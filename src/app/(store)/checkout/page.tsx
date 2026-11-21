import type { Metadata } from "next";
import { activePaymentOptions } from "@/lib/orders/queries";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

// Rendered per request (one cheap query): if the database was unreachable at build time, a static checkout
// would keep saying "payments aren't set up" for an hour. The cart itself is read in the browser.
export const dynamic = "force-dynamic";

export default async function Checkout() {
  const paymentOptions = await activePaymentOptions();
  return <CheckoutForm paymentOptions={paymentOptions} />;
}
