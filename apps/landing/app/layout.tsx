import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synap — mensajería Privado / Nube",
  description:
    "En un chat Privado el servidor no guarda el mensaje legible. En Nube sí puede leerlo, y la app avisa antes. Lo demás todavía no está listo.",
  keywords: [
    "mensajería",
    "chat",
    "cifrado",
    "privacidad",
    "Synap",
    "Toscana Systems",
  ],
  authors: [{ name: "Toscana Systems, S.A." }],
  openGraph: {
    title: "Synap",
    description:
      "Privado: el servidor no lee el mensaje. Nube: sí puede, con aviso. Lo demás todavía no.",
    type: "website",
    url: "https://synapmsg.ai",
    siteName: "Synap",
  },
  twitter: {
    card: "summary_large_image",
    title: "Synap",
    description:
      "Privado sin mensaje legible en el servidor. Nube con aviso. Lo demás todavía no.",
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
