"use client";

export function Hero() {
  return (
    <section
      id="top"
      className="hero-pattern relative min-h-[100svh] overflow-hidden bg-primary text-white"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-accent-dark/20 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-6 pb-20 pt-28 md:pt-32">
        <div className="mb-8 animate-fade-in">
          <img
            src="/synapmsg-logo.png"
            alt="Synap"
            className="h-28 w-28 md:h-36 md:w-36 rounded-3xl object-cover shadow-[0_0_48px_rgba(48,176,176,0.45)] ring-1 ring-accent/40"
          />
        </div>

        <h1 className="font-serif text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl max-w-4xl animate-slide-up">
          Synap
        </h1>

        <p className="mt-6 max-w-2xl text-xl md:text-2xl text-gray-200 leading-relaxed animate-slide-up">
          Mensajería con seguridad absoluta.
          <span className="block mt-2 text-lg text-gray-400">
            Cifrado extremo a extremo, Private Number sin SIM, wipe remoto,
            PIN de coacción y defensa post-cuántica. Para el mundo entero.
          </span>
        </p>

        <div className="mt-10 flex flex-wrap gap-3 animate-slide-up">
          <a
            href="https://media.synapmsg.ai/downloads/synap-android.apk"
            className="rounded-xl bg-accent px-7 py-3.5 font-semibold text-black hover:bg-accent/90 transition-colors"
          >
            Descargar Android · GA 1.1
          </a>
          <span className="rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 font-semibold text-gray-400">
            iOS · próximamente
          </span>
          <a
            href="#seguridad"
            className="rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 font-semibold text-white hover:border-accent/50 transition-colors"
          >
            Ver seguridad
          </a>
        </div>

        <ul className="mt-14 flex flex-wrap gap-x-8 gap-y-3 text-sm text-gray-300 animate-fade-in">
          <li>E2E + post-cuántica (ML-KEM)</li>
          <li>Sin número de celular</li>
          <li>Wipe remoto · PIN de coacción</li>
          <li>AGPL · auditable</li>
        </ul>
      </div>
    </section>
  );
}
