import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Soporte — Synap",
  description: "Ayuda y preguntas frecuentes de Synap.",
};

const faqs = [
  {
    q: "¿Qué es Synap?",
    a: "Una app de mensajería de Toscana Systems. En Privado el servidor no lee el mensaje; en Nube sí puede, con aviso. Lo demás todavía no está listo.",
  },
  {
    q: "¿Mis chats son privados?",
    a: "En modo Privado el servidor guarda un paquete cifrado que no puede leer. Si activás Nube, el servidor puede leer y traducir ese chat — la app te avisa antes.",
  },
  {
    q: "¿Dónde descargo Android?",
    a: "En synapmsg.ai — botón Descargar Android (APK). Instalá y ya tenés cuenta (número de 10 dígitos). El correo es opcional y solo sirve para avisos; la recuperación es con el código de 12 caracteres.",
  },
  {
    q: "¿Cuánto cuesta Premium?",
    a: "Premium es $4.99 USD / mes (más media). Se activa desde Ajustes en la app cuando el cobro esté configurado.",
  },
  {
    q: "¿Cómo elimino mi cuenta?",
    a: "Escríbenos a administrador@toscanasystems.com desde el email de tu cuenta y procesaremos la eliminación.",
  },
  {
    q: "¿Dónde está la política de privacidad?",
    a: "En synapmsg.ai/privacy.",
  },
];

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-primary-soft text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-accent-light hover:underline">
          ← Volver a Synap
        </Link>
        <h1 className="mt-6 font-serif text-4xl font-bold text-white">Soporte</h1>
        <p className="mt-3 text-gray-300">
          ¿Necesitas ayuda? Revisa las preguntas frecuentes o escríbenos a{" "}
          <a href="mailto:administrador@toscanasystems.com" className="text-accent-light underline">
            administrador@toscanasystems.com
          </a>
          .
        </p>

        <div className="mt-8">
          <a
            href="https://media.synapmsg.ai/downloads/synap-android.apk"
            className="inline-flex rounded-xl bg-accent px-6 py-3 font-semibold text-black hover:bg-accent/90"
          >
            Descargar APK Android
          </a>
        </div>

        <div className="mt-10 space-y-6">
          {faqs.map((item) => (
            <section key={item.q} className="rounded-xl border border-white/10 bg-surface p-5">
              <h2 className="text-lg font-semibold text-white">{item.q}</h2>
              <p className="mt-2 text-gray-300 leading-relaxed">{item.a}</p>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-xl bg-primary px-6 py-8 text-white">
          <h2 className="text-xl font-semibold">Contacto directo</h2>
          <p className="mt-2 text-gray-300">
            Toscana Systems, S.A.
            <br />
            Email:{" "}
            <a href="mailto:administrador@toscanasystems.com" className="text-accent underline">
              administrador@toscanasystems.com
            </a>
            <br />
            Privacidad:{" "}
            <Link href="/privacy" className="text-accent underline">
              synapmsg.ai/privacy
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
