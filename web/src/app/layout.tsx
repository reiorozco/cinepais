import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/styles/globals.css";
import { Toaster } from "@/components/ui/sonner";
import { CityProvider } from "@/components/providers/city-provider";
import { SelectionProvider } from "@/components/providers/selection-provider";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CopilotWidget } from "@/components/copilot/copilot-widget";
import { getCities } from "@/lib/api/queries";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CinePaís — Cine en Colombia",
    template: "%s | CinePaís",
  },
  description:
    "Cartelera, horarios y boletas de cine en Colombia. Demo de portafolio con datos ficticios.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Cities are fetched once here and passed to the client `CitySelector`
  // island in the header. This avoids a separate client-side fetch and keeps
  // the option list consistent with whatever the DB currently exposes.
  const cities = await getCities();

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased overflow-x-hidden`}
    >
      <body className="min-h-full flex flex-col">
        <CityProvider>
          <SelectionProvider>
            <Header cities={cities} />
            <div className="flex-1">{children}</div>
            <Footer />
            {/* Mounted here on purpose: inside `SelectionProvider` (later
                todos read the seat selection) and inside the root layout, which
                the App Router does not remount on client-side navigation — so
                the copilot panel survives a `router.push` to the seat map. */}
            <CopilotWidget />
          </SelectionProvider>
        </CityProvider>
        <Toaster />
      </body>
    </html>
  );
}
