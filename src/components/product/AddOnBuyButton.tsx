"use client";

import { useCart } from "@/components/cart/CartProvider";
import { ADD_ONS, type AddOnId } from "@/lib/store";

export function AddOnBuyButton({ id, className = "mt-6 w-full md:w-auto" }: { id: AddOnId; className?: string }) {
  const { add } = useCart();
  const a = ADD_ONS.find((x) => x.id === id)!;
  return (
    <button type="button" className={`btn-brand ${className}`} onClick={() => add([{ key: `addon:${a.id}`, title: a.title, image: a.image, price: a.price }])}>
      Add to cart
    </button>
  );
}
