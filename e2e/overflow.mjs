// Lists the elements that stick out past the right edge on a phone (what causes sideways scrolling).
// usage: node e2e/overflow.mjs [url]
import { chromium } from "playwright";
import os from "node:os";

const url = process.argv[2] ?? "http://localhost:3200/products/akatsukizipup-mask-hoodie";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? `${os.homedir()}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome` });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(url, { waitUntil: "networkidle" });
const found = await page.evaluate(() => {
  const w = window.innerWidth;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right > w + 1 && r.width > 0) {
      // skip things inside a scroller that clips them
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { clipped = true; break; }
        p = p.parentElement;
      }
      if (!clipped) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 90)} right=${Math.round(r.right)}`);
    }
  }
  return out.slice(0, 15);
});
console.log(found.join("\n") || "nothing sticks out");
await browser.close();
