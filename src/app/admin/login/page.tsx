import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await isAdmin()) redirect("/admin");
  const sp = await searchParams;
  const from = typeof sp.from === "string" ? sp.from : "";
  const unconfigured = sp.error === "unconfigured";

  return (
    <div className="grain relative flex min-h-dvh items-center justify-center overflow-hidden bg-ink px-4 py-12">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand/30 blur-[120px]" aria-hidden />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="rounded-2xl bg-white p-3 shadow-xl">
            <Image src="/store/logo.jpg" alt="AkatsukiZipUp" width={1600} height={719} className="h-10 w-auto" priority />
          </div>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.35em] text-brand">Store admin</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl">
          <h1 className="text-xl font-bold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-zinc-500">Restricted area. Enter the admin password.</p>
          {unconfigured ? (
            <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
              The admin password isn&apos;t set up on the server yet (ADMIN_PASSWORD and ADMIN_SESSION_SECRET).
            </p>
          ) : (
            <LoginForm from={from} />
          )}
        </div>
        <Link prefetch={false} href="/" className="mt-6 block text-center text-sm text-white/50 transition hover:text-white">
          ← Back to the store
        </Link>
      </div>
    </div>
  );
}
