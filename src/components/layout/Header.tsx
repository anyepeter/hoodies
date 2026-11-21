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
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.style.overflow = menu ? "hidden" : "";
  }, [menu]);

  return (
    <header className="relative z-30 border-b border-black/5 bg-white">
      <div className="mx-auto grid h-[76px] max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center px-4 md:grid-cols-[auto_1fr_auto] md:px-12">
        <button type="button" className="-ml-2 p-2 md:hidden" aria-label="Menu" onClick={() => setMenu(true)}>
          <MenuIcon className="h-6 w-6" />
        </button>

        <Link href="/" className="justify-self-center md:justify-self-start" aria-label="AkatsukiZipUp home">
          <Image src="/store/logo.jpg" alt="AkatsukiZipUp" width={1600} height={719} priority className="h-[44px] w-auto md:h-[52px]" />
        </Link>

        <nav className="hidden justify-center gap-8 md:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-[15px] underline-offset-4 transition-colors hover:text-ink hover:underline ${pathname === item.href ? "text-ink underline" : "text-ink/75"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button type="button" className="relative -mr-2 justify-self-end p-2" aria-label={`Cart, ${count} items`} onClick={() => setOpen(true)}>
          <BagIcon className="h-6 w-6" />
          {count > 0 && (
            <span className="absolute bottom-1 right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
              {count}
            </span>
          )}
        </button>
      </div>

      {/* Mobile menu drawer */}
      <div className={`fixed inset-0 z-50 md:hidden ${menu ? "" : "pointer-events-none"}`} aria-hidden={!menu}>
        <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${menu ? "opacity-100" : "opacity-0"}`} onClick={() => setMenu(false)} />
        <nav
          className={`absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-white transition-transform duration-300 ease-out ${menu ? "translate-x-0" : "-translate-x-full"}`}
          aria-label="Menu"
        >
          <div className="flex h-[76px] items-center justify-between border-b border-black/5 px-4">
            <Image src="/store/logo.jpg" alt="" width={1600} height={719} className="h-10 w-auto" />
            <button type="button" className="p-2" aria-label="Close menu" onClick={() => setMenu(false)}>
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          <ul className="py-4">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={() => setMenu(false)} className="block px-8 py-3 text-lg hover:bg-soft">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
