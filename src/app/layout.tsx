import type { Metadata, Viewport } from "next";
import { Inter, Outfit, Oooh_Baby } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", weight: ["600", "700"] });
const ooohBaby = Oooh_Baby({ subsets: ["latin"], variable: "--font-oooh-baby", weight: "400" });

export const metadata: Metadata = {
  title: "Cashent - Business Management",
  description: "Accounting and business management for SMBs",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${ooohBaby.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
