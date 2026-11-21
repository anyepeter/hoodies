// Checks the home page's quick add-to-cart on the two style cards, the "pieces left" counts, and that the
// delivery dates follow the visitor's date (the clock is set to 22 Nov 2026).
// usage: node e2e/home-and-dates.mjs [baseUrl] [screenshotDir]
import { chromium } from "playwright";
import os from "node:os";

const base = process.argv[2] ?? "http://localhost:3200";
const out = process.argv[3] ?? "e2e/out";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? `${os.homedir()}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome` });
let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};

// 1. Home: each style card says how many are left and adds straight to the cart.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  check(await page.getByText("Only 20 left").first().isVisible(), "Akatsuki card says Only 20 left");
  check(await page.getByText("Only 35 left").first().isVisible(), "Shinobi card says Only 35 left");

  const shinobi = page.locator("article").filter({ has: page.getByRole("heading", { name: "Shinobi" }) });
  await shinobi.getByRole("button", { name: /^Add to cart/ }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/home-sizes-open.png` });
  await shinobi.getByRole("button", { name: "Add Shinobi size L to cart" }).click();
  await page.waitForTimeout(1300);
  const drawer = page.getByRole("dialog", { name: "Your cart" });
  check(await drawer.getByText("Shinobi / L").isVisible(), "picking L on the Shinobi card puts Shinobi / L in the cart");
  check((await drawer.textContent()).includes("$63.69"), "at the single-hoodie price ($63.69)");
  await page.screenshot({ path: `${out}/home-quick-add-cart.png` });
  check(errors.length === 0, `no page errors on home${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await page.close();
}

// 2. Hoodie page on 22 Nov: ordered 22 Nov, ready 23–24 Nov, delivered 27–29 Nov. Stock on the swatches.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.clock.setFixedTime(new Date("2026-11-22T10:00:00"));
  await page.goto(`${base}/products/akatsukizipup-mask-hoodie`, { waitUntil: "networkidle" });
  const text = await page.locator("main").textContent();
  check(text.includes("22 Nov") && text.includes("Ordered"), "ordered: 22 Nov");
  check(text.includes("23 Nov - 24 Nov"), "ready to ship: 23 Nov - 24 Nov");
  check(text.includes("27 Nov - 29 Nov"), "delivered: 27 Nov - 29 Nov");
  check(text.includes("Only 20 left"), "hoodie page shows Only 20 left for Akatsuki");
  check(text.includes("35 left"), "hoodie page shows 35 left for Shinobi");
  await page.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
