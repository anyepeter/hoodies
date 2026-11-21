// Starting data: stock per style and the payment methods (the same rails as the owner's Bourbon and Muh-med
// stores). Safe to re-run: stock is only created if missing; methods are matched by key and never overwrite
// what the admin has since typed in.
// usage: npm run db:seed
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Bourbon's rails, word for word, plus the message the admin sends in the chat to ask for payment. */
const METHODS = [
  {
    key: "chime",
    name: "Chime",
    detail: "Pay from your Chime account via Pay Anyone.",
    details: "$YourChimeSign",
    instructions: "Please send {total} with Chime (Pay Anyone) to {details} and write {order} in the note. Send us a screenshot here once it's done.",
    discountRate: 0,
  },
  {
    key: "zelle",
    name: "Zelle",
    detail: "Send from your bank app — no fees, arrives in minutes.",
    details: "payments@yourstore.com",
    instructions: "Please send {total} with Zelle to {details} and write {order} in the memo. Send us a screenshot here once it's done.",
    discountRate: 0,
  },
  {
    key: "cash-app",
    name: "Cash App",
    detail: "Pay to our $Cashtag from the Cash App.",
    details: "$YourCashtag",
    instructions: "Please send {total} on Cash App to {details} and write {order} in the note. Send us a screenshot here once it's done.",
    discountRate: 0,
  },
  {
    key: "apple-pay",
    name: "Apple Pay",
    detail: "Touch ID or Face ID confirmation.",
    details: "(555) 555-0123",
    instructions: "Please send {total} with Apple Pay (Apple Cash) to {details} and write {order} in the message. Send us a screenshot here once it's done.",
    discountRate: 0,
  },
  {
    key: "crypto",
    name: "Cryptocurrency",
    detail: "Pay with Bitcoin, Ethereum, USDC. Settles in ~10 minutes.",
    details: "Your wallet address",
    instructions: "Please send {total} in Bitcoin, Ethereum or USDC to this address:\n{details}\nThen send us the transaction ID here with {order}.",
    discountRate: 0.1,
  },
];

async function main() {
  for (const [style, stock] of [
    ["Akatsuki", 20],
    ["Shinobi", 35],
  ] as const) {
    await prisma.styleStock.upsert({ where: { style }, update: {}, create: { style, stock } });
  }

  for (const [i, m] of METHODS.entries()) {
    // Create the ones that are missing; leave existing ones exactly as the admin set them.
    await prisma.paymentOption.upsert({ where: { key: m.key }, update: {}, create: { ...m, sortOrder: i, active: true } });
  }
  // The first version's placeholder methods (no key) are switched off, not deleted: old orders keep their copy.
  await prisma.paymentOption.updateMany({ where: { key: null }, data: { active: false } });

  const stock = await prisma.styleStock.findMany();
  const methods = await prisma.paymentOption.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { name: true } });
  console.log("stock:", stock.map((s) => `${s.style} ${s.stock}`).join(", "), "· payment methods:", methods.map((m) => m.name).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
