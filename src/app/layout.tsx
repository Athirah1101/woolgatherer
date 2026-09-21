import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinanceOS — Vertex Mastery",
  description: "Internal operational finance & cashflow visibility for Vertex Mastery.",
  // Makes iOS treat it as a standalone app when added to the home screen.
  appleWebApp: {
    capable: true,
    title: "FinanceOS",
    statusBarStyle: "default",
  },
};

// Mobile-friendly viewport + browser theme colour (the phone's status/URL bar
// tints indigo to match the app).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
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
