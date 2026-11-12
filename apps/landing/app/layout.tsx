import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synap — Mensajería con seguridad absoluta",
  description:
    "La mensajería más segura: cifrado extremo a extremo, Private Number sin SIM, wipe remoto, PIN de coacción y defensa post-cuántica. Disponible en todo el mundo.",
  keywords: [
    "mensajería",
    "chat",
    "cifrado",
    "seguridad",
    "privacidad",
    "E2E",
    "Synap",
  ],
  authors: [{ name: "Toscana Systems, S.A." }],
  openGraph: {
    title: "Synap — Mensajería con seguridad absoluta",
    description:
      "E2E, Private Number sin SIM, wipe remoto y post-cuántica. Para el mundo entero.",
    type: "website",
    url: "https://synapmsg.ai",
    siteName: "Synap",
  },
  twitter: {
    card: "summary_large_image",
    title: "Synap",
    description:
      "Mensajería con seguridad absoluta. Cifrado E2E, sin SIM, wipe remoto.",
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
