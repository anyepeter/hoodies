import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

// This is a demo build for showing the client: there is no payment provider behind it on purpose.
export default function Checkout() {
  return (
    <section className="mx-auto max-w-[560px] px-4 py-20 text-center">
      <h1 className="text-[28px] font-bold">Checkout</h1>
      <p className="mt-4 text-ink/75">
        This is a demo of the store. Checkout isn&apos;t connected, so no order is placed and nothing is charged. In the live store this step hands over to the payment
        provider.
      </p>
      <Link href="/products/akatsukizipup-mask-hoodie" className="btn-brand mt-8">
        Back to the hoodie
      </Link>
    </section>
  );
}
