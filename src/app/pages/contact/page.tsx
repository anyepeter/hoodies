import type { Metadata } from "next";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-[740px] px-4 py-12 md:py-16">
      <h1 className="text-[30px] font-bold md:text-[40px]">Contact</h1>
      <h2 className="mt-8 text-[22px] font-bold">Get in touch</h2>
      <ContactForm />
    </section>
  );
}
