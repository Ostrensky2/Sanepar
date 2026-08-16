import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Yva'e Monitoramento",
    template: "%s | Yva'e Monitoramento",
  },
  description:
    "Painel institucional para monitoramento, documentos, campanhas e ingestao de dados entre ATGC e Sanepar.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
      style={{
        "--font-body": "Arial, Helvetica, sans-serif",
        "--font-heading": "Arial, Helvetica, sans-serif",
      } as CSSProperties}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
