# Hoodies

A rebuild of the AkatsukiZipUp store (akatsukizipup.com) in Next.js 16 + Tailwind CSS 4, made to show the
client what a custom build can do.

- **Tag `clone`**: the faithful copy. Same pages, photos, video, wording, prices, colours (#A70317) and
  Poppins type as the live Shopify store on 21 Nov 2026. Prices are the store's euro prices converted to US
  dollars at the ECB rate of 20 Nov 2026 (1 EUR = 1.099 USD): $63.69, was $88.96. The rate is one constant,
  `EUR_TO_USD` in `src/lib/store.ts`.

The site is marked noindex (and robots.txt disallows everything) because it's a design preview of a real store. `git checkout clone` to see it.
- **`main`**: the improved version built on top of it (below).

It has a real backend now (Neon Postgres via Prisma): orders with manual payment methods and invoices, stock
that goes down when someone orders, live chat (Pusher), phone notifications for the admin, analytics,
subscribers and contact messages. Checkout carries one line saying it's a design preview: orders are recorded
but nothing is charged, because the site uses another company's brand.

## Admin

`/admin`, signed in with `ADMIN_PASSWORD` (local: `.env.local`; production: `.env.vercel-production` and Vercel).

| Page | What it does |
| --- | --- |
| Dashboard | Revenue, orders, awaiting payment, visitors, conversion, stock, unread chats and messages |
| Orders | Status tabs, search, detail with Mark paid (with reference) / shipped / delivered / cancel / refund, timeline, invoice. Cancelling puts stock back. Unpaid orders cancel themselves after 48 hours |
| Products & stock | Pieces left per style (Akatsuki, Shinobi), +/− and set, sold and held counts |
| Payment methods | What checkout offers and the instructions on the order page and invoice (`{order}`, `{total}`) |
| Live chat | Inbox for the chat bubble on the store; replies arrive live on the shopper's screen |
| Messages | The contact form |
| Subscribers | Newsletter sign-ups, CSV export |
| Analytics | Visitors, page views, time on page, pages, countries, devices, referrers, live now |
| Notifications & app | Turn on phone notifications (new order, chat, message) and install the admin as an app |

How it's built and the rules every module follows: `ADMIN-BLUEPRINT.md`.

## What's better than the original

Same brand, same photos and words. These are the changes, and why each one matters.

**More of the phone screen for the product**
- The original stacks a 78px countdown bar and a 40px ticker above the header and keeps the countdown pinned
  while you scroll. Here it's one 36px line (rotating offers + countdown) that scrolls away, and a header that
  shrinks as you scroll.

**A home page that sells**
- The original home page is one product tile. Now it opens on the store's own video full-screen on a phone
  (split layout on desktop), then both styles side by side, three feature stories (the mask, the clouds, the
  two styles), the review wall, FAQs and a closing call to action.

**Buying is clearer**
- Price, compare-at price and "Save 28%" are next to the title. The original only shows prices inside the bundle cards.
- Each bundle shows the saving in dollars and the price per hoodie ("Save $63.28 · $57.32 each").
- Style is picked with photo swatches and size with buttons, not dropdowns. You can mix Akatsuki and Shinobi
  in a pack.
- No size is pre-selected. The original defaults everyone to S, which is how wrong sizes get ordered.
  Add-to-cart asks for a size if one is missing.
- The button shows the running total ("Add to cart · $114.64"). The product photo flies into the cart, then
  the cart opens.
- The sticky bar at the bottom shows the pack you picked and its real total. The original always shows the
  single-hoodie price.

**Legal and trust**
- Paid extras (Mystery Box, Shipping Protection, Priority Shipping) start **unticked**. The original ticks all
  three in advance, which EU consumer law does not allow (Consumer Rights Directive, Art. 22), and this store
  sells to the EU.
- Free shipping, 30-day returns and dispatch time are shown under the button, not buried in an FAQ.
- The "Delivired" typo is fixed.

**Details that make it feel premium**
- Gallery: thumbnails on phones too, a photo counter, tap to zoom fullscreen, and swatches jump to the photo of that style.
- The size guide is a real table with an inches/cm switch. The original is a picture of a table, tiny on a phone
  and unreadable to screen readers.
- Reviews: every review on one wall instead of a carousel that hides two of the three.
- Cart: savings total, a free-shipping confirmation, extras offered once (never pre-ticked), quantity controls,
  and the cart survives a reload and stays in sync across tabs.
- Motion: sections fade up as they scroll in, the hero text rises in, pages fade between routes, and there are
  press and hover states throughout. It all switches off for people who set "reduce motion".

**Under the hood**
- Every page is pre-rendered. Images are resized per screen and served as WebP, and the video only plays
  while it's on screen.
- The page carries Product structured data for Google (price, currency, stock, free shipping).
- For keyboard and screen-reader users: a skip link, visible focus rings, an inert closed drawer and collapsed
  packs, and labelled controls. There's no sideways scrolling at phone width.

## Run it

```bash
npm install                # also generates the Prisma client
npm run dev -- -p 3200     # http://localhost:3200 (database: Neon branch "dev", from .env.local)
npm run db:push            # apply prisma/schema.prisma
npm run db:seed            # stock 20/35 + two example payment methods (only fills what's missing)
```

Checks (run against a running server):

```bash
node --env-file=.env.local e2e/checkout.mjs http://localhost:3200   # checkout, orders, stock, payment methods, admin
node --env-file=.env.local e2e/chat.mjs http://localhost:3200       # live chat both ways, Pusher auth, push, layout
node --env-file=.env.local e2e/insights.mjs http://localhost:3200   # tracking, analytics, newsletter, contact, dashboard
node e2e/flow.mjs http://localhost:3200      # walks the buying flow: 12 checks
node e2e/home-and-dates.mjs http://localhost:3200   # quick add on the style cards, pieces left, delivery dates on 22 Nov
node e2e/screens.mjs http://localhost:3200 e2e/out   # phone + desktop screenshots, sideways-scroll check
node e2e/overflow.mjs                         # lists anything wider than a phone screen
```

## Where things are

| What | Where |
| --- | --- |
| Product, bundles, add-ons, reviews, FAQs, size chart, all wording | `src/lib/store.ts` |
| Pieces left per style ("Only 20 left": Akatsuki 20, Shinobi 35) | `STOCK` in `src/lib/store.ts` |
| Delivery dates (ordered today, ships in 1–2 days, delivered in 5–7, from the visitor's own date) | `src/components/product/DeliveryTimeline.tsx` |
| Policy pages (shipping, refund, terms, privacy, contact) | `src/lib/policies.ts` |
| Photos and the video (downloaded from the store's CDN) | `public/store/` |
| Home page | `src/app/page.tsx`, `src/components/sections/Hero.tsx` |
| Hoodie page | `src/app/products/akatsukizipup-mask-hoodie/page.tsx`, `src/components/product/` |
| Cart (kept in the browser) and cart drawer | `src/components/cart/` |
