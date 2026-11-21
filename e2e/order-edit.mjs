// "Something's wrong" → the admin fixes the order → an updated invoice (the vape store's flow).
// A shopper orders through the API from a browser context (so the chat cookie is set), taps "Something's wrong"
// (POST /api/chat/invoice), and the admin edits the order on /admin/orders/<id>: a style and a size in the pack,
// the address, the payment method (Cryptocurrency, 10% off). The server prices everything again and moves stock
// per style; going past the stock or past 6 hoodies is refused and changes nothing. Then the admin sends
// INV-xxxx-2: the old card is replaced, the new one asks again, and the order page and invoice show the new number.
// A paid order can't be edited, even from a tab that still has the editor open.
// Leaves stock as it found it (the test order is cancelled at the end).
// usage: node --env-file=.env.local e2e/order-edit.mjs [baseUrl] [screenshotDir]
import { chromium } from "playwright";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const base = process.argv[2] ?? "http://localhost:3232";
const out = process.argv[3] ?? "e2e/out";
fs.mkdirSync(out, { recursive: true });
const password = process.env.ADMIN_PASSWORD;
if (!password || !process.env.DATABASE_URL) {
  console.error("ADMIN_PASSWORD / DATABASE_URL missing: run with node --env-file=.env.local e2e/order-edit.mjs <base>");
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
const createdTokens = []; // every order this run places, cancelled at the end if anything is left open
const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";

const options = await prisma.paymentOption.findMany({ where: { active: true } });
const rail = Object.fromEntries(options.filter((o) => o.key).map((o) => [o.key, o]));
if (!rail.chime || !rail.crypto) {
  console.error("Needs the Chime and Cryptocurrency payment rails active. Run npm run db:seed.");
  process.exit(2);
}

const stockNow = async () => Object.fromEntries((await prisma.styleStock.findMany()).map((s) => [s.style, s.stock]));
let lowered = 0; // Shinobi taken off the shelf for the "not enough stock" check, given back in finally

try {
  const before = await stockNow();
  console.log(`      stock before: Akatsuki ${before.Akatsuki}, Shinobi ${before.Shinobi}`);
  if (before.Akatsuki < 3 || before.Shinobi < 4) {
    console.error("Needs at least 3 Akatsuki and 4 Shinobi in stock to run.");
    process.exit(2);
  }

  // ---- 1. The shopper orders (phone browser, through the API) ----------------------------------------------
  const shopCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: headers, locale: "en-US" });
  const api = shopCtx.request;
  const placed = await api.post(`${base}/api/orders`, {
    headers: { origin: base, "content-type": "application/json" },
    data: {
      name: "Edit Tester",
      email: "edit+e2e@example.com",
      phone: "+1 512 555 0100",
      country: "US",
      address1: "1 Cloud Street",
      city: "Dallas",
      region: "TX",
      postalCode: "73301",
      paymentOptionId: rail.chime.id,
      lines: [
        { key: "bundle:duo:Akatsuki / M, Shinobi / L", qty: 1 },
        { key: "addon:mystery-box", qty: 1 },
      ],
    },
  });
  const order = await placed.json();
  check(placed.status() === 201 && order.token, `the order is placed (${placed.status()} ${order.number ?? order.error})`);
  createdTokens.push(order.token);
  const number = order.number; // "#1023"
  const n = number.slice(1);
  const INV1 = `INV-${n}`;
  const INV2 = `INV-${n}-2`;
  check((await shopCtx.cookies()).some((c) => c.name === "akz_chat"), "the browser got the chat cookie");
  let row = await prisma.order.findUnique({ where: { token: order.token }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  check(Number(row.total) === 129.97 && row.paymentKey === "chime" && row.invoiceVersion === 1, `Chime, $129.97, invoice version 1 (got ${row.total}, ${row.paymentKey}, v${row.invoiceVersion})`);
  let s = await stockNow();
  check(s.Akatsuki === before.Akatsuki - 1 && s.Shinobi === before.Shinobi - 1, "stock: 1 Akatsuki and 1 Shinobi taken");

  // ---- 2. "Something's wrong" ------------------------------------------------------------------------------
  const thread = async () => (await (await api.get(`${base}/api/chat`)).json()).messages ?? [];
  const invoicesOf = (msgs) => msgs.filter((m) => m.kind === "INVOICE" && m.invoice?.number === number);
  let invoices = invoicesOf(await thread());
  check(invoices.length === 1 && invoices[0].invoice.invoiceNumber === INV1 && invoices[0].invoice.latest === true, `the chat has the invoice ${INV1}`);
  const firstInvoiceId = invoices[0]?.id;
  const answer = async (messageId, a) => {
    const res = await api.post(`${base}/api/chat/invoice`, { headers: { origin: base, "content-type": "application/json" }, data: { messageId, answer: a } });
    return { status: res.status(), data: await res.json() };
  };
  const wrong = await answer(firstInvoiceId, "wrong");
  check(wrong.status === 200 && wrong.data.ok, "the shopper taps “Something's wrong”");

  // ---- 3. The admin sees it ---------------------------------------------------------------------------------
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: headers });
  const admin = await adminCtx.newPage();
  const errors = [];
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.goto(`${base}/admin/login`);
  await admin.fill("#password", password);
  await admin.click('button[type="submit"]');
  await admin.waitForURL(`${base}/admin`, { timeout: 30000 });
  const orderUrl = `${base}/admin/orders/${row.id}`;
  await admin.goto(orderUrl, { waitUntil: "load" });
  const pay = admin.locator("#payment");
  const wrongBox = pay.locator('[data-testid="invoice-wrong"]');
  check(await wrongBox.isVisible(), "Chat & payment says so prominently");
  check((await wrongBox.textContent()).includes(`The shopper says something's wrong with ${INV1}`), `…“The shopper says something's wrong with ${INV1}”`);
  check((await wrongBox.getByRole("link", { name: "Read the chat" }).getAttribute("href")) === `/admin/chat?c=${row.conversationId}`, "…with a link to the chat");
  check((await pay.locator('[data-testid="invoice-number"]').textContent()).trim() === INV1, `the card shows the invoice number ${INV1}`);
  check((await admin.locator("main header").textContent()).includes(`Invoice ${INV1}`), "the page header shows it too");
  check(!(await pay.locator('[data-testid="updated-invoice-prompt"]').isVisible()), "no “send the updated invoice” prompt before any edit");

  // ---- 4. The editor at 390 px (layout only) ------------------------------------------------------------------
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: headers });
  await phoneCtx.addCookies(await adminCtx.cookies());
  const phone = await phoneCtx.newPage();
  await phone.goto(orderUrl, { waitUntil: "load" });
  await phone.getByRole("button", { name: "Edit order" }).click();
  await phone.locator('[data-testid="order-editor"]').waitFor();
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `the editor fits a 390 px phone (no sideways scroll: ${overflow}px)`);
  await phone.screenshot({ path: `${out}/order-edit-390.png`, fullPage: true });
  await phoneCtx.close();

  // ---- 5. Edit: a style and a size, the address, Cryptocurrency --------------------------------------------------
  await admin.getByRole("button", { name: "Edit order" }).click();
  const editor = admin.locator('[data-testid="order-editor"]');
  await editor.waitFor();
  check((await editor.locator("[data-line]").count()) === 2, "the editor lists the two lines");
  check((await admin.locator("#edit-address1").inputValue()) === "1 Cloud Street" && (await admin.locator("#edit-country").inputValue()) === "US", "…and the current address, country US");

  // Same validation as checkout, inline.
  await admin.fill("#edit-name", "");
  await admin.fill("#edit-email", "not-an-email");
  await editor.getByRole("button", { name: "Save changes" }).click();
  check(await editor.getByText("Enter your full name.").isVisible(), "an empty name is refused inline (“Enter your full name.”)");
  check(await editor.getByText("Enter a valid email address").isVisible(), "a bad email is refused inline");
  check((await editor.locator('[data-testid="edit-error"]').textContent()).includes("Some fields need attention."), "…with “Some fields need attention.”");
  await admin.fill("#edit-name", "Edit Tester");
  await admin.fill("#edit-email", "edit+e2e@example.com");
  check(!(await editor.getByText("Enter your full name.").isVisible()), "the error clears once it's fixed");

  const line0 = editor.locator('[data-line="0"]');
  await line0.getByLabel("hoodie 1 style").selectOption("Shinobi"); // Akatsuki / M → Shinobi / M
  await line0.getByLabel("hoodie 2 size").selectOption("XL"); // Shinobi / L → Shinobi / XL
  await admin.fill("#edit-address1", "2 Rain Road");
  await admin.fill("#edit-city", "Austin");
  await admin.locator("#edit-paymentOptionId").selectOption(rail.crypto.id);
  check((await editor.locator('[data-testid="edit-total"]').textContent()) === "$116.97", "the preview: $129.97 − 10% = $116.97");
  check((await editor.locator('[data-testid="edit-stock"]').textContent()).includes("takes 1 Shinobi from stock, puts 1 Akatsuki back"), "the preview says which stock moves");

  // Network failure: the save request never arrives.
  const isAction = (req) => req.method() === "POST" && Boolean(req.headers()["next-action"]);
  await admin.route("**/admin/orders/**", (route) => (isAction(route.request()) ? route.abort() : route.continue()));
  await editor.getByRole("button", { name: "Save changes" }).click();
  await editor.locator('[data-testid="edit-error"]').filter({ hasText: NETWORK_ERROR }).waitFor({ timeout: 15000 });
  check(true, "offline: “We couldn't reach the server…”");
  await admin.unroute("**/admin/orders/**");
  check(Number((await prisma.order.findUnique({ where: { id: row.id } })).total) === 129.97, "…and nothing was saved");

  await admin.screenshot({ path: `${out}/order-edit-1440.png`, fullPage: true });
  await editor.getByRole("button", { name: "Save changes" }).click();
  await pay.locator('[data-testid="updated-invoice-prompt"]').waitFor({ timeout: 30000 });
  check(
    (await pay.locator('[data-testid="updated-invoice-prompt"]').textContent()).includes("Order saved. Send the updated invoice so the shopper can confirm it."),
    "saved: “Order saved. Send the updated invoice so the shopper can confirm it.”",
  );
  check(await pay.getByRole("button", { name: "Send updated invoice" }).isEnabled(), "…with the Send updated invoice button");
  const detailsAfterEdit = await admin.locator("#payment-details").inputValue();
  check(detailsAfterEdit.includes("$116.97") && !detailsAfterEdit.includes("$129.97"), "the payment-details message already uses the new total (no reload)");

  row = await prisma.order.findUnique({ where: { id: row.id }, include: { items: { orderBy: { sortOrder: "asc" } }, events: { orderBy: { createdAt: "asc" } } } });
  check(
    Number(row.subtotal) === 129.97 && Number(row.paymentDiscount) === 13 && Number(row.total) === 116.97 && row.paymentKey === "crypto" && row.paymentMethod === rail.crypto.name,
    `the server recomputed: $129.97 − $13.00 (10%) = $116.97, Cryptocurrency (got ${row.subtotal} − ${row.paymentDiscount} = ${row.total}, ${row.paymentKey})`,
  );
  check(
    row.items.length === 2 && row.items[0].detail === "Shinobi / M, Shinobi / XL" && Number(row.items[0].lineTotal) === 114.64 && row.items[1].sku === "mystery-box",
    `items: Duo (Shinobi / M, Shinobi / XL) + Mystery Box (got ${row.items.map((i) => i.detail ?? i.sku).join(" + ")})`,
  );
  check(row.address1 === "2 Rain Road" && row.city === "Austin" && row.name === "Edit Tester", "the new address is saved");
  check(JSON.stringify(row.stockTaken) === JSON.stringify({ Shinobi: 2 }), `the order now holds 2 Shinobi (stockTaken ${JSON.stringify(row.stockTaken)})`);
  check(
    row.paymentInstructions.includes("$116.97") && row.paymentInstructions.includes(number) && (!rail.crypto.details || row.paymentInstructions.includes(rail.crypto.details)),
    "the payment message copy is refreshed (new total, the wallet)",
  );
  s = await stockNow();
  check(s.Akatsuki === before.Akatsuki && s.Shinobi === before.Shinobi - 2, `stock moved per style: Akatsuki back to ${s.Akatsuki}, Shinobi ${before.Shinobi} → ${s.Shinobi}`);
  const edited = row.events.filter((e) => e.type === "edited");
  const summary = edited[0]?.message ?? "";
  check(
    edited.length === 1 &&
      summary.includes("Address: 1 Cloud Street → 2 Rain Road") &&
      summary.includes("City: Dallas → Austin") &&
      summary.includes("Payment: Chime → Cryptocurrency (10% off)") &&
      summary.includes("Total: $129.97 → $116.97") &&
      summary.includes("Stock: took 1 Shinobi, put back 1 Akatsuki") &&
      summary.includes("Shinobi / M, Shinobi / XL"),
    "the timeline has an “edited” event saying what changed",
  );
  console.log(`      ${summary.split("\n").join("\n      ")}`);
  check(await admin.getByText("Order edited").isVisible(), "…shown as “Order edited”");
  const itemsText = await admin.locator("#items").textContent();
  check(itemsText.includes("Shinobi / M, Shinobi / XL") && itemsText.includes("$116.97"), "the Items card shows the new pack and total");

  // ---- 6. Not enough stock: refused, nothing changes ------------------------------------------------------------
  lowered = (await stockNow()).Shinobi - 1; // leave exactly 1 Shinobi on the shelf
  await prisma.$executeRaw`UPDATE "StyleStock" SET "stock" = "stock" - ${lowered} WHERE "style" = 'Shinobi'`;
  await admin.reload({ waitUntil: "load" });
  await admin.getByRole("button", { name: "Edit order" }).click();
  await editor.waitFor();
  await admin.locator("#edit-add").selectOption("bundle:duo");
  await editor.getByRole("button", { name: "Add item" }).click();
  const line2 = editor.locator('[data-line="2"]');
  await line2.getByLabel("hoodie 1 style").selectOption("Shinobi");
  await line2.getByLabel("hoodie 2 style").selectOption("Shinobi");
  check(await editor.getByText("Only 1 Shinobi left in stock (when this page loaded)").isVisible(), "the preview warns: only 1 Shinobi left");
  await editor.getByRole("button", { name: "Save changes" }).click();
  const stockError = editor.locator('[data-testid="edit-error"]');
  await stockError.filter({ hasText: "Only 1 Shinobi left" }).waitFor({ timeout: 30000 });
  check((await stockError.textContent()).includes("Only 1 Shinobi left in stock: this change needs 2 more."), `saving is refused: “${await stockError.textContent()}”`);
  let after = await prisma.order.findUnique({ where: { id: row.id }, include: { items: true, events: true } });
  check(
    after.items.length === 2 && Number(after.total) === 116.97 && JSON.stringify(after.stockTaken) === JSON.stringify({ Shinobi: 2 }) && after.events.filter((e) => e.type === "edited").length === 1,
    "…and nothing changed (items, total, stockTaken, timeline)",
  );
  check((await stockNow()).Shinobi === 1, "…stock still 1 Shinobi");
  await prisma.$executeRaw`UPDATE "StyleStock" SET "stock" = "stock" + ${lowered} WHERE "style" = 'Shinobi'`;
  lowered = 0;

  // ---- 7. More than 6 hoodies: refused ----------------------------------------------------------------------------
  await admin.locator("#edit-add").selectOption("bundle:squad"); // 2 + 2 + 3 = 7
  await editor.getByRole("button", { name: "Add item" }).click();
  check((await editor.locator('[data-testid="edit-limit"]').textContent()).includes("up to 6 hoodies"), "the preview warns about 7 hoodies");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await stockError.filter({ hasText: "up to 6 hoodies" }).waitFor({ timeout: 30000 });
  check((await stockError.textContent()).includes("An order can have up to 6 hoodies. This one would have 7"), "the server refuses 7 hoodies");
  after = await prisma.order.findUnique({ where: { id: row.id }, include: { items: true } });
  s = await stockNow();
  check(after.items.length === 2 && Number(after.total) === 116.97 && s.Shinobi === before.Shinobi - 2 && s.Akatsuki === before.Akatsuki, "…and nothing changed");
  await editor.getByRole("button", { name: "Discard changes" }).click();
  check((await editor.count()) === 0 && (await admin.getByRole("button", { name: "Edit order" }).isVisible()), "Discard changes closes the editor");

  // ---- 8. Send the updated invoice --------------------------------------------------------------------------------
  await pay.getByRole("button", { name: "Send updated invoice" }).click();
  await pay.locator('[data-testid="updated-invoice-sent"]').waitFor({ timeout: 30000 });
  check((await pay.locator('[data-testid="updated-invoice-sent"]').textContent()).trim() === `${INV2} sent to the chat`, `“${INV2} sent to the chat”`);
  await pay.locator('[data-testid="invoice-number"]').filter({ hasText: INV2 }).waitFor({ timeout: 30000 });
  check(true, `the card now shows ${INV2}`);
  check((await pay.locator('[data-testid="invoice-answer"]').textContent()).includes("Waiting for the shopper"), "…waiting for the shopper again");
  check(!(await pay.locator('[data-testid="updated-invoice-prompt"]').isVisible()), "…and the prompt is gone");
  row = await prisma.order.findUnique({ where: { id: row.id } });
  check(row.invoiceVersion === 2 && row.invoiceAnswer === null, "the order: invoice version 2, answer reset");

  // ---- 9. The shopper's chat: the old one replaced, the new one asks again -------------------------------------
  invoices = invoicesOf(await thread());
  const [oldCard, newCard] = invoices;
  check(invoices.length === 2, "the chat has two invoices for the order");
  check(oldCard?.invoice.latest === false && oldCard.invoice.invoiceNumber === INV1, `the old one: ${INV1}, latest: false (REPLACED)`);
  check(newCard?.invoice.latest === true && newCard.invoice.invoiceNumber === INV2 && newCard.invoice.answer === null, `the new one: ${INV2}, latest: true, answer: null`);
  check(newCard?.invoice.total === "$116.97" && newCard.invoice.lines.some((l) => l.detail === "Shinobi / M, Shinobi / XL"), "the new card has the new items and total");
  check(newCard?.body.startsWith("Here's your updated invoice."), "…introduced with “Here's your updated invoice.”");
  const stale = await answer(oldCard.id, "confirmed");
  check(stale.status === 409 && /replaced/i.test(stale.data.error ?? ""), `answering the old one is refused (${stale.status} “${stale.data.error}”)`);

  // ---- 10. The order page and the invoice show INV-xxxx-2 ---------------------------------------------------------
  const shop = await shopCtx.newPage();
  shop.on("pageerror", (e) => errors.push(`shop: ${e.message}`));
  await shop.goto(`${base}/order/${order.token}`, { waitUntil: "load" });
  const orderPage = await shop.locator("main").textContent();
  check((await shop.locator('[data-testid="invoice-number"]').textContent()).includes(INV2), `the order page shows ${INV2}`);
  check(orderPage.includes(`Order ${number}`), `…and the order number stays ${number}`);
  check(orderPage.includes(`Your updated invoice ${INV2} is in the chat.`), "…“Your updated invoice … is in the chat.”");
  check(orderPage.includes("2 Rain Road") && orderPage.includes("$116.97") && orderPage.includes("Shinobi / M, Shinobi / XL"), "…with the new address, items and total");
  await shop.goto(`${base}/invoice/${order.token}`, { waitUntil: "load" });
  const invoicePage = await shop.locator("body").textContent();
  check((await shop.locator('[data-testid="invoice-number"]').textContent()).trim() === INV2, `the printable invoice is ${INV2}`);
  check(invoicePage.includes("Order no.") && invoicePage.includes(number), "…with Order no. " + number);
  check(invoicePage.includes("2 Rain Road") && invoicePage.includes("Cryptocurrency discount (10%)−$13.00") && invoicePage.includes("$116.97"), "…the new address, the crypto discount and $116.97");
  await shop.screenshot({ path: `${out}/invoice-updated.png`, fullPage: true });

  const yes = await answer(newCard.id, "confirmed");
  check(yes.status === 200 && yes.data.ok, "the shopper confirms the updated invoice");
  await admin.reload({ waitUntil: "load" });
  check((await pay.locator('[data-testid="invoice-answer"]').textContent()).includes("Confirmed ✓"), "the admin sees “Confirmed ✓”");

  // ---- 11. A paid order can't be edited (not even from a tab that still has the editor open) -------------------
  const staleTab = await adminCtx.newPage();
  await staleTab.goto(orderUrl, { waitUntil: "load" });
  await staleTab.getByRole("button", { name: "Edit order" }).click();
  await staleTab.locator('[data-testid="order-editor"]').waitFor();
  await staleTab.fill("#edit-city", "Houston");
  await admin.getByRole("button", { name: "Mark paid" }).click();
  await admin.fill("#reference", "E2E-EDIT-1");
  await admin.getByRole("button", { name: "Confirm payment" }).click();
  await admin.getByText("Reference E2E-EDIT-1", { exact: true }).waitFor({ timeout: 30000 });
  const staleEditor = staleTab.locator('[data-testid="order-editor"]');
  const staleSave = staleEditor.getByRole("button", { name: "Save changes" });
  if (await staleSave.isEnabled()) {
    await staleSave.click();
    await staleEditor.locator('[data-testid="edit-error"]').waitFor({ timeout: 30000 });
    const msg = await staleEditor.locator('[data-testid="edit-error"]').textContent();
    check(msg.includes("This order is paid now, so it can't be edited."), `the stale tab's save is refused: “${msg}”`);
  } else {
    const msg = await staleEditor.getByRole("alert").first().textContent();
    check(msg.includes("This one is paid"), `the stale tab refreshed itself and locked the editor: “${msg}”`);
  }
  await staleTab.close();
  check((await prisma.order.findUnique({ where: { id: row.id } })).city === "Austin", "…and the city is unchanged");
  await admin.reload({ waitUntil: "load" });
  check((await admin.getByRole("button", { name: "Edit order" }).count()) === 0, "the paid order has no Edit order button");
  check((await admin.locator('[data-testid="edit-locked"]').textContent()).includes("Only orders waiting for payment can be edited. This one is paid."), "…and says why");
  check(await pay.getByRole("button", { name: "Send updated invoice" }).isDisabled(), "Send updated invoice is off for a paid order");

  // ---- 12. Clean up: cancel it, stock back where it started ---------------------------------------------------------
  await admin.getByRole("button", { name: "Cancel order" }).click();
  await admin.getByRole("button", { name: "Yes, cancel order" }).click();
  await admin.getByText("This order is closed").waitFor({ timeout: 30000 });
  check(await admin.getByText("Put back: 2 Shinobi").isVisible(), "cancelling puts back what the edited order held (2 Shinobi)");
  const end = await stockNow();
  check(end.Akatsuki === before.Akatsuki && end.Shinobi === before.Shinobi, `stock is back where it started (Akatsuki ${end.Akatsuki}, Shinobi ${end.Shinobi})`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} catch (err) {
  console.log(`FAIL  the run stopped: ${err.message.split("\n")[0]}`);
  failed++;
} finally {
  if (lowered > 0) await prisma.$executeRaw`UPDATE "StyleStock" SET "stock" = "stock" + ${lowered} WHERE "style" = 'Shinobi'`;
  // Anything this run left open is cancelled and its stock put back (same claim as the admin's cancel).
  for (const token of createdTokens) {
    const o = await prisma.order.findUnique({ where: { token }, select: { id: true, status: true } });
    if (!o || !["PENDING", "PAID"].includes(o.status)) continue;
    await prisma.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({ where: { id: o.id, status: o.status }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      if (!changed.count) return;
      const claim = await tx.order.updateMany({ where: { id: o.id, stockRestored: false }, data: { stockRestored: true } });
      if (!claim.count) return;
      const held = await tx.order.findUnique({ where: { id: o.id }, select: { stockTaken: true } });
      for (const [style, n] of Object.entries(held?.stockTaken ?? {})) {
        await tx.$executeRaw`UPDATE "StyleStock" SET "stock" = "stock" + ${Number(n)}, "updatedAt" = NOW() WHERE "style" = ${style}`;
      }
      await tx.orderEvent.create({ data: { orderId: o.id, type: "status", fromStatus: o.status, toStatus: "CANCELLED", message: "Cancelled by the e2e clean-up" } });
    });
    console.log(`      (clean-up: cancelled a leftover ${o.status.toLowerCase()} order)`);
  }
  const final = await stockNow();
  console.log(`      stock after: Akatsuki ${final.Akatsuki}, Shinobi ${final.Shinobi}`);
  await browser.close();
  await prisma.$disconnect();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
