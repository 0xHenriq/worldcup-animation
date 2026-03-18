import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Source_Sans_3 } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";

import "./globals.css";

const headingFont = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-heading",
  display: "swap",
});

const bodyFont = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FIFA World Cup 2026 Tickets",
  description:
    "Scroll-driven World Cup 2026 ticket hero experience with cinematic portal, celebration, and trophy reveal.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1B2A4A",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      className={`${headingFont.variable} ${bodyFont.variable}`}
      suppressHydrationWarning
    >
      <body className={`${bodyFont.className} antialiased`}>
        <Script id="js-flag" strategy="beforeInteractive">
          {`document.documentElement.dataset.js = 'true';`}
        </Script>
        {children}
      </body>
    </html>
  );
}
