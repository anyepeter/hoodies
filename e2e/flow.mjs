// Walks the buying flow on a phone and checks each step.
// usage: node e2e/flow.mjs [baseUrl] [screenshotDir]
import { chromium } from "playwright";
import os from "node:os";

const base = process.argv[2] ?? "http://localhost:3200";
const out = process.argv[3] ?? "e2e/out";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? `${os.homedir()}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome` });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};

await page.goto(`${base}/products/akatsukizipup-mask-hoodie`, { waitUntil: "networkidle" });
const buy = page.getByRole("button", { name: "Add to cart", exact: true }).first();
const secs = (t) => t.split(":").reduce((a, n) => a * 60 + Number(n), 0);
const timer = page.getByRole("timer");
await page.waitForFunction(() => /^\d\d:\d\d:\d\d$/.test(document.querySelector('[role="timer"]')?.textContent ?? ""));
const firstLeft = secs(await timer.textContent());
check(firstLeft > 14 * 3600 - 20 && firstLeft <= 14 * 3600, `a first visit starts the sale countdown at 14 hours (${await timer.textContent()})`);

// 1. The packs look like the original: FREE SHIPPING on each, the "Most Popular" sticker, the MOST VALUE tag.
const group = page.getByRole("radiogroup", { name: "Bundle" });
check((await group.getByText("Free shipping").count()) === 3, "each pack says FREE SHIPPING");
check(await group.getByText("Popular").isVisible(), "the Duo pack wears the Most Popular sticker");
check(await group.getByText("MOST VALUE").isVisible(), "the Squad pack has the MOST VALUE tag");

// 2. Duo pack (the default). Sizes start on S and all three extras are ticked inside the open pack, as on
//    the original. The folded-away packs are inert, so only the open card is searched.
const card = page.locator('[role="radio"][aria-checked="true"]').locator("..");
check((await card.getByLabel("Size for hoodie 1").inputValue()) === "S", "sizes start on S");
check((await card.getByRole("checkbox").evaluateAll((bs) => bs.length === 3 && bs.every((b) => b.checked))), "the three extras start ticked inside the open pack");
await page.screenshot({ path: `${out}/flow-packs.png` });
await card.getByLabel("Size for hoodie 1").selectOption("M");
await card.getByLabel("Style for hoodie 2").selectOption("Shinobi");
await card.getByLabel("Size for hoodie 2").selectOption("L");
check((await page.locator('[inert] select[aria-label="Size for hoodie 1"]').count()) === 2, "the two closed packs are inert (skipped by keyboard and screen readers)");
// Untick two: the shopper keeps only the mystery box.
await card.getByText("Add Shipping Protection").click();
await card.getByText("Add Priority Shipping").click();
check((await card.getByRole("checkbox").evaluateAll((bs) => bs.map((b) => b.checked).join())) === "true,false,false", "unticking leaves only the mystery box");

await buy.click();
await page.waitForTimeout(1300);
const drawer = page.getByRole("dialog", { name: "Your cart" });
check(await drawer.getByText("Akatsuki Mask Hoodie · Duo Pack").isVisible(), "cart opens with the duo pack");
check(await drawer.getByText("Akatsuki / M, Shinobi / L").isVisible(), "cart line shows both styles and sizes");
check(await drawer.getByText("Mystery Box").first().isVisible(), "cart has the mystery box");
check((await drawer.textContent()).includes("$129.97"), "cart total is $129.97");
await page.screenshot({ path: `${out}/flow-cart.png` });

// 3. Close, scroll past the button: the sticky bar appears.
await drawer.getByRole("button", { name: "Close cart" }).click();
await page.evaluate(() => window.scrollTo({ top: 2600, behavior: "instant" }));
await page.waitForTimeout(700);
check(await page.getByText("Duo Pack", { exact: true }).last().isVisible(), "sticky bar shows the chosen pack");
await page.screenshot({ path: `${out}/flow-sticky.png` });

// 4. The cart survives a reload, and the countdown carries on instead of starting over. (These reloads wait
//    for "load", not "networkidle": the page's live connections keep the network busy for ~30 s.)
const ticking = () => page.waitForFunction(() => /^\d\d:\d\d:\d\d$/.test(document.querySelector('[role="timer"]')?.textContent ?? ""));
await page.reload({ waitUntil: "load" });
await ticking();
check((await page.locator("#cart-icon").getAttribute("aria-label")).includes("2 items"), "cart is still there after a reload (2 items)");
const afterReload = secs(await timer.textContent());
check(afterReload < firstLeft && afterReload > firstLeft - 180, `after a reload the countdown carries on (${await timer.textContent()})`);

// 5. A round that runs out starts the next 14 hours: one ending in 2 seconds, then one that ended yesterday.
await page.evaluate(() => localStorage.setItem("akz.sale-ends-at", String(Date.now() + 2000)));
await page.reload({ waitUntil: "load" });
await ticking();
await page.waitForTimeout(3000);
check(secs(await timer.textContent()) > 14 * 3600 - 10, `when the round reaches zero, a new 14 hours starts (${await timer.textContent()})`);
await page.evaluate(() => localStorage.setItem("akz.sale-ends-at", String(Date.now() - 86400000)));
await page.reload({ waitUntil: "load" });
await ticking();
check(secs(await timer.textContent()) > 14 * 3600 - 10, `coming back the next day shows a fresh 14 hours (${await timer.textContent()})`);

// 6. Sizing chart: a real table with a cm switch.
await page.getByRole("button", { name: "Sizing chart", exact: true }).click();
await page.getByRole("button", { name: "Centimetres" }).click();
check(await page.getByRole("cell", { name: "112", exact: true }).isVisible(), "size guide converts S chest to 112 cm");
await page.screenshot({ path: `${out}/flow-size-guide.png` });

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
