// What a checkout sends, validated with the same rules in the browser (inline errors) and on the server
// (POST /api/orders). Prices are deliberately not part of it: the server works them out from the cart keys.
// Client-safe.

import { z } from "zod";
import { isCountryCode, needsPostcode } from "@/lib/orders/countries";
import { MAX_LINES, MAX_QTY } from "@/lib/orders/pricing";

const required = (max: number, message: string) =>
  z.string({ required_error: message, invalid_type_error: message }).trim().min(1, message).max(max, `Keep it under ${max} characters.`);

const optional = (max: number) =>
  z
    .string({ invalid_type_error: "Invalid value." })
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .nullish()
    .transform((v) => (v ? v : null));

const PHONE_RE = /^\+?[\d\s().-]{6,30}$/;

const customerShape = {
  name: required(100, "Enter your full name."),
  email: z.string({ required_error: "Enter your email address." }).trim().max(254, "That email is too long.").email("Enter a valid email address, like you@example.com."),
  phone: optional(30).refine((v) => v === null || PHONE_RE.test(v), "Enter a valid phone number, or leave it empty."),
  country: z.string({ required_error: "Choose your country." }).refine(isCountryCode, "Choose your country."),
  address1: required(200, "Enter your street address."),
  address2: optional(200),
  city: required(100, "Enter your city."),
  region: optional(100),
  postalCode: optional(20),
  notes: optional(1000),
  paymentOptionId: z.string({ required_error: "Choose how you'll pay." }).trim().min(1, "Choose how you'll pay.").max(64, "Choose how you'll pay."),
};

function postcodeWhereNeeded(v: { country: string; postalCode: string | null }, ctx: z.RefinementCtx) {
  if (!v.postalCode && isCountryCode(v.country) && needsPostcode(v.country)) ctx.addIssue({ code: "custom", path: ["postalCode"], message: "Enter your postal code." });
}

/** The form fields alone: what the checkout checks before sending. */
export const customerSchema = z.object(customerShape).superRefine(postcodeWhereNeeded);

export const lineSchema = z.object({
  key: z.string().min(1).max(300),
  qty: z.number().int().min(1, "Quantities start at 1.").max(MAX_QTY, `At most ${MAX_QTY} of one item per order.`),
});

/** The whole POST /api/orders body. Unknown keys (a "price" or "total" someone adds) are dropped. */
export const orderSchema = z
  .object({
    ...customerShape,
    lines: z.array(lineSchema).min(1, "Your cart is empty.").max(MAX_LINES, "That's too many items for one order."),
    /** Honeypot: people never see it, bots fill it. */
    website: z.string().max(200).optional(),
  })
  .superRefine(postcodeWhereNeeded);

export type CustomerFields = z.input<typeof customerSchema>;
export type OrderInput = z.output<typeof orderSchema>;
