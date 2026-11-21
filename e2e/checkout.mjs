// The whole order loop: a shopper buys a Duo pack + Mystery Box on a phone, the server prices and stocks it,
// Admin pages hold a Pusher socket open, so they wait for "load" (not "networkidle").
// the order page and invoice show it, then the admin confirms payment, refunds, cancels, and stock comes back
// exactly once. Also: crafted requests (wrong prices, too many, unknown items), sold-out storefront, payment
// methods. Leaves stock and payment methods as it found them.
// usage: node --env-file=.env.local e2e/checkout.mjs [baseUrl] [screenshotDir]
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";

const base = process.argv[2] ?? "http://localhost:3200";
const out = process.argv[3] ?? "e2e/out";
fs.mkdirSync(out, { recursive: true });
const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error("ADMIN_PASSWORD is missing: run with node --env-file=.env.local e2e/checkout.mjs <base>");
  process.exit(2);
}

// Each run looks like a fresh visitor to the rate limits (orders 5/hour per IP). Locally the dev server
// passes x-forwarded-for through; on Vercel the platform sets it and this header is ignored.
const r = () => Math.floor(Math.random() * 250) + 1;
const headers = { "x-forwarded-for": `10.${r()}.${r()}.${r()}` };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? `${os.homedir()}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome` });
let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};
const STYLES = ["Akatsuki", "Shinobi"];

// ---- Admin (desktop) ----------------------------------------------------------------------------------
const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: headers });
const admin = await adminCtx.newPage();
await admin.goto(`${base}/admin/login`);
await admin.fill("#password", password);
await admin.click('button[type="submit"]');
await admin.waitForURL(`${base}/admin`, { timeout: 30000 });

async function readStock(page = admin) {
  await page.goto(`${base}/admin/products`, { waitUntil: "load" });
  const out = {};
  for (const s of STYLES) out[s] = Number((await page.locator(`[data-stock="${s}"]`).textContent()).match(/\d+/)[0]);
  return out;
}
async function setStock(style, n) {
  await admin.goto(`${base}/admin/products`, { waitUntil: "load" });
  await admin.fill(`#stock-${style}`, String(n));
  await admin
    .locator("li")
    .filter({ has: admin.locator(`#stock-${style}`) })
    .getByRole("button", { name: "Save" })
    .click();
  await admin
    .locator(`[data-stock="${style}"]`)
    .filter({ hasText: new RegExp(`^${n}\\b`) })
    .waitFor({ timeout: 30000 });
}
async function openOrder(page, number) {
  await page.goto(`${base}/admin/orders?q=${encodeURIComponent(number)}`, { waitUntil: "load" });
  await page.locator("table").getByRole("link", { name: number, exact: true }).click();
  await page.waitForURL(/\/admin\/orders\/[^/?]+$/);
  await page.waitForLoadState("load");
}
const statusPill = (page) => page.locator("main header span.rounded-full").first();

const before = await readStock();
console.log(`      stock before: Akatsuki ${before.Akatsuki}, Shinobi ${before.Shinobi}`);
if (before.Akatsuki < 3 || before.Shinobi < 2) {
  console.error("Needs at least 3 Akatsuki and 2 Shinobi in stock to run.");
  process.exit(2);
}

// ---- Shopper (phone) ----------------------------------------------------------------------------------
const shopCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: headers, locale: "en-US" });
const page = await shopCtx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// 1. Duo pack (Akatsuki M + Shinobi L) + Mystery Box, as in flow.mjs.
await page.goto(`${base}/products/akatsukizipup-mask-hoodie`, { waitUntil: "networkidle" });
const card = page.locator('[role="radio"][aria-checked="true"]').locator("..");
await card.getByRole("button", { name: "Size M for hoodie 1" }).click();
await card.getByRole("button", { name: "Size L for hoodie 2" }).click();
await card.getByRole("button", { name: "Shinobi" }).nth(1).click();
await page.getByText("Mystery Box", { exact: true }).click();
await page.getByRole("button", { name: /^Add to cart · / }).click();
await page.waitForTimeout(1300);
await page
  .getByRole("dialog", { name: "Your cart" })
  .getByRole("link", { name: /Check out/ })
  .click();
await page.waitForURL(`${base}/checkout`);
await page.getByRole("button", { name: /^Place order/ }).waitFor();

const summary = await page.locator("aside").first().textContent();
check(summary.includes("Akatsuki / M, Shinobi / L") && summary.includes("Mystery Box"), "checkout lists the duo pack and the mystery box");
check(summary.includes("$129.97"), "checkout total is $129.97");
check(summary.includes("You save$63.28"), "checkout shows the saving ($63.28)");
check(
  await page.getByText("This store is a design preview: your order is recorded but nothing is charged or shipped.").isVisible(),
  "the design-preview line is next to the button",
);

// 2. Empty submit: inline errors, no request.
await page.getByRole("button", { name: /^Place order/ }).click();
for (const msg of ["Enter your full name.", "Enter a valid email address", "Enter your street address.", "Enter your city.", "Enter your postal code."]) {
  check(await page.getByText(msg).first().isVisible(), `empty form shows “${msg}”`);
}
check(page.url() === `${base}/checkout`, "stays on checkout");
check((await page.evaluate(() => document.activeElement?.id)) === "name", "focus moves to the first missing field");
await page.screenshot({ path: `${out}/checkout-errors.png`, fullPage: true });

// 3. Fill it in and place the order.
await page.fill("#name", "Ada Lovelace");
check(!(await page.getByText("Enter your full name.").isVisible()), "an error clears as soon as it's fixed");
await page.fill("#email", "ada+e2e@example.com");
await page.fill("#phone", "+1 512 555 0100");
await page.selectOption("#country", "US");
await page.fill("#address1", "1 Cloud Street");
await page.fill("#city", "Austin");
await page.fill("#region", "TX");
await page.fill("#postalCode", "73301");
await page.fill("#notes", "e2e test order");
await page.getByText("Bank transfer", { exact: true }).click();
const pmId = await page.locator("label", { hasText: "Bank transfer" }).locator('input[type="radio"]').getAttribute("value");
check(await page.getByText("Send $129.97 by bank transfer").isVisible(), "the chosen method's instructions show the total");
await page.screenshot({ path: `${out}/checkout-filled.png`, fullPage: true });
await page.getByRole("button", { name: /^Place order/ }).click();
await page.waitForURL(/\/order\/[A-Za-z0-9_-]{32}$/, { timeout: 60000 });
await page.waitForLoadState("networkidle");
const orderUrl = page.url();

// 4. The order page.
const orderText = await page.locator("main").textContent();
const number = orderText.match(/Order (#\d{4,})/)?.[1];
check(Boolean(number), `order page shows the order number (${number})`);
check(orderText.includes("Thank you, Ada!"), "order page thanks the customer");
check(orderText.includes("Send $129.97"), "order page asks for $129.97");
check(orderText.includes(`Send $129.97 by bank transfer and put order ${number} as the reference`), "payment instructions carry the total and the order number");
check(orderText.includes("You saved$63.28"), "order page shows You saved $63.28");
check(orderText.includes("Akatsuki / M, Shinobi / L") && orderText.includes("Mystery Box"), "order page lists the items");
check(orderText.includes("1 Cloud Street") && orderText.includes("United States"), "order page shows the shipping address");
check((await page.locator("#cart-icon").getAttribute("aria-label")).includes("0 items"), "the cart was emptied");
await page.screenshot({ path: `${out}/order-page.png`, fullPage: true });

// 5. The invoice.
await page.getByRole("link", { name: "View invoice" }).click();
await page.waitForURL(/\/invoice\//);
const invoiceText = await page.locator("body").textContent();
check(invoiceText.includes("Invoice") && invoiceText.includes(number), "invoice has the order number");
check(invoiceText.includes("Unpaid") && invoiceText.includes("$129.97"), "invoice says Unpaid, $129.97");
check(invoiceText.includes("info@akatsukizipup.com") && invoiceText.includes("Ada Lovelace"), "invoice has the seller and the customer");
check(await page.getByRole("button", { name: "Print / Save as PDF" }).isVisible(), "invoice has a print button");
check((await page.locator("#cart-icon").count()) === 0, "invoice has no store chrome");
await page.emulateMedia({ media: "print" });
check(!(await page.getByRole("button", { name: "Print / Save as PDF" }).isVisible()), "print button is hidden when printing");
await page.emulateMedia({ media: "screen" });
await page.screenshot({ path: `${out}/invoice.png`, fullPage: true });

// 6. Crafted requests: the server's prices win, more than 6 hoodies is refused, unknown items are refused.
await admin.goto(`${base}/admin/orders`, { waitUntil: "load" });
// Each crafted request comes from its own made-up IP so the per-IP order limit (5/hour) doesn't mask the check.
const post = async (body) => {
  const res = await adminCtx.request.post(`${base}/api/orders`, {
    headers: { origin: base, "content-type": "application/json", "x-forwarded-for": `10.${r()}.${r()}.${r()}` },
    data: body,
  });
  return { status: res.status(), data: await res.json() };
};
const customer = { name: "Crafted Request", email: "crafted+e2e@example.com", country: "DE", address1: "Wolkenweg 1", city: "Berlin", postalCode: "10115", paymentOptionId: pmId };
const crafted = await post({ ...customer, lines: [{ key: "bundle:solo:Akatsuki / S", qty: 1, price: 0.01 }], subtotal: 0.01, total: 0.01 });
check(crafted.status === 201 && crafted.data.token, "a request with made-up prices is accepted…");
await page.goto(`${base}/order/${crafted.data.token}`, { waitUntil: "networkidle" });
check((await page.locator("main").textContent()).includes("Send $63.69"), "…but charged the real price ($63.69, not $0.01)");
const craftedNumber = crafted.data.number;

const tooMany = await post({ ...customer, lines: [{ key: "bundle:squad:Akatsuki / S, Akatsuki / M, Akatsuki / L", qty: 10 }] });
check(
  tooMany.status === 400 && /up to 6 hoodies/.test(tooMany.data.error ?? ""),
  `30 Akatsuki → 400 “${tooMany.data.error}” (one order can't take the whole stock)`,
);
const sevenSplit = await post({ ...customer, lines: [{ key: "bundle:squad:Akatsuki / S, Akatsuki / M, Akatsuki / L", qty: 2 }, { key: "bundle:solo:Shinobi / M", qty: 1 }] });
check(sevenSplit.status === 400 && /up to 6 hoodies/.test(sevenSplit.data.error ?? ""), "7 hoodies across two lines → 400 too");
const unknown = await post({ ...customer, lines: [{ key: "bundle:duo:Akatsuki / M", qty: 1 }] });
check(unknown.status === 400, "a pack with the wrong number of hoodies → 400");
const freebie = await post({ ...customer, lines: [{ key: "addon:free-hoodie", qty: 1 }] });
check(freebie.status === 400, "an item the store doesn't sell → 400");
const badOrigin = await adminCtx.request.post(`${base}/api/orders`, {
  headers: { origin: "https://evil.example" },
  data: { ...customer, lines: [{ key: "addon:mystery-box", qty: 1 }] },
});
check(badOrigin.status() === 403, "a request from another site → 403");

// 7. Admin list refreshes on the realtime ping.
await admin.evaluate(() => window.dispatchEvent(new CustomEvent("admin:order.created", { detail: {} })));
await admin.locator("table").getByRole("link", { name: craftedNumber, exact: true }).waitFor({ timeout: 30000 });
check(true, "orders list refreshes on admin:order.created and shows the new order");
check(await admin.locator("table").getByRole("link", { name: number, exact: true }).isVisible(), "orders list shows the checkout order");

// 8. Stock went down by exactly what was bought: 1 Akatsuki + 1 Shinobi (duo) + 1 Akatsuki (crafted).
const mid = await readStock();
check(
  mid.Akatsuki === before.Akatsuki - 2 && mid.Shinobi === before.Shinobi - 1,
  `stock went down by the units ordered (Akatsuki ${before.Akatsuki}→${mid.Akatsuki}, Shinobi ${before.Shinobi}→${mid.Shinobi})`,
);

// 9. Mark the checkout order paid, with a reference.
await openOrder(admin, number);
check((await admin.locator("main").textContent()).includes("1 Cloud Street"), "order detail shows the address");
check((await admin.getByRole("button", { name: "Mark shipped" }).count()) === 0, "a pending order can't be shipped yet");
await admin.getByRole("button", { name: "Mark paid" }).click();
await admin.fill("#reference", "E2E-REF-42");
await admin.getByRole("button", { name: "Confirm payment" }).click();
await admin.getByText("Reference E2E-REF-42", { exact: true }).waitFor({ timeout: 30000 });
check((await statusPill(admin).textContent()).trim() === "paid", "order is marked paid");
check(
  (await admin.getByRole("button", { name: "Mark shipped" }).isVisible()) && (await admin.getByRole("button", { name: "Mark delivered" }).count()) === 0,
  "paid offers Mark shipped, not Mark delivered",
);
await admin.screenshot({ path: `${out}/admin-order-paid.png`, fullPage: true });
const inv = await adminCtx.newPage();
await inv.goto(orderUrl.replace("/order/", "/invoice/"), { waitUntil: "networkidle" });
check(
  (await inv.locator("body").textContent()).includes("E2E-REF-42") && !(await inv.locator("body").textContent()).includes("Unpaid"),
  "the invoice now says paid, with the reference",
);
await inv.close();

// 10. Refund it (paid, not shipped): its 1 Akatsuki + 1 Shinobi go back.
await admin.getByRole("button", { name: "Refund" }).click();
await admin.getByRole("button", { name: "Yes, mark refunded" }).click();
await admin.getByText("This order is closed").waitFor({ timeout: 30000 });
check((await statusPill(admin).textContent()).trim() === "refunded", "order is refunded");
check(await admin.getByText("Put back: 1 Akatsuki, 1 Shinobi").isVisible(), "timeline records the stock put back");
const afterRefund = await readStock();
check(afterRefund.Akatsuki === before.Akatsuki - 1 && afterRefund.Shinobi === before.Shinobi, "refund restored its stock");

// 11. Cancel the crafted order from one tab while a second, stale tab still offers its buttons.
const stale = await adminCtx.newPage();
await openOrder(stale, craftedNumber);
await stale.getByRole("button", { name: "Cancel order" }).click(); // the stale tab has its confirm open…
await openOrder(admin, craftedNumber);
await admin.getByRole("button", { name: "Cancel order" }).click();
await admin.getByRole("button", { name: "Yes, cancel order" }).click();
await admin.getByText("This order is closed").waitFor({ timeout: 30000 });
check((await statusPill(admin).textContent()).trim() === "cancelled", "crafted order cancelled");
const staleConfirm = stale.getByRole("button", { name: "Yes, cancel order" });
if (await staleConfirm.isVisible()) {
  await staleConfirm.click(); // …and confirms after the order is already cancelled
  await stale.getByText("This order is closed").waitFor({ timeout: 30000 });
  check(true, "cancelling again from a stale tab is a harmless no-op");
} else {
  console.log("      (the stale tab refreshed itself from the realtime ping, so there was nothing stale to click)");
}
await stale.goto(stale.url(), { waitUntil: "load" });
check((await stale.getByText("Put back:").count()) === 1, "stock was put back once, not twice");
await stale.close();
const end = await readStock();
await admin.screenshot({ path: `${out}/admin-products.png`, fullPage: true });
check(end.Akatsuki === before.Akatsuki && end.Shinobi === before.Shinobi, `stock is back where it started (Akatsuki ${end.Akatsuki}, Shinobi ${end.Shinobi})`);

// 12. Sold out: the storefront can't sell a style at 0.
try {
  await setStock("Akatsuki", 0);
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  const akCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Akatsuki", exact: true }) });
  check(await akCard.getByText("Sold out").first().isVisible(), "home: the Akatsuki card says Sold out");
  check(await akCard.getByRole("button", { name: "Sold out" }).isDisabled(), "home: its button is disabled");
  await page.goto(`${base}/products/akatsukizipup-mask-hoodie`, { waitUntil: "networkidle" });
  const open = page.locator('[role="radio"][aria-checked="true"]').locator("..");
  check(
    await open
      .getByRole("button", { name: /^Akatsuki/ })
      .first()
      .isDisabled(),
    "hoodie page: the Akatsuki swatch is disabled",
  );
  check(
    (await open
      .getByRole("button", { name: /^Shinobi/ })
      .first()
      .getAttribute("aria-pressed")) === "true",
    "hoodie page: Shinobi is picked by default",
  );
  await page.screenshot({ path: `${out}/sold-out.png` });
} finally {
  await setStock("Akatsuki", before.Akatsuki);
}
check((await readStock()).Akatsuki === before.Akatsuki, "Akatsuki stock restored after the sold-out check");

// 13. Payment methods: add, show at checkout, hide, delete.
const NAME = `E2E Pay ${r()}`;
await admin.goto(`${base}/admin/payment-methods`, { waitUntil: "load" });
await admin.getByRole("button", { name: "+ Add payment method" }).click();
await admin.fill("#pm-name", "");
await admin.getByRole("button", { name: "Add method" }).click();
check(await admin.getByText("Give the method a name").isVisible(), "payment method form: name is required (inline)");
await admin.fill("#pm-name", NAME);
await admin.fill("#pm-instructions", "Pay {total} and mention {order}.");
check(await admin.getByText("Pay $129.97 and mention #1001.").isVisible(), "payment method form previews {total} and {order}");
await admin.getByRole("button", { name: "Add method" }).click();
await admin.getByRole("heading", { name: NAME }).waitFor({ timeout: 30000 });
check(true, "payment method added");
await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
check((await page.content()).includes(NAME), "the new method is offered at checkout");
const row = admin.locator("li").filter({ has: admin.getByRole("heading", { name: NAME }) });
await row.getByRole("button", { name: `Move ${NAME} up` }).click();
await admin.getByText(`${NAME} moved up.`).waitFor({ timeout: 30000 });
await admin.reload({ waitUntil: "load" });
const names = await admin.locator("li h2").allTextContents();
check(names.indexOf(NAME) === names.length - 2, "move up swaps it with the one above");
await row.getByRole("button", { name: "Turn off" }).click();
await row.getByText("Off", { exact: true }).waitFor({ timeout: 30000 });
await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
check(!(await page.content()).includes(NAME), "a method turned off isn't offered at checkout");
await row.getByRole("button", { name: "Delete", exact: true }).click();
await row.getByRole("button", { name: "Yes, delete" }).click();
await admin.getByText(`${NAME} deleted.`).waitFor({ timeout: 30000 });
await admin
  .getByRole("heading", { name: NAME })
  .waitFor({ state: "detached", timeout: 30000 })
  .catch(() => {});
check(!(await admin.getByRole("heading", { name: NAME }).count()), "payment method deleted");
await admin.screenshot({ path: `${out}/admin-payment-methods.png`, fullPage: true });

// 14. The admin pages work on a phone.
await admin.setViewportSize({ width: 390, height: 844 });
await admin.goto(`${base}/admin/orders`, { waitUntil: "load" });
check(await admin.locator("ul.md\\:hidden a").first().isVisible(), "orders list is cards on a phone");
const overflow = await admin.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check(!overflow, "orders list doesn't scroll sideways at 390px");
await admin.screenshot({ path: `${out}/admin-orders-phone.png`, fullPage: true });
await admin.goto(`${base}/admin/products`, { waitUntil: "load" });
check(!(await admin.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "products page doesn't scroll sideways at 390px");

check(errors.length === 0, `no page errors on the storefront${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
