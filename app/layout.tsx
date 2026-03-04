import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARM Energy — Trading Terminal",
  description: "Energy commodity trading simulation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
