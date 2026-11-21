import "server-only";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { PrismaClient } from "@prisma/client";

// Neon is ~175ms away from the owner's machine; Node's 250ms happy-eyeballs per-address timeout makes a busy
// build worker miss the answer (ETIMEDOUT). Same fix as the vape store.
setDefaultAutoSelectFamilyAttemptTimeout(2_000);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
