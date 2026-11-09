import type { Plot } from "@/lib/geo";

const W = 360;
const H = 200;
const PAD = 36;

/** The plot's real boundary, scaled into a 360×200 frame (equirectangular, cos-lat corrected). */
function project(plot: Plot): string {
  const ring = plot.ring;
  if (ring.length < 2) return "";
  const lat0 = (ring.reduce((s, [, lat]) => s + lat, 0) / ring.length) * (Math.PI / 180);
  const pts = ring.map(([lon, lat]) => [lon * Math.cos(lat0), -lat]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = Math.min((W - 2 * PAD) / (maxX - minX || span), (H - 2 * PAD) / (maxY - minY || span));
  const ox = (W - (maxX - minX) * scale) / 2;
  const oy = (H - (maxY - minY) * scale) / 2;
  return pts.map(([x, y]) => `${(ox + (x - minX) * scale).toFixed(1)},${(oy + (y - minY) * scale).toFixed(1)}`).join(" ");
}

export default function PlotMiniMap({
  plot,
  stroke,
  fill,
  showProtected,
  coords,
}: {
  plot: Plot;
  stroke: string;
  fill: string;
  showProtected: boolean;
  coords: string;
}) {
  return (
    <div className="relative h-[200px] bg-[#EEF0EA]">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <g fill="none" stroke="#D6DAD1">
          <path d="M-10 40 C 80 10, 150 70, 230 36 S 330 10, 380 46" />
          <path d="M-10 90 C 90 60, 160 120, 240 86 S 340 60, 380 96" />
          <path d="M-10 140 C 100 110, 170 170, 250 136 S 350 110, 380 146" />
          <path d="M-10 190 C 110 160, 180 220, 260 186 S 360 160, 380 196" />
        </g>
        {showProtected && <path d="M250 0 C 260 70, 300 100, 360 104 L360 0 Z" fill="#DCE6D6" />}
        <polygon points={project(plot)} fill={fill} fillOpacity="0.18" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
      <span className="absolute top-3 left-3 rounded-full border border-line bg-white px-2.5 py-1 font-mono text-[11px] text-ink">{coords}</span>
    </div>
  );
}
