/**
 * Locanix logo: an open plot boundary with a surveyed point at its top vertex, plus
 * the wordmark set in Inter Tight Bold. Redrawn from the approved logo
 * (docs/brand/locanix-logo.jpg); app/icon.svg uses the "small" geometry below.
 */
type Tone = "dark" | "light";

const INK: Record<Tone, string> = { dark: "#0D0F0E", light: "#F2F2EE" };
const DOT = "#3DDC84";
const DOT_CENTER: [number, number] = [17.58, 4.43];

/**
 * Boundary in a 32×32 box. It stops `gap` units from the dot's centre, leaving a ring
 * of space around the dot; the three corners are rounded.
 */
export function markPath(gap: number): string {
  const [x, y] = DOT_CENTER;
  const start = [x + 0.883 * gap, y + 0.47 * gap].map((n) => n.toFixed(2)).join(" ");
  const end = [x - 0.8 * gap, y + 0.6 * gap].map((n) => n.toFixed(2)).join(" ");
  return `M${start} L26.84 9.36 Q28.96 10.49 27.92 12.65 L21.13 26.72 Q20 29.06 17.98 27.43 L5.05 16.97 Q3.03 15.34 5.11 13.78 L${end}`;
}

/** As drawn at large sizes; heavier line and a bigger dot when small so both stay legible. */
const GEOMETRY = {
  large: { stroke: 1.6, dot: 2.15, gap: 2.93 },
  medium: { stroke: 2, dot: 2.7, gap: 3.7 },
  small: { stroke: 2.3, dot: 3, gap: 4.1 },
};

export function LogoMark({ size = 32, tone = "dark" }: { size?: number; tone?: Tone }) {
  const g = size >= 40 ? GEOMETRY.large : size >= 28 ? GEOMETRY.medium : GEOMETRY.small;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d={markPath(g.gap)} stroke={INK[tone]} strokeWidth={g.stroke} strokeLinejoin="round" />
      <circle cx={DOT_CENTER[0]} cy={DOT_CENTER[1]} r={g.dot} fill={DOT} />
    </svg>
  );
}

/** `size` is the mark's box in px; the wordmark scales with it. */
export default function Logo({ size = 32, tone = "dark", className = "" }: { size?: number; tone?: Tone; className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: Math.round(size * 0.28) }}>
      <LogoMark size={size} tone={tone} />
      <span
        className="font-display font-bold"
        style={{ fontSize: Math.round(size * 0.64), letterSpacing: "-0.01em", color: INK[tone], lineHeight: 1 }}
      >
        Locanix
      </span>
    </span>
  );
}
