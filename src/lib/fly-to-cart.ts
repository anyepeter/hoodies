/**
 * The product photo arcs from the button into the cart icon, and the icon gives a little bounce.
 * Pure Web Animations API (transform + opacity only), skipped for people who prefer reduced motion.
 * Returns how long the flight takes so the caller can open the cart when it lands.
 */
export function flyToCart(from: HTMLElement, imageSrc: string): number {
  const target = document.getElementById("cart-icon");
  if (!target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;

  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const size = 72;
  const startX = a.left + a.width / 2 - size / 2;
  const startY = a.top + a.height / 2 - size / 2;
  const dx = b.left + b.width / 2 - size / 2 - startX;
  const dy = b.top + b.height / 2 - size / 2 - startY;

  const img = document.createElement("img");
  img.src = imageSrc;
  img.alt = "";
  Object.assign(img.style, {
    position: "fixed",
    left: `${startX}px`,
    top: `${startY}px`,
    width: `${size}px`,
    height: `${size}px`,
    objectFit: "cover",
    borderRadius: "14px",
    boxShadow: "0 10px 30px rgba(167,3,23,.35)",
    zIndex: "60",
    pointerEvents: "none",
  });
  document.body.appendChild(img);

  const duration = 700;
  const flight = img.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${Math.min(dy, 0) - 90}px) scale(.7)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.18)`, opacity: 0.4 },
    ],
    { duration, easing: "cubic-bezier(.45,.05,.35,1)" },
  );
  flight.onfinish = () => {
    img.remove();
    target.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 380, easing: "cubic-bezier(.3,1.6,.5,1)" });
  };
  return duration;
}
