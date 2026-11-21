// Orders in the chat: the invoice card and its two answers, the payment-details card, and the admin's view.
// usage: node --env-file=.env.local e2e/invoice-chat.mjs [baseUrl] [screenshotDir]
//   The scene (a conversation, an order and its invoice message) is written straight into the database, the same
//   rows src/lib/chat/order-chat.ts writes (postInvoice / sendPaymentDetails), so this suite doesn't depend on the
//   checkout UI. The browser gets the conversation's cookie: a token we generate, its SHA-256 stored like
//   hashChatToken() in src/lib/chat/server.ts. Everything it creates is deleted at the end.
import { chromium } from "playwright";
import prismaPkg from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import os from "node:os";

setDefaultAutoSelectFamilyAttemptTimeout(2_000); // Neon is far away (same fix as src/lib/db.ts)
const { PrismaClient } = prismaPkg;
const db = new PrismaClient();

const base = process.argv[2] ?? "http://localhost:3222";
const out = process.argv[3] ?? "e2e/out";
mkdirSync(out, { recursive: true });
const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error("ADMIN_PASSWORD missing: run with node --env-file=.env.local e2e/invoice-chat.mjs");
  process.exit(2);
}
const tag = Math.random().toString(36).slice(2, 7);
const testIp = () => `198.18.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;

// Same words as INVOICE_COPY in src/lib/chat/shared.ts.
const COPY = {
  question: "Please check your invoice. Are your items, delivery address and contact details all correct?",
  yesButton: "Yes, all correct",
  noButton: "Something's wrong",
  yesMessage: "Yes, all correct",
  yesReply: "Thanks for confirming! We'll send your payment details here within 5 minutes.",
  noReply: "No problem. Tell us what needs changing and we'll send you an updated invoice.",
};

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};
const errors = [];
const watch = (page, who) => page.on("pageerror", (e) => errors.push(`${who}: ${e.message}`));

/* ------------------------------------------------------------ the scene, straight in the database */

const hashChatToken = (t) => createHash("sha256").update(t).digest("base64url");
const money = (n) => `$${n.toFixed(2)}`;

/** A shopper's conversation + a pending order + its invoice message, as checkout leaves them. */
async function scene(label) {
  const token = randomBytes(32).toString("base64url");
  const email = `e2e-inv-${tag}-${label}@example.com`;
  const conv = await db.conversation.create({
    data: { visitorToken: hashChatToken(token), name: `E2E Invoice ${tag} ${label}`, email, pagePath: "/checkout" },
    select: { id: true },
  });
  const order = await db.order.create({
    data: {
      token: randomBytes(24).toString("base64url"),
      name: `E2E Invoice ${tag} ${label}`,
      email,
      country: "US",
      address1: "1 Test Street",
      city: "Testville",
      postalCode: "10001",
      paymentMethod: "Cash App",
      paymentInstructions: "Send the total to $akz-e2e",
      paymentKey: "cash-app",
      paymentDiscount: 4.5,
      compareAtTotal: 140,
      subtotal: 89.98,
      shipping: 0,
      total: 85.48,
      stockTaken: {},
      items: {
        create: [
          { kind: "bundle", sku: "duo", title: "Duo bundle", detail: "Akatsuki / M, Shinobi / L", image: "/store/logo.jpg", quantity: 1, unitPrice: 79.99, lineTotal: 79.99, sortOrder: 0 },
          { kind: "addon", sku: "e2e-ring", title: "Akatsuki ring", detail: null, image: "/store/logo.jpg", quantity: 2, unitPrice: 4.995, lineTotal: 9.99, sortOrder: 1 },
        ],
      },
    },
    select: { id: true, number: true, token: true },
  });
  const number = `#${1000 + order.number}`;
  const total = money(85.48);
  // Same rows as postInvoice() in src/lib/chat/order-chat.ts.
  const now = new Date();
  const msg = await db.chatMessage.create({
    data: { conversationId: conv.id, sender: "ADMIN", kind: "INVOICE", orderId: order.id, body: `Invoice ${number} · ${total}\n${COPY.question}`, createdAt: now },
    select: { id: true },
  });
  await db.conversation.update({ where: { id: conv.id }, data: { lastMessage: `New order ${number} · ${total}`, lastMessageAt: now, unreadForAdmin: { increment: 1 }, status: "OPEN" } });
  await db.order.update({ where: { id: order.id }, data: { conversationId: conv.id } });
  return { token, convId: conv.id, orderId: order.id, orderToken: order.token, number, total, messageId: msg.id };
}

/** Same rows as sendPaymentDetails() in src/lib/chat/order-chat.ts. */
async function sendPayment(s, body) {
  const now = new Date();
  await db.$transaction([
    db.chatMessage.create({ data: { conversationId: s.convId, sender: "ADMIN", kind: "PAYMENT", orderId: s.orderId, body, createdAt: now } }),
    db.conversation.update({ where: { id: s.convId }, data: { unreadForVisitor: { increment: 1 }, lastMessage: body.slice(0, 140), lastMessageAt: now, status: "OPEN" } }),
    db.order.update({ where: { id: s.orderId }, data: { paymentDetailsSentAt: now } }),
  ]);
}

async function cleanup() {
  // This run's rows, and leftovers from an earlier run that stopped half-way.
  const orders = await db.order.deleteMany({ where: { email: { startsWith: "e2e-inv-" }, name: { startsWith: "E2E Invoice " } } });
  const convs = await db.conversation.deleteMany({ where: { name: { startsWith: "E2E Invoice " } } });
  return { orders: orders.count, convs: convs.count };
}

const A = await scene("a"); // the visitor's own order
const B = await scene("b"); // someone else's
console.log(`scene: conversation ${A.convId.slice(0, 8)}…, order ${A.number}; other order ${B.number}`);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? `${os.homedir()}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome` });

try {
  /* ------------------------------------------------------------ the shopper opens the chat on their invoice */

  const visitorCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { "x-forwarded-for": testIp() },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await visitorCtx.addCookies([{ name: "akz_chat", value: A.token, url: base, httpOnly: true, sameSite: "Lax" }]);
  const visitor = await visitorCtx.newPage();
  watch(visitor, "visitor");
  await visitor.goto(`${base}/`, { waitUntil: "networkidle" });
  await visitor.waitForTimeout(1500);
  const panel = visitor.getByRole("dialog", { name: "Chat with AkatsukiZipUp" });
  check(!(await panel.isVisible().catch(() => false)), "visitor: chat starts closed");
  check((await visitor.evaluate(() => localStorage.getItem("akz_chat_id"))) === null, "visitor: the browser doesn't know the conversation yet (first-time chatter after an order)");

  await visitor.evaluate(() => window.dispatchEvent(new CustomEvent("akz:open-chat")));
  await panel.waitFor({ timeout: 10000 });
  check(true, 'visitor: "akz:open-chat" opens the panel');
  const vlog = panel.getByRole("log", { name: "Messages" });
  const card = vlog.getByRole("article", { name: `Invoice ${A.number}` });
  await card.waitFor({ timeout: 20000 });
  check(true, `visitor: the invoice card shows (Invoice ${A.number})`);
  check(await card.getByRole("heading", { name: `Invoice ${A.number}` }).isVisible(), "visitor: card heading reads Invoice #…");
  check(await card.getByText("Duo bundle").isVisible(), "visitor: line title shows");
  check(await card.getByText("Akatsuki / M, Shinobi / L").isVisible(), "visitor: line detail shows");
  check(await card.getByText("Qty 2").isVisible(), "visitor: line quantity shows");
  check(await card.getByText("$79.99").isVisible(), "visitor: line total shows");
  check(await card.getByText("Subtotal").isVisible() && (await card.getByText("$89.98").isVisible()), "visitor: subtotal shows");
  check(await card.getByText(/^Discount/).isVisible() && (await card.getByText("−$4.50").isVisible()), "visitor: discount line shows");
  check(await card.getByText("Free").isVisible(), "visitor: shipping shows (Free)");
  check(await card.getByText(A.total, { exact: true }).isVisible(), "visitor: total shows");
  check(await card.getByText("Cash App", { exact: true }).isVisible(), "visitor: payment method shows");
  check(await card.getByText("Payment due").isVisible(), "visitor: stamp says Payment due");
  const printLink = card.getByRole("link", { name: /View \/ print invoice/ });
  check((await printLink.getAttribute("href")) === `/invoice/${A.orderToken}` && (await printLink.getAttribute("target")) === "_blank", "visitor: View / print invoice links to /invoice/<token> in a new tab");
  check(await card.getByText(COPY.question).isVisible(), "visitor: the question shows");
  const yes = card.getByRole("button", { name: COPY.yesButton });
  const no = card.getByRole("button", { name: COPY.noButton });
  check((await yes.isVisible()) && (await no.isVisible()), "visitor: both answer buttons show");
  check((await visitor.evaluate(() => localStorage.getItem("akz_chat_id"))) === A.convId, "visitor: the widget adopted the conversation found by cookie");

  // Scrolled to the invoice: on a phone the whole card fits (its heading and its buttons are in view).
  /** Where the invoice card sits in the thread's visible area. */
  const invoiceView = (page) =>
    page.evaluate(() => {
      const list = document.querySelector('[role="log"][aria-label="Messages"]');
      const c = list?.querySelector("[data-invoice-card]");
      const buttons = [...(c?.querySelectorAll("button") ?? [])];
      if (!list || !c) return { top: false, buttons: false };
      const l = list.getBoundingClientRect();
      const r = c.getBoundingClientRect();
      const inside = (x) => x.top >= l.top - 1 && x.bottom <= l.bottom + 1;
      return { top: r.top >= l.top - 1 && r.top < l.bottom - 100, buttons: buttons.length > 0 && buttons.every((b) => inside(b.getBoundingClientRect())) };
    });
  const view = await invoiceView(visitor);
  check(view.top && view.buttons, `visitor 390px: the thread is scrolled to the invoice (heading ${view.top ? "in" : "out of"} view, buttons ${view.buttons ? "in" : "out of"} view)`);

  // A computer's panel is shorter than the receipt: the question and the buttons must still be in view.
  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": testIp() } });
  await deskCtx.addCookies([{ name: "akz_chat", value: A.token, url: base, httpOnly: true, sameSite: "Lax" }]);
  const desk = await deskCtx.newPage();
  watch(desk, "visitor 1440");
  await desk.goto(`${base}/`, { waitUntil: "networkidle" });
  await desk.evaluate(() => window.dispatchEvent(new CustomEvent("akz:open-chat")));
  await desk.getByRole("dialog", { name: "Chat with AkatsukiZipUp" }).getByRole("article", { name: `Invoice ${A.number}` }).waitFor({ timeout: 20000 });
  await desk.waitForTimeout(300);
  const dview = await invoiceView(desk);
  check(dview.buttons, "visitor 1440px: opened for an order, the answer buttons are in view");
  await desk.screenshot({ path: `${out}/invoice-chat-visitor-desktop.png` });
  await deskCtx.close();

  const overflow = async (page) =>
    page.evaluate(() => {
      const list = document.querySelector('[role="log"][aria-label="Messages"]');
      const bad = [...(list?.querySelectorAll("article, section, button, a") ?? [])].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.left < 0 || r.right > innerWidth + 0.5);
      });
      return { page: document.documentElement.scrollWidth > innerWidth, list: list ? list.scrollWidth > list.clientWidth + 1 : true, bad: bad.length };
    });
  let o = await overflow(visitor);
  check(!o.page && !o.list && o.bad === 0, `visitor 390px: no horizontal overflow with the invoice card${o.bad ? ` (${o.bad} elements off-screen)` : ""}`);
  await visitor.screenshot({ path: `${out}/invoice-chat-visitor-invoice.png` });

  /* ------------------------------------------------------------ "Yes, all correct" */

  await yes.dblclick(); // a double tap must answer once
  await vlog.getByText(COPY.yesReply).waitFor({ timeout: 20000 });
  check(true, "visitor: the auto-reply shows after Yes");
  check(await vlog.locator("p", { hasText: /^Yes, all correct$/ }).first().isVisible(), "visitor: their answer shows as their own message");
  check((await card.getByRole("button").count()) === 0, "visitor: the buttons are gone once answered");
  check(await card.getByText("You confirmed this invoice ✓").isVisible(), "visitor: the card says You confirmed this invoice ✓");
  const answered = await db.order.findUnique({ where: { id: A.orderId }, select: { invoiceAnswer: true, invoiceAnsweredAt: true } });
  check(answered?.invoiceAnswer === "confirmed" && Boolean(answered.invoiceAnsweredAt), "db: the order remembers the answer (confirmed)");
  const yesCount = await db.chatMessage.count({ where: { conversationId: A.convId, sender: "VISITOR", body: COPY.yesMessage } });
  const replyCount = await db.chatMessage.count({ where: { conversationId: A.convId, sender: "ADMIN", body: COPY.yesReply } });
  check(yesCount === 1 && replyCount === 1, `db: a double tap answered once (${yesCount} answer, ${replyCount} reply)`);
  await visitor.screenshot({ path: `${out}/invoice-chat-visitor-answered.png` });

  /* ------------------------------------------------------------ the API refuses what it should */

  const post = (ctxOrPage, data, headers = { Origin: base }) => ctxOrPage.request.post(`${base}/api/chat/invoice`, { data, headers });
  const again = await post(visitor, { messageId: A.messageId, answer: "wrong" });
  const againJson = await again.json().catch(() => ({}));
  check(again.status() === 409 && /already answered/.test(againJson.error ?? ""), `api: answering again → 409 (${again.status()}: ${againJson.error})`);
  const others = await post(visitor, { messageId: B.messageId, answer: "confirmed" });
  const othersJson = await others.json().catch(() => ({}));
  check([403, 409].includes(others.status()) && !othersJson.ok, `api: another conversation's invoice → refused (${others.status()}: ${othersJson.error})`);
  const bStill = await db.order.findUnique({ where: { id: B.orderId }, select: { invoiceAnswer: true } });
  check(bStill?.invoiceAnswer === null, "db: the other order is untouched");
  const cross = await post(visitor, { messageId: A.messageId, answer: "confirmed" }, { Origin: "https://evil.example" });
  check(cross.status() === 403, `api: wrong Origin → 403 (${cross.status()})`);
  const bad = await post(visitor, { messageId: A.messageId, answer: "maybe" });
  check(bad.status() === 400, `api: an answer that isn't one of the two → 400 (${bad.status()})`);
  const badId = await post(visitor, { messageId: "../../etc", answer: "confirmed" });
  check(badId.status() === 400, `api: a malformed message id → 400 (${badId.status()})`);
  const stranger = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": testIp() } });
  const noCookie = await post(stranger, { messageId: A.messageId, answer: "confirmed" });
  check(noCookie.status() === 403, `api: no chat cookie → 403 (${noCookie.status()})`);
  await stranger.close();

  // The other shopper says something's wrong (API, their own cookie): the reply comes back in the thread.
  const otherCtx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": testIp() } });
  await otherCtx.addCookies([{ name: "akz_chat", value: B.token, url: base, httpOnly: true, sameSite: "Lax" }]);
  const wrong = await post(otherCtx, { messageId: B.messageId, answer: "wrong" });
  const wrongJson = await wrong.json().catch(() => ({}));
  const wrongInv = wrongJson.messages?.find((m) => m.id === B.messageId)?.invoice;
  check(
    wrong.ok() && wrongJson.messages?.some((m) => m.body === COPY.noReply) && wrongInv?.answer === "wrong" && wrongInv.orderId === undefined,
    "api: Something's wrong → 200 with the fresh thread (No problem… reply, answer = wrong, no admin order id)",
  );
  const thread = await otherCtx.request.get(`${base}/api/chat`).then((r) => r.json());
  check(thread.messages?.find((m) => m.id === B.messageId)?.kind === "INVOICE" && thread.messages.every((m) => typeof m.kind === "string"), "api: GET /api/chat returns kind on every message");
  await otherCtx.close();

  /* ------------------------------------------------------------ the admin's inbox */

  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": testIp() } });
  const admin = await adminCtx.newPage();
  watch(admin, "admin");
  await admin.goto(`${base}/admin/login`, { waitUntil: "networkidle" });
  await admin.locator("#password").fill(password);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.waitForURL(`${base}/admin`, { timeout: 30000 });

  await admin.goto(`${base}/admin/chat?c=${A.convId}`, { waitUntil: "networkidle" });
  const alog = admin.getByRole("log", { name: "Messages" });
  const acard = alog.getByRole("article", { name: `Invoice ${A.number}` });
  await acard.waitFor({ timeout: 20000 });
  check(true, "admin: the invoice shows as a receipt card");
  check(await acard.getByText("Duo bundle").isVisible() && (await acard.getByText(A.total, { exact: true }).isVisible()), "admin: card has the lines and the total");
  check(await acard.getByText("Confirmed ✓").isVisible(), "admin: answer status reads Confirmed ✓");
  const openOrder = acard.getByRole("link", { name: `Open order ${A.number}` });
  check((await openOrder.getAttribute("href")) === `/admin/orders/${A.orderId}`, "admin: Open order #… links to /admin/orders/<id>");
  const sendPay = acard.getByRole("link", { name: "Send payment details" });
  check((await sendPay.getAttribute("href")) === `/admin/orders/${A.orderId}#payment`, "admin: Send payment details links to /admin/orders/<id>#payment");
  check(await alog.getByText(COPY.yesReply).isVisible(), "admin: the auto-reply is in the thread too");
  await admin.screenshot({ path: `${out}/invoice-chat-admin.png` });

  const rowA = admin.getByRole("button").filter({ hasText: `E2E Invoice ${tag} a` });
  const rowB = admin.getByRole("button").filter({ hasText: `E2E Invoice ${tag} b` });
  await rowB.waitFor({ timeout: 15000 });
  const rowAText = (await rowA.textContent()) ?? "";
  check(rowAText.includes(COPY.yesMessage) && !rowAText.includes("You:"), `admin inbox: preview is the shopper's "Yes, all correct", not "You: …" (the auto-reply doesn't count)`);
  const rowBText = (await rowB.textContent()) ?? "";
  check(rowBText.includes("Something's wrong with my invoice") && !rowBText.includes("You:"), "admin inbox: the other conversation's preview is the shopper's answer, not \"You: …\"");
  await rowB.click();
  const bcard = alog.getByRole("article", { name: `Invoice ${B.number}` });
  await bcard.waitFor({ timeout: 20000 });
  check(await bcard.getByText("Says something's wrong").isVisible(), "admin: answer status reads Says something's wrong");

  // A fresh, unanswered order: "Waiting for the shopper", and the preview is "New order #… · $…" (no "You:").
  const C = await scene("c");
  await admin.goto(`${base}/admin/chat?c=${C.convId}`, { waitUntil: "networkidle" });
  const ccard = alog.getByRole("article", { name: `Invoice ${C.number}` });
  await ccard.waitFor({ timeout: 20000 });
  check(await ccard.getByText("Waiting for the shopper").isVisible(), "admin: an unanswered invoice reads Waiting for the shopper");
  const rowC = admin.getByRole("button").filter({ hasText: `E2E Invoice ${tag} c` });
  const rowText = (await rowC.textContent()) ?? "";
  check(rowText.includes(`New order ${C.number} · ${C.total}`) && !rowText.includes("You:"), `admin inbox: preview reads "New order ${C.number} · ${C.total}" without "You:"`);

  /* ------------------------------------------------------------ payment details */

  await visitor.getByRole("button", { name: "Close chat" }).first().click();
  const payBody = `Cash App: $akz-e2e\nAmount: ${A.total}\nNote: ${A.number} (${tag})`;
  await sendPayment(A, payBody);
  await visitor.reload({ waitUntil: "load" });
  const bubble = visitor.locator('button[aria-controls="akz-chat-panel"]');
  let badge = true;
  await visitor.locator('button[aria-controls="akz-chat-panel"][aria-label*="new repl"]').waitFor({ timeout: 15000 }).catch(() => (badge = false));
  check(badge, "visitor: the closed bubble shows an unread badge for the payment details");
  await bubble.click();
  const pay = vlog.getByRole("region", { name: `Payment details · ${A.number}` });
  await pay.waitFor({ timeout: 20000 });
  check(true, `visitor: the payment card shows (Payment details · ${A.number})`);
  const shown = await pay.locator("p").first().evaluate((el) => ({ text: el.textContent, ws: getComputedStyle(el).whiteSpace }));
  check(shown.text === payBody && shown.ws === "pre-wrap", "visitor: payment text is shown as plain text, line breaks kept");
  await pay.getByRole("button", { name: "Copy" }).click();
  await pay.getByRole("button", { name: "Copied" }).waitFor({ timeout: 5000 });
  const clip = await visitor.evaluate(() => navigator.clipboard.readText());
  check(clip === payBody, "visitor: Copy puts the payment details on the clipboard");
  o = await overflow(visitor);
  check(!o.page && !o.list && o.bad === 0, `visitor 390px: no horizontal overflow with the payment card${o.bad ? ` (${o.bad} elements off-screen)` : ""}`);
  await visitor.screenshot({ path: `${out}/invoice-chat-visitor-payment.png` });

  await admin.goto(`${base}/admin/chat?c=${A.convId}`, { waitUntil: "load" });
  const apay = alog.getByRole("region", { name: `Payment details sent · ${A.number}` });
  await apay.waitFor({ timeout: 20000 });
  check(true, "admin: the payment card shows (Payment details sent · #…)");
  check(await acard.getByText("Payment details sent ✓").isVisible(), "admin: the invoice card notes the payment details were sent");
  check((await acard.getByRole("link", { name: "Send again" }).getAttribute("href")) === `/admin/orders/${A.orderId}#payment`, "admin: Send again still links to the payment form");

  // Admin on a phone.
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.reload({ waitUntil: "load" });
  await acard.waitFor({ timeout: 20000 });
  const ao = await admin.evaluate(() => {
    const log = document.querySelector('[role="log"][aria-label="Messages"]');
    const off = [...(log?.querySelectorAll("article, section") ?? [])].filter((el) => el.getBoundingClientRect().right > innerWidth + 0.5).length;
    return { page: document.documentElement.scrollWidth > innerWidth, off };
  });
  check(!ao.page && ao.off === 0, "admin 390px: no horizontal overflow with the cards");
  await admin.screenshot({ path: `${out}/invoice-chat-admin-phone.png` });

  await adminCtx.close();
  await visitorCtx.close();
} catch (err) {
  console.log(`FAIL  stopped: ${err.message.split("\n")[0]}`);
  failed++;
} finally {
  const gone = await cleanup();
  check(gone.orders >= 2 && gone.convs >= 2, `cleanup: removed ${gone.orders} test orders and ${gone.convs} conversations`);
  await db.$disconnect();
  await browser.close();
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
process.exit(failed ? 1 : 0);
