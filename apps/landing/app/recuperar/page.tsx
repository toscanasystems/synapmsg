import type { Metadata } from "next";
import Link from "next/link";
import { RecoverForm } from "./RecoverForm";

export const metadata: Metadata = {
  title: "Recuperar cuenta — Synap",
  description:
    "Recuperá tu cuenta Synap con el código de 12 caracteres. Conservás tu número. Las conversaciones anteriores no se pueden recuperar.",
};

export default function RecuperarPage() {
  return (
    <main className="min-h-screen bg-primary-soft text-white">
      <div className="mx-auto max-w-lg px-5 py-12 sm:px-6 sm:py-16">
        <Link
          href="/"
          className="text-sm text-accent-light hover:underline underline-offset-2"
        >
          ← Volver a Synap
        </Link>

        <p className="mt-8 font-serif text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Synap
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
          Recuperar mi cuenta
        </h1>
        <p className="mt-3 text-base leading-relaxed text-gray-300">
          Si perdiste el teléfono, usá el código de 12 caracteres que apuntaste
          en papel al crear la cuenta.
        </p>
        <p className="mt-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-accent-light">
          Recuperas tu cuenta y tu número. Tus conversaciones anteriores no se
          pueden recuperar.
        </p>

        <RecoverForm />

        <p className="mt-10 text-center text-sm text-gray-500">
          ¿Necesitás ayuda?{" "}
          <Link href="/support/" className="text-accent-light hover:underline">
            Soporte
          </Link>
        </p>
      </div>
    </main>
  );
}
