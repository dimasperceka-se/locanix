import Logo from "@/components/Logo";
import Link from "next/link";

/** Centered card on the login page's background, for the password-reset pages. */
export default function AuthShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-br from-paper via-paper to-paper-warm">
      <header className="flex items-center gap-3 px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center" aria-label="Locanix home">
          <Logo size={30} />
        </Link>
        <span className="h-5 w-px bg-slate-300" />
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </header>
      <div className="flex flex-1 items-center justify-center px-5 py-8">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-100">{children}</div>
      </div>
    </main>
  );
}

export const inputCls =
  "w-full rounded-md border border-slate-300 px-3.5 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-ink focus:ring-1 focus:ring-ink";
export const buttonCls =
  "w-full rounded-md bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink-mid disabled:opacity-60";
