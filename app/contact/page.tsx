import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ContactForm from "@/components/ContactForm";
import { getSession } from "@/lib/server/session";

export const metadata: Metadata = {
  title: "Contact Us — Locanix",
  description: "Get in touch with the Locanix team.",
};

export default async function ContactPage() {
  const session = await getSession();
  return (
    <>
      <Navbar authed={!!session} userName={session?.name} />

      {/* Title band */}
      <div className="bg-ink-gradient">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Contact Us
          </h1>
        </div>
      </div>

      <main className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-extrabold text-ink">
            Get in touch
          </h2>
          <p className="mt-3 text-center text-sm text-slate-500">
            We&apos;d love to hear from you. Please fill out this form.
          </p>

          <div className="mt-10">
            <ContactForm />
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
