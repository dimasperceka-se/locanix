import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { PlotStoreProvider } from "@/lib/plotStore";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600"],
  display: "swap",
  // The Google subset has no "→"; without a generated Arial fallback it comes from
  // system-ui, as in the design reference.
  adjustFontFallback: false,
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  weight: ["500", "600", "700"],
  display: "swap",
  adjustFontFallback: false,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://locanix.id"),
  title: "Locanix — Know which plots are safe to ship",
  description:
    "Locanix checks every plot boundary for forest loss after 2020 and overlap with protected areas, and shows which ones need a second look before you file your EUDR due diligence statement.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable}`}>
      <body>
        <PlotStoreProvider>{children}</PlotStoreProvider>
      </body>
    </html>
  );
}
