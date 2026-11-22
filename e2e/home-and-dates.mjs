// Checks the home page's two style cards (pieces left, and Add to cart opening the hoodie page with that style
// picked) and that the delivery dates follow the visitor's date (the clock is set to 22 Nov 2026).
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

// 1. Home: each style card says how many are left. Its Add to cart is a link to the hoodie page with that
//    style picked for every hoodie; sizes and packs are chosen there (no size picker on the card).
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  check(await page.getByText("Only 20 left").first().isVisible(), "Akatsuki card says Only 20 left");
  check(await page.getByText("Only 35 left").first().isVisible(), "Shinobi card says Only 35 left");

  const cardOf = (style) => page.locator("article").filter({ has: page.getByRole("heading", { name: style, exact: true }) });
  for (const style of ["Akatsuki", "Shinobi"]) {
    const add = cardOf(style).getByRole("link", { name: /^Add to cart/ });
    check((await add.getAttribute("href")) === `/products/akatsukizipup-mask-hoodie?style=${style}`, `${style} card: Add to cart → the hoodie page with ?style=${style}`);
    check((await cardOf(style).getByRole("button", { name: /size/i }).count()) === 0, `${style} card: no size picker on the card`);
  }
  check((await cardOf("Shinobi").getByRole("link", { name: /^Add to cart/ }).textContent()).includes("$63.69"), "the card still shows the price ($63.69)");

  await cardOf("Shinobi").getByRole("link", { name: /^Add to cart/ }).click();
  await page.waitForURL(`${base}/products/akatsukizipup-mask-hoodie?style=Shinobi`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(900); // the picker is set after mount, then scrolled into view
  const open = page.locator('[role="radio"][aria-checked="true"]').locator("..");
  const picked = await open.locator('select[aria-label^="Style for hoodie"]').evaluateAll((s) => s.map((x) => x.value));
  check(picked.length === 2 && picked.every((t) => t === "Shinobi"), `both hoodies of the Duo pack are Shinobi (${picked.join(", ")})`);
  const inView = await page.evaluate(() => {
    const r = document.querySelector('[role="radiogroup"][aria-label="Bundle"]').getBoundingClientRect();
    return window.scrollY > 200 && r.top < window.innerHeight && r.bottom > 0;
  });
  check(inView, "the page scrolled down to the packs");
  await page.screenshot({ path: `${out}/home-card-to-hoodie-page.png` });

  // Pick sizes and add: the cart gets two Shinobi.
  await open.getByLabel("Size for hoodie 1").selectOption("M");
  await open.getByLabel("Size for hoodie 2").selectOption("L");
  await page.getByRole("button", { name: "Add to cart", exact: true }).first().click();
  await page.waitForTimeout(1300);
  const drawer = page.getByRole("dialog", { name: "Your cart" });
  check(await drawer.getByText("Shinobi / M, Shinobi / L").isVisible(), "adding puts Shinobi / M, Shinobi / L in the cart");
  await page.evaluate(() => localStorage.clear());

  // A style that isn't sold, or no ?style=: the usual default (Akatsuki).
  await page.goto(`${base}/products/akatsukizipup-mask-hoodie?style=Hokage`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const def = await page.locator('[role="radio"][aria-checked="true"]').locator("..").locator('select[aria-label^="Style for hoodie"]').evaluateAll((s) => s.map((x) => x.value));
  check(def.length === 2 && def.every((t) => t === "Akatsuki"), "an unknown ?style= is ignored (Akatsuki stays picked)");
  check(errors.length === 0, `no page errors on home or the hoodie page${errors.length ? `: ${errors.join(" | ")}` : ""}`);
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
  const options = await page.locator('[role="radio"][aria-checked="true"]').locator("..").locator('select[aria-label="Style for hoodie 1"] option').evaluateAll((os) => os.map((o) => `${o.value}:${o.disabled}`).join());
  check(options === "Akatsuki:false,Shinobi:false", `both styles can be picked while in stock (${options})`);
  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
