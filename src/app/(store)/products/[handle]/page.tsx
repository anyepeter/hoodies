import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddOnBuyButton } from "@/components/product/AddOnBuyButton";
import { ADD_ONS, money } from "@/lib/store";

// The three add-ons have simple pages of their own, like on the original store. (The hoodie has its own route.)
export function generateStaticParams() {
  return ADD_ONS.map((a) => ({ handle: a.id }));
}

export async function generateMetadata({ params }: PageProps<"/products/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const addOn = ADD_ONS.find((a) => a.id === handle);
  return addOn ? { title: addOn.title } : {};
}

async function AddOn({ params }: { params: PageProps<"/products/[handle]">["params"] }) {
  const { handle } = await params;
  const addOn = ADD_ONS.find((a) => a.id === handle);
  if (!addOn) notFound();
  return (
    <>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-soft">
        <Image src={addOn.image} alt={addOn.title} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-contain p-10" priority />
      </div>
      <div className="flex flex-col justify-center">
        <h1 className="text-[29px] font-bold">{addOn.title}</h1>
        <p className="mt-2 text-xl font-semibold">{money(addOn.price)}</p>
        <p className="mt-4 text-ink/80">{addOn.description}</p>
        <AddOnBuyButton id={addOn.id} />
      </div>
    </>
  );
}

export default function AddOnPage(props: PageProps<"/products/[handle]">) {
  return (
    <section className="mx-auto grid max-w-[1100px] gap-8 px-4 py-10 md:grid-cols-2 md:px-12">
      <Suspense fallback={<div className="aspect-square animate-pulse rounded-xl bg-soft" />}>
        <AddOn params={props.params} />
      </Suspense>
    </section>
  );
}
