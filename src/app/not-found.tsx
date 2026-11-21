import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-[560px] px-4 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand">404</p>
      <h1 className="mt-2 text-[30px] font-bold">Page not found</h1>
      <Link href="/collections/all" className="btn-brand mt-8">
        Continue shopping
      </Link>
    </section>
  );
}
