import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synapmsg — Mensajería cifrada con traducción nativa",
  description:
    "La app de mensajería más segura del mundo. Escribe en tu idioma, el destinatario recibe en el suyo. Cifrado extremo a extremo, traducción en tiempo real, sin anuncios.",
  keywords: [
    "mensajería",
    "chat",
    "cifrado",
    "traducción",
    "privacidad",
    "LatAm",
    "Synapmsg",
  ],
  authors: [{ name: "Toscana Systems, S.A." }],
  openGraph: {
    title: "Synapmsg — Mensajería cifrada con traducción nativa",
    description:
      "Escribe en tu idioma, el destinatario recibe en el suyo. Cifrado E2E, traducción en tiempo real.",
    type: "website",
    url: "https://synapmsg.com",
    siteName: "Synapmsg",
  },
  twitter: {
    card: "summary_large_image",
    title: "Synapmsg",
    description:
      "Mensajería cifrada con traducción nativa. Escribe en tu idioma, el destinatario recibe en el suyo.",
  },
  robots: { index: true, follow: true },
  viewport: "width=device-width, initial-scale=1, maximum-scale=5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  );
}
