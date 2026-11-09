/** Shared class names for the workspace and checkout screens (v2 app design). */
export const ui = {
  card: "rounded-2xl border border-line bg-white",
  eyebrow: "font-mono text-[12px] tracking-[0.1em] text-muted uppercase",
  h1: "m-0 font-display text-[34px] font-semibold tracking-[-0.03em] text-ink",
  btnDark:
    "inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border-0 bg-ink px-4.5 text-[14px] font-semibold text-paper no-underline hover:bg-ink-mid disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-ink",
  btnOutline:
    "inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border border-line-strong bg-white px-4.5 text-[14px] font-semibold text-ink no-underline hover:border-ink disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line-strong",
  chip: (on: boolean) =>
    `min-h-9 cursor-pointer rounded-full border px-3.5 text-[13px] ${
      on ? "border-ink bg-ink font-semibold text-paper" : "border-[#DAD9D2] bg-white font-medium text-[#3A403C] hover:border-ink"
    }`,
  badge: "inline-block rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap",
};
