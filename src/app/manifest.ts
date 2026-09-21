import type { MetadataRoute } from "next";

// Web App Manifest — lets FinanceOS be installed to a phone's home screen and
// launch full-screen (no browser chrome), so it behaves like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FinanceOS — Vertex Mastery",
    short_name: "FinanceOS",
    description: "Vertex Mastery operational finance & cashflow, on the go.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f6f8",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
