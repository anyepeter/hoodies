"use client";

import { useSyncExternalStore } from "react";
import { CartAddIcon, GiftIcon, TruckIcon } from "@/components/icons";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const plus = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const noSubscribe = () => () => {};

/** Ordered today → ready to ship in 1–2 days → delivered in 5–7 days, worked out in the visitor's browser. */
export function DeliveryTimeline() {
  // The server can't know the visitor's date, so it renders blanks and the browser fills them in.
  const day = useSyncExternalStore(noSubscribe, () => new Date().toDateString(), () => null);
  const today = day ? new Date(day) : null;

  const steps = [
    { icon: CartAddIcon, date: today ? fmt(today) : "", label: "Ordered" },
    { icon: TruckIcon, date: today ? `${fmt(plus(today, 1))} - ${fmt(plus(today, 2))}` : "", label: "Ready to ship" },
    { icon: GiftIcon, date: today ? `${fmt(plus(today, 5))} - ${fmt(plus(today, 7))}` : "", label: "Delivired" },
  ];

  return (
    <div className="relative mx-auto grid max-w-[440px] grid-cols-3 text-center">
      <div className="absolute left-[16.6%] right-[16.6%] top-[19px] h-[2px] bg-brand" aria-hidden />
      {steps.map(({ icon: Icon, date, label }) => (
        <div key={label} className="relative flex flex-col items-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand text-white">
            <Icon className="h-5 w-5" />
          </span>
          <span className="mt-2 h-4 text-[11px] font-bold">{date}</span>
          <span className="text-[11px] text-ink/75">{label}</span>
        </div>
      ))}
    </div>
  );
}
