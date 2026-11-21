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
const buy = page.getByRole("button", { name: /^Add to cart · / });

// 1. No size picked yet: the store asks instead of guessing S.
await buy.click();
check(await page.getByRole("alert").filter({ hasText: "Pick a size" }).isVisible(), "asks for a size before adding");

// 2. Duo pack (the default): M Akatsuki + L Shinobi, plus the mystery box. The folded-away packs are inert,
//    so only the open card is searched.
const card = page.locator('[role="radio"][aria-checked="true"]').locator("..");
await card.getByRole("button", { name: "Size M for hoodie 1" }).click();
await card.getByRole("button", { name: "Size L for hoodie 2" }).click();
await card.getByRole("button", { name: "Shinobi" }).nth(1).click();
check((await page.locator('[inert] [aria-label="Size M for hoodie 1"]').count()) === 2, "the two closed packs are inert (skipped by keyboard and screen readers)");
check(!(await page.getByRole("checkbox").first().isChecked()), "extras start unticked");
await page.getByText("Mystery Box", { exact: true }).click();
check((await buy.textContent()).includes("€118,26"), "button shows the total with the extra (€118,26)");

await buy.click();
await page.waitForTimeout(1300);
const drawer = page.getByRole("dialog", { name: "Your cart" });
check(await drawer.getByText("Akatsuki Mask Hoodie · Duo Pack").isVisible(), "cart opens with the duo pack");
check(await drawer.getByText("Akatsuki / M, Shinobi / L").isVisible(), "cart line shows both styles and sizes");
check(await drawer.getByText("Mystery Box").first().isVisible(), "cart has the mystery box");
check((await drawer.textContent()).includes("€118,26"), "cart total is €118,26");
await page.screenshot({ path: `${out}/flow-cart.png` });

// 3. Close, scroll past the button: the sticky bar appears.
await drawer.getByRole("button", { name: "Close cart" }).click();
await page.evaluate(() => window.scrollTo({ top: 2600, behavior: "instant" }));
await page.waitForTimeout(700);
check(await page.getByText("Duo Pack", { exact: true }).last().isVisible(), "sticky bar shows the chosen pack");
await page.screenshot({ path: `${out}/flow-sticky.png` });

// 4. The cart survives a reload.
await page.reload({ waitUntil: "networkidle" });
check((await page.locator("#cart-icon").getAttribute("aria-label")).includes("2 items"), "cart is still there after a reload (2 items)");

// 5. Size guide: a real table with a cm switch.
await page.getByRole("button", { name: "Size guide", exact: true }).click();
await page.getByRole("button", { name: "Centimetres" }).click();
check(await page.getByRole("cell", { name: "112", exact: true }).isVisible(), "size guide converts S chest to 112 cm");
await page.screenshot({ path: `${out}/flow-size-guide.png` });

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
