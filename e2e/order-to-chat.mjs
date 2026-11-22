// The whole order path, the way the owner's Bourbon / Muh-med stores work, in one run on a phone:
// home card → hoodie page (style picked) → cart → checkout with Cryptocurrency (10% off) → "Order confirmed"
// → the chat opens on the invoice → "Yes, all correct" → the admin sends the payment details from the order
// page → the shopper sees them in the chat. Then the order is cancelled so the stock goes back.
// usage: node --env-file=.env.local e2e/order-to-chat.mjs [baseUrl] [screenshotDir]
import { chromium } from "playwright";
import os from "node:os";

const base = process.argv[2] ?? "http://localhost:3200";
const out = process.argv[3] ?? "e2e/out";
const password = process.env.ADMIN_PASSWORD;
if (!password) throw new Error("run with node --env-file=.env.local so ADMIN_PASSWORD is set");

// A made-up IP per run so the per-IP limits (orders 5/hour) don't trip on repeated runs; Vercel sets its own.
const r = () => Math.floor(Math.random() * 250) + 1;
const headers = { "x-forwarded-for": `10.${r()}.${r()}.${r()}` };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? `${os.homedir()}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome` });
let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};

const shopCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: headers });
await shopCtx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
const shop = await shopCtx.newPage();
const errors = [];
shop.on("pageerror", (e) => errors.push(e.message));
const panel = shop.locator('[aria-labelledby="akz-chat-title"]');

// 1. Home: the Shinobi card's Add to cart opens the hoodie page with Shinobi picked.
await shop.goto(`${base}/`, { waitUntil: "load" });
const shinobiCard = shop.locator("article").filter({ has: shop.getByRole("heading", { name: "Shinobi", exact: true }) });
await shinobiCard.getByRole("link", { name: /^Add to cart/ }).click();
await shop.waitForURL(/\/products\/akatsukizipup-mask-hoodie\?style=Shinobi$/);
await shop.waitForTimeout(900);
check(true, "home card → the hoodie page with ?style=Shinobi");

// 2. Hoodie page: Solo, size M → add → cart → checkout.
await shop.getByRole("radio", { name: /Solo Hoodie/ }).click();
const pack = shop.locator('[role="radio"][aria-checked="true"]').locator("..");
check((await pack.getByLabel("Style for hoodie 1").inputValue()) === "Shinobi", "Shinobi is picked on the hoodie page");
await pack.getByLabel("Size for hoodie 1").selectOption("M");
// The extras start ticked; this order is the hoodie alone.
for (const extra of ["Add Mystery Box", "Add Shipping Protection", "Add Priority Shipping"]) await pack.getByText(extra).click();
await shop.getByRole("button", { name: "Add to cart", exact: true }).first().click();
const drawer = shop.getByRole("dialog", { name: "Your cart" });
await drawer.getByText("Shinobi / M").waitFor({ timeout: 10000 });
check(true, "the cart has Shinobi / M");
await drawer.getByRole("link", { name: /Check out/ }).click();
await shop.waitForURL(`${base}/checkout`);

// 3. Checkout with Cryptocurrency: 10% off $63.69 = −$6.37 → $57.32.
await shop.getByRole("button", { name: /^Place order/ }).waitFor();
for (const key of ["chime", "zelle", "cash-app", "apple-pay", "crypto"]) {
  check((await shop.locator(`label[data-rail="${key}"]`).count()) === 1, `checkout offers ${key}`);
}
await shop.locator('label[data-rail="crypto"]').click();
check(await shop.getByRole("button", { name: "Place order · $57.32" }).isVisible(), "crypto takes 10% off: Place order · $57.32");
await shop.fill("#name", "Grace Hopper");
await shop.fill("#email", "grace+e2e@example.com");
await shop.selectOption("#country", "US");
await shop.fill("#address1", "1 Compiler Way");
await shop.fill("#city", "Arlington");
await shop.fill("#region", "VA");
await shop.fill("#postalCode", "22201");
await shop.getByRole("button", { name: "Place order · $57.32" }).click();

// 4. "Order confirmed", and the chat opens by itself on the invoice.
await shop.waitForURL(/\/order\/[A-Za-z0-9_-]{20,}$/, { timeout: 30000 });
check(await shop.getByRole("heading", { level: 1, name: "Order confirmed" }).isVisible(), "lands on “Order confirmed”");
await panel.waitFor({ state: "visible", timeout: 10000 });
check(true, "the chat opened by itself");
const yes = panel.getByRole("button", { name: "Yes, all correct" });
await yes.waitFor({ timeout: 15000 });
const panelText = await panel.textContent();
const number = (panelText.match(/Order\s*(#\d{4,})/) ?? [])[1];
check(Boolean(number), `the invoice is in the chat (${number})`);
check(panelText.includes("$57.32") && panelText.includes("Cryptocurrency"), "the invoice card shows $57.32 and Cryptocurrency");
check(panelText.includes("Are your items, delivery address and contact details all correct?"), "it asks “are your items, address and details all correct?”");
await shop.screenshot({ path: `${out}/order-chat-invoice.png` });

// 5. "Yes, all correct" → the answer and the automatic reply.
await yes.click();
await panel.getByText("Thanks for confirming! We'll send your payment details here within 5 minutes.").waitFor({ timeout: 15000 });
check(true, "“Yes, all correct” → “Thanks for confirming! We'll send your payment details here…”");
check((await panel.getByRole("button", { name: "Yes, all correct" }).count()) === 0, "the buttons are gone after answering");

// 6. Admin: the order shows Confirmed in the chat; send the payment details from the order page.
const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: headers });
const admin = await adminCtx.newPage();
await admin.goto(`${base}/admin/login`, { waitUntil: "load" });
await admin.fill("#password", password);
await Promise.all([admin.waitForURL(`${base}/admin`), admin.click("button[type=submit]")]);
await admin.goto(`${base}/admin/orders?q=${encodeURIComponent(number)}`, { waitUntil: "load" });
await admin.locator("table").getByRole("link", { name: number, exact: true }).click();
await admin.waitForURL(/\/admin\/orders\/[^/?#]+$/);
const payCard = admin.locator("#payment");
await payCard.waitFor();
check(/Confirmed/.test(await payCard.textContent()), "admin order page: the invoice is Confirmed in the chat");
const prefill = await admin.locator("#payment-details").inputValue();
check(prefill.includes(number) && prefill.includes("$57.32"), "the payment message is prefilled with the order number and $57.32");
await admin.getByRole("button", { name: "Send payment details" }).click();
await admin.getByRole("button", { name: "Send again" }).waitFor({ timeout: 15000 });
check(true, "admin sent the payment details (Send again offered)");

// 7. The shopper sees the payment details in the open chat (live over Pusher; a reopen is the fallback).
const payment = panel.getByText(`Payment details · ${number}`);
const live = await payment.waitFor({ timeout: 8000 }).then(() => true, () => false);
if (!live) {
  await panel.getByRole("button", { name: "Close chat" }).click();
  await shop.waitForTimeout(400);
  await shop.locator('button[aria-label*="chat" i]').last().click();
  await payment.waitFor({ timeout: 10000 });
}
check(true, `the shopper sees “Payment details · ${number}” in the chat (${live ? "live" : "after reopening"})`);
check((await panel.textContent()).includes("$57.32"), "the payment details say $57.32");
check((await panel.getByRole("button", { name: /^Copy/ }).count()) >= 1, "with a Copy button");
await shop.screenshot({ path: `${out}/order-chat-payment.png` });
check(errors.length === 0, `no page errors for the shopper${errors.length ? `: ${errors.join(" | ")}` : ""}`);

// 8. Clean up: cancel the test order so its hoodie goes back into stock.
await admin.reload({ waitUntil: "load" });
await admin.getByRole("button", { name: "Cancel order" }).click();
await admin.getByRole("button", { name: "Yes, cancel order" }).click();
await admin.getByText("Put back:").first().waitFor({ timeout: 15000 });
check(true, "test order cancelled, stock put back");

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
