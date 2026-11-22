// The whole order loop, the owner's Bourbon / Muh-med way: a shopper buys a Duo pack + Mystery Box on a phone
// and picks a payment rail (Chime, Zelle, Cash App, Apple Pay, Cryptocurrency 10% off). Checkout never shows
// account details. Placing the order posts the invoice into the shopper's chat (cookie set for a first-time
// chatter), the "Order confirmed" page opens the chat, and the admin sends the payment details from the order
// page. Then: crafted requests (made-up prices / discounts, too many, unknown items), the admin confirms
// payment, refunds, cancels, stock comes back exactly once, sold-out storefront, payment methods admin.
// Admin pages hold a Pusher socket open, so they wait for "load" (not "networkidle").
// Leaves stock and payment methods as it found them.
// usage: node --env-file=.env.local e2e/checkout.mjs [baseUrl] [screenshotDir]
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const base = process.argv[2] ?? "http://localhost:3200";
const out = process.argv[3] ?? "e2e/out";
fs.mkdirSync(out, { recursive: true });
const password = process.env.ADMIN_PASSWORD;
if (!password || !process.env.DATABASE_URL) {
  console.error("ADMIN_PASSWORD / DATABASE_URL missing: run with node --env-file=.env.local e2e/checkout.mjs <base>");
  process.exit(2);
}
const prisma = new PrismaClient();

// Each run looks like a fresh visitor to the rate limits (orders 5/hour per IP). Locally the dev server
// passes x-forwarded-for through; on Vercel the platform sets it and this header is ignored.
const r = () => Math.floor(Math.random() * 250) + 1;
const ip = () => `10.${r()}.${r()}.${r()}`;
const headers = { "x-forwarded-for": ip() };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? `${os.homedir()}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome` });
let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};
const STYLES = ["Akatsuki", "Shinobi"];
const RAILS = ["chime", "zelle", "cash-app", "apple-pay", "crypto"];
const createdTokens = []; // every order this run places, cancelled at the end if anything is left open

// The rails as the database has them (the seed's five), by key.
const options = await prisma.paymentOption.findMany({ where: { active: true } });
const rail = Object.fromEntries(options.filter((o) => o.key).map((o) => [o.key, o]));
if (!RAILS.every((k) => rail[k])) {
  console.error(`Needs the five seeded payment rails active (${RAILS.join(", ")}). Run npm run db:seed.`);
  process.exit(2);
}

try {
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
    await page.waitForURL(/\/admin\/orders\/[^/?#]+$/);
    await page.waitForLoadState("load");
  }
  const statusPill = (page) => page.locator("main header span.rounded-full").first();
  // The chat panel the order page opens (full screen on a phone): closed before clicking anything under it.
  const chatPanel = (p) => p.locator('[aria-labelledby="akz-chat-title"]');
  async function closeChat(p) {
    const close = chatPanel(p).getByRole("button", { name: "Close chat" });
    if (await close.isVisible().catch(() => false)) {
      await close.click();
      await chatPanel(p).waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    }
  }

  const before = await readStock();
  console.log(`      stock before: Akatsuki ${before.Akatsuki}, Shinobi ${before.Shinobi}`);
  if (before.Akatsuki < 3 || before.Shinobi < 3) {
    console.error("Needs at least 3 Akatsuki and 3 Shinobi in stock to run.");
    process.exit(2);
  }

  // ---- Shopper (phone) ----------------------------------------------------------------------------------
  const shopCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: headers, locale: "en-US" });
  // Count the "open the chat" requests the order page sends to the chat widget.
  await shopCtx.addInitScript(() => {
    window.__openChat = 0;
    window.addEventListener("akz:open-chat", () => {
      window.__openChat += 1;
    });
  });
  const page = await shopCtx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Duo pack (Akatsuki M + Shinobi L) + Mystery Box, as in flow.mjs.
  await page.goto(`${base}/products/akatsukizipup-mask-hoodie`, { waitUntil: "networkidle" });
  const card = page.locator('[role="radio"][aria-checked="true"]').locator("..");
  await card.getByLabel("Size for hoodie 1").selectOption("M");
  await card.getByLabel("Style for hoodie 2").selectOption("Shinobi");
  await card.getByLabel("Size for hoodie 2").selectOption("L");
  // The extras start ticked: keep the mystery box, untick the other two.
  await card.getByText("Add Shipping Protection").click();
  await card.getByText("Add Priority Shipping").click();
  await page.getByRole("button", { name: "Add to cart", exact: true }).first().click();
  await page.waitForTimeout(1300);
  await page
    .getByRole("dialog", { name: "Your cart" })
    .getByRole("link", { name: /Check out/ })
    .click();
  await page.waitForURL(`${base}/checkout`);
  await page.getByRole("button", { name: /^Place order/ }).waitFor();

  const summaryBox = page.locator("aside").first();
  let summary = await summaryBox.textContent();
  check(summary.includes("Akatsuki / M, Shinobi / L") && summary.includes("Mystery Box"), "checkout lists the duo pack and the mystery box");
  check(summary.includes("$129.97"), "checkout total is $129.97");
  check(summary.includes("You save$63.28"), "checkout shows the saving ($63.28)");

  // 2. The payment rails: five, each with its logo, name and short line. No account details anywhere.
  for (const key of RAILS) {
    const row = page.locator(`label[data-rail="${key}"]`);
    const text = (await row.textContent()) ?? "";
    check(
      (await row.isVisible()) && (await row.locator(`[data-payment-logo="${key}"]`).count()) === 1 && text.includes(rail[key].name) && text.includes(rail[key].detail),
      `rail ${rail[key].name}: logo, name and “${rail[key].detail}”`,
    );
  }
  check((await page.locator("label[data-rail]").count()) === RAILS.length, "exactly the five active rails are listed");
  check((await page.locator('label[data-rail="crypto"]').textContent()).includes("10% off"), "Cryptocurrency carries a “10% off” badge");
  check(
    (await page.locator('label[data-rail]:not([data-rail="crypto"])').filter({ hasText: "% off" }).count()) === 0,
    "no other rail has a discount badge",
  );
  const html = await page.content();
  check(
    options.every((o) => !o.details || !html.includes(o.details)) && !html.includes("Please send"),
    "checkout never shows account details or the payment message",
  );
  check(
    await page.getByText("You'll get your invoice and the payment details in the chat right after you order.").isVisible(),
    "the chat line is next to the button",
  );
  check(
    await page.getByText("This store is a design preview: your order is recorded but nothing is charged or shipped.").isVisible(),
    "the design-preview line is still there",
  );
  check((await page.locator('[data-testid="payment-discount"]').count()) === 0, "Chime (first, picked by default): no discount line");

  // 3. Crypto: 10% off the items, shown in the summary and on the button. Back to Chime: gone again.
  await page.locator('label[data-rail="crypto"]').click();
  summary = await summaryBox.textContent();
  check(summary.includes("Cryptocurrency discount (10%)−$13.00"), "crypto: “Cryptocurrency discount (10%) −$13.00” in the summary");
  check(summary.includes("$116.97") && summary.includes("You save$76.28"), "crypto: total $116.97, you save $76.28");
  check(await page.getByRole("button", { name: "Place order · $116.97" }).isVisible(), "crypto: the button says Place order · $116.97");
  await page.locator('label[data-rail="zelle"]').click();
  check(
    (await page.locator('[data-testid="payment-discount"]').count()) === 0 && (await page.getByRole("button", { name: "Place order · $129.97" }).isVisible()),
    "switching to Zelle takes the discount off again",
  );
  await page.screenshot({ path: `${out}/checkout-rails.png`, fullPage: true });

  // 4. Empty submit: inline errors, no request.
  await page.getByRole("button", { name: /^Place order/ }).click();
  for (const msg of ["Enter your full name.", "Enter a valid email address", "Enter your street address.", "Enter your city.", "Enter your postal code."]) {
    check(await page.getByText(msg).first().isVisible(), `empty form shows “${msg}”`);
  }
  check(page.url() === `${base}/checkout`, "stays on checkout");
  check((await page.evaluate(() => document.activeElement?.id)) === "name", "focus moves to the first missing field");

  // 5. Fill it in, pay with crypto, place the order.
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
  await page.locator('label[data-rail="crypto"]').click();
  check(!(await shopCtx.cookies()).some((c) => c.name === "akz_chat"), "no chat cookie before ordering (first-time chatter)");
  await page.getByRole("button", { name: "Place order · $116.97" }).click();
  await page.waitForURL(/\/order\/[A-Za-z0-9_-]{32}$/, { timeout: 60000 });
  await page.waitForLoadState("networkidle");
  const orderUrl = page.url();
  const orderToken = orderUrl.split("/").pop();
  createdTokens.push(orderToken);

  // 6. The "Order confirmed" page: it opens the chat by itself, once.
  await page.waitForTimeout(1000);
  const main = page.locator("main");
  const orderText = await main.textContent();
  const number = orderText.match(/Order (#\d{4,})/)?.[1];
  check(Boolean(number), `order page shows the order number (${number})`);
  check(await page.getByRole("heading", { level: 1, name: "Order confirmed" }).isVisible(), "the page says “Order confirmed”");
  check(orderText.includes("Thank you, Ada."), "and thanks the customer");
  const chatBox = page.locator('[data-testid="order-chat-box"]');
  const chatBoxText = await chatBox.textContent();
  check(
    chatBoxText.includes("Your invoice is in the chat.") && chatBoxText.includes("Yes, all correct") && chatBoxText.includes("we'll send your payment details right there"),
    "the box says the invoice is in the chat: tap “Yes, all correct”",
  );
  check(await chatBox.getByRole("button", { name: "Open the chat" }).isVisible(), "with an “Open the chat” button");
  check((await page.evaluate(() => window.__openChat)) === 1, "the page asked the chat to open once (akz:open-chat)");
  check(await chatPanel(page).isVisible(), "the chat widget opened by itself");
  const invoiceInWidget = await chatPanel(page)
    .getByText(number)
    .first()
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  console.log(`      (chat widget shows the invoice ${number}: ${invoiceInWidget ? "yes" : "not yet"}; that card is the chat module's)`);
  await page.screenshot({ path: `${out}/order-confirmed-chat-open.png` });
  // The chat panel (opened by the page) may cover the button on a phone, so press it directly.
  await chatBox.getByRole("button", { name: "Open the chat" }).dispatchEvent("click");
  check((await page.evaluate(() => window.__openChat)) === 2, "the button asks again");
  await closeChat(page);
  check(orderText.includes("Cryptocurrency discount (10%)−$13.00") && orderText.includes("$116.97"), "summary: crypto discount −$13.00, total $116.97");
  check(orderText.includes("You saved$76.28"), "summary: you saved $76.28 (packs + crypto)");
  check(!orderText.includes("Your wallet address") && !orderText.includes("Please send") && !orderText.includes("To finish your order"), "the old payment-instructions box is gone");
  check(orderText.includes("Akatsuki / M, Shinobi / L") && orderText.includes("Mystery Box"), "order page lists the items");
  check(orderText.includes("1 Cloud Street") && orderText.includes("United States"), "order page shows the shipping address");
  check(await page.locator('[aria-label="Order progress"]').isVisible(), "the status timeline is still there");
  check((await page.locator("#cart-icon").getAttribute("aria-label")).includes("0 items"), "the cart was emptied");
  await page.screenshot({ path: `${out}/order-confirmed.png`, fullPage: true });

  // 7. The chat cookie, the order row and the invoice message in the database.
  const chatCookie = (await shopCtx.cookies()).find((c) => c.name === "akz_chat");
  check(Boolean(chatCookie?.value) && chatCookie.httpOnly, "a first-time chatter gets the chat cookie (httpOnly)");
  const dbOrder = await prisma.order.findUnique({ where: { token: orderToken } });
  check(
    dbOrder.paymentKey === "crypto" && Number(dbOrder.paymentDiscount) === 13 && Number(dbOrder.subtotal) === 129.97 && Number(dbOrder.total) === 116.97,
    `the order stores crypto, −$13.00, total $116.97 (got ${dbOrder.paymentKey}, ${dbOrder.paymentDiscount}, ${dbOrder.total})`,
  );
  const conv = dbOrder.conversationId ? await prisma.conversation.findUnique({ where: { id: dbOrder.conversationId } }) : null;
  check(
    Boolean(conv) && conv.visitorToken === createHash("sha256").update(chatCookie?.value ?? "").digest("base64url"),
    "the order's conversation is the one the cookie opens",
  );
  check(conv?.name === "Ada Lovelace" && conv?.email === "ada+e2e@example.com", "the conversation knows the shopper's name and email");
  const invoiceMsgs = await prisma.chatMessage.findMany({ where: { orderId: dbOrder.id, kind: "INVOICE" } });
  check(
    // The message names the invoice (INV-1001 for #1001), like the vape store.
    invoiceMsgs.length === 1 && invoiceMsgs[0].conversationId === dbOrder.conversationId && invoiceMsgs[0].body.includes(`INV-${number.slice(1)}`) && invoiceMsgs[0].body.includes("$116.97"),
    `the invoice message is in the shopper's chat (${invoiceMsgs[0]?.body.split("\n")[0]})`,
  );
  check(
    dbOrder.paymentInstructions.includes(number) && dbOrder.paymentInstructions.includes("$116.97") && dbOrder.paymentInstructions.includes(rail.crypto.details),
    "the admin's reference copy of the payment message has the order, total and wallet",
  );

  // 8. The invoice: method with logo, the discount, and "details in the chat".
  await page.getByRole("link", { name: "View invoice" }).click();
  await page.waitForURL(/\/invoice\//);
  const invoiceText = await page.locator("body").textContent();
  check(invoiceText.includes("Invoice") && invoiceText.includes(number), "invoice has the order number");
  check((await page.locator('[data-testid="invoice-number"]').textContent()).trim() === `INV-${number.slice(1)}`, `invoice no. is INV-${number.slice(1)}`);
  check(invoiceText.includes("Unpaid") && invoiceText.includes("$116.97"), "invoice says Unpaid, $116.97");
  check(invoiceText.includes("Cryptocurrency discount (10%)−$13.00"), "invoice shows the crypto discount");
  check((await page.locator('[data-payment-logo="crypto"]').count()) === 1 && invoiceText.includes("Cryptocurrency"), "invoice shows the payment method with its logo");
  check(invoiceText.includes("Payment details are sent to you in the chat.") && !invoiceText.includes(rail.crypto.details), "invoice: payment details come in the chat (no wallet here)");
  check(invoiceText.includes("info@akatsukizipup.com") && invoiceText.includes("Ada Lovelace"), "invoice has the seller and the customer");
  check(await page.getByRole("button", { name: "Print / Save as PDF" }).isVisible(), "invoice has a print button");
  check((await page.locator("#cart-icon").count()) === 0, "invoice has no store chrome");
  await page.screenshot({ path: `${out}/invoice.png`, fullPage: true });

  // 9. Crafted requests. Made-up prices and discounts are dropped: the server prices from the catalogue and
  //    takes the discount from the method's row.
  const customer = { name: "Crafted Request", email: "crafted+e2e@example.com", country: "DE", address1: "Wolkenweg 1", city: "Berlin", postalCode: "10115" };
  const lies = { price: 0.01, subtotal: 0.01, total: 0.01, discount: 60, paymentDiscount: 60, discountRate: 0.9 };
  const post = async (ctx, body) => {
    const res = await ctx.request.post(`${base}/api/orders`, {
      headers: { origin: base, "content-type": "application/json", "x-forwarded-for": ip() },
      data: body,
    });
    return { status: res.status(), data: await res.json(), setCookie: res.headers()["set-cookie"] ?? "" };
  };
  // Same browser as the shopper (it has the chat cookie): crypto on a Solo Akatsuki.
  const cryptoLie = await post(shopCtx, { ...customer, ...lies, paymentOptionId: rail.crypto.id, lines: [{ key: "bundle:solo:Akatsuki / S", qty: 1, price: 0.01 }] });
  check(cryptoLie.status === 201 && cryptoLie.data.token, "a crypto order with made-up prices and a 90% discount is accepted…");
  createdTokens.push(cryptoLie.data.token);
  const cryptoRow = await prisma.order.findUnique({ where: { token: cryptoLie.data.token } });
  check(
    Number(cryptoRow.subtotal) === 63.69 && Number(cryptoRow.paymentDiscount) === 6.37 && Number(cryptoRow.total) === 57.32,
    `…but charged $63.69 − 10% = $57.32 (got ${cryptoRow.total}, discount ${cryptoRow.paymentDiscount})`,
  );
  check(
    cryptoLie.data.conversationId === dbOrder.conversationId && !cryptoLie.setCookie.includes("akz_chat"),
    "a second order from the same browser goes into the same chat (no new cookie)",
  );
  check((await prisma.chatMessage.count({ where: { conversationId: dbOrder.conversationId, kind: "INVOICE" } })) === 2, "that chat now holds both invoices");
  const cryptoNumber = cryptoLie.data.number;

  // Another browser, no chat yet: Chime with a made-up discount → full price, its own chat, cookie set.
  const chimeLie = await post(adminCtx, { ...customer, ...lies, paymentOptionId: rail.chime.id, lines: [{ key: "bundle:solo:Shinobi / M", qty: 1 }] });
  check(chimeLie.status === 201, "a Chime order claiming a discount is accepted…");
  createdTokens.push(chimeLie.data.token);
  const chimeRow = await prisma.order.findUnique({ where: { token: chimeLie.data.token } });
  check(Number(chimeRow.paymentDiscount) === 0 && Number(chimeRow.total) === 63.69, `…at full price, no discount ($${chimeRow.total})`);
  check(
    /akz_chat=[A-Za-z0-9_-]{43}/.test(chimeLie.setCookie) && /httponly/i.test(chimeLie.setCookie) && chimeLie.data.conversationId !== dbOrder.conversationId,
    "a first-time chatter's order sets the chat cookie and gets its own chat",
  );
  const chimeNumber = chimeLie.data.number;

  const crafted = { ...customer, paymentOptionId: rail.chime.id };
  const tooMany = await post(adminCtx, { ...crafted, lines: [{ key: "bundle:squad:Akatsuki / S, Akatsuki / M, Akatsuki / L", qty: 10 }] });
  check(tooMany.status === 400 && /up to 6 hoodies/.test(tooMany.data.error ?? ""), `30 Akatsuki → 400 “${tooMany.data.error}”`);
  const sevenSplit = await post(adminCtx, { ...crafted, lines: [{ key: "bundle:squad:Akatsuki / S, Akatsuki / M, Akatsuki / L", qty: 2 }, { key: "bundle:solo:Shinobi / M", qty: 1 }] });
  check(sevenSplit.status === 400 && /up to 6 hoodies/.test(sevenSplit.data.error ?? ""), "7 hoodies across two lines → 400 too");
  const unknown = await post(adminCtx, { ...crafted, lines: [{ key: "bundle:duo:Akatsuki / M", qty: 1 }] });
  check(unknown.status === 400, "a pack with the wrong number of hoodies → 400");
  const freebie = await post(adminCtx, { ...crafted, lines: [{ key: "addon:free-hoodie", qty: 1 }] });
  check(freebie.status === 400, "an item the store doesn't sell → 400");
  const hidden = await prisma.paymentOption.findFirst({ where: { active: false } });
  if (hidden) {
    const off = await post(adminCtx, { ...crafted, paymentOptionId: hidden.id, lines: [{ key: "addon:mystery-box", qty: 1 }] });
    check(off.status === 400, "a payment method that's turned off → 400");
  }
  const badOrigin = await adminCtx.request.post(`${base}/api/orders`, {
    headers: { origin: "https://evil.example" },
    data: { ...crafted, lines: [{ key: "addon:mystery-box", qty: 1 }] },
  });
  check(badOrigin.status() === 403, "a request from another site → 403");

  // 10. Admin list refreshes on the realtime ping.
  await admin.goto(`${base}/admin/orders`, { waitUntil: "load" });
  await admin.evaluate(() => window.dispatchEvent(new CustomEvent("admin:order.created", { detail: {} })));
  await admin.locator("table").getByRole("link", { name: chimeNumber, exact: true }).waitFor({ timeout: 30000 });
  check(await admin.locator("table").getByRole("link", { name: number, exact: true }).isVisible(), "orders list shows the new orders");

  // 11. Stock went down by exactly what was bought: duo (1 + 1), crypto solo Akatsuki, chime solo Shinobi.
  const mid = await readStock();
  check(
    mid.Akatsuki === before.Akatsuki - 2 && mid.Shinobi === before.Shinobi - 2,
    `stock went down by the units ordered (Akatsuki ${before.Akatsuki}→${mid.Akatsuki}, Shinobi ${before.Shinobi}→${mid.Shinobi})`,
  );

  // 12. Admin order page: "Chat & payment". Waiting → confirmed → send the payment details.
  await openOrder(admin, number);
  const orderPath = new URL(admin.url()).pathname;
  const pay = admin.locator("#payment");
  check(await pay.getByRole("heading", { name: "Chat & payment" }).isVisible(), "order page has the Chat & payment card (#payment)");
  check((await pay.locator('[data-testid="invoice-answer"]').textContent()).includes("Waiting for the shopper"), "invoice answer: waiting for the shopper");
  check((await pay.getByRole("link", { name: "Open chat" }).getAttribute("href")) === `/admin/chat?c=${dbOrder.conversationId}`, "Open chat → /admin/chat?c=<conversation>");
  check((await admin.locator("main").textContent()).includes("Cryptocurrency discount (10%)−$13.00"), "admin items show the crypto discount");
  const prefill = await admin.locator("#payment-details").inputValue();
  check(
    prefill.includes(number) && prefill.includes("$116.97") && prefill.includes(rail.crypto.details) && !prefill.includes("{"),
    "the message is prefilled from the method: order, $116.97, wallet",
  );
  // The shopper taps "Yes, all correct" (the chat's job; here straight in the database).
  await prisma.order.update({ where: { id: dbOrder.id }, data: { invoiceAnswer: "confirmed", invoiceAnsweredAt: new Date() } });
  await admin.reload({ waitUntil: "load" });
  check((await pay.locator('[data-testid="invoice-answer"]').textContent()).includes("Confirmed ✓"), "after the shopper confirms: “Confirmed ✓” with the time");
  await admin.goto(`${base}/admin/orders?q=${encodeURIComponent(number)}`, { waitUntil: "load" });
  check(await admin.locator("table").getByText("confirmed in chat").isVisible(), "orders list: “confirmed in chat” chip");
  await admin.goto(`${base}${orderPath}#payment`, { waitUntil: "load" });
  // Typed before hydration, a controlled textarea snaps back: fill until the edit sticks.
  for (let i = 0; i < 5; i++) {
    await admin.locator("#payment-details").fill(`${prefill}\n(e2e)`);
    await admin.waitForTimeout(400);
    if ((await admin.locator("#payment-details").inputValue()).endsWith("(e2e)")) break;
  }
  await admin.getByRole("button", { name: "Send payment details" }).click();
  await admin.locator('[data-testid="payment-sent-at"]').waitFor({ timeout: 30000 });
  check((await admin.locator('[data-testid="payment-sent-at"]').textContent()).startsWith("Sent at"), "after sending: “Sent at …”");
  check(await admin.getByRole("button", { name: "Send again" }).isVisible(), "and it can be sent again");
  const paymentMsgs = await prisma.chatMessage.findMany({ where: { orderId: dbOrder.id, kind: "PAYMENT" } });
  check(
    paymentMsgs.length === 1 && paymentMsgs[0].conversationId === dbOrder.conversationId && paymentMsgs[0].body.endsWith("(e2e)") && paymentMsgs[0].sender === "ADMIN",
    "a PAYMENT message with the edited text is in the shopper's chat",
  );
  check(Boolean((await prisma.order.findUnique({ where: { id: dbOrder.id } })).paymentDetailsSentAt), "the order records when the details were sent");
  check(await admin.getByText("Payment details sent in the chat").isVisible(), "the timeline records it");
  await admin.screenshot({ path: `${out}/admin-order-chat-payment.png`, fullPage: true });
  await page.goto(orderUrl, { waitUntil: "networkidle" });
  check((await page.locator('[data-testid="order-chat-box"]').textContent()).includes("Your payment details are in the chat"), "the shopper's page now says the payment details are in the chat");
  await page.waitForTimeout(800);
  await closeChat(page);

  // An order from before the chat flow: no conversation, so sending is off and says why.
  const legacy = await prisma.order.findFirst({ where: { conversationId: null }, select: { id: true } });
  if (legacy) {
    await admin.goto(`${base}/admin/orders/${legacy.id}`, { waitUntil: "load" });
    check(
      (await admin.locator('[data-testid="payment-no-chat"]').isVisible()) && (await admin.getByRole("button", { name: "Send payment details" }).isDisabled()),
      "an order without a chat: Send is disabled, with the reason",
    );
  }

  // 13. Mark the checkout order paid, with a reference.
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
  const inv = await adminCtx.newPage();
  await inv.goto(orderUrl.replace("/order/", "/invoice/"), { waitUntil: "networkidle" });
  const paidInvoice = await inv.locator("body").textContent();
  check(paidInvoice.includes("E2E-REF-42") && !paidInvoice.includes("Unpaid"), "the invoice now says paid, with the reference");
  await inv.close();

  // 14. Refund it (paid, not shipped): its 1 Akatsuki + 1 Shinobi go back.
  await admin.getByRole("button", { name: "Refund" }).click();
  await admin.getByRole("button", { name: "Yes, mark refunded" }).click();
  await admin.getByText("This order is closed").waitFor({ timeout: 30000 });
  check((await statusPill(admin).textContent()).trim() === "refunded", "order is refunded");
  check(await admin.getByText("Put back: 1 Akatsuki, 1 Shinobi").isVisible(), "timeline records the stock put back");

  // 15. Cancel the crypto order from one tab while a second, stale tab still offers its buttons.
  const stale = await adminCtx.newPage();
  await openOrder(stale, cryptoNumber);
  await stale.getByRole("button", { name: "Cancel order" }).click(); // the stale tab has its confirm open…
  await openOrder(admin, cryptoNumber);
  await admin.getByRole("button", { name: "Cancel order" }).click();
  await admin.getByRole("button", { name: "Yes, cancel order" }).click();
  await admin.getByText("This order is closed").waitFor({ timeout: 30000 });
  check((await statusPill(admin).textContent()).trim() === "cancelled", "crypto order cancelled");
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
  await openOrder(admin, chimeNumber);
  await admin.getByRole("button", { name: "Cancel order" }).click();
  await admin.getByRole("button", { name: "Yes, cancel order" }).click();
  await admin.getByText("This order is closed").waitFor({ timeout: 30000 });
  const end = await readStock();
  check(end.Akatsuki === before.Akatsuki && end.Shinobi === before.Shinobi, `stock is back where it started (Akatsuki ${end.Akatsuki}, Shinobi ${end.Shinobi})`);

  // 16. Sold out: the storefront can't sell a style at 0, and ?style= can't pick it.
  try {
    await setStock("Akatsuki", 0);
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    const akCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Akatsuki", exact: true }) });
    check(await akCard.getByText("Sold out").first().isVisible(), "home: the Akatsuki card says Sold out");
    check(await akCard.getByRole("button", { name: "Sold out" }).isDisabled(), "home: its button is disabled");
    await page.goto(`${base}/products/akatsukizipup-mask-hoodie?style=Akatsuki`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const open = page.locator('[role="radio"][aria-checked="true"]').locator("..");
    const akOption = open.locator('select[aria-label="Style for hoodie 1"] option[value="Akatsuki"]');
    check((await akOption.evaluate((o) => o.disabled)) && (await akOption.textContent()) === "Akatsuki (sold out)", "hoodie page: Akatsuki can't be picked and reads (sold out)");
    check((await open.getByLabel("Style for hoodie 1").inputValue()) === "Shinobi", "hoodie page: Shinobi is picked, even with ?style=Akatsuki");
    await page.screenshot({ path: `${out}/sold-out.png` });
  } finally {
    await setStock("Akatsuki", before.Akatsuki);
  }
  check((await readStock()).Akatsuki === before.Akatsuki, "Akatsuki stock restored after the sold-out check");

  // 17. Payment methods admin: logo, short line, discount, details, chat message (with preview), on/off,
  //     order, unique logos, delete.
  const NAME = `E2E Pay ${r()}`;
  await admin.goto(`${base}/admin/payment-methods`, { waitUntil: "load" });
  for (const key of RAILS) check((await admin.locator(`li [data-payment-logo="${key}"]`).count()) === 1, `methods list shows the ${rail[key].name} logo`);
  await admin.getByRole("button", { name: "+ Add payment method" }).click();
  await admin.fill("#pm-name", "");
  await admin.fill("#pm-discount", "60");
  await admin.getByRole("button", { name: "Add method" }).click();
  check(await admin.getByText("Give the method a name").isVisible(), "payment method form: name is required (inline)");
  check(await admin.getByText("Enter a whole number from 0 to 50.").isVisible(), "payment method form: discount over 50% is refused (inline)");
  await admin.fill("#pm-name", NAME);
  check((await admin.locator("#pm-key").inputValue()) === "", "a new method starts on “Other” (plain badge)");
  await admin.fill("#pm-detail", "E2E short line under the name.");
  await admin.fill("#pm-discount", "5");
  await admin.fill("#pm-details", "e2e-handle-123");
  await admin.fill("#pm-instructions", "Pay {total}.");
  check(await admin.getByText("The message has no {details}").isVisible(), "warns when the message leaves out {details}");
  await admin.fill("#pm-instructions", "Pay {total} for {order} to {details}.");
  check((await admin.locator('[data-testid="pm-preview"]').textContent()).includes("Pay $129.97 for #1001 to e2e-handle-123."), "the preview fills {total}, {order} and {details}");
  await admin.getByRole("button", { name: "Add method" }).click();
  await admin.getByRole("heading", { name: NAME }).waitFor({ timeout: 30000 });
  const row = admin.locator("li").filter({ has: admin.getByRole("heading", { name: NAME }) });
  const rowText = await row.textContent();
  check(rowText.includes("5% off") && rowText.includes("E2E short line") && rowText.includes("e2e-handle-123"), "the new method lists its discount, short line and details");
  check((await row.locator('[data-payment-logo="other"]').count()) === 1, "with the neutral badge for “Other”");
  await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
  // The cart is empty after the order: put one hoodie back so checkout shows the rails.
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}/products/akatsukizipup-mask-hoodie`, { waitUntil: "networkidle" });
  await page.locator('[role="radio"]').filter({ hasText: "Solo" }).first().click();
  await page.waitForTimeout(400);
  const solo = page.locator('[role="radio"][aria-checked="true"]').locator("..");
  await solo.getByLabel("Size for hoodie 1").selectOption("M");
  for (const extra of ["Add Mystery Box", "Add Shipping Protection", "Add Priority Shipping"]) await solo.getByText(extra).click();
  await page.getByRole("button", { name: "Add to cart", exact: true }).first().click();
  await page.waitForTimeout(1300);
  await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
  const newRail = page.locator('label[data-rail="other"]').filter({ hasText: NAME });
  check(
    (await newRail.isVisible()) && (await newRail.textContent()).includes("5% off") && (await newRail.textContent()).includes("E2E short line"),
    "the new method is offered at checkout with its badge and short line",
  );
  check(!(await page.content()).includes("e2e-handle-123"), "its payment details are not on the checkout page");
  await newRail.click();
  check((await summaryBox.textContent()).includes(`${NAME} discount (5%)−$3.18`), "picking it takes 5% off ($63.69 → −$3.18)");

  await row.getByRole("button", { name: "Edit" }).click();
  await admin.selectOption("#pm-key", "chime");
  await admin.getByRole("button", { name: "Save changes" }).click();
  const clash = await admin
    .getByText("Chime already uses the Chime logo")
    .first()
    .waitFor({ timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check(clash, "two methods can't share a logo (friendly error)");
  await admin.getByRole("button", { name: "Cancel" }).click();

  await row.getByRole("button", { name: `Move ${NAME} up` }).click();
  await admin.getByText(`${NAME} moved up.`).waitFor({ timeout: 30000 });
  await admin.reload({ waitUntil: "load" });
  const names = await admin.locator("li h2").allTextContents();
  check(names.indexOf(NAME) === names.length - 2, "move up swaps it with the one above");
  await row.getByRole("button", { name: "Turn off" }).click();
  await row.getByText("Off", { exact: true }).waitFor({ timeout: 30000 });
  await page.goto(`${base}/checkout`, { waitUntil: "load" });
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
  await page.evaluate(() => localStorage.clear());

  // 18. The admin pages work on a phone.
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.goto(`${base}/admin/orders`, { waitUntil: "load" });
  check(await admin.locator("ul.md\\:hidden a").first().isVisible(), "orders list is cards on a phone");
  check(!(await admin.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "orders list doesn't scroll sideways at 390px");
  await admin.goto(`${base}${orderPath}`, { waitUntil: "load" });
  check(!(await admin.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "order detail doesn't scroll sideways at 390px");
  await admin.screenshot({ path: `${out}/admin-order-phone.png`, fullPage: true });
  await admin.goto(`${base}/admin/payment-methods`, { waitUntil: "load" });
  check(!(await admin.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "payment methods page doesn't scroll sideways at 390px");
  await admin.goto(`${base}/admin/products`, { waitUntil: "load" });
  check(!(await admin.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "products page doesn't scroll sideways at 390px");

  check(errors.length === 0, `no page errors on the storefront${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} catch (err) {
  console.log(`FAIL  the run stopped: ${err.message.split("\n")[0]}`);
  failed++;
} finally {
  // Anything this run left open is cancelled and its stock put back (same claim as the admin's cancel).
  for (const token of createdTokens) {
    const o = await prisma.order.findUnique({ where: { token }, select: { id: true, status: true, stockTaken: true } });
    if (!o || !["PENDING", "PAID"].includes(o.status)) continue;
    await prisma.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({ where: { id: o.id, status: o.status }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      if (!changed.count) return;
      const claim = await tx.order.updateMany({ where: { id: o.id, stockRestored: false }, data: { stockRestored: true } });
      if (!claim.count) return;
      for (const [style, n] of Object.entries(o.stockTaken ?? {})) {
        await tx.$executeRaw`UPDATE "StyleStock" SET "stock" = "stock" + ${Number(n)}, "updatedAt" = NOW() WHERE "style" = ${style}`;
      }
      await tx.orderEvent.create({ data: { orderId: o.id, type: "status", fromStatus: o.status, toStatus: "CANCELLED", message: "Cancelled by the e2e clean-up" } });
    });
    console.log(`      (clean-up: cancelled a leftover ${o.status.toLowerCase()} order)`);
  }
  await browser.close();
  await prisma.$disconnect();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
