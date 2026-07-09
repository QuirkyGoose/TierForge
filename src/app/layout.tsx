import type { Metadata } from "next";
import { Instrument_Serif, Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tier Forge — Twitch-Powered Tier Lists",
  description:
    "A live tier list studio for Twitch streamers. Chat commands, channel rewards, viewer voting — all wired up.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${geist.variable} ${geistMono.variable} ${newsreader.variable}`}>
      <head>
        <style>{`
          :root {
            --font-display: var(--font-instrument-serif), Georgia, "Times New Roman", serif;
            --font-body: var(--font-geist), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            --font-mono: var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
            --font-brand: var(--font-newsreader), Georgia, serif;
          }
        `}</style>
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
