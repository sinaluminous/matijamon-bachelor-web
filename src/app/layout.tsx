import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bachelor Special — Matijamon",
  description: "Igra za pijenje za Matijinu momacku vecer",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0c0c14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hr" className="h-full">
      <body className="min-h-full flex flex-col bg-[#0c0c14] text-white font-pixel">{children}</body>
    </html>
  );
}
