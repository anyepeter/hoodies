// Starting data: stock per style and two example payment methods. Safe to re-run: it only fills what's missing.
// usage: npm run db:seed
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  for (const [style, stock] of [
    ["Akatsuki", 20],
    ["Shinobi", 35],
  ] as const) {
    await prisma.styleStock.upsert({ where: { style }, update: {}, create: { style, stock } });
  }

  if ((await prisma.paymentOption.count()) === 0) {
    await prisma.paymentOption.createMany({
      data: [
        {
          name: "Bank transfer",
          instructions: "Send {total} by bank transfer and put order {order} as the reference. We ship as soon as it arrives.",
          details: "Account details are added by the store owner in Admin → Payment methods.",
          sortOrder: 0,
        },
        {
          name: "PayPal",
          instructions: "Send {total} with PayPal (Friends & Family) and write order {order} in the note.",
          details: "PayPal address is added by the store owner in Admin → Payment methods.",
          sortOrder: 1,
        },
      ],
    });
  }
  const stock = await prisma.styleStock.findMany();
  console.log("stock:", stock.map((s) => `${s.style} ${s.stock}`).join(", "), "· payment methods:", await prisma.paymentOption.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
