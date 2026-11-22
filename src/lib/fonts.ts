import { Pacifico } from "next/font/google";

/** The brush script on the "Most Popular" sticker, as on the original. Applied by className where it's
 *  used, so it only loads (and preloads) on the hoodie page. */
export const scriptFont = Pacifico({ subsets: ["latin"], weight: "400" });
