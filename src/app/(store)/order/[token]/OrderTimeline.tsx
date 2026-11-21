import type { OrderStatus } from "@prisma/client";
import { CartAddIcon, CheckBoxIcon, GiftIcon, TruckIcon } from "@/components/icons";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
const range = (d: Date, from: number, to: number) => `${fmt(plus(d, from))} - ${fmt(plus(d, to))}`;

interface Dates {
  status: OrderStatus;
  createdAt: Date;
  paidAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
}

/**
 * The product page's delivery timeline, but for a real order: each step shows the day it happened, or the
 * estimate from the day it was paid (ships 1–2 days after payment, arrives 5–7 days after payment).
 */
export function OrderTimeline({ order }: { order: Dates }) {
  const paid = order.paidAt;
  const shipped = order.shippedAt;
  const steps = [
    { icon: CartAddIcon, label: "Ordered", date: fmt(order.createdAt), done: true },
    { icon: CheckBoxIcon, label: "Paid", date: paid ? fmt(paid) : "Waiting", done: Boolean(paid) },
    { icon: TruckIcon, label: "Shipped", date: shipped ? fmt(shipped) : paid ? `est. ${range(paid, 1, 2)}` : "1–2 days after payment", done: Boolean(shipped) },
    {
      icon: GiftIcon,
      label: "Delivered",
      date: order.deliveredAt ? fmt(order.deliveredAt) : shipped ? `est. ${range(shipped, 4, 6)}` : paid ? `est. ${range(paid, 5, 7)}` : "5–7 days after payment",
      done: Boolean(order.deliveredAt),
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="relative mx-auto max-w-[560px]">
      <div className="absolute left-[12.5%] right-[12.5%] top-[19px] h-[2px] bg-black/10" aria-hidden />
      <div className="absolute left-[12.5%] top-[19px] h-[2px] bg-brand" style={{ width: `${(Math.max(0, doneCount - 1) / 3) * 75}%` }} aria-hidden />
      <ol className="relative grid grid-cols-4 text-center" aria-label="Order progress">
        {steps.map(({ icon: Icon, label, date, done }) => (
          <li key={label} className="relative flex flex-col items-center px-1">
            <span className={`grid h-10 w-10 place-items-center rounded-full ${done ? "bg-brand text-white" : "border-2 border-black/10 bg-white text-ink/35"}`}>
              <Icon className="h-5 w-5" />
            </span>
            <span className={`mt-2 text-[12px] font-bold ${done ? "" : "text-ink/50"}`}>{label}</span>
            <span className="text-[11px] leading-tight text-ink/60">{date}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
