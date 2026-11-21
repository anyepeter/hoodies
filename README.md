# Hoodies

A rebuild of the AkatsukiZipUp store (akatsukizipup.com) in Next.js 16 + Tailwind CSS 4, made to show the
client what a custom build can do.

- **Tag `clone`**: the faithful copy. Same pages, photos, video, wording, prices (EUR), colours (#A70317) and
  Poppins type as the live Shopify store on 21 Nov 2026.
- **`main`**: the improved version built on top of it.

This is a demo: there is no payment provider, so "Check out" explains that rather than taking an order, and
the newsletter and contact forms don't send anything.

## Run it

```bash
npm install
npm run dev -- -p 3200     # http://localhost:3200
```

Screenshots at phone (390px) and desktop (1440px) width, with a check for sideways scrolling and console errors:

```bash
node e2e/screens.mjs http://localhost:3200 e2e/out
```

## Where things are

| What | Where |
| --- | --- |
| Product, bundles, add-ons, reviews, FAQs, all wording | `src/lib/store.ts` |
| Policy pages (shipping, refund, terms, privacy, contact) | `src/lib/policies.ts` |
| Photos and the video (downloaded from the store's CDN) | `public/store/` |
| Hoodie page | `src/app/products/akatsukizipup-mask-hoodie/page.tsx` |
| Cart (kept in the browser) and cart drawer | `src/components/cart/` |
