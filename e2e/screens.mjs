// Screenshots of the store at phone and desktop width, for checking against the original.
// usage: node e2e/screens.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import os from "node:os";

const base = process.argv[2] ?? "http://localhost:3200";
const out = process.argv[3] ?? "e2e/out";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? `${os.homedir()}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`,
});
const pages = [
  ["product", "/products/akatsukizipup-mask-hoodie"],
  ["home", "/"],
  ["catalog", "/collections/all"],
];
for (const [name, path] of pages) {
  for (const [label, width, height] of [["mobile", 390, 844], ["desktop", 1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(base + path, { waitUntil: "networkidle" });
    // Scroll through so the fade-ins fire, then back to the top.
    await page.evaluate(async () => {
      // "instant": the site sets scroll-behavior: smooth, which would make each step only crawl.
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 80));
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.waitForTimeout(900);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: `${out}/${name}-${label}.png`, fullPage: true });
    console.log(`${name}-${label}: horizontal overflow ${overflow}px, errors: ${errors.length ? errors.join(" | ") : "none"}`);
    await page.close();
  }
}
await browser.close();
