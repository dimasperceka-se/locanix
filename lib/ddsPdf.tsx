import {
  Circle,
  Document,
  Font,
  Image,
  Page,
  Path,
  Polygon,
  StyleSheet,
  Svg,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import { SCREENING_LABEL, type DdsModel, type Screening } from "./dds";
import { SCREENING_COLOR, renderPlotsMap, type PlotsMapImage } from "./ddsMap";

// Keep words whole — the default hyphenation splits short labels oddly.
Font.registerHyphenationCallback((word) => [word]);

const C = {
  ink: "#1f2937",
  muted: "#64748b",
  line: "#e2e8f0",
  soft: "#f8fafc",
  green: "#166534",
  greenMid: "#15803d",
  greenSoft: "#f0fdf4",
  greenLine: "#bbf7d0",
  amber: "#b45309",
  amberSoft: "#fffbeb",
  amberLine: "#fde68a",
};

const SCREENING_TEXT: Record<Screening, string> = {
  passed: C.greenMid,
  review: C.amber,
  pending: C.muted,
};

const PAGE_H = 841.89;
const CONTENT_W = 595.28 - 72;
const COL_W = (CONTENT_W - 18) / 2;
const MAP_H = 205;
// Off-screen map size, same aspect ratio as the PDF map box.
const MAP_PX_W = 900;
const MAP_PX_H = Math.round((MAP_PX_W * MAP_H) / COL_W);

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 52, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 8, color: C.ink, lineHeight: 1.35 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 10, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: C.greenLine },
  title: { fontFamily: "Helvetica-Bold", fontSize: 20, lineHeight: 1.15, color: C.green },
  subtitle: { fontSize: 10, lineHeight: 1.3, color: C.ink, marginTop: 3 },
  ref: { fontSize: 9, lineHeight: 1.3, color: C.muted, marginTop: 1 },
  badge: { fontFamily: "Helvetica-Bold", fontSize: 9, lineHeight: 1.2, color: "#ffffff", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 3, marginTop: 4 },
  footerLine: { position: "absolute", left: 36, right: 36, bottom: 34, borderTopWidth: 1, borderTopColor: C.line },
  footerText: { position: "absolute", left: 36, bottom: 22, fontSize: 7, color: C.muted },
  // react-pdf misplaces `bottom` on render-prop text, so place it from the top.
  footerPage: { position: "absolute", left: 36, right: 36, top: PAGE_H - 22 - 7 * 1.35, fontSize: 7, color: C.muted, textAlign: "right" },
  footerBrand: { fontFamily: "Helvetica-Bold", color: C.ink },
  row: { flexDirection: "row", justifyContent: "space-between" },
  col: { width: COL_W },
  section: { marginBottom: 14 },
  sectionTitle: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  num: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.greenMid, alignItems: "center", justifyContent: "center", marginRight: 7 },
  numText: { fontFamily: "Helvetica-Bold", fontSize: 8.5, lineHeight: 1, color: "#ffffff" },
  sectionText: { fontFamily: "Helvetica-Bold", fontSize: 12, lineHeight: 1.2, color: C.green },
  kv: { borderWidth: 1, borderColor: C.line, borderRadius: 2, marginBottom: 8 },
  kvRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line },
  kvKey: { width: "40%", padding: 5, backgroundColor: C.soft, fontFamily: "Helvetica-Bold" },
  kvVal: { width: "60%", padding: 5 },
  th: { flexDirection: "row", backgroundColor: C.greenSoft, borderBottomWidth: 1, borderBottomColor: C.greenLine },
  thCell: { padding: 5, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: C.ink },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line },
  td: { padding: 5 },
  table: { borderWidth: 1, borderColor: C.line, borderRadius: 2 },
  mapBox: { position: "relative", width: COL_W, height: MAP_H, borderWidth: 1, borderColor: C.line, borderRadius: 2, overflow: "hidden" },
  legend: { flexDirection: "row", alignItems: "center", marginTop: 5 },
  legendTitle: { fontFamily: "Helvetica-Bold", fontSize: 6.5, marginRight: 8 },
  legendRow: { flexDirection: "row", alignItems: "center", marginRight: 10 },
  stats: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  stat: { width: (COL_W - 12) / 3, borderWidth: 1, borderColor: C.line, borderRadius: 2, padding: 7, backgroundColor: C.soft },
  statValue: { fontFamily: "Helvetica-Bold", fontSize: 13, lineHeight: 1.2, color: C.green, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  small: { fontSize: 6.5, color: C.muted },
  note: { fontSize: 6.5, color: C.muted, marginTop: 4, marginBottom: 8 },
  box: { borderWidth: 1, borderColor: C.line, borderRadius: 3, padding: 9, backgroundColor: C.soft },
  pill: { fontFamily: "Helvetica-Bold", fontSize: 9, lineHeight: 1.2, color: "#ffffff", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 2, marginRight: 10 },
  checkItem: { flexDirection: "row", alignItems: "center", paddingVertical: 2.5 },
  checkBar: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 2 },
  statement: { flexDirection: "row", borderWidth: 1, borderRadius: 3, padding: 8, marginBottom: 8 },
  bold: { fontFamily: "Helvetica-Bold" },
  signLine: { borderBottomWidth: 1, borderBottomColor: C.muted, height: 22, marginBottom: 3 },
});

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const cap = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);
const or = (v: string) => (v.trim() ? v.trim() : "—");

function SectionTitle({ n, children }: { n: number; children: string }) {
  return (
    <View style={s.sectionTitle} minPresenceAhead={60} wrap={false}>
      <View style={s.num}>
        <Text style={s.numText}>{n}</Text>
      </View>
      <Text style={s.sectionText}>{children}</Text>
    </View>
  );
}

function KvTable({ rows }: { rows: [string, string][] }) {
  return (
    <View style={s.kv}>
      {rows.map(([k, v], i) => (
        <View key={k} style={[s.kvRow, i === rows.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
          <Text style={s.kvKey}>{k}</Text>
          <Text style={s.kvVal}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

type Cell = string | { text: string; color?: string; bold?: boolean };
function Table({ cols, rows }: { cols: { label: string; width: string }[]; rows: Cell[][] }) {
  return (
    <View style={s.table}>
      <View style={s.th} wrap={false}>
        {cols.map((c) => (
          <Text key={c.label} style={[s.thCell, { width: c.width }]}>{c.label}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={[s.tr, i === rows.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
          {r.map((cell, j) => {
            const c = typeof cell === "string" ? { text: cell } : cell;
            return (
              <Text key={j} style={[s.td, { width: cols[j].width }, c.color ? { color: c.color } : {}, c.bold ? s.bold : {}]}>
                {c.text}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function CheckIcon({ done, optional }: { done: boolean; optional?: boolean }) {
  if (!done && optional) {
    return (
      <Svg width={10} height={10} viewBox="0 0 16 16" style={{ marginRight: 6 }}>
        <Circle cx="8" cy="8" r="7" stroke={C.muted} strokeWidth={1.4} fill="none" />
      </Svg>
    );
  }
  return done ? (
    <Svg width={10} height={10} viewBox="0 0 16 16" style={{ marginRight: 6 }}>
      <Circle cx="8" cy="8" r="8" fill={C.greenMid} />
      <Path d="M4.4 8.3 L7 10.9 L11.7 5.6" stroke="#ffffff" strokeWidth={1.9} fill="none" />
    </Svg>
  ) : (
    <Svg width={10} height={10} viewBox="0 0 16 16" style={{ marginRight: 6 }}>
      <Circle cx="8" cy="8" r="7" stroke={C.amber} strokeWidth={1.6} fill="none" />
      <Path d="M8 4.4 L8 9.2" stroke={C.amber} strokeWidth={1.9} />
      <Circle cx="8" cy="11.7" r="1.1" fill={C.amber} />
    </Svg>
  );
}

function LeafIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" style={{ marginRight: 8 }}>
      <Path d="M2.5 13.5 C2.5 6.5 7 2.5 14 2.5 C14 9.5 10 13.5 3.5 13.5 Z" fill={color} />
      <Path d="M2.5 13.5 L9.5 6.5" stroke="#ffffff" strokeWidth={1.2} />
    </Svg>
  );
}

function ScaleIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" style={{ marginRight: 8 }}>
      <Path d="M8 2 L8 14 M4.5 14 L11.5 14 M2.5 4.5 L13.5 4.5" stroke={color} strokeWidth={1.3} />
      <Path d="M2.5 4.5 L0.8 9 L4.2 9 Z M13.5 4.5 L11.8 9 L15.2 9 Z" stroke={color} strokeWidth={1} fill="none" />
    </Svg>
  );
}

function MapLegend({ model }: { model: DdsModel }) {
  const used = (Object.keys(SCREENING_LABEL) as Screening[]).filter((k) => model.counts[k] > 0);
  return (
    <View style={s.legend}>
      <Text style={s.legendTitle}>SCREENING</Text>
      {used.map((k) => (
        <View key={k} style={s.legendRow}>
          <View style={[s.dot, { backgroundColor: SCREENING_COLOR[k] }]} />
          <Text style={{ fontSize: 6.5 }}>{SCREENING_LABEL[k]}</Text>
        </View>
      ))}
    </View>
  );
}

function PlotsMap({ map }: { map: PlotsMapImage }) {
  const ratio = COL_W / map.width;
  return (
    <View style={s.mapBox}>
      {map.src ? (
        <Image src={map.src} style={{ width: COL_W, height: MAP_H, objectFit: "cover" }} />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.soft }}>
          <Text style={s.small}>Map could not be drawn — see coordinates below.</Text>
        </View>
      )}
      <View style={{ position: "absolute", top: 6, right: 8, alignItems: "center" }}>
        <Text style={[s.bold, { fontSize: 7 }]}>N</Text>
        <Svg width={8} height={10} viewBox="0 0 8 10">
          <Polygon points="4,0 8,10 4,7.5 0,10" fill={C.ink} />
        </Svg>
      </View>
      {map.scale && (
        <View style={{ position: "absolute", left: 8, bottom: 6, backgroundColor: "#ffffffcc", paddingHorizontal: 3, paddingVertical: 2 }}>
          <View style={{ width: map.scale.px * ratio, height: 3, borderWidth: 1, borderColor: C.ink, borderTopWidth: 0 }} />
          <Text style={{ fontSize: 6 }}>{map.scale.label}</Text>
        </View>
      )}
      <Text style={[s.small, { position: "absolute", right: 4, bottom: 3, fontSize: 5.5, backgroundColor: "#ffffffcc", paddingHorizontal: 2 }]}>
        {map.basemap ? "© OpenStreetMap contributors" : "Basemap unavailable"}
      </Text>
    </View>
  );
}

function DdsDocument({ model, map }: { model: DdsModel; map: PlotsMapImage }) {
  const d = model.details;
  const ready = model.ready;
  const date = fmtDate(model.date);
  const reviewOrPending = model.counts.review + model.counts.pending;
  const quantity = Number(d.quantityKg) > 0 ? Number(d.quantityKg).toLocaleString("en-US") : "—";

  return (
    <Document title={`Due Diligence Statement ${model.reference}`} author={d.legalName || "Locanix"} creator="Locanix" producer="Locanix">
      <Page size="A4" style={s.page}>
        <View fixed style={s.header}>
          <View>
            <Text style={s.title}>Due Diligence Statement</Text>
            <Text style={s.subtitle}>Regulation (EU) 2023/1115 — Deforestation Regulation</Text>
            <Text style={s.ref}>{model.reference} · {date}</Text>
          </View>
          <Text style={[s.badge, { backgroundColor: ready ? C.greenMid : C.amber }]}>
            {ready ? "READY FOR TRACES" : "DRAFT — ACTION NEEDED"}
          </Text>
        </View>

        {/* 1 + 2 */}
        <View style={[s.row, s.section]}>
          <View style={s.col}>
            <SectionTitle n={1}>Compliance summary</SectionTitle>
            <KvTable
              rows={[
                ["Legal name", or(d.legalName)],
                ["VAT / Tax ID", or(d.vat)],
                ["EORI", or(d.eori)],
                ["Country", or(d.operatorCountry)],
                ["Operator type", cap(d.operatorType)],
                ["Size", cap(d.size)],
              ]}
            />
            <KvTable
              rows={[
                ["Product", or(d.product)],
                ["HS code", or(d.hsCode)],
                ["Quantity (kg)", quantity],
                ["Country of production", or(d.productionCountry)],
                ["Country risk", cap(d.countryRisk)],
                ["Suppliers", or(d.suppliers)],
              ]}
            />
          </View>
          <View style={s.col}>
            <SectionTitle n={2}>Farm maps</SectionTitle>
            <PlotsMap map={map} />
            <MapLegend model={model} />
            <Text style={s.note}>
              Geolocation as provided by the operator. Coordinates in WGS 84, given to 6 decimal places per EUDR Annex II.
            </Text>
            <View style={s.stats}>
              {[
                ["Plots", String(model.plots.length)],
                ["Total area", `${model.plots.reduce((a, p) => a + p.areaHa, 0).toFixed(2)} ha`],
                ["Passed", `${model.counts.passed} of ${model.plots.length}`],
              ].map(([label, value]) => (
                <View key={label} style={s.stat}>
                  <Text style={s.small}>{label}</Text>
                  <Text style={s.statValue}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Table
            cols={[
              { label: "Plot", width: "7%" },
              { label: "Name", width: "33%" },
              { label: "Area (ha)", width: "11%" },
              { label: "Type", width: "10%" },
              { label: "Centroid (lat, lng)", width: "22%" },
              { label: "Screening", width: "17%" },
            ]}
            rows={model.plots.map((p) => [
              { text: p.code, bold: true },
              p.name,
              p.areaHa.toFixed(2),
              "polygon",
              `${p.centroid.lat.toFixed(6)}, ${p.centroid.lon.toFixed(6)}`,
              { text: SCREENING_LABEL[p.screening], color: SCREENING_TEXT[p.screening], bold: true },
            ])}
          />
        </View>

        {/* 3 */}
        <View style={s.section}>
          <SectionTitle n={3}>Satellite screening</SectionTitle>
          <Table
            cols={[
              { label: "Plot", width: "24%" },
              { label: "Result", width: "14%" },
              { label: "Deforestation datasets", width: "18%" },
              { label: "Details", width: "44%" },
            ]}
            rows={model.plots.map((p) => [
              `${p.code} — ${p.name}`,
              { text: SCREENING_LABEL[p.screening], color: SCREENING_TEXT[p.screening], bold: true },
              p.evidence,
              p.details,
            ])}
          />
          <Text style={s.note}>
            Deforestation: tree-cover loss after 31 Dec 2020 in GFW, JRC and SBTN datasets. Legality: overlap with protected areas (WDPA).
          </Text>
        </View>

        {/* 4 */}
        <View style={s.section} wrap={false}>
          <SectionTitle n={4}>Risk assessment</SectionTitle>
          <View style={s.box}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              <Text style={[s.pill, { backgroundColor: model.negligibleRisk ? C.greenMid : C.amber }]}>
                {model.negligibleRisk ? "Negligible risk" : "Non-negligible risk"}
              </Text>
              <Text style={s.bold}>Country risk: {cap(d.countryRisk)}</Text>
            </View>
            <Text>{model.riskSummary}</Text>
          </View>
        </View>

        {/* 5 + 6 + 7 */}
        <View style={s.row} wrap={false}>
          <View style={s.col}>
            <SectionTitle n={5}>TRACES submission checklist</SectionTitle>
            <View style={[s.box, { backgroundColor: "#ffffff" }]}>
              {model.checklist.map((c) => (
                <View key={c.label} style={s.checkItem}>
                  <CheckIcon done={c.done} optional={c.optional} />
                  <Text style={c.done || c.optional ? {} : { color: C.amber }}>{c.label}</Text>
                </View>
              ))}
              <View style={[s.checkBar, { backgroundColor: ready ? C.greenMid : C.amber }]}>
                <Text style={[s.bold, { color: "#ffffff" }]}>
                  {model.mandatoryDone}/{model.mandatoryTotal} mandatory items complete
                </Text>
                <Text style={[s.bold, { color: "#ffffff" }]}>{ready ? "READY TO SUBMIT" : "ACTION NEEDED"}</Text>
              </View>
            </View>
          </View>

          <View style={s.col}>
            <SectionTitle n={6}>Statements</SectionTitle>
            <View style={[s.statement, { borderColor: model.deforestationFree ? C.greenLine : C.amberLine, backgroundColor: model.deforestationFree ? C.greenSoft : C.amberSoft }]}>
              <LeafIcon color={model.deforestationFree ? C.greenMid : C.amber} />
              <View style={{ flex: 1 }}>
                <Text style={s.bold}>Deforestation-free:</Text>
                <Text>
                  {model.deforestationFree
                    ? "the relevant products are deforestation-free, produced on land that has not been subject to deforestation after 31 December 2020."
                    : `cannot be declared yet — ${reviewOrPending} plot${reviewOrPending === 1 ? "" : "s"} still need review or screening.`}
                </Text>
              </View>
            </View>
            <View style={[s.statement, { borderColor: model.legalityClear ? C.greenLine : C.amberLine, backgroundColor: model.legalityClear ? C.greenSoft : C.amberSoft }]}>
              <ScaleIcon color={model.legalityClear ? C.greenMid : C.amber} />
              <View style={{ flex: 1 }}>
                <Text style={s.bold}>Legality of production:</Text>
                <Text>
                  {model.legalityClear
                    ? "production was conducted in accordance with the relevant legislation of the country of production."
                    : "cannot be declared yet — resolve the protected-area findings first."}
                </Text>
                <Text style={[s.small, { marginTop: 3 }]}>
                  Locanix screening covers protected areas (WDPA). Other legal requirements (land-use rights, labour, tax) remain the operator&apos;s responsibility to verify.
                </Text>
              </View>
            </View>

            <SectionTitle n={7}>EU Information System reference</SectionTitle>
            <View style={[s.box, { backgroundColor: "#ffffff", marginBottom: 10 }]}>
              <Text>{d.euReference.trim() || "Not yet submitted to the EU Information System."}</Text>
            </View>

            <View style={s.row}>
              <View style={{ width: "58%" }}>
                <Text style={s.bold}>Authorised representative</Text>
                <View style={s.signLine} />
                <Text style={s.small}>{d.representative.trim() || "Name and signature"}</Text>
              </View>
              <View style={{ width: "36%" }}>
                <Text style={s.bold}>Date</Text>
                <View style={s.signLine} />
              </View>
            </View>
          </View>
        </View>

        <Text style={[s.small, { marginTop: 14 }]}>
          Generated by Locanix on {date} from satellite screening. This document supports, but does not replace, the
          operator&apos;s due diligence and the official statement submitted in TRACES.
        </Text>

        <View fixed style={s.footerLine} />
        <Text fixed style={s.footerText}>
          <Text style={s.footerBrand}>Locanix</Text> · Due Diligence Statement · Retain for 5 years (Reg. (EU) 2023/1115)
        </Text>
        <Text fixed style={s.footerPage} render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
      </Page>
    </Document>
  );
}

/** Render the map, build the PDF and download it as <reference>.pdf. */
export async function downloadDdsPdf(model: DdsModel) {
  const map = await renderPlotsMap(model.plots, MAP_PX_W, MAP_PX_H);
  const blob = await pdf(<DdsDocument model={model} map={map} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${model.reference}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
