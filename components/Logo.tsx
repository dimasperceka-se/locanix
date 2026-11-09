/**
 * Locanix logo: a plot boundary with a surveyed point, plus the wordmark set in
 * Inter Tight. The mark is the interim one from the v2 design reference; swap the
 * SVG in LogoMark when the final logo is ready.
 */
type Tone = "dark" | "light";

const INK: Record<Tone, string> = { dark: "#0D0F0E", light: "#F2F2EE" };
const DOT: Record<Tone, string> = { dark: "#1F9D5C", light: "#3DDC84" };

export function LogoMark({ size = 26, tone = "dark" }: { size?: number; tone?: Tone }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M4 20 L11 5 L24 9 L21 23 Z" stroke={INK[tone]} strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="11" cy="5" r="2.8" fill={DOT[tone]} />
    </svg>
  );
}

/** `size` is the mark's height in px; the wordmark scales with it. */
export default function Logo({ size = 26, tone = "dark", className = "" }: { size?: number; tone?: Tone; className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: Math.round(size * 0.38) }}>
      <LogoMark size={size} tone={tone} />
      <span
        className="font-display font-semibold"
        style={{ fontSize: Math.round(size * 0.81), letterSpacing: "-0.02em", color: INK[tone], lineHeight: 1 }}
      >
        Locanix
      </span>
    </span>
  );
}
