import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinanceOS — Vertex Mastery",
  description: "Internal operational finance & cashflow visibility for Vertex Mastery.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
