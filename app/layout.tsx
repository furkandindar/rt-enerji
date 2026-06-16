import type { Metadata } from "next";
import { Geist, Ballet, Great_Vibes, Sacramento } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "RT Enerji",
  description: "RT Enerji ve bağlı sahaların organizasyon yapısını, pozisyonları, çalışanları ve atamalarını yönetmek için merkezi bir platform.",
  // Şirket içi yönetim paneli — arama motorlarında indekslenmesini istemiyoruz.
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  // Chrome/Google Translate'in "bu sayfayı çevir" önerisini (popover) tamamen kapatır.
  other: {
    google: "notranslate",
  },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

// Signature fonts
const ballet = Ballet({
  variable: "--font-ballet",
  display: "swap",
  subsets: ["latin"],
  weight: "400",
});

const greatVibes = Great_Vibes({
  variable: "--font-great-vibes",
  display: "swap",
  subsets: ["latin"],
  weight: "400",
});

const sacramento = Sacramento({
  variable: "--font-sacramento",
  display: "swap",
  subsets: ["latin"],
  weight: "400",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" translate="no" suppressHydrationWarning>
      <body className={`${geistSans.className} ${ballet.variable} ${greatVibes.variable} ${sacramento.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Suspense fallback={null}>
            <AppShell>{children}</AppShell>
          </Suspense>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
