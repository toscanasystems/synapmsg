import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Windows — Synap",
  description: "Synap para Windows todavía no está listo.",
};

export default function WindowsPage() {
  return (
    <main className="min-h-screen bg-primary-soft text-white">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/" className="text-sm text-accent-light hover:underline">
          ← Volver a Synap
        </Link>
        <h1 className="mt-6 font-serif text-4xl font-bold">Synap Version Windows</h1>
        <p className="mt-4 text-lg text-gray-300 leading-relaxed">
          Todavía no está listo. La app de escritorio para Windows está en el roadmap;
          hoy solo hay Android (APK).
        </p>
        <p className="mt-3 text-gray-400 leading-relaxed">
          Cuando esté demostrada en docs/HECHO.md, la publicaremos aquí.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="https://media.synapmsg.ai/downloads/synap-android.apk"
            className="rounded-xl bg-accent px-6 py-3 font-semibold text-black hover:bg-accent/90"
          >
            Descargar APK Android
          </a>
          <Link
            href="/"
            className="rounded-xl border border-white/20 bg-white/5 px-6 py-3 font-semibold text-white hover:border-accent/50"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
