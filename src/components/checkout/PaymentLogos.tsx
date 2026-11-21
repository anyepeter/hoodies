// Payment rail marks, ported from the owner's Bourbon store (src/app/checkout/Logos.tsx): brand colours and
// letterforms, no shipped artwork. Plain markup with no state, so server pages (invoice, admin) use them too.

type LogoProps = { className?: string };

export function ChimeLogo({ className = "h-6" }: LogoProps) {
  return (
    <span className={`${className} inline-flex items-center justify-center rounded-sm bg-[#1EC677] px-2`}>
      <span className="text-sm font-extrabold leading-none tracking-tight text-white">Chime</span>
    </span>
  );
}

export function ZelleLogo({ className = "h-6" }: LogoProps) {
  return (
    <span className={`${className} inline-flex items-center justify-center rounded-sm bg-[#6D1ED4] px-2`}>
      <span className="text-sm font-extrabold leading-none tracking-tight text-white">Zelle</span>
    </span>
  );
}

export function CashAppLogo({ className = "h-6" }: LogoProps) {
  return (
    <span className={`${className} inline-flex items-center justify-center rounded-sm bg-[#00D632] px-2`}>
      <span className="whitespace-nowrap text-sm font-extrabold leading-none tracking-tight text-white">Cash App</span>
    </span>
  );
}

export function ApplePayLogo({ className = "h-6" }: LogoProps) {
  return (
    <span className={`${className} inline-flex items-center justify-center gap-0.5 rounded-sm bg-black px-2 text-white`}>
      <svg viewBox="0 0 384 512" className="h-3 w-auto fill-current" aria-hidden>
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
      </svg>
      <span className="text-xs font-medium leading-none">Pay</span>
    </span>
  );
}

export function BitcoinLogo({ className = "h-6 w-6" }: LogoProps) {
  return (
    <span className={`${className} inline-flex items-center justify-center rounded-full bg-[#F7931A] text-white`}>
      <span className="text-sm font-bold leading-none">₿</span>
    </span>
  );
}

export function EthereumLogo({ className = "h-6 w-6" }: LogoProps) {
  return (
    <span className={`${className} inline-flex items-center justify-center rounded-full bg-[#627EEA]`}>
      <svg viewBox="0 0 24 24" className="h-4 w-auto" aria-hidden>
        <path fill="#FFFFFF" d="M12 2L5 12.5l7 4 7-4z" opacity=".7" />
        <path fill="#FFFFFF" d="M12 22l7-9-7 4-7-4z" opacity=".9" />
      </svg>
    </span>
  );
}

/** A method the admin added without a built-in logo: its first letters on a plain badge. */
function OtherLogo({ name, className = "h-6" }: LogoProps & { name: string }) {
  const letters =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "$";
  return (
    <span className={`${className} inline-flex min-w-8 items-center justify-center rounded-sm border border-black/15 bg-white px-2`}>
      <span className="text-xs font-bold leading-none tracking-wide text-ink/70">{letters}</span>
    </span>
  );
}

/**
 * The mark for a payment method, by its key (chime | zelle | cash-app | apple-pay | crypto). Anything else
 * (null, or a key from the future) gets the neutral badge, so a new method never breaks the layout.
 */
export function PaymentLogo({ paymentKey, name, className = "" }: { paymentKey: string | null | undefined; name: string; className?: string }) {
  const key = paymentKey ?? "other";
  let mark;
  switch (key) {
    case "chime":
      mark = <ChimeLogo />;
      break;
    case "zelle":
      mark = <ZelleLogo />;
      break;
    case "cash-app":
      mark = <CashAppLogo />;
      break;
    case "apple-pay":
      mark = <ApplePayLogo />;
      break;
    case "crypto":
      mark = (
        <span className="flex items-center gap-1.5">
          <BitcoinLogo />
          <EthereumLogo />
        </span>
      );
      break;
    default:
      mark = <OtherLogo name={name} />;
  }
  return (
    <span className={`inline-flex shrink-0 items-center ${className}`} data-payment-logo={key} aria-hidden>
      {mark}
    </span>
  );
}
