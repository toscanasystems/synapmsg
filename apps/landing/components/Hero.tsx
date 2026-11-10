"use client";

import { useState } from "react";

export function Hero() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    // TODO: Replace with actual API endpoint when backend is deployed
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="hero-pattern relative overflow-hidden bg-primary text-white">
      {/* Decorative synapse nodes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 h-2 w-2 rounded-full bg-accent opacity-60 animate-pulse-slow" />
        <div className="absolute top-40 right-20 h-3 w-3 rounded-full bg-accent opacity-40 animate-pulse-slow" style={{ animationDelay: "1s" }} />
        <div className="absolute bottom-32 left-1/4 h-2 w-2 rounded-full bg-accent opacity-50 animate-pulse-slow" style={{ animationDelay: "2s" }} />
        <svg className="absolute inset-0 h-full w-full opacity-10" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#30B0B0" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-24 lg:py-32">
        {/* Logo */}
        <div className="mb-12 flex items-center gap-3 animate-fade-in">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary font-bold text-xl">
            S
          </div>
          <span className="text-2xl font-bold tracking-tight">Synapmsg</span>
        </div>

        {/* Headline */}
        <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl font-bold leading-tight max-w-4xl animate-slide-up">
          Escribe en tu idioma.
          <br />
          <span className="gradient-text">Ellos lo reciben en el suyo.</span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 max-w-2xl text-lg md:text-xl text-gray-300 leading-relaxed animate-slide-up" style={{ animationDelay: "0.1s" }}>
          Mensajería cifrada extremo a extremo con traducción nativa en tiempo real.
          La privacidad de WhatsApp, la flexibilidad de Telegram, sin barreras de idioma.
        </p>

        {/* Email capture */}
        <div className="mt-10 max-w-md animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setStatus("idle");
              }}
              placeholder="tu@email.com"
              className="flex-1 rounded-xl bg-white/10 border border-white/20 px-5 py-3.5 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent backdrop-blur-sm"
              disabled={status === "loading"}
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded-xl bg-accent px-6 py-3.5 font-semibold text-primary hover:bg-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {status === "loading" ? "Enviando..." : "Únete a la beta"}
            </button>
          </form>

          {status === "success" && (
            <p className="mt-3 text-sm text-accent animate-fade-in">
              ✅ ¡Listo! Te avisaremos cuando la beta esté disponible.
            </p>
          )}
          {status === "error" && (
            <p className="mt-3 text-sm text-red-400 animate-fade-in">
              ❌ Por favor ingresa un email válido.
            </p>
          )}

          <p className="mt-3 text-sm text-gray-400">
            Sin spam. Solo te avisaremos cuando lancemos. Cancela cuando quieras.
          </p>
        </div>

        {/* Trust indicators */}
        <div className="mt-16 flex flex-wrap items-center gap-x-8 gap-y-4 text-sm text-gray-400 animate-fade-in" style={{ animationDelay: "0.4s" }}>
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Cifrado E2E</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
            <span>100+ idiomas</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
              <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
              <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
            </svg>
            <span>Sin anuncios</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-500">by Toscana Systems</span>
          </div>
        </div>
      </div>
    </section>
  );
}
