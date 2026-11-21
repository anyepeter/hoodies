# ADMIN-BLUEPRINT.md — Hoodies (AkatsukiZipUp rebuild)

Every admin module reads this first. The owner's reference admin is `/home/chendi/Desktop/Hard projects/bourbon`
(read its `ADMIN-BLUEPRINT.md` and `src/app/admin/**` for how things look and behave). Match that panel's
structure and behaviour; don't copy its known flaws (see "Do better than Bourbon").

## 1. Codebase facts

| Concern | Here |
|---|---|
| Framework | Next.js **16.4.6** App Router, React 19.3, TypeScript. `cacheComponents` is OFF (classic model, like Bourbon). Proxy file is `src/proxy.ts` (Next 16 renamed middleware). Read `node_modules/next/dist/docs/` when unsure. |
| Data | Prisma **6.19.3** → Neon Postgres. Schema `prisma/schema.prisma` (applied with `prisma db push`). Client: `import { prisma } from "@/lib/db"`. Local `.env.local` points at Neon branch **dev**; production uses branch main. |
| Catalogue | NOT in the DB. `src/lib/store.ts` holds the hoodie, styles (Akatsuki/Shinobi), sizes, bundles (solo/duo/squad), add-ons, prices (USD, converted from EUR via `EUR_TO_USD`), `money()`. Only runtime state is in the DB (stock, orders...). |
| Styling | Tailwind v4 tokens in `src/app/globals.css`: `brand` #A70317, `brand-dark`, `ink` #121212, `soft` #F3F3F3, font Poppins. |
| Admin UI kit | `src/components/admin/ui.tsx`: `PageHeader`, `Card`, `Kpi`, `StatusPill`, `EmptyState`, `Tabs`, `btn.*`, `field`, `label`, `usd()`, `shortDate()`, `orderNo()`. Use these; don't invent a parallel style. |
| Admin shell | `src/app/admin/layout.tsx` → `AdminChrome` (hides chrome on /admin/login) → `AdminSidebar` (nav + badges from `/api/admin/badges`) + `AdminRealtime` (placeholder). Content area: `bg-zinc-100`, max-w-7xl. |
| Storefront chrome | `src/app/(store)/layout.tsx`: PromoBar, Header, Footer, FloatingShop, ChatWidget (placeholder), CartDrawer, BackToTop, VisitTracker (placeholder). Cart = `useCart()` from `src/components/cart/CartProvider.tsx` (localStorage). |
| Payments | **Manual**, like Bourbon: no processor. Customer picks a `PaymentOption`, sees its instructions, pays out of band; the admin confirms (PENDING → PAID). |
| Email | None configured. Don't send email. Invoices are pages (printable), not attachments. |
| Hosting | Vercel Hobby (account apcode1) — **CPU is scarce** (4 h/month shared by 10 sites). No polling faster than 60 s, no long-lived functions, no SSE. Realtime only through Pusher. |

## 2. Conventions contract (follow exactly)

**Auth — three layers.** `src/proxy.ts` guards `/admin/*` and `/api/admin/*`. Every admin page also calls
`await requireAdminPage()` first; every `/api/admin/*` handler starts with
`const denied = await requireAdminApi(); if (denied) return denied;`; every server action calls `await assertAdmin()`.
All from `@/lib/admin-session`. Admin pages: `export const dynamic = "force-dynamic"`.

**API envelope** (`@/lib/http`): `ok({...})` → `{ ok: true, ... }`; `fail("Plain sentence.", status)` → `{ ok: false, error }`;
`serverError("where", err)` for unexpected errors (logs, returns a safe 500). Never leak stack traces, SQL, secrets.

**Order of checks in any public write handler:** `if (!sameOrigin(req)) return fail("Bad origin.", 403)` →
`rateLimit(\`<name>:${clientIp(req)}\`, limit, windowSec)` → validate with **zod** via `readJson(req, schema)` → work.
Honeypot field `website` on public forms: if filled, return `ok()` and do nothing.
Suggested limits: orders 10/hour, contact 5/hour, newsletter 10/hour, chat messages 30/10 min, chat start 5/hour,
tracking 120/min.

**Validation:** zod schemas, server-side, every input. Trim strings, cap lengths (names 100, emails 254, messages 4000).

**Money:** never trust prices from the browser. Recompute every line from `src/lib/store.ts`. Store Decimal(10,2).

**Realtime = ping, then pull** (`@/lib/pusher-server`): server sends a tiny `ping(channel, event, data)`; clients refetch
from our API. Channels: `private-admin` (admin events: `order.created`, `order.updated`, `chat.message`, `contact.created`,
`badges`) and `private-chat-<conversationId>`. Admin notifications: `notifyAdmins(event, pushPayload | null, data)`
from `@/lib/notify` (Pusher ping + web push to the admin's phone, runs after the response via `after()`).
Pusher keys may be empty locally: everything must still work (just without instant updates) — always keep a
visible-tab fallback refresh (≥ 60 s).

**Admin realtime → pages:** `AdminRealtime` re-dispatches each `private-admin` ping as a window event
`admin:<event>` (e.g. `window.addEventListener("admin:order.created", ...)`). Pages that should refresh listen and
call `router.refresh()`.

**Cache/revalidation:** storefront pages are static. Anything that changes what a shopper sees (stock) calls
`revalidatePath()` for `/` and `/products/akatsukizipup-mask-hoodie` (and `/collections/all`).

**Errors in UI:** every form shows inline errors (no `alert()`), disables its button while sending, and handles
network failure ("We couldn't reach the server. Check your connection and try again."). Loading states use skeletons.

**Responsive:** every admin page works at 390 px wide (tables become cards on phones) and at 1440 px.

**Security headers** are in `next.config.ts`. Don't weaken them. Don't render user content with `dangerouslySetInnerHTML`.

## 3. Do better than Bourbon (known Bourbon flaws — don't port them)

- Bourbon trusted client totals once (fixed later) → recompute server-side from day one.
- Bourbon had no order state guard / audit → enforce transitions + write `OrderEvent` rows.
- Bourbon never decremented stock → decrement atomically on order, restore on cancel.
- Bourbon's sidebar polls every 10 s → ours: Pusher ping + 60 s visible-only fallback.
- Bourbon's admin cookie = hash of the password → ours: signed expiring session (`src/lib/admin-auth.ts`).

## 4. Modules and owners

| Module | Owner | Verdict |
|---|---|---|
| Foundation: schema, auth, proxy, shell, UI kit, http/pusher/push/notify helpers, badges | lead | ✅ built |
| Checkout, orders API, stock decrement, order page + invoice, admin orders, payment methods, products & stock, live stock on storefront | agent **orders** | build |
| Live chat (widget + admin inbox), Pusher auth, AdminRealtime, web push devices, admin PWA (manifest, service worker, install) | agent **realtime** | build |
| Visitor analytics, newsletter + subscribers, contact form + messages, dashboard | agent **insights** | build |
| Security review + e2e tests + deploy | lead + reviewer | after |
| Campaigns (email) | — | SKIP: no email provider |
| Customer accounts | — | SKIP: guest checkout; order page via secret token |

## 5. Rules for agents working in parallel

- Edit **only the files you own** (listed in your brief). Need a change elsewhere (schema, shared lib, another
  agent's file)? Don't make it: say so in your final report.
- Don't run `npm install`, `prisma db push`, `next build`, `git commit` or anything that writes `.next/`.
  You may run `npx tsc --noEmit`, `npx eslint <your files>`, and **your own** dev server:
  `NEXT_DIST_DIR=.next-<you> npx next dev -p <your port>` (orders 3211, realtime 3212, insights 3213).
  Stop it when done. Local DB = Neon dev branch: test data there is fine.
- Never print or commit secrets (`.env.local`, `.env.vercel-production`).

## Progress

- [x] Foundation — 21 Nov 2026. `prisma/schema.prisma`, `src/lib/{db,admin-auth,admin-session,http,pusher-server,push,notify}.ts`,
  `src/proxy.ts`, `src/app/admin/{layout,AdminChrome,AdminSidebar,page}.tsx`, `src/app/admin/login/*`, `src/app/api/admin/badges`,
  `src/components/admin/ui.tsx`, `src/app/(store)/layout.tsx`.
- [x] Orders & stock — 21 Nov 2026 (agent orders). Checkout, POST /api/orders (server pricing, atomic stock, 409 when
  short), /order/[token], /invoice/[token], admin orders (guarded transitions, audit timeline, restore once),
  payment methods, products & stock. e2e/checkout.mjs.
- [x] Realtime — 21 Nov 2026 (agent realtime). Pusher client + /api/pusher/auth, chat widget + admin inbox, AdminRealtime
  (window events + toasts + chime), web push devices, admin manifest + /admin-sw.js. e2e/chat.mjs.
- [x] Insights — 21 Nov 2026 (agent insights). Visitor tracking (akz_vid cookie, order/invoice tokens collapsed),
  analytics, newsletter + subscribers + CSV, contact → messages, dashboard. e2e/insights.mjs.
- [x] Security review — 21 Nov 2026. Fixed: one order can't take the whole stock (max 6 hoodies, 5 orders/hour/IP,
  unpaid orders auto-cancel after 48 h and give stock back), production has its own admin password / session secret /
  VAPID keys, tracking capped (30/min + 1,000/day per IP) and analytics queries bounded to the period, chat page-path
  and service-worker URL checks reject `/\host`, order metadata checks the session, admin links don't prefetch (CPU).
  Open (low): no global login cap across IPs; stateless sessions can't be revoked one by one (rotate
  ADMIN_SESSION_SECRET); a Vercel Firewall rule on /api/* would stop floods before they cost invocations.
- [x] e2e: flow 12, home-and-dates 10, checkout 65, chat 70, insights 57 — all passing against `next start`.
- [x] Order-in-chat (21 Nov 2026, owner's request: "do it the Bourbon / Muh-med way"). Payment rails = Bourbon's
  (Chime, Zelle, Cash App, Apple Pay, Cryptocurrency 10% off; no details at checkout). Placing an order posts the
  invoice into the shopper's chat (src/lib/chat/order-chat.ts) with Muh-med's "is everything correct?" + Yes / No;
  "Order confirmed" page opens the chat (`akz:open-chat`); admin sends payment details from the order page (PAYMENT
  message). Home style cards link to the hoodie page with `?style=`. e2e: order-to-chat 24, checkout 127,
  invoice-chat 59, chat 70, insights 57, home-and-dates 17, flow 12.
- [x] Chat like the vape store — 21 Nov 2026. Pictures + PDFs both ways (made small in the browser, stored in
  Postgres ChatFile, served only to that chat's shopper / the admin, type-checked by magic bytes, sandbox CSP);
  shoppers' "Don't miss your payment details" notification card (public/sw.js, ChatPushSubscription; pushes only
  when they're away, max 1/min per chat; `?chat=open` opens the chat); admin order editor for PENDING orders
  (server recomputes totals + moves stock) and "Send updated invoice" (INV-1001-2, old card REPLACED). e2e:
  order-to-chat 24, order-edit 71, checkout 128, invoice-chat 60, chat-files 62, chat-notify 62, chat 70,
  insights 57, home-and-dates 17, flow 12 — 563 checks.
