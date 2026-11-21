// Live chat, Pusher auth, admin notifications/app, and the bottom-of-screen layout.
// usage: node --env-file=.env.local e2e/chat.mjs [baseUrl] [screenshotDir]
//   ADMIN_PASSWORD comes from .env.local. With NEXT_PUBLIC_PUSHER_KEY set, messages must arrive live (no reload);
//   without it, the visitor's reply is checked after reopening the panel (the refetch path).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import os from "node:os";

const base = process.argv[2] ?? "http://localhost:3212";
const out = process.argv[3] ?? "e2e/out";
mkdirSync(out, { recursive: true });
const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error("ADMIN_PASSWORD missing: run with node --env-file=.env.local e2e/chat.mjs");
  process.exit(2);
}
const live = Boolean(process.env.NEXT_PUBLIC_PUSHER_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER);
const HOODIE = "/products/akatsukizipup-mask-hoodie";
const tag = Math.random().toString(36).slice(2, 7);
// Each run is its own "visitor IP" so repeated local runs don't hit the 5-chats-an-hour start limit.
// (Vercel overwrites x-forwarded-for, so this does nothing against production.)
const testIp = () => `198.18.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? `${os.homedir()}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome` });
let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};
const errors = [];
const watch = (page, who) => page.on("pageerror", (e) => errors.push(`${who}: ${e.message}`));
const created = []; // conversation ids to clean up

/* ------------------------------------------------------------ bottom-of-screen layout */

/** Boxes of the floating things that are actually showing: bubble, pill, back-to-top, sticky bar. */
async function floating(page) {
  return page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.5) return null;
      const r = el.getBoundingClientRect();
      return r.width && r.height ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    };
    const sticky = [...document.querySelectorAll("div")].find(
      (d) => getComputedStyle(d).position === "fixed" && d.querySelector("button") && /Add to cart/.test(d.textContent ?? "") && d.getBoundingClientRect().bottom >= innerHeight - 1,
    );
    return {
      bubble: box(document.querySelector('button[aria-controls="akz-chat-panel"]')),
      pill: box(document.querySelector("a.floating-shop")),
      top: box(document.querySelector('button[aria-label="Back to top"]')),
      sticky: box(sticky),
      vw: innerWidth,
    };
  });
}
const overlap = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function layoutCheck(width, height, path, expectSticky) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  watch(page, `layout ${width} ${path}`);
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo({ top: 3000, behavior: "instant" }));
  await page.waitForTimeout(2600); // entrance animations + back-to-top fade
  const f = await floating(page);
  const name = `${width}px ${path === "/" ? "home" : "hoodie page"}`;
  check(Boolean(f.bubble), `${name}: chat bubble shows`);
  check(Boolean(f.top), `${name}: back-to-top shows after scrolling`);
  if (path === "/") check(Boolean(f.pill), `${name}: "Shop the hoodie" pill shows`);
  if (expectSticky) check(Boolean(f.sticky), `${name}: sticky add-to-cart bar shows`);
  const items = Object.entries(f).filter(([k, v]) => k !== "vw" && v);
  const clashes = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) if (overlap(items[i][1], items[j][1])) clashes.push(`${items[i][0]}×${items[j][0]}`);
  check(clashes.length === 0, `${name}: nothing overlaps${clashes.length ? ` (${clashes.join(", ")})` : ""}`);
  check(items.every(([, v]) => v.x >= 0 && v.x + v.w <= f.vw), `${name}: all inside the screen`);
  await page.screenshot({ path: `${out}/chat-layout-${width}-${path === "/" ? "home" : "hoodie"}.png` });
  await ctx.close();
}

await layoutCheck(390, 844, "/", false);
await layoutCheck(390, 844, HOODIE, true);
await layoutCheck(1440, 900, "/", false);
await layoutCheck(1440, 900, HOODIE, true);

/* ------------------------------------------------------------ visitor starts a chat */

const visitorCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "x-forwarded-for": testIp() } });
const visitor = await visitorCtx.newPage();
watch(visitor, "visitor");
await visitor.goto(`${base}/`, { waitUntil: "networkidle" });
await visitor.waitForTimeout(1800);
const bubble = visitor.locator('button[aria-controls="akz-chat-panel"]');
await bubble.click();
const panel = visitor.getByRole("dialog", { name: "Chat with AkatsukiZipUp" });
check(await panel.isVisible(), "visitor: bubble opens the chat panel");
check(await panel.getByText("Questions about sizing or shipping?").isVisible(), "visitor: greeting shows");
const pbox = await panel.boundingBox();
check(pbox && pbox.width >= 389 && pbox.height >= 843, "visitor: panel is a full-screen sheet on a phone");
const vlog = panel.getByRole("log", { name: "Messages" }); // the thread (the composer's own text doesn't count)

// Inline validation: empty message, bad email
await panel.getByRole("button", { name: "Start chat" }).click();
check(await panel.getByText("Please write a message.").isVisible(), "visitor: empty message is refused inline");
const name = `E2E Visitor ${tag}`;
await panel.getByPlaceholder("Name (optional)").fill(name);
await panel.getByPlaceholder("Email (optional)").fill("not-an-email");
await panel.getByPlaceholder("Ask us anything…").fill(`Hi, does size M fit 180 cm? (${tag})`);
await panel.getByRole("button", { name: "Start chat" }).click();
check(await panel.getByText("Please enter a valid email address").isVisible(), "visitor: bad email is refused inline");
await panel.getByPlaceholder("Email (optional)").fill(`e2e-${tag}@example.com`);
// Enter sends
await panel.getByPlaceholder("Ask us anything…").press("Enter");
const firstShown = vlog.getByText(`Hi, does size M fit 180 cm? (${tag})`);
await firstShown.or(panel.getByRole("alert")).first().waitFor({ timeout: 15000 });
if (!(await firstShown.isVisible())) {
  console.log(`FAIL  visitor: starting the chat was refused: ${await panel.getByRole("alert").first().textContent()}`);
  process.exit(1);
}
check(true, "visitor: first message sent with Enter and shown in the thread");
const mine = await visitor.request.get(`${base}/api/chat?peek=1`).then((r) => r.json());
const convId = mine.conversation?.id;
check(Boolean(convId), "visitor: conversation exists (cookie)");
if (convId) created.push(convId);

// Shift+Enter makes a new line instead of sending
const box = panel.getByPlaceholder("Write a message…");
await box.fill("line one");
await box.press("Shift+Enter");
await box.pressSequentially("line two");
check((await box.inputValue()) === "line one\nline two", "visitor: Shift+Enter adds a new line");
await box.press("Enter");
await vlog.getByText(/line one\s+line two/).waitFor({ timeout: 15000 });
check(true, "visitor: second message sent");
await visitor.screenshot({ path: `${out}/chat-visitor-thread.png` });

/* ------------------------------------------------------------ pusher-auth denies the wrong channels */

const authAs = (page, channel) =>
  page.request.post(`${base}/api/pusher/auth`, { form: { socket_id: "123.456", channel_name: channel }, headers: { Origin: base } }).then((r) => r.status());
const other = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": testIp() } });
const otherConv = await other.request
  .post(`${base}/api/chat`, { data: { message: `Other visitor (${tag})`, name: `E2E Other ${tag}` }, headers: { Origin: base } })
  .then((r) => r.json());
if (otherConv.conversation?.id) created.push(otherConv.conversation.id);
check((await authAs(visitor, "private-admin")) === 403, "pusher-auth: visitor asking for private-admin → 403");
check((await authAs(visitor, "presence-anything")) === 403, "pusher-auth: unknown channel → 403");
const own = await authAs(visitor, `private-chat-${convId}`);
check(live ? own === 200 : own === 503, `pusher-auth: visitor's own conversation → ${live ? "200 (signed)" : "503 (allowed, Pusher not set up)"}`);
await other.close();

/* ------------------------------------------------------------ admin sees it and replies */

const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": testIp() } });
const admin = await adminCtx.newPage();
watch(admin, "admin");
await admin.goto(`${base}/admin/login`, { waitUntil: "networkidle" });
await admin.locator("#password").fill(password);
await admin.getByRole("button", { name: "Sign in" }).click();
await admin.waitForURL(`${base}/admin`, { timeout: 20000 }).catch(async () => {
  console.log(`FAIL  admin: sign-in didn't go through: ${await admin.getByRole("alert").first().textContent().catch(() => "no message")}`);
  process.exit(1);
});
check((await authAs(admin, "private-admin")) === (live ? 200 : 503), `pusher-auth: signed-in admin → private-admin ${live ? "200" : "503 (allowed)"}`);
// A real conversation that isn't the visitor's (the second visitor's, unless the local start limit kicked in).
const everyone = await admin.request.get(`${base}/api/admin/chat?status=all`).then((r) => r.json());
const someoneElse = otherConv.conversation?.id ?? everyone.conversations?.find((c) => c.id !== convId)?.id;
check(Boolean(someoneElse), `pusher-auth: found another real conversation to try${otherConv.conversation ? "" : ` (second start answered: ${otherConv.error})`}`);
check((await authAs(visitor, `private-chat-${someoneElse}`)) === 403, "pusher-auth: visitor asking for another (real) conversation's channel → 403");

await admin.goto(`${base}/admin/chat`, { waitUntil: "networkidle" });
const row = admin.getByRole("button").filter({ hasText: name });
await row.waitFor({ timeout: 15000 });
check(await row.getByLabel(/unread/).isVisible(), "admin: the new conversation is in the inbox with an unread badge");
check((await row.getByLabel(/unread/).textContent())?.trim() === "2", "admin: unread badge counts both messages (2)");
await row.click();
await admin.waitForURL(/\/admin\/chat\?c=/);
const thread = admin.getByRole("log", { name: "Messages" });
await thread.getByText(`Hi, does size M fit 180 cm? (${tag})`).waitFor({ timeout: 15000 });
check(true, "admin: thread shows the visitor's messages");
check(await admin.getByRole("link", { name: `e2e-${tag}@example.com` }).getAttribute("href").then((h) => h === `mailto:e2e-${tag}@example.com`), "admin: email is a mailto link");
check(await admin.getByText("Device").isVisible(), "admin: visitor info (started, page, device) shows");
let cleared = true;
await row.getByLabel(/unread/).waitFor({ state: "hidden", timeout: 10000 }).catch(() => (cleared = false));
check(cleared, "admin: opening the thread clears its unread badge");

// Live visitor → admin: the thread is open; a new visitor message shows without reloading.
if (live) {
  await box.fill(`Are you there? (${tag})`);
  await box.press("Enter");
  let arrived = true;
  await thread.getByText(`Are you there? (${tag})`).waitFor({ timeout: 12000 }).catch(() => (arrived = false));
  check(arrived, "LIVE visitor → admin: new message appears in the open admin thread without a reload (Pusher)");
}

const replyText = `Yes, M fits 175–185 cm. (${tag})`;
await admin.getByLabel("Reply").fill(replyText);
await admin.getByLabel("Reply").press("Enter");
await thread.getByText(replyText).waitFor({ timeout: 15000 });
check(true, "admin: reply sent and shown");
await admin.screenshot({ path: `${out}/chat-admin.png` });

/* ------------------------------------------------------------ visitor sees the reply */

if (live) {
  let arrived = true;
  await vlog.getByText(replyText).waitFor({ timeout: 12000 }).catch(() => (arrived = false));
  check(arrived, "LIVE admin → visitor: reply appears in the open chat panel without a reload (Pusher)");
} else {
  await visitor.getByRole("button", { name: "Close chat" }).first().click();
  await bubble.click();
  await vlog.getByText(replyText).waitFor({ timeout: 15000 });
  check(true, "visitor: reply shows after reopening the panel (refetch path, no Pusher keys)");
}

// Badge while closed: the admin replies again with the panel closed.
await visitor.keyboard.press("Escape");
check(!(await panel.isVisible().catch(() => false)), "visitor: Escape closes the panel");
await admin.getByLabel("Reply").fill(`One more thing (${tag})`);
await admin.getByLabel("Reply").press("Enter");
await thread.getByText(`One more thing (${tag})`).waitFor({ timeout: 15000 });
if (!live) await visitor.reload({ waitUntil: "networkidle" });
let badge = true;
await visitor.locator('button[aria-controls="akz-chat-panel"][aria-label*="new repl"]').waitFor({ timeout: 12000 }).catch(() => (badge = false));
check(badge, `visitor: closed bubble shows an unread badge for the reply (${live ? "live" : "after reload"})`);
await visitor.screenshot({ path: `${out}/chat-visitor-badge.png` });
await bubble.click();
await vlog.getByText(`One more thing (${tag})`).waitFor({ timeout: 15000 });
check(true, "visitor: reopening shows the newest reply");

// Admin: close, reopen
await admin.getByRole("button", { name: "Close", exact: true }).click();
await admin.getByRole("button", { name: "Reopen" }).waitFor({ timeout: 10000 });
check(true, "admin: close conversation");
await admin.getByRole("button", { name: "Reopen" }).click();
await admin.getByRole("button", { name: "Close", exact: true }).waitFor({ timeout: 10000 });
check(true, "admin: reopen conversation");

// Phone: list → thread → back
const phoneAdmin = await adminCtx.newPage();
await phoneAdmin.setViewportSize({ width: 390, height: 844 });
await phoneAdmin.goto(`${base}/admin/chat?c=${convId}`, { waitUntil: "networkidle" });
await phoneAdmin.getByRole("log", { name: "Messages" }).getByText(replyText).waitFor({ timeout: 15000 });
check(!(await phoneAdmin.getByRole("heading", { name: "Live chat" }).isVisible()), "admin 390px: ?c= deep link opens the thread full-screen");
await phoneAdmin.screenshot({ path: `${out}/chat-admin-phone.png` });
await phoneAdmin.getByRole("button", { name: "Back to conversations" }).click();
await phoneAdmin.getByRole("heading", { name: "Live chat" }).waitFor({ timeout: 10000 });
check(true, "admin 390px: back returns to the list");
const hscroll = await phoneAdmin.evaluate(() => document.documentElement.scrollWidth > innerWidth);
check(!hscroll, "admin 390px: no horizontal scroll");
await phoneAdmin.close();

/* ------------------------------------------------------------ notifications page, manifest, service worker, push API */

await admin.goto(`${base}/admin/notifications`, { waitUntil: "networkidle" });
check(await admin.getByRole("heading", { name: "Notifications & app" }).isVisible(), "notifications page renders");
check(await admin.getByRole("heading", { name: "Install the admin app" }).isVisible(), "notifications page: install card");
await admin.getByRole("button", { name: /Turn on notifications|Turn off/ }).waitFor({ timeout: 10000 });
check(true, "notifications page: this-device controls show");

const manifest = await admin.request.get(`${base}/admin/manifest.webmanifest`);
const mjson = await manifest.json().catch(() => null);
check(manifest.ok() && mjson?.name === "AkatsukiZipUp Admin" && mjson?.display === "standalone" && mjson?.icons?.length === 2, "manifest returns valid JSON");
const signedOut = await browser.newContext();
check((await signedOut.request.get(`${base}/admin/manifest.webmanifest`)).ok(), "manifest loads signed out");
check((await signedOut.request.get(`${base}/api/admin/push`)).status() === 401, "push API refuses signed-out callers");
await signedOut.close();
const sw = await admin.request.get(`${base}/admin-sw.js`);
check(sw.ok() && /javascript/.test(sw.headers()["content-type"] ?? "") && (await sw.text()).includes("notificationclick"), "service worker is served");
const swScope = await admin.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration("/admin/");
  return reg?.scope ?? null;
});
check(swScope === `${base}/admin/`, "service worker registered with scope /admin/");

// Push devices API with a stand-in subscription (headless Chrome has no push service to subscribe to).
const fake = { endpoint: `https://push.invalid/e2e-${tag}`, keys: { p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U", auth: "8eDyX_uCN0XRhSbY5hs7Hg" } };
const post = (url, data) => admin.request.post(`${base}${url}`, { data, headers: { Origin: base } });
const sub = await post("/api/admin/push", fake).then((r) => r.json());
check(sub.ok && sub.device?.id, "push: save a device subscription");
check((await post("/api/admin/push", { ...fake, endpoint: "http://insecure.invalid/x" })).status() === 400, "push: refuses a non-https endpoint");
const list = await admin.request.get(`${base}/api/admin/push`).then((r) => r.json());
check(list.devices?.some((d) => d.id === sub.device?.id && d.label), "push: device is listed with a label");
const test = await post("/api/admin/push/test", {}).then((r) => r.json());
check(test.ok && test.failed >= 1, `push: test send runs (sent ${test.sent}, failed ${test.failed} — the stand-in endpoint can't be reached)`);
const del = await admin.request.delete(`${base}/api/admin/push/${sub.device?.id}`, { headers: { Origin: base } });
check(del.ok(), "push: remove a device");
const after = await admin.request.get(`${base}/api/admin/push`).then((r) => r.json());
check(!after.devices?.some((d) => d.id === sub.device?.id), "push: removed device is gone");
await admin.reload({ waitUntil: "networkidle" });
await admin.screenshot({ path: `${out}/chat-notifications.png`, fullPage: true });

/* ------------------------------------------------------------ delete (cleanup) */

// Leftovers from an earlier run that stopped half-way are removed too (anything named "E2E …").
const leftovers = await admin.request.get(`${base}/api/admin/chat?status=all`).then((r) => r.json());
for (const c of leftovers.conversations ?? []) if (/^E2E /.test(c.name ?? "") && !created.includes(c.id)) created.push(c.id);
for (const id of created) {
  const r = await admin.request.delete(`${base}/api/admin/chat/${id}`, { headers: { Origin: base } });
  check(r.ok(), `admin: delete conversation ${id.slice(0, 8)}…`);
}
const gone = await visitor.request.get(`${base}/api/chat`).then((r) => r.json());
check(gone.conversation === null, "visitor: after the admin deletes it, the conversation is gone for the visitor");

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
console.log(`\nRealtime path tested: ${live ? "LIVE (Pusher keys set)" : "refetch (no Pusher keys)"}`);
await browser.close();
process.exit(failed ? 1 : 0);
