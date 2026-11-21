// Insights end to end: visitor tracking → Admin → Analytics, newsletter → Subscribers (+ CSV export),
// contact form → Messages (read / archive / delete), the dashboard, and every insights admin page at 390 px.
// usage: node --env-file=.env.local e2e/insights.mjs [baseUrl]      (needs ADMIN_PASSWORD from .env.local)
import { chromium } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";

const base = process.argv[2] ?? "http://localhost:3213";
const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error("ADMIN_PASSWORD is not set. Run with: node --env-file=.env.local e2e/insights.mjs <base>");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? `${os.homedir()}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome` });
const errors = [];
let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};
const stamp = Date.now().toString(36);
const email = `e2e-${stamp}@example.com`;
// Lists render twice (phone cards + desktop table, one hidden by CSS): always act on the one on screen.
const vis = (loc) => loc.filter({ visible: true }).first();
const sender = `E2E Tester ${stamp}`;

/* ---- 1. A shopper browses ------------------------------------------------------------------------------
   Playwright's default user agent says "HeadlessChrome" and navigator.webdriver is true, and the tracker
   rightly ignores both. A real Chrome agent plus webdriver=false makes this browser count as a person. */
const shop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
});
await shop.addInitScript(() => {
  Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
  // Keep a copy of each time-on-page beacon (Playwright can't read a sendBeacon body).
  const send = navigator.sendBeacon.bind(navigator);
  window.__beacons = [];
  navigator.sendBeacon = (url, data) => {
    if (String(url).endsWith("/api/track/duration") && data instanceof Blob) data.text().then((t) => window.__beacons.push(JSON.parse(t)));
    return send(url, data);
  };
});
const page = await shop.newPage();
page.on("pageerror", (e) => errors.push(`shop: ${e.message}`));
const views = [];
page.on("request", (r) => {
  if (r.url().endsWith("/api/track/view")) views.push(JSON.parse(r.postData() ?? "{}"));
});
const viewDone = () => page.waitForResponse((r) => r.url().endsWith("/api/track/view") && r.status() === 200, { timeout: 15_000 });

await Promise.all([viewDone(), page.goto(`${base}/`, { waitUntil: "networkidle" })]);
await page.waitForTimeout(1500);
await Promise.all([viewDone(), page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Catalog" }).click()]);
await page.waitForURL("**/collections/all");
await page.waitForTimeout(1500);
await Promise.all([viewDone(), page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Contact" }).click()]);
await page.waitForURL("**/pages/contact");
await page.waitForTimeout(500);
check(views.map((v) => v.path).join(" → ") === "/ → /collections/all → /pages/contact", `one view per page (${views.map((v) => v.path).join(" → ")})`);
check(new Set(views.map((v) => v.viewId)).size === 3, "each view has its own viewId");
const beacons = await page.evaluate(() => window.__beacons);
check(
  beacons.length === 2 && beacons[0].viewId === views[0].viewId && beacons[1].viewId === views[1].viewId && beacons.every((b) => b.ms >= 1000 && b.ms <= 60_000),
  `one time-on-page beacon per page left, with its visible time (${beacons.map((b) => `${b.ms}ms`).join(", ")})`,
);
const cookies = await shop.cookies();
const vid = cookies.find((c) => c.name === "akz_vid");
check(Boolean(vid?.httpOnly) && /^[0-9a-f-]{36}$/.test(vid?.value ?? ""), "visitor cookie akz_vid is set, httpOnly");

// Secret URLs: an order page's token (and anything in a query string) must never be stored.
const orderToken = `abc123${stamp}`;
const secretViews = await page.evaluate(async ([t, st]) => {
  const send = (path, i) =>
    fetch("/api/track/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, viewId: `secret-${st}-${i}` }) }).then((r) => r.status);
  return Promise.all([send(`/order/${t}`, 1), send(`/invoice/${t}`, 2), send(`/checkout?email=${t}@example.com`, 3)]);
}, [orderToken, stamp]);
check(secretViews.every((s) => s === 200), "secret-path views accepted (/order/<token>, /invoice/<token>, /checkout?…)");

/* ---- 2. Newsletter ------------------------------------------------------------------------------------- */
const footer = page.locator("footer");
await footer.getByLabel("Email").fill("not-an-email");
await footer.getByRole("button", { name: "Sign up" }).click();
check(await footer.getByRole("alert").filter({ hasText: "valid email" }).isVisible(), "newsletter: invalid email shows an inline error");
await footer.getByLabel("Email").fill(email);
await footer.getByRole("button", { name: "Sign up" }).click();
await footer.getByText("Thanks for subscribing").waitFor({ timeout: 10_000 });
check(true, "newsletter: subscribe shows “Thanks for subscribing”");
await page.reload({ waitUntil: "networkidle" });
await footer.getByLabel("Email").fill(email.toUpperCase());
await footer.getByRole("button", { name: "Sign up" }).click();
await footer.getByText("Thanks for subscribing").waitFor({ timeout: 10_000 });
check(true, "newsletter: subscribing again (same address, other case) gives the same success");

/* ---- 3. Contact form ----------------------------------------------------------------------------------- */
const form = page.locator("main form");
await form.getByRole("button", { name: "Send" }).click();
check(await form.getByText("Please enter your email.").isVisible(), "contact: empty email → inline error");
check(await form.getByText("Please write a little more").isVisible(), "contact: empty message → inline error");
check((await page.locator("#contact-email").getAttribute("aria-invalid")) === "true", "contact: invalid field is marked aria-invalid");
await page.locator("#contact-email").fill("nope");
await page.locator("#contact-phone").fill("call me");
await form.getByRole("button", { name: "Send" }).click();
check(await form.getByText("Please enter a valid email address.").isVisible(), "contact: bad email → inline error");
check(await form.getByText("Please enter a valid phone number").isVisible(), "contact: bad phone → inline error");
await page.locator("#contact-name").fill(sender);
await page.locator("#contact-email").fill(email);
await page.locator("#contact-phone").fill("+1 555 0100");
await page.locator("#contact-message").fill(`Hello from the e2e test ${stamp}.\nSecond line <b>not bold</b>.`);
await form.getByRole("button", { name: "Send" }).click();
await page.getByText("Thanks for contacting us.").waitFor({ timeout: 10_000 });
check(true, "contact: a valid message shows the thank-you");
await page.close(); // pagehide: the last beacon
await shop.close();

/* ---- 4. Admin ------------------------------------------------------------------------------------------ */
const admin = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const a = await admin.newPage();
a.on("pageerror", (e) => errors.push(`admin: ${e.message}`));
await a.goto(`${base}/admin/login`, { waitUntil: "networkidle" });
await a.locator("#password").fill(password);
await Promise.all([a.waitForURL(`${base}/admin`), a.getByRole("button", { name: "Sign in" }).click()]);
check(true, "admin: signed in");

// Dashboard
await a.getByRole("heading", { name: "Dashboard" }).waitFor();
const kpi = async (label) => (await a.locator("p", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::p[1]").first().textContent())?.trim() ?? "";
const visitorsToday = await kpi("Visitors today");
check(Number(visitorsToday.replace(/,/g, "")) >= 1, `dashboard: visitors today is a number ≥ 1 (${visitorsToday})`);
check(/^\$[\d,]+\.\d{2}$/.test(await kpi("Revenue, 30 days")), `dashboard: revenue shows dollars (${await kpi("Revenue, 30 days")})`);
check(/^\d+ left$/.test(await kpi("Akatsuki stock")), `dashboard: stock per style (${await kpi("Akatsuki stock")}, ${await kpi("Shinobi stock")})`);
check(Number(await kpi("Needs a reply")) >= 1, `dashboard: needs-a-reply counts the new message (${await kpi("Needs a reply")})`);
check(await a.getByRole("heading", { name: "Today" }).isVisible(), "dashboard: Today strip");
check(await a.getByText(sender).first().isVisible(), "dashboard: the new message is in Recent messages");

// Analytics
await a.goto(`${base}/admin/analytics?p=today`, { waitUntil: "networkidle" });
check(await a.getByText("/collections/all", { exact: true }).first().isVisible(), "analytics: /collections/all is in Top pages");
check(await a.getByText("/order/[token]", { exact: true }).first().isVisible(), "analytics: an order page shows as /order/[token]");
check(await a.getByText("/invoice/[token]", { exact: true }).first().isVisible(), "analytics: an invoice page shows as /invoice/[token]");
check(!(await a.content()).includes(orderToken), "analytics: no order token (or checkout query) anywhere on the page");
check(await vis(a.getByText(email, { exact: true })).isVisible(), "analytics: the visitor shows with the email they subscribed with");
const avg = await kpi("Avg time on page");
check(avg !== "—" && /\d+(s|m)/.test(avg), `analytics: average time on page is measured (${avg})`);
check(Number((await kpi("Page views")).replace(/,/g, "")) >= 3, `analytics: page views today ≥ 3 (${await kpi("Page views")})`);
await a.getByRole("link", { name: /All traffic/ }).click();
await a.waitForURL(/t=all/);
check((await a.getByRole("link", { name: /All traffic/ }).getAttribute("aria-current")) === "page", "analytics: All traffic toggle");
for (const p of ["7 days", "30 days", "90 days"]) {
  const tab = a.getByRole("link", { name: new RegExp(`^${p}`) });
  await tab.click();
  await a.waitForFunction((label) => [...document.querySelectorAll('nav[aria-label="Filter"] a[aria-current="page"]')].some((x) => x.textContent.startsWith(label)), p);
  check(await a.getByText("/collections/all", { exact: true }).first().isVisible(), `analytics: ${p} period shows the views`);
}

// Subscribers + CSV
await a.goto(`${base}/admin/subscribers?q=${encodeURIComponent(email)}`, { waitUntil: "networkidle" });
check(await vis(a.getByText(email, { exact: true })).isVisible(), "subscribers: the new address is listed (stored lower-case, once)");
const [download] = await Promise.all([a.waitForEvent("download"), a.getByRole("link", { name: "Export CSV" }).click()]);
const csv = await fs.readFile(await download.path(), "utf8");
const lines = csv.trim().split(/\r?\n/);
check(lines[0] === '"email","status","source","subscribed_at","updated_at"', `csv: header row (${lines[0]})`);
check(lines.length === 2 && lines[1].startsWith(`"${email}","subscribed","footer"`), `csv: exactly the filtered row (${lines.length - 1} row)`);
await vis(a.getByRole("button", { name: `Unsubscribe ${email}` })).click();
await a.getByText("No subscribed addresses match").waitFor({ timeout: 10_000 });
check(true, "subscribers: unsubscribe moves it out of Subscribed");
await a.goto(`${base}/admin/subscribers?status=all&q=${encodeURIComponent(email)}`, { waitUntil: "networkidle" });
await vis(a.getByRole("button", { name: `Resubscribe ${email}` })).click();
await vis(a.getByRole("button", { name: `Unsubscribe ${email}` })).waitFor({ timeout: 10_000 });
check(true, "subscribers: resubscribe");

// Messages
await a.goto(`${base}/admin/messages`, { waitUntil: "networkidle" });
const item = a.getByRole("link", { name: new RegExp(sender) });
check(await item.isVisible(), "messages: the new message is in Unread");
check((await item.textContent()).includes("Unread"), "messages: it is marked unread");
await item.click();
await a.waitForURL(/\/admin\/messages\/[^/?]+$/);
const msgUrl = a.url();
check(await a.getByText(`Hello from the e2e test ${stamp}.`, { exact: false }).isVisible(), "message: full text shown");
check((await a.locator("p.whitespace-pre-wrap").textContent()).includes("<b>not bold</b>"), "message: shown as plain text, not HTML");
const reply = await a.getByRole("link", { name: "Reply by email" }).getAttribute("href");
check(reply.startsWith(`mailto:${email}?subject=`), "message: Reply by email is a mailto with a subject");
const messageCard = a.locator("section", { has: a.getByRole("heading", { name: "Message", exact: true }) });
check(await messageCard.getByText("read", { exact: true }).isVisible(), "message: opening it marked it read");
await a.goto(`${base}/admin/messages`, { waitUntil: "networkidle" });
check(!(await a.getByRole("link", { name: new RegExp(sender) }).isVisible()), "messages: no longer in Unread");
await a.goto(`${base}/admin/messages?status=read`, { waitUntil: "networkidle" });
check(await a.getByRole("link", { name: new RegExp(sender) }).isVisible(), "messages: now in Read");
await a.goto(msgUrl, { waitUntil: "networkidle" });
await a.getByRole("button", { name: "Archive" }).click();
await a.getByRole("button", { name: "Unarchive" }).waitFor({ timeout: 10_000 });
await a.goto(`${base}/admin/messages?status=archived`, { waitUntil: "networkidle" });
check(await a.getByRole("link", { name: new RegExp(sender) }).isVisible(), "messages: archive moves it to Archived");

/* ---- 5. Phones: every insights admin page fits 390 px ------------------------------------------------- */
await a.setViewportSize({ width: 390, height: 844 });
for (const path of ["/admin", "/admin/analytics", "/admin/analytics?p=90d&t=all", "/admin/subscribers?status=all", `/admin/subscribers?q=${encodeURIComponent(email)}`, "/admin/messages?status=all", new URL(msgUrl).pathname]) {
  await a.goto(`${base}${path}`, { waitUntil: "networkidle" });
  const { sw, w } = await a.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  check(sw <= w, `390 px: ${path} has no sideways scroll (${sw} ≤ ${w})`);
}
await a.goto(`${base}/admin/analytics?p=today`, { waitUntil: "networkidle" });
await a.screenshot({ path: "e2e/out/insights-analytics-390.png", fullPage: true }).catch(() => {});

/* ---- 6. Clean up the test rows (delete with confirm) --------------------------------------------------- */
await a.goto(msgUrl, { waitUntil: "networkidle" });
await a.getByRole("button", { name: "Delete" }).click();
check(await a.getByText("Delete this message for good?").isVisible(), "message: delete asks to confirm");
await Promise.all([a.waitForURL(`${base}/admin/messages`), a.getByRole("button", { name: "Yes, delete" }).click()]);
await a.goto(`${base}/admin/messages?status=all`, { waitUntil: "networkidle" });
check(!(await a.getByRole("link", { name: new RegExp(sender) }).isVisible()), "message: deleted");
await a.goto(`${base}/admin/subscribers?status=all&q=${encodeURIComponent(email)}`, { waitUntil: "networkidle" });
await vis(a.getByRole("button", { name: `Delete ${email}` })).click();
await vis(a.getByRole("button", { name: "Yes, delete" })).click();
await a.getByText(/No addresses match|No subscribers yet/).waitFor({ timeout: 10_000 });
check(true, "subscriber: deleted after confirm");

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall insights checks passed");
process.exit(failed ? 1 : 0);
