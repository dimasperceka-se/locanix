import Link from "next/link";
import { company, legalLinks } from "@/lib/data";

const productLinks = [
  { label: "How it works", href: "/#how" },
  { label: "EUDR", href: "/#eudr" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Analyze plots", href: "/analyze" },
];

const heading = "font-semibold text-[#F2F2EE]";
const link = "text-[#A9AFAB] no-underline hover:text-[#F2F2EE]";

export default function Footer() {
  return (
    <footer className="border-t border-[#262B28] bg-ink leading-[normal] text-[#A9AFAB]">
      <div className="mx-auto grid max-w-[1360px] grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-9 px-5 pt-14 pb-8 text-[14px] sm:px-10">
        <div className="flex flex-col gap-2.5">
          <span className="font-display text-[19px] font-bold text-[#F2F2EE]">Locanix</span>
          <span>{company.tagline}</span>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className={heading}>Product</span>
          {productLinks.map((l) => (
            <a key={l.label} href={l.href} className={link}>
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          <span className={heading}>Company</span>
          <a href={`mailto:${company.email}`} className={link}>
            {company.email}
          </a>
          <Link href="/contact" className={link}>
            Contact
          </Link>
          <Link href="/about" className={link}>
            About
          </Link>
          {legalLinks.map((l) => (
            <a key={l.label} href={l.href} className={link}>
              {l.label}
            </a>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-[1360px] px-5 pt-5 pb-8 text-[13px] text-[#8A908C] sm:px-10">
        © {new Date().getFullYear()} Locanix. All rights reserved.
      </div>
    </footer>
  );
}
