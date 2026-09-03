import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MEXC EMA Trend Dashboard",
  description: "Live EMA20/50/100/200 trend tracker for MEXC Futures tokens.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
