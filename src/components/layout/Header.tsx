"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { BagIcon, CloseIcon, MenuIcon } from "@/components/icons";
import { NAV } from "@/lib/store";

export function Header() {
  const { count, setOpen } = useCart();
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.style.overflow = menu ? "hidden" : "";
  }, [menu]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={`sticky top-0 z-30 border-b transition-[background-color,box-shadow,border-color] duration-300 ${
          scrolled ? "border-black/5 bg-white shadow-[0_6px_24px_-12px_rgba(18,18,18,0.25)]" : "border-transparent bg-white"
        }`}
      >
        <div
          className={`mx-auto grid max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center px-4 transition-[height] duration-300 md:grid-cols-[auto_1fr_auto] md:px-12 ${scrolled ? "h-[60px]" : "h-[68px] md:h-[76px]"}`}
        >
          <button type="button" className="-ml-2 rounded-full p-2 transition hover:bg-black/5 md:hidden" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}>
            <MenuIcon className="h-6 w-6" />
          </button>

          <Link href="/" className="justify-self-center md:justify-self-start" aria-label="AkatsukiZipUp home">
            <Image
              src="/store/logo.jpg"
              alt="AkatsukiZipUp"
              width={1600}
              height={719}
              priority
              className={`w-auto transition-[height] duration-300 ${scrolled ? "h-9" : "h-10 md:h-12"}`}
            />
          </Link>

          <nav className="hidden justify-center gap-1 md:flex" aria-label="Main">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative rounded-full px-4 py-2 text-[14px] font-medium transition-colors ${active ? "text-ink" : "text-ink/60 hover:text-ink"}`}
                >
                  {item.label}
                  <span className={`absolute inset-x-4 -bottom-0.5 h-0.5 origin-left rounded-full bg-brand transition-transform duration-300 ${active ? "scale-x-100" : "scale-x-0"}`} />
                </Link>
              );
            })}
          </nav>

          <button
            id="cart-icon"
            type="button"
            className="relative -mr-2 justify-self-end rounded-full p-2 transition hover:bg-black/5"
            aria-label={`Open cart, ${count} ${count === 1 ? "item" : "items"}`}
            onClick={() => setOpen(true)}
          >
            <BagIcon className="h-6 w-6" />
            <span
              className={`absolute right-0 top-0 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white transition-transform duration-300 ${count > 0 ? "scale-100" : "scale-0"}`}
            >
              {count}
            </span>
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      <div className={`fixed inset-0 z-50 md:hidden ${menu ? "" : "pointer-events-none"}`} aria-hidden={!menu} inert={!menu}>
        <div className={`absolute inset-0 bg-ink/50 backdrop-blur-sm transition-opacity duration-300 ${menu ? "opacity-100" : "opacity-0"}`} onClick={() => setMenu(false)} />
        <nav
          className={`absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-white transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${menu ? "translate-x-0" : "-translate-x-full"}`}
          aria-label="Menu"
        >
          <div className="flex h-[68px] items-center justify-between px-5">
            <Image src="/store/logo.jpg" alt="" width={1600} height={719} className="h-9 w-auto" />
            <button type="button" className="rounded-full p-2 hover:bg-black/5" aria-label="Close menu" onClick={() => setMenu(false)}>
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          <ul className="px-3 pt-4">
            {NAV.map((item, i) => (
              <li
                key={item.href}
                className={`transition-all duration-500 ${menu ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"}`}
                style={{ transitionDelay: menu ? `${120 + i * 60}ms` : "0ms" }}
              >
                <Link
                  href={item.href}
                  onClick={() => setMenu(false)}
                  className={`flex items-center justify-between rounded-xl px-4 py-4 text-[22px] font-semibold tracking-tight ${pathname === item.href ? "text-brand" : "text-ink"}`}
                >
                  {item.label}
                  <span aria-hidden className="text-ink/30">→</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/products/akatsukizipup-mask-hoodie"
            onClick={() => setMenu(false)}
            className="group mx-5 mt-auto mb-6 flex items-center gap-4 rounded-2xl bg-soft p-3"
          >
            <Image src="/store/akatsuki-front.webp" alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-xl object-cover" />
            <span>
              <span className="block text-[15px] font-semibold">Akatsuki Mask Hoodie</span>
              <span className="text-[13px] text-ink/60">Shop the hoodie →</span>
            </span>
          </Link>
        </nav>
      </div>
    </>
  );
}
