"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { usePlotStore, type SurveyData } from "@/lib/plotStore";
import DashboardNavbar from "@/components/DashboardNavbar";

export default function SurveyForm() {
  return (
    <Suspense>
      <SurveyInner />
    </Suspense>
  );
}

function SurveyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const rawReturn = params.get("return") || "/checkout";
  const returnTo = /^\/(?![/\\])/.test(rawReturn) ? rawReturn : "/checkout";
  const { setSurvey } = usePlotStore();
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget)) as SurveyData;
    setSurvey(data); // marks surveyDone = true
    router.push(returnTo);
  };

  return (
    <>
      <DashboardNavbar />
      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-slate-900">
              Tell us about yourself and your land
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              To access your free analysis, we&apos;d like to learn a bit about you and
              your land. It takes less than 2 minutes.
            </p>
            <button
              type="button"
              onClick={() => router.push(returnTo)}
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-ink hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              back to payment page
            </button>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-6">
            {/* General Information */}
            <Section title="General Information">
              <Grid>
                <Field label="Name" name="name" />
                <Field label="Identification Number (KTP)" name="ktp" />
                <Field label="Birthplace" name="birthplace" />
                <Field label="Birthdate" name="birthdate" />
                <Field label="Country" name="country" />
                <Field label="Province" name="province" />
                <Field label="District" name="district" />
                <Field label="Sub District" name="sub_district" />
                <Field label="Address" name="address" full textarea />
              </Grid>
            </Section>

            {/* Personal Information */}
            <Section title="Personal Information">
              <Grid>
                <Field label="Jenis Kelamin" name="gender" />
                <Field label="Status dalam Rumah Tangga" name="household_status" />
                <Field label="Jumlah Anggota Rumah Tangga" name="household_members" />
                <Field label="Ijazah terakhir yang dimiliki" name="education" />
                <Field label="Pekerjaan selain memiliki kebun" name="other_job" full />
              </Grid>
            </Section>

            {/* Land Information */}
            <Section title="Land Information">
              <Grid>
                <Field label="Status Kepemilikan Lahan" name="land_ownership" />
                <Field label="Land ID" name="land_id" />
                <Field label="Commodity" name="commodity" />
                <Field label="Jumlah Pohon" name="tree_count" />
                <Field label="Luas Lahan ditanam telah produksi" name="area_productive" />
                <Field label="Luas lahan ditanam belum produksi" name="area_unproductive" />
                <Field label="Rata-rata jumlah panen dalam satu tahun (kali)" name="harvests_per_year" />
                <Field label="Rata rata produksi dalam satu kali panen (Ton)" name="yield_per_harvest" />
                <Field label="Total produksi satu tahun (ton)" name="yearly_production" />
                <Field label="Produktivitas lahan (ha/ton)" name="land_productivity" />
                <Field label="Rata rata harga jual TBS (Rp/kg)" name="tbs_price" />
                <Field label="Total penjualan TBS per tahun (Rp)" name="tbs_sales_year" />
                <Field label="Rata rata umur tanaman" name="plant_age" />
                <Field label="Total pengeluaran TBS per tahun (Rp)" name="tbs_expense_year" />
                <Field label="Pola Tanam" name="planting_pattern" />
                <Field label="Land Type" name="land_type" />
                <Field label="Topography Land Condition" name="topography" />
                <Field label="Metode pembukaan lahan perkebunan" name="land_clearing_method" />
                <Field label="Asal Benih" name="seed_origin" />
                <Field label="Fertilizer Type" name="fertilizer_type" />
                <Field label="Mitra Pengelolaan" name="management_partner" />
              </Grid>
            </Section>

            {/* Additional Information */}
            <Section title="Additional Information">
              <SubHeading>Biaya Produksi per Bulan</SubHeading>
              <Grid>
                <Field label="Pupuk + Upah" name="cost_fertilizer" />
                <Field label="Pembersihan kebun + upah" name="cost_clearing" />
                <Field label="Pestisida + Upah" name="cost_pesticide" />
                <Field label="Panen + Upah" name="cost_harvest" />
                <Field label="Pengeluaran lain yang dibayarkan" name="cost_other" />
                <Field label="Total biaya produksi" name="cost_total" />
                <RadioYaTidak label="Apakah kesulitan menjual hasil kebun?" name="sell_difficulty" />
                <Field label="Jika sulit, Apa kesulitan utamanya?" name="sell_difficulty_reason" />
                <Field label="Bagaimana penentuan" name="price_determination" />
              </Grid>

              <SubHeading className="mt-8">Peremajaan Kebun</SubHeading>
              <Grid>
                <Field label="Adakah lahan perkebunan yang sudah harus diremajakan?" name="needs_replanting" />
                <Field label="Jika ada, berapa luasnya?" name="replanting_area" />
              </Grid>

              <SubHeading className="mt-8">
                Kesulitan yang dihadapi dalam peremajaan kebun
              </SubHeading>
              <Grid>
                <RadioYaTidak label="Tidak ada Modal" name="diff_capital" />
                <RadioYaTidak label="Sulitnya mendapatkan bibit" name="diff_seeds" />
                <RadioYaTidak label="Lahan sudah tidak produktif lagi" name="diff_unproductive" />
                <RadioYaTidak label="Pasar yang tidak menguntungkan" name="diff_market" />
                <RadioYaTidak label="Tidak memiliki pengetahuan peremajaan" name="diff_knowledge" />
                <RadioYaTidak label="Tidak ada komitmen perusahaan inti untuk peremajaan" name="diff_commitment" />
              </Grid>

              <div className="mt-6">
                <Field
                  label="Bagaimana skema bantuan peremajaan yang Anda inginkan?"
                  name="replanting_scheme"
                />
              </div>
            </Section>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => router.push(returnTo)}
                className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink-mid disabled:opacity-60"
              >
                {busy ? "Submitting…" : "Submit & continue"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </>
  );
}

/* ------------------------------- helpers -------------------------------- */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-center text-lg font-bold text-slate-900">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function SubHeading({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={`text-base font-bold text-slate-800 ${className}`}>{children}</h3>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
      {children}
    </div>
  );
}

const inputCls =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-ink";

function Field({
  label,
  name,
  full,
  textarea,
}: {
  label: string;
  name: string;
  full?: boolean;
  textarea?: boolean;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium text-slate-600">{label}</span>
      {textarea ? (
        <textarea name={name} rows={3} placeholder="Type here" className={inputCls} />
      ) : (
        <input type="text" name={name} placeholder="Type here" className={inputCls} />
      )}
    </label>
  );
}

function RadioYaTidak({ label, name }: { label: string; name: string }) {
  return (
    <fieldset className="block">
      <legend className="text-sm font-medium text-slate-600">{label}</legend>
      <div className="mt-2 flex items-center gap-6">
        {["Ya", "Tidak"].map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name={name} value={opt} className="h-4 w-4 accent-ink" />
            {opt}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
