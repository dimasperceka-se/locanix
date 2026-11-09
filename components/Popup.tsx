"use client";

/** Centered confirmation popup with an icon, a message and two actions. */
export default function Popup({
  icon,
  tone,
  title,
  body,
  primaryLabel,
  onPrimary,
  onClose,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
        <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${tone}`}>
          {icon}
        </span>
        <h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{body}</p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onPrimary}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-mid"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
