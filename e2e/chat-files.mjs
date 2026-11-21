// Pictures and PDFs in the chat, both directions: browser-side shrinking, the upload checks, access control on
// the file routes, the viewer, and the layout at 390 px.
// usage: node --env-file=.env.local e2e/chat-files.mjs [baseUrl] [screenshotDir]
//   Two shopper conversations are written straight into the database (cookie = a token we generate, stored as
//   its SHA-256 like hashChatToken() in src/lib/chat/server.ts), the same way e2e/invoice-chat.mjs does it.
//   Every row this run makes is deleted at the end (files and messages go with their conversation).
import { chromium } from "playwright";
import prismaPkg from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import os from "node:os";

setDefaultAutoSelectFamilyAttemptTimeout(2_000); // Neon is far away (same fix as src/lib/db.ts)
const { PrismaClient } = prismaPkg;
const db = new PrismaClient();

const base = process.argv[2] ?? "http://localhost:3231";
const out = process.argv[3] ?? "e2e/out";
mkdirSync(out, { recursive: true });
const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error("ADMIN_PASSWORD missing: run with node --env-file=.env.local e2e/chat-files.mjs");
  process.exit(2);
}
const live = Boolean(process.env.NEXT_PUBLIC_PUSHER_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER);
const tag = Math.random().toString(36).slice(2, 7);
const testIp = () => `198.18.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
const DECODE_ERROR = "That picture couldn't be opened. Try a screenshot or a JPEG/PNG.";

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};
const errors = [];
const watch = (page, who) =>
  page.on("pageerror", (e) => errors.push(`${who}: ${e.message}`));

const hashChatToken = (t) => createHash("sha256").update(t).digest("base64url");

async function scene(label) {
  const token = randomBytes(32).toString("base64url");
  const conv = await db.conversation.create({
    data: { visitorToken: hashChatToken(token), name: `E2E Files ${tag} ${label}`, email: `e2e-files-${tag}-${label}@example.com`, pagePath: "/" },
    select: { id: true },
  });
  await db.chatMessage.create({ data: { conversationId: conv.id, sender: "VISITOR", body: `Hi, can I send you a picture? (${tag} ${label})` } });
  return { token, convId: conv.id };
}

async function cleanup() {
  const convs = await db.conversation.deleteMany({ where: { name: { startsWith: "E2E Files " } } });
  return convs.count;
}

const A = await scene("a");
const B = await scene("b");
console.log(`scene: conversations ${A.convId.slice(0, 8)}… and ${B.convId.slice(0, 8)}…`);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? `${os.homedir()}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome` });

/** A context that is shopper `s` (their chat cookie), on its own test IP. */
async function shopper(s, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, extraHTTPHeaders: { "x-forwarded-for": testIp() } });
  if (s) await ctx.addCookies([{ name: "akz_chat", value: s.token, url: base, httpOnly: true, sameSite: "Lax" }]);
  return ctx;
}

/** A minimal valid PDF. */
const pdfBytes = (pad = 0) =>
  Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n"),
    Buffer.alloc(pad, 0x20),
    Buffer.from("trailer<</Root 1 0 R>>\n%%EOF\n"),
  ]);

const overflow = (page) =>
  page.evaluate(() => {
    const list = document.querySelector('[role="log"][aria-label="Messages"]');
    const bad = [...(list?.querySelectorAll("img, a, button, p") ?? [])].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.left < 0 || r.right > innerWidth + 0.5);
    });
    return { page: document.documentElement.scrollWidth > innerWidth, list: list ? list.scrollWidth > list.clientWidth + 1 : true, bad: bad.length };
  });

try {
  /* ------------------------------------------------------------ the shopper sends a picture */

  const vctx = await shopper(A);
  const visitor = await vctx.newPage();
  watch(visitor, "visitor");
  await visitor.goto(`${base}/`, { waitUntil: "networkidle" });
  await visitor.evaluate(() => window.dispatchEvent(new CustomEvent("akz:open-chat", { detail: { at: "latest" } })));
  const panel = visitor.getByRole("dialog", { name: "Chat with AkatsukiZipUp" });
  const vlog = panel.getByRole("log", { name: "Messages" });
  await vlog.getByText(`Hi, can I send you a picture? (${tag} a)`).waitFor({ timeout: 40000 });
  const clip = panel.getByRole("button", { name: "Attach a picture or PDF" });
  check(await clip.isVisible(), "visitor: the composer has a paperclip button");

  // A big, detailed PNG made in the page (2400 × 1800, noisy so it doesn't compress to nothing).
  const png = Buffer.from(
    await visitor.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 2400;
      c.height = 1800;
      const g = c.getContext("2d");
      const grad = g.createLinearGradient(0, 0, 2400, 1800);
      grad.addColorStop(0, "#a70317");
      grad.addColorStop(1, "#121212");
      g.fillStyle = grad;
      g.fillRect(0, 0, 2400, 1800);
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = `hsl(${(i * 37) % 360} 70% ${30 + (i % 50)}%)`;
        g.fillRect((i * 97) % 2400, (i * 53) % 1800, 6 + (i % 30), 6 + (i % 20));
      }
      return c.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
  check(png.length > 300_000, `test: made a ${Math.round(png.length / 1024)} KB PNG (2400 × 1800)`);

  const caption = `The tag on mine (${tag})`;
  await panel.getByPlaceholder("Write a message…").fill(caption);
  await panel.locator('input[type="file"]').setInputFiles({ name: "IMG_0042 big.png", mimeType: "image/png", buffer: png });
  const vimg = vlog.locator('img[src^="/api/chat/files/"]').first();
  await vimg.waitFor({ timeout: 30000 });
  check(true, "visitor: the picture is sent and shows from /api/chat/files/<id>");
  check(await vlog.getByText(caption).isVisible(), "visitor: the caption shows under the picture");
  check((await panel.getByPlaceholder("Write a message…").inputValue()) === "", "visitor: the text box was used as the caption and cleared");
  await visitor.waitForFunction(() => {
    const i = document.querySelector('[role="log"] img[src^="/api/chat/files/"]');
    return i && i.complete && i.naturalWidth > 0;
  });
  const vbox = await vimg.evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, nw: el.naturalWidth, nh: el.naturalHeight }));
  check(vbox.w <= 241 && vbox.w > 100 && Math.abs(vbox.w / vbox.h - 4 / 3) < 0.03, `visitor: picture box is ≤ 240 px wide in the picture's shape (${Math.round(vbox.w)} × ${Math.round(vbox.h)})`);

  const row = await db.chatMessage.findFirst({
    where: { conversationId: A.convId, fileId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, sender: true, body: true, fileId: true, fileName: true, fileMime: true, fileSize: true, fileWidth: true, fileHeight: true },
  });
  const stored = row && (await db.chatFile.findUnique({ where: { id: row.fileId }, select: { mime: true, size: true, data: true, conversationId: true } }));
  const head = stored ? Buffer.from(stored.data) : Buffer.alloc(0);
  check(row?.sender === "VISITOR" && row.body === caption, "db: a VISITOR message with the caption as its body");
  check(stored?.mime === "image/webp" && head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP", "db: stored as WebP (RIFF....WEBP), made in the browser");
  check(row?.fileWidth === 1600 && row.fileHeight === 1200, `db: longest side shrunk to 1600 (${row?.fileWidth} × ${row?.fileHeight})`);
  check(stored && stored.size < png.length / 3 && stored.size <= 1_500_000 && stored.size === head.length, `db: much smaller than the PNG (${Math.round((stored?.size ?? 0) / 1024)} KB vs ${Math.round(png.length / 1024)} KB)`);
  check(row?.fileName === "IMG_0042 big.webp" && row.fileMime === "image/webp", `db: file name keeps the name with the real extension (${row?.fileName})`);
  check(stored?.conversationId === A.convId, "db: the file belongs to the shopper's conversation");
  const convA = await db.conversation.findUnique({ where: { id: A.convId }, select: { unreadForAdmin: true, lastMessage: true } });
  check(convA?.lastMessage === `📷 ${caption}` && convA.unreadForAdmin >= 1, `db: inbox preview "${convA?.lastMessage}", unread for the admin`);
  const imgId = row?.fileId;

  // Headers, as the shopper's browser gets them.
  // The route sets Content-Length, but Next 16 drops it from route-handler responses (send-response.js
  // FORBIDDEN_HEADERS) and sends the body chunked: accept either, and check the body is exactly the file.
  const vres = await visitor.request.get(`${base}/api/chat/files/${imgId}`);
  const vh = vres.headers();
  const vbody = await vres.body();
  check(
    vres.status() === 200 && vh["content-type"] === "image/webp" && (vh["content-length"] === undefined || Number(vh["content-length"]) === stored?.size) && vbody.length === stored?.size,
    `files: 200, exact Content-Type, ${vh["content-length"] ? "Content-Length" : "chunked body"} of exactly ${stored?.size} bytes`,
  );
  check((await db.chatMessage.count({ where: { conversationId: A.convId, fileName: "IMG_0042 big.webp" } })) === 1, "db: one pick sends one message");
  check(vh["x-content-type-options"] === "nosniff" && vh["content-security-policy"] === "sandbox; default-src 'none'", "files: nosniff + sandbox CSP");
  check(vh["cache-control"] === "private, max-age=86400", `files: Cache-Control private, max-age=86400 (${vh["cache-control"]})`);
  check(/^inline; filename="IMG_0042 big\.webp"; filename\*=UTF-8''IMG_0042%20big\.webp$/.test(vh["content-disposition"] ?? ""), `files: picture is inline (${vh["content-disposition"]})`);

  // Full screen from the widget: Escape closes the viewer, not the chat.
  await vlog.getByRole("button", { name: /^Open picture/ }).first().click();
  const vview = visitor.getByRole("dialog", { name: "Picture" });
  await vview.waitFor({ timeout: 5000 });
  check(await vview.getByRole("link", { name: "Download picture" }).isVisible(), "visitor: tapping the picture opens the full-screen viewer with Download");
  await visitor.keyboard.press("Escape");
  await vview.waitFor({ state: "hidden", timeout: 5000 });
  check(await panel.isVisible(), "visitor: Escape closes the viewer and leaves the chat open");

  // EXIF/GPS never leaves the phone: a JPEG carrying a marker in its EXIF block comes out without it.
  const jpeg = Buffer.from(
    await visitor.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 800;
      c.height = 600;
      const g = c.getContext("2d");
      g.fillStyle = "#3a6";
      g.fillRect(0, 0, 800, 600);
      return c.toDataURL("image/jpeg", 0.9).split(",")[1];
    }),
    "base64",
  );
  const marker = Buffer.from(`GPS-E2E-SECRET-${tag}`);
  const exifBody = Buffer.concat([Buffer.from("Exif\0\0II*\0\x08\0\0\0\0\0", "latin1"), marker]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (exifBody.length + 2) >> 8, (exifBody.length + 2) & 0xff]), exifBody]);
  const withExif = Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
  await panel.locator('input[type="file"]').setInputFiles({ name: "holiday.jpg", mimeType: "image/jpeg", buffer: withExif });
  await visitor.waitForFunction(() => document.querySelectorAll('[role="log"] img[src^="/api/chat/files/"]').length >= 2, null, { timeout: 30000 });
  const exifRow = await db.chatMessage.findFirst({ where: { conversationId: A.convId, fileName: "holiday.webp" }, select: { fileId: true } });
  const exifFile = exifRow && (await db.chatFile.findUnique({ where: { id: exifRow.fileId }, select: { data: true } }));
  check(Boolean(exifFile) && !Buffer.from(exifFile.data).includes(marker) && withExif.includes(marker), "db: a JPEG's EXIF block (with its GPS marker) is gone after the browser re-encodes it");

  // A picture the browser can't open (HEIC on most desktops): a plain sentence, nothing sent.
  const before = await db.chatMessage.count({ where: { conversationId: A.convId } });
  await panel.locator('input[type="file"]').setInputFiles({ name: "IMG_9999.HEIC", mimeType: "image/heic", buffer: Buffer.from("not really a heic file at all") });
  await panel.getByText(DECODE_ERROR).waitFor({ timeout: 10000 });
  check(true, `visitor: an undecodable picture says "${DECODE_ERROR}"`);
  check((await db.chatMessage.count({ where: { conversationId: A.convId } })) === before, "db: nothing was sent for it");

  // Upload fails once (offline): the bubble says Not sent + Retry, and Retry sends it.
  await visitor.route("**/api/chat/files", (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue()));
  await panel.locator('input[type="file"]').setInputFiles({ name: "retry-me.png", mimeType: "image/png", buffer: png.subarray(0, png.length) });
  const notSent = vlog.getByText(/Not sent\./);
  await notSent.first().waitFor({ timeout: 20000 });
  check(await vlog.getByRole("button", { name: "Retry", exact: true }).isVisible(), "visitor: a failed upload shows Not sent + Retry");
  await visitor.unroute("**/api/chat/files");
  await vlog.getByRole("button", { name: "Retry", exact: true }).click();
  await notSent.waitFor({ state: "hidden", timeout: 30000 });
  await visitor.waitForFunction(() => document.querySelectorAll('[role="log"] img[src^="/api/chat/files/"]').length >= 3, null, { timeout: 30000 });
  check((await db.chatMessage.count({ where: { conversationId: A.convId, fileName: "retry-me.webp" } })) === 1, "visitor: Retry sends it (saved once)");

  /* ------------------------------------------------------------ the upload API refuses what it should */

  const apiCtx = await shopper(A);
  const up = (ctx, multipart, headers = { Origin: base }) => ctx.request.post(`${base}/api/chat/files`, { multipart, headers });
  const svg = await up(apiCtx, { file: { name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') } });
  check(svg.status() === 415, `upload: an SVG → 415 (${svg.status()})`);
  const html = await up(apiCtx, { file: { name: "cat.png", mimeType: "image/png", buffer: Buffer.from("<!doctype html><script>alert(document.cookie)</script>") } });
  check(html.status() === 415, `upload: HTML renamed to .png → 415 (${html.status()})`);
  const htmlType = await up(apiCtx, { file: { name: "page.html", mimeType: "text/html", buffer: Buffer.from("<b>hi</b>") } });
  check(htmlType.status() === 415, `upload: text/html → 415 (${htmlType.status()})`);
  const bigImg = await up(apiCtx, { file: { name: "big.png", mimeType: "image/png", buffer: Buffer.concat([png.subarray(0, 8), randomBytes(1_600_000)]) } });
  check(bigImg.status() === 413, `upload: a picture over 1.5 MB → 413 (${bigImg.status()})`);
  const bigPdf = await up(apiCtx, { file: { name: "big.pdf", mimeType: "application/pdf", buffer: pdfBytes(3_100_000) } });
  check(bigPdf.status() === 413, `upload: a PDF over 3 MB → 413 (${bigPdf.status()})`);
  const badDim = await up(apiCtx, { file: { name: "a.png", mimeType: "image/png", buffer: png.subarray(0, 2000) }, width: "abc", height: "12" });
  check(badDim.status() === 400, `upload: a width that isn't a whole number → 400 (${badDim.status()})`);
  const hugeDim = await up(apiCtx, { file: { name: "a.png", mimeType: "image/png", buffer: png.subarray(0, 2000) }, width: "20000", height: "12" });
  check(hugeDim.status() === 400, `upload: a width over 10000 → 400 (${hugeDim.status()})`);
  const cross = await up(apiCtx, { file: { name: "a.pdf", mimeType: "application/pdf", buffer: pdfBytes() } }, { Origin: "https://evil.example" });
  check(cross.status() === 403, `upload: wrong Origin → 403 (${cross.status()})`);
  const anon = await shopper(null);
  const noCookieUp = await up(anon, { file: { name: "a.pdf", mimeType: "application/pdf", buffer: pdfBytes() } });
  check(noCookieUp.status() === 404, `upload: no chat cookie → 404 (${noCookieUp.status()})`);
  const weird = await up(apiCtx, { file: { name: "../../etc/pass‮gpj.pdf", mimeType: "application/pdf", buffer: pdfBytes() } });
  const weirdJson = await weird.json().catch(() => ({}));
  check(weird.status() === 201 && weirdJson.message?.file?.name === "passgpj.pdf", `upload: path parts and bidi characters are stripped from the name (${weirdJson.message?.file?.name})`);
  check(weirdJson.message?.file?.url?.startsWith("/api/chat/files/") && weirdJson.message.body === "", "upload: an empty caption is fine for a file");
  const emptyText = await apiCtx.request.post(`${base}/api/chat/messages`, { data: { message: "   " }, headers: { Origin: base } });
  check(emptyText.status() === 400, `messages: a text message still needs text (${emptyText.status()})`);

  /* ------------------------------------------------------------ who can fetch a file */

  const bCtx = await shopper(B);
  const other = await bCtx.request.get(`${base}/api/chat/files/${imgId}`);
  check(other.status() === 404, `files: another chat's file → 404 (${other.status()})`);
  const nobody = await anon.request.get(`${base}/api/chat/files/${imgId}`);
  check(nobody.status() === 404, `files: no cookie → 404 (${nobody.status()})`);
  const madeUp = await visitor.request.get(`${base}/api/chat/files/../../etc/passwd`);
  check(madeUp.status() === 404, `files: a made-up path → 404 (${madeUp.status()})`);
  const adminSignedOut = await anon.request.get(`${base}/api/admin/chat/files/${imgId}`);
  check(adminSignedOut.status() === 401, `admin files: signed out → 401 (${adminSignedOut.status()})`);
  await bCtx.close();
  await apiCtx.close();
  await anon.close();

  /* ------------------------------------------------------------ the admin sees it, and sends a PDF */

  const actx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": testIp() } });
  const admin = await actx.newPage();
  watch(admin, "admin");
  await admin.goto(`${base}/admin/login`, { waitUntil: "networkidle" });
  await admin.locator("#password").fill(password);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.waitForURL(`${base}/admin`, { timeout: 30000 });
  await admin.goto(`${base}/admin/chat?c=${A.convId}`, { waitUntil: "networkidle" });
  const alog = admin.getByRole("log", { name: "Messages" });
  const aimg = alog.locator(`img[src="/api/admin/chat/files/${imgId}"]`);
  await aimg.waitFor({ timeout: 20000 });
  check(true, "admin: the shopper's picture shows in the inbox (from /api/admin/chat/files/<id>)");
  check(await alog.getByText(caption).isVisible(), "admin: with its caption");
  await admin.waitForFunction((id) => {
    const i = document.querySelector(`img[src="/api/admin/chat/files/${id}"]`);
    return i && i.complete && i.naturalWidth === 1600;
  }, imgId);
  check(true, "admin: the picture loads (1600 px wide)");
  const ah = (await admin.request.get(`${base}/api/admin/chat/files/${imgId}`)).headers();
  check(ah["content-type"] === "image/webp" && ah["x-content-type-options"] === "nosniff" && ah["content-security-policy"] === "sandbox; default-src 'none'", "admin files: exact type, nosniff, sandbox CSP");
  await alog.getByRole("button", { name: /^Open picture/ }).first().click();
  const aview = admin.getByRole("dialog", { name: "Picture" });
  await aview.waitFor({ timeout: 5000 });
  const big = aview.locator("img");
  check((await big.getAttribute("src")) === `/api/admin/chat/files/${imgId}`, "admin: the viewer shows the picture full screen");
  check((await aview.getByRole("link", { name: "Download picture" }).getAttribute("download")) === "IMG_0042 big.webp", "admin: the viewer has a download link with the file's name");
  await admin.screenshot({ path: `${out}/chat-files-admin-viewer.png` });
  await aview.getByRole("button", { name: "Close picture" }).click();
  await aview.waitFor({ state: "hidden", timeout: 5000 });
  check(true, "admin: Close shuts the viewer");

  const pdf = pdfBytes(2000);
  await admin.getByLabel("Reply").fill(`Here's your receipt (${tag})`);
  await admin.locator('input[type="file"]').setInputFiles({ name: "receipt-e2e.pdf", mimeType: "application/pdf", buffer: pdf });
  const achip = alog.getByRole("link", { name: /receipt-e2e\.pdf/ });
  await achip.waitFor({ timeout: 30000 });
  check(true, "admin: the PDF is sent and shows as a file chip");
  const pdfRow = await db.chatMessage.findFirst({ where: { conversationId: A.convId, fileName: "receipt-e2e.pdf" }, select: { sender: true, body: true, fileId: true, fileSize: true } });
  check(pdfRow?.sender === "ADMIN" && pdfRow.body === `Here's your receipt (${tag})` && pdfRow.fileSize === pdf.length, "db: an ADMIN message with the PDF (sent as-is) and its caption");
  const convAfter = await db.conversation.findUnique({ where: { id: A.convId }, select: { unreadForVisitor: true, lastMessage: true } });
  check(convAfter?.unreadForVisitor >= 1 && convAfter.lastMessage === "📄 receipt-e2e.pdf", `db: unread for the shopper, preview "${convAfter?.lastMessage}"`);
  await admin.screenshot({ path: `${out}/chat-files-admin.png` });

  // The shopper gets the chip (live over Pusher, or on reopening the panel).
  if (!live) {
    await panel.getByRole("button", { name: "Close chat" }).first().click();
    await visitor.locator('button[aria-controls="akz-chat-panel"]').click();
  }
  const vchip = vlog.getByRole("link", { name: /receipt-e2e\.pdf/ });
  await vchip.waitFor({ timeout: 20000 });
  check(true, `visitor: the admin's PDF shows as a file chip (${live ? "live" : "after reopening"})`);
  check((await vchip.getAttribute("href")) === `/api/chat/files/${pdfRow?.fileId}` && (await vchip.getAttribute("target")) === "_blank", "visitor: the chip opens /api/chat/files/<id> in a new tab");
  check(/PDF · 2 KB/.test((await vchip.textContent()) ?? ""), "visitor: the chip shows the size");
  const pres = await visitor.request.get(`${base}/api/chat/files/${pdfRow?.fileId}`);
  const ph = pres.headers();
  check(pres.status() === 200 && ph["content-type"] === "application/pdf" && (ph["content-length"] === undefined || Number(ph["content-length"]) === pdf.length), "visitor files: the PDF comes back as application/pdf");
  check(/^attachment; filename="receipt-e2e\.pdf"; filename\*=UTF-8''receipt-e2e\.pdf$/.test(ph["content-disposition"] ?? ""), `visitor files: PDF is an attachment (${ph["content-disposition"]})`);
  check(ph["x-content-type-options"] === "nosniff" && ph["content-security-policy"] === "sandbox; default-src 'none'", "visitor files: PDF has nosniff + sandbox CSP");
  check(Buffer.from(await pres.body()).equals(pdf), "visitor files: the PDF bytes are exactly what the admin sent");

  /* ------------------------------------------------------------ 390 px */

  await vlog.evaluate((el) => (el.scrollTop = el.scrollHeight));
  let o = await overflow(visitor);
  check(!o.page && !o.list && o.bad === 0, `visitor 390px: no horizontal overflow with pictures and a PDF${o.bad ? ` (${o.bad} elements off-screen)` : ""}`);
  await visitor.screenshot({ path: `${out}/chat-files-visitor-390.png` });

  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.reload({ waitUntil: "networkidle" });
  await aimg.waitFor({ timeout: 20000 });
  o = await overflow(admin);
  check(!o.page && !o.list && o.bad === 0, `admin 390px: no horizontal overflow with pictures and a PDF${o.bad ? ` (${o.bad} elements off-screen)` : ""}`);
  await admin.screenshot({ path: `${out}/chat-files-admin-390.png` });

  await actx.close();
  await vctx.close();
} catch (err) {
  console.log(`FAIL  stopped: ${err.message.split("\n")[0]}`);
  failed++;
} finally {
  const gone = await cleanup();
  const leftFiles = await db.chatFile.count({ where: { conversationId: { in: [A.convId, B.convId] } } });
  check(gone >= 2 && leftFiles === 0, `cleanup: removed ${gone} test conversations (their files and messages with them)`);
  await db.$disconnect();
  await browser.close();
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
process.exit(failed ? 1 : 0);
