// Shopper notifications (the vape store's notify card), "?chat=open", the service worker, server-side pushes,
// and updated invoices (REPLACED) in both views.
// usage: node --env-file=.env.local e2e/chat-notify.mjs [baseUrl] [screenshotDir]
//   Scenes (conversations, pending orders, invoice messages) are written straight into the database, like
//   e2e/invoice-chat.mjs. Headless Chrome has no push service, so the browser's PushManager is replaced by a
//   stand-in that hands out a fake https subscription (https://push.invalid/…, which can never be reached):
//   everything else — permission, registering /sw.js, POST /api/chat/push, the server's push decision — is real.
//   The service worker's push handler is driven through DevTools (ServiceWorker.deliverPushMessage).
//   Everything this run makes is deleted at the end.
import { chromium } from "playwright";
import prismaPkg from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import os from "node:os";

setDefaultAutoSelectFamilyAttemptTimeout(2_000);
const { PrismaClient } = prismaPkg;
const db = new PrismaClient();

const base = process.argv[2] ?? "http://localhost:3231";
const out = process.argv[3] ?? "e2e/out";
mkdirSync(out, { recursive: true });
const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error("ADMIN_PASSWORD missing: run with node --env-file=.env.local e2e/chat-notify.mjs");
  process.exit(2);
}
const vapid = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
const tag = Math.random().toString(36).slice(2, 7);
const testIp = () => `198.18.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Same words as src/lib/chat/shared.ts.
const COPY = {
  question: "Please check your invoice. Are your items, delivery address and contact details all correct?",
  yesButton: "Yes, all correct",
  noButton: "Something's wrong",
  yesReply: "Thanks for confirming! We'll send your payment details here within 5 minutes.",
  noMessage: "Something's wrong with my invoice",
  noReply: "No problem. Tell us what needs changing and we'll send you an updated invoice.",
  updated: "Here's your updated invoice.",
};
const NOTIFY = {
  title: "Don't miss your payment details",
  body: "We'll tell you the moment your payment details arrive.",
  button: "Turn on notifications",
  done: "Notifications are on. We'll tell you when your payment details arrive.",
};

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};
const errors = [];
const watch = (page, who) => page.on("pageerror", (e) => errors.push(`${who}: ${e.message}`));

/* ------------------------------------------------------------ scenes, straight in the database */

const hashChatToken = (t) => createHash("sha256").update(t).digest("base64url");
const invNo = (n, v) => (v <= 1 ? `INV-${1000 + n}` : `INV-${1000 + n}-${v}`);

/** A conversation; with `order`, a pending order and its invoice (v1), like checkout leaves them. */
async function scene(label, { order = true } = {}) {
  const token = randomBytes(32).toString("base64url");
  const email = `e2e-notify-${tag}-${label}@example.com`;
  const conv = await db.conversation.create({
    data: { visitorToken: hashChatToken(token), name: `E2E Notify ${tag} ${label}`, email, pagePath: "/checkout" },
    select: { id: true },
  });
  if (!order) return { token, convId: conv.id };
  const o = await db.order.create({
    data: {
      token: randomBytes(24).toString("base64url"),
      name: `E2E Notify ${tag} ${label}`,
      email,
      country: "US",
      address1: "1 Test Street",
      city: "Testville",
      postalCode: "10001",
      paymentMethod: "Cash App",
      paymentInstructions: "Send the total to $akz-e2e",
      paymentKey: "cash-app",
      paymentDiscount: 0,
      compareAtTotal: 100,
      subtotal: 79.99,
      shipping: 0,
      total: 79.99,
      stockTaken: {},
      conversationId: conv.id,
      items: { create: [{ kind: "bundle", sku: "duo", title: "Duo bundle", detail: "Akatsuki / M, Shinobi / L", image: "/store/logo.jpg", quantity: 1, unitPrice: 79.99, lineTotal: 79.99, sortOrder: 0 }] },
    },
    select: { id: true, number: true },
  });
  const now = new Date();
  const msg = await db.chatMessage.create({
    data: { conversationId: conv.id, sender: "ADMIN", kind: "INVOICE", orderId: o.id, body: `Invoice ${invNo(o.number, 1)} · $79.99\n${COPY.question}`, meta: { version: 1 }, createdAt: now },
    select: { id: true },
  });
  await db.conversation.update({ where: { id: conv.id }, data: { lastMessage: `New order #${1000 + o.number} · $79.99`, lastMessageAt: now } });
  return { token, convId: conv.id, orderId: o.id, number: o.number, messageId: msg.id };
}

/** "Something's wrong" on v1, then the admin's updated invoice (the rows postUpdatedInvoice() writes). */
async function replaceInvoice(s) {
  const t = Date.now();
  await db.chatMessage.update({ where: { id: s.messageId }, data: { meta: { version: 1, answer: "wrong" } } });
  await db.chatMessage.create({ data: { conversationId: s.convId, sender: "VISITOR", body: COPY.noMessage, createdAt: new Date(t + 1) } });
  await db.chatMessage.create({ data: { conversationId: s.convId, sender: "ADMIN", body: COPY.noReply, createdAt: new Date(t + 2) } });
  await db.order.update({ where: { id: s.orderId }, data: { invoiceVersion: 2, invoiceAnswer: null, invoiceAnsweredAt: null } });
  const v2 = await db.chatMessage.create({
    data: {
      conversationId: s.convId,
      sender: "ADMIN",
      kind: "INVOICE",
      orderId: s.orderId,
      body: `${COPY.updated}\nInvoice ${invNo(s.number, 2)} · $79.99\n${COPY.question}`,
      meta: { version: 2 },
      createdAt: new Date(t + 3),
    },
    select: { id: true },
  });
  return v2.id;
}

async function cleanup() {
  const orders = await db.order.deleteMany({ where: { email: { startsWith: "e2e-notify-" }, name: { startsWith: "E2E Notify " } } });
  const convs = await db.conversation.deleteMany({ where: { name: { startsWith: "E2E Notify " } } });
  return { orders: orders.count, convs: convs.count };
}

const A = await scene("a"); // turns notifications on
const B = await scene("b", { order: false }); // someone else
const C = await scene("c"); // gets an updated invoice
await replaceInvoice(C);
console.log(`scene: order #${1000 + A.number} (A), updated invoice ${invNo(C.number, 2)} (C)`);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? `${os.homedir()}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome` });

/** Headless Chrome has no push service: hand out a fake (unreachable) https subscription, kept in localStorage. */
function fakePush(tagArg) {
  const KEY = "e2e-fake-push";
  const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fake = (saved) => ({
    endpoint: saved.endpoint,
    options: { applicationServerKey: new Uint8Array(saved.key).buffer, userVisibleOnly: true },
    toJSON: () => ({ endpoint: saved.endpoint, expirationTime: null, keys: saved.keys }),
    unsubscribe: async () => {
      localStorage.removeItem(KEY);
      return true;
    },
  });
  if (typeof PushManager === "undefined") return;
  PushManager.prototype.subscribe = async function (opts) {
    const k = opts.applicationServerKey;
    const saved = {
      endpoint: `https://push.invalid/e2e-${tagArg}/${crypto.randomUUID()}`,
      key: [...new Uint8Array(k.buffer ?? k)],
      keys: { p256dh: b64u(crypto.getRandomValues(new Uint8Array(65))), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) },
    };
    localStorage.setItem(KEY, JSON.stringify(saved));
    return fake(saved);
  };
  PushManager.prototype.getSubscription = async function () {
    const raw = localStorage.getItem(KEY);
    return raw ? fake(JSON.parse(raw)) : null;
  };
}

async function shopper(s, { viewport = { width: 390, height: 844 }, push = true } = {}) {
  const ctx = await browser.newContext({ viewport, permissions: ["notifications"], extraHTTPHeaders: { "x-forwarded-for": testIp() } });
  if (push) await ctx.addInitScript(fakePush, tag);
  if (s) await ctx.addCookies([{ name: "akz_chat", value: s.token, url: base, httpOnly: true, sameSite: "Lax" }]);
  return ctx;
}

const swScopes = (page) => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => ({ scope: r.scope, script: (r.active ?? r.installing ?? r.waiting)?.scriptURL ?? null })));

try {
  check(vapid, "env: VAPID keys are set (server and browser)");

  /* ------------------------------------------------------------ ?chat=open opens the chat */

  const actx = await shopper(A);
  const visitor = await actx.newPage();
  watch(visitor, "visitor");
  await visitor.goto(`${base}/?chat=open`, { waitUntil: "networkidle" });
  const panel = visitor.getByRole("dialog", { name: "Chat with AkatsukiZipUp" });
  await panel.waitFor({ timeout: 30000 });
  check(true, "?chat=open: the panel opens by itself");
  const vlog = panel.getByRole("log", { name: "Messages" });
  const cardA = vlog.getByRole("article", { name: `Invoice ${invNo(A.number, 1)}`, exact: true });
  await cardA.waitFor({ timeout: 30000 });
  check(new URL(visitor.url()).search === "", `?chat=open: the address bar is tidied (${new URL(visitor.url()).pathname}${new URL(visitor.url()).search})`);
  check(await cardA.getByRole("heading", { name: `Invoice ${invNo(A.number, 1)}`, exact: true }).isVisible(), `invoice card: heading reads "Invoice ${invNo(A.number, 1)}"`);
  check(await cardA.getByText(`Order #${1000 + A.number}`).isVisible(), "invoice card: shows the order number under it");

  /* ------------------------------------------------------------ the notify card */

  const card = vlog.getByRole("region", { name: NOTIFY.title });
  check((await card.count()) === 0, "notify card: not shown before the invoice is confirmed");
  check(!(await swScopes(visitor)).some((r) => r.scope === `${base}/`), "service worker: not registered on page load");

  await cardA.getByRole("button", { name: COPY.yesButton }).click();
  await vlog.getByText(COPY.yesReply).waitFor({ timeout: 20000 });
  await card.waitFor({ timeout: 10000 });
  check(true, 'notify card: appears after "Yes, all correct" while the order awaits payment');
  const afterReply = await card.evaluate((el, reply) => (el.previousElementSibling?.textContent ?? "").includes(reply), COPY.yesReply);
  check(afterReply, 'notify card: sits right under "Thanks for confirming!"');
  check(await card.getByText(NOTIFY.body).isVisible(), "notify card: says what it's for");
  const turnOn = card.getByRole("button", { name: NOTIFY.button });
  check(await turnOn.isVisible(), `notify card: "${NOTIFY.button}" button`);
  await visitor.screenshot({ path: `${out}/chat-notify-card.png` });

  await turnOn.click();
  await card.getByText(NOTIFY.done).waitFor({ timeout: 20000 });
  check(true, "notify card: tapping it turns notifications on (done line shows)");
  const subs = await db.chatPushSubscription.findMany({ where: { conversationId: A.convId }, select: { endpoint: true, p256dh: true, auth: true, userAgent: true } });
  check(subs.length === 1 && subs[0].endpoint.startsWith(`https://push.invalid/e2e-${tag}/`) && subs[0].p256dh.length === 87 && subs[0].auth.length === 22, "db: the subscription is saved for this chat");
  const regs = await swScopes(visitor);
  check(regs.some((r) => r.scope === `${base}/` && r.script === `${base}/sw.js`), "service worker: /sw.js registered with scope / after the tap");
  await visitor.screenshot({ path: `${out}/chat-notify-on.png` });

  // A reload: the browser is still subscribed, so the card says so straight away.
  await visitor.reload({ waitUntil: "networkidle" });
  await visitor.evaluate(() => window.dispatchEvent(new CustomEvent("akz:open-chat")));
  await vlog.getByRole("region", { name: NOTIFY.title }).getByText(NOTIFY.done).waitFor({ timeout: 30000 });
  check(true, "notify card: already on after a reload");

  /* ------------------------------------------------------------ the service worker */

  const swRes = await visitor.request.get(`${base}/sw.js`);
  const swText = await swRes.text();
  check(swRes.ok() && /javascript/.test(swRes.headers()["content-type"] ?? ""), "service worker: /sw.js is served as JavaScript");
  check(!/addEventListener\(\s*["']fetch["']/.test(swText) && !/caches\./.test(swText), "service worker: no fetch handler, no caching");

  const cdp = await actx.newCDPSession(visitor);
  const registrations = [];
  cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => registrations.push(...e.registrations));
  await cdp.send("ServiceWorker.enable");
  for (let i = 0; i < 20 && !registrations.some((r) => r.scopeURL === `${base}/` && !r.isDeleted); i++) await sleep(250);
  const reg = registrations.find((r) => r.scopeURL === `${base}/` && !r.isDeleted);
  const notifications = () =>
    visitor.evaluate(async () => (await (await navigator.serviceWorker.getRegistration("/")).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url, icon: n.icon })));
  if (reg) {
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin: base,
      registrationId: reg.registrationId,
      data: JSON.stringify({ title: "AkatsukiZipUp", body: `Your payment details are here (${tag})`, url: "/?chat=open", tag: "chat-e2e" }),
    });
    let shown = [];
    for (let i = 0; i < 20 && !shown.length; i++) {
      await sleep(250);
      shown = await notifications();
    }
    const n = shown.find((x) => x.tag === "chat-e2e");
    check(n?.title === "AkatsukiZipUp" && n.body === `Your payment details are here (${tag})` && n.url === "/?chat=open" && /\/icon\.png$/.test(n.icon ?? ""), "service worker: a push shows a notification (title, body, url, /icon.png)");
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin: base,
      registrationId: reg.registrationId,
      data: JSON.stringify({ title: "Hi", body: "x", url: "//evil.example/steal", tag: "chat-e2e-evil" }),
    });
    let evil;
    for (let i = 0; i < 20 && !evil; i++) {
      await sleep(250);
      evil = (await notifications()).find((x) => x.tag === "chat-e2e-evil");
    }
    check(evil?.url === "/", `service worker: an off-site url in a push is replaced by "/" (${evil?.url})`);
  } else check(false, "service worker: found its registration through DevTools");

  // A tapped notification with a store tab open: the worker posts { type: "akz:open", url } and the widget opens.
  await panel.getByRole("button", { name: "Close chat" }).first().click();
  await panel.waitFor({ state: "hidden" });
  await visitor.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "akz:open", url: "/?chat=open" } })));
  await panel.waitFor({ timeout: 10000 });
  check(true, "widget: a message from the service worker opens the chat");
  await panel.getByRole("button", { name: "Close chat" }).first().click();
  await visitor.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "akz:open", url: "//evil.example/?chat=open" } })));
  await sleep(800);
  check(!(await panel.isVisible()) && new URL(visitor.url()).host === new URL(base).host, "widget: an off-site url from the worker is ignored");

  /* ------------------------------------------------------------ POST /api/chat/push refuses what it should */

  const apiCtx = await shopper(A, { push: false });
  const sub = (ctx, data, headers = { Origin: base }) => ctx.request.post(`${base}/api/chat/push`, { data, headers });
  const keys = { p256dh: randomBytes(65).toString("base64url"), auth: randomBytes(16).toString("base64url") };
  const fakeEndpoint = `https://push.invalid/e2e-${tag}/api-${randomBytes(6).toString("hex")}`;
  const okSub = await sub(apiCtx, { endpoint: fakeEndpoint, keys, conversationId: A.convId });
  check(okSub.status() === 201 && (await db.chatPushSubscription.count({ where: { endpoint: fakeEndpoint, conversationId: A.convId } })) === 1, `push api: the owner saves a (fake https) subscription → 201 (${okSub.status()})`);
  const http = await sub(apiCtx, { endpoint: "http://push.invalid/plain", keys });
  check(http.status() === 400, `push api: a non-https endpoint → 400 (${http.status()})`);
  const long = await sub(apiCtx, { endpoint: `https://push.invalid/${"a".repeat(2000)}`, keys });
  check(long.status() === 400, `push api: an endpoint over 2000 characters → 400 (${long.status()})`);
  const badKey = await sub(apiCtx, { endpoint: fakeEndpoint, keys: { p256dh: "not base64url!!/+", auth: keys.auth } });
  check(badKey.status() === 400, `push api: a key that isn't base64url → 400 (${badKey.status()})`);
  const otherChat = await sub(apiCtx, { endpoint: `${fakeEndpoint}-b`, keys, conversationId: B.convId });
  check(otherChat.status() === 403, `push api: another chat's id → 403 (${otherChat.status()})`);
  check((await db.chatPushSubscription.count({ where: { conversationId: B.convId } })) === 0, "db: nothing was attached to the other chat");
  const anon = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": testIp() } });
  const noCookie = await sub(anon, { endpoint: `${fakeEndpoint}-anon`, keys });
  check(noCookie.status() === 403, `push api: no chat cookie → 403 (${noCookie.status()})`);
  const cross = await sub(apiCtx, { endpoint: fakeEndpoint, keys }, { Origin: "https://evil.example" });
  check(cross.status() === 403, `push api: wrong Origin → 403 (${cross.status()})`);
  const bCtx = await shopper(B, { push: false });
  const bDelete = await bCtx.request.delete(`${base}/api/chat/push`, { data: { endpoint: fakeEndpoint }, headers: { Origin: base } });
  check(bDelete.ok() && (await db.chatPushSubscription.count({ where: { endpoint: fakeEndpoint } })) === 1, "push api: another chat can't remove this chat's subscription");
  const aDelete = await apiCtx.request.delete(`${base}/api/chat/push`, { data: { endpoint: fakeEndpoint }, headers: { Origin: base } });
  check(aDelete.ok() && (await db.chatPushSubscription.count({ where: { endpoint: fakeEndpoint } })) === 0, "push api: the owner can turn it off (DELETE)");

  /* ------------------------------------------------------------ presence */

  await db.conversation.update({ where: { id: B.convId }, data: { visitorLastSeenAt: null } });
  await bCtx.request.get(`${base}/api/chat?peek=1`);
  check((await db.conversation.findUnique({ where: { id: B.convId }, select: { visitorLastSeenAt: true } }))?.visitorLastSeenAt === null, "presence: the bubble's ?peek=1 doesn't count as being here");
  await bCtx.request.get(`${base}/api/chat`);
  const seen = (await db.conversation.findUnique({ where: { id: B.convId }, select: { visitorLastSeenAt: true } }))?.visitorLastSeenAt;
  check(seen && Date.now() - seen.getTime() < 60_000, "presence: opening the chat (full GET) marks the shopper as here");
  await db.conversation.update({ where: { id: B.convId }, data: { visitorLastSeenAt: null } });
  await bCtx.request.post(`${base}/api/chat/messages`, { data: { message: `Still there? (${tag})` }, headers: { Origin: base } });
  check(Boolean((await db.conversation.findUnique({ where: { id: B.convId }, select: { visitorLastSeenAt: true } }))?.visitorLastSeenAt), "presence: writing a message marks the shopper as here");
  await bCtx.close();
  await anon.close();
  await apiCtx.close();

  /* ------------------------------------------------------------ the store writes → the shopper's phone */

  // The shopper leaves (closing the page, so its live refresh can't mark them as here again).
  await visitor.close();
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": testIp() } });
  const admin = await adminCtx.newPage();
  watch(admin, "admin");
  await admin.goto(`${base}/admin/login`, { waitUntil: "networkidle" });
  await admin.locator("#password").fill(password);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.waitForURL(`${base}/admin`, { timeout: 30000 });
  const reply = (text) => admin.request.post(`${base}/api/admin/chat/${A.convId}`, { data: { message: text }, headers: { Origin: base } });
  const pushState = () => db.conversation.findUnique({ where: { id: A.convId }, select: { lastPushAt: true, pushSubscriptions: { select: { failures: true, lastUsedAt: true } } } });

  await db.conversation.update({ where: { id: A.convId }, data: { visitorLastSeenAt: new Date(Date.now() - 120_000), lastPushAt: null } });
  const r1 = await reply(`Payment details coming up (${tag})`);
  let st;
  for (let i = 0; i < 40; i++) {
    st = await pushState();
    if (st?.lastPushAt && st.pushSubscriptions.some((p) => p.failures > 0 || p.lastUsedAt)) break;
    await sleep(500);
  }
  check(r1.status() === 201 && Boolean(st?.lastPushAt), "push: an admin reply to a shopper who's away sends a push (lastPushAt set)");
  check(Boolean(st?.pushSubscriptions.some((p) => p.failures > 0)), "push: it was really sent to the subscription (the stand-in endpoint can't be reached, so failures = 1)");

  const firstPush = st.lastPushAt.getTime();
  await reply(`One more thing (${tag})`);
  await sleep(4000);
  st = await pushState();
  check(st?.lastPushAt?.getTime() === firstPush, "push: a second reply within a minute doesn't push again");

  await db.conversation.update({ where: { id: A.convId }, data: { visitorLastSeenAt: new Date(), lastPushAt: null } });
  await reply(`Are you there? (${tag})`);
  await sleep(4000);
  st = await pushState();
  check(st?.lastPushAt === null, "push: nothing is pushed while the shopper is on the site");

  /* ------------------------------------------------------------ the card only while payment is due */

  await db.order.update({ where: { id: A.orderId }, data: { status: "PAID" } });
  const paidCtx = await shopper(A);
  const paidPage = await paidCtx.newPage();
  watch(paidPage, "visitor paid");
  await paidPage.goto(`${base}/?chat=open`, { waitUntil: "networkidle" });
  const plog = paidPage.getByRole("dialog", { name: "Chat with AkatsukiZipUp" }).getByRole("log", { name: "Messages" });
  await plog.getByText(COPY.yesReply).waitFor({ timeout: 30000 });
  await sleep(500);
  check((await plog.getByRole("region", { name: NOTIFY.title }).count()) === 0, "notify card: gone once the order is paid");
  await paidCtx.close();

  /* ------------------------------------------------------------ updated invoices: REPLACED */

  const cctx = await shopper(C);
  const cpage = await cctx.newPage();
  watch(cpage, "visitor C");
  await cpage.goto(`${base}/`, { waitUntil: "networkidle" });
  await cpage.evaluate(() => window.dispatchEvent(new CustomEvent("akz:open-chat")));
  const clog = cpage.getByRole("dialog", { name: "Chat with AkatsukiZipUp" }).getByRole("log", { name: "Messages" });
  const oldCard = clog.getByRole("article", { name: `Invoice ${invNo(C.number, 1)}`, exact: true });
  const newCard = clog.getByRole("article", { name: `Invoice ${invNo(C.number, 2)}`, exact: true });
  await newCard.waitFor({ timeout: 30000 });
  check(await oldCard.getByText("Replaced", { exact: true }).isVisible(), `visitor: the old invoice (${invNo(C.number, 1)}) has a REPLACED badge`);
  check((await oldCard.getByRole("button", { name: COPY.yesButton }).count()) === 0 && (await oldCard.getByRole("button", { name: COPY.noButton }).count()) === 0, "visitor: the replaced invoice has no answer buttons");
  const toggle = oldCard.getByRole("button", { name: "Show details" });
  check((await toggle.getAttribute("aria-expanded")) === "false" && !(await oldCard.getByText("Duo bundle").isVisible()), "visitor: the replaced invoice starts folded");
  await toggle.click();
  check(await oldCard.getByText("Duo bundle").isVisible(), "visitor: Show details unfolds it");
  check(await newCard.getByText("Payment due").isVisible(), `visitor: the newest invoice (${invNo(C.number, 2)}) reads Payment due`);
  check((await newCard.getByRole("button", { name: COPY.yesButton }).isVisible()) && (await newCard.getByRole("button", { name: COPY.noButton }).isVisible()), "visitor: the newest invoice has both buttons");
  check((await clog.getByText(COPY.updated, { exact: true }).count()) === 1, `visitor: "${COPY.updated}" shows once, above the new card`);
  check((await clog.getByText(COPY.question).count()) === 1, "visitor: the question isn't repeated from the message text");
  const stale = await cctx.request.post(`${base}/api/chat/invoice`, { data: { messageId: C.messageId, answer: "confirmed" }, headers: { Origin: base } });
  check(stale.status() === 409, `api: answering the replaced invoice → 409 (${stale.status()})`);
  await cpage.screenshot({ path: `${out}/chat-notify-replaced-visitor.png` });
  const o390 = await cpage.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check(!o390, "visitor 390px: no horizontal overflow with a replaced and an updated invoice");

  await admin.goto(`${base}/admin/chat?c=${C.convId}`, { waitUntil: "networkidle" });
  const alog = admin.getByRole("log", { name: "Messages" });
  const aOld = alog.getByRole("article", { name: `Invoice ${invNo(C.number, 1)}`, exact: true });
  const aNew = alog.getByRole("article", { name: `Invoice ${invNo(C.number, 2)}`, exact: true });
  await aNew.waitFor({ timeout: 30000 });
  check(await aOld.getByText("Replaced", { exact: true }).isVisible(), "admin: the old invoice has the REPLACED badge");
  check((await aOld.getByRole("link", { name: "Send payment details" }).count()) === 0 && (await aOld.getByText("Waiting for the shopper").count()) === 0, "admin: no answer status and no Send payment details on the replaced invoice");
  check(await aNew.getByText("Waiting for the shopper").isVisible(), "admin: the newest invoice shows the answer status");
  check((await aNew.getByRole("link", { name: "Send payment details" }).getAttribute("href")) === `/admin/orders/${C.orderId}#payment`, "admin: Send payment details on the newest invoice only");
  check((await aNew.getByRole("link", { name: "Send updated invoice" }).getAttribute("href")) === `/admin/orders/${C.orderId}#payment`, "admin: a Send updated invoice link to the order's #payment");
  check((await alog.getByText(COPY.updated, { exact: true }).count()) === 1, `admin: "${COPY.updated}" shows once above the new card`);
  await admin.screenshot({ path: `${out}/chat-notify-replaced-admin.png` });

  // Confirming the newest invoice brings the notify card.
  await newCard.getByRole("button", { name: COPY.yesButton }).click();
  await clog.getByRole("region", { name: NOTIFY.title }).waitFor({ timeout: 20000 });
  check(true, "notify card: shows after confirming the updated invoice");
  await cctx.close();

  // iPhone Safari in a normal tab can't get web push: the card explains Add to Home Screen instead of a button.
  const iphone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    extraHTTPHeaders: { "x-forwarded-for": testIp() },
  });
  await iphone.addCookies([{ name: "akz_chat", value: C.token, url: base, httpOnly: true, sameSite: "Lax" }]);
  const ipage = await iphone.newPage();
  await ipage.goto(`${base}/?chat=open`, { waitUntil: "networkidle" });
  const icard = ipage.getByRole("dialog", { name: "Chat with AkatsukiZipUp" }).getByRole("region", { name: NOTIFY.title });
  await icard.waitFor({ timeout: 30000 });
  check((await icard.getByText(/add this site to your Home Screen/).isVisible()) && (await icard.getByRole("button").count()) === 0, "notify card on iPhone Safari: Add to Home Screen steps, no button");
  await iphone.close();

  // Notifications blocked for the site: the card says how to allow them, no button.
  const blocked = await shopper(C);
  await blocked.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "denied" }));
  const bpage = await blocked.newPage();
  await bpage.goto(`${base}/?chat=open`, { waitUntil: "networkidle" });
  const bcard = bpage.getByRole("dialog", { name: "Chat with AkatsukiZipUp" }).getByRole("region", { name: NOTIFY.title });
  await bcard.waitFor({ timeout: 30000 });
  check((await bcard.getByText(/Notifications are blocked for this site/).isVisible()) && (await bcard.getByRole("button").count()) === 0, "notify card when blocked: says how to allow them, no button");
  await blocked.close();

  /* ------------------------------------------------------------ the admin's own worker still works */

  await admin.goto(`${base}/admin/notifications`, { waitUntil: "networkidle" });
  const both = await admin.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const adminReg = await navigator.serviceWorker.getRegistration("/admin/");
    const storeReg = await navigator.serviceWorker.getRegistration("/");
    const url = (r) => (r?.active ?? r?.installing ?? r?.waiting)?.scriptURL ?? null;
    return { admin: [adminReg?.scope, url(adminReg)], store: [storeReg?.scope, url(storeReg)] };
  });
  check(both.admin[0] === `${base}/admin/` && both.admin[1] === `${base}/admin-sw.js`, `admin: /admin-sw.js still owns /admin/ next to the store's worker (${both.admin.join(" ")})`);
  check(both.store[0] === `${base}/` && both.store[1] === `${base}/sw.js`, "admin: the store's /sw.js sits at / without taking over");
  await adminCtx.close();
  await actx.close();
} catch (err) {
  console.log(`FAIL  stopped: ${err.message.split("\n")[0]}`);
  failed++;
} finally {
  const gone = await cleanup();
  const leftSubs = await db.chatPushSubscription.count({ where: { endpoint: { startsWith: `https://push.invalid/e2e-${tag}/` } } });
  check(gone.orders >= 2 && gone.convs >= 3 && leftSubs === 0, `cleanup: removed ${gone.orders} test orders, ${gone.convs} conversations and their subscriptions`);
  await db.$disconnect();
  await browser.close();
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
process.exit(failed ? 1 : 0);
