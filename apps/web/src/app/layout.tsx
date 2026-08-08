import type { Metadata } from "next";
import { Big_Shoulders, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const boardFont = Big_Shoulders({
  variable: "--font-board",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const sansFont = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Market Data Ops — Trading Jutsu",
  description:
    "Ingestion health for PH stocks, US stocks, crypto, and forex market data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${boardFont.variable} ${sansFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink font-sans text-flap">
        {children}
      </body>
    </html>
  );
}
