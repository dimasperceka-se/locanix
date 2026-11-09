import { FREE_QUOTA_HA } from "@/lib/quota";

export default function FinalCta() {
  return (
    <section id="start" className="bg-ink text-[#F2F2EE]">
      <div className="mx-auto flex max-w-[1360px] flex-col items-center gap-7 px-5 py-24 text-center sm:px-10 md:py-34">
        <span className="eyebrow text-[#A9AFAB]">Start with one plot</span>
        <h2 className="m-0 max-w-[900px] font-display text-[clamp(44px,6vw,84px)] leading-none font-semibold tracking-[-0.04em]">
          Your first {FREE_QUOTA_HA} hectares are on us.
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="/register" className="rounded-full bg-accent px-6.5 py-4 text-[16px] font-semibold text-ink no-underline hover:bg-[#5BE59A]">
            Try Locanix →
          </a>
          <a
            href="/contact"
            className="rounded-full border border-[#3E4541] px-6 py-[15px] text-[16px] font-medium text-[#F2F2EE] no-underline hover:border-[#F2F2EE]"
          >
            Talk to us
          </a>
        </div>
      </div>
    </section>
  );
}
