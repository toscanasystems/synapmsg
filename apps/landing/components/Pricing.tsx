const PLANS = [
  {
    id: "free",
    name: "Gratis",
    price: "$0",
    period: "/ mes",
    blurb: "Seguridad absoluta desde el día uno. Sin tarjeta.",
    cta: "Descargar Android",
    href: "https://media.synapmsg.ai/downloads/synap-android.apk",
    featured: false,
    features: [
      "E2E privado + Private Number",
      "Wipe remoto y PIN de coacción",
      "Post-cuántica híbrida (ML-KEM)",
      "5 GB de media · archivos hasta 25 MB",
      "Chats, grupos, llamadas y bloqueo de app",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "$4.99",
    period: "/ mes",
    blurb: "Más capacidad sin tocar la seguridad de base.",
    cta: "Activar en la app",
    href: "#empezar",
    featured: true,
    features: [
      "Todo lo del plan Gratis",
      "100 GB de media",
      "Archivos hasta 100 MB",
      "Sin anuncios",
      "Soporte prioritario",
      "Pago con Recurrente (tarjeta)",
    ],
  },
];

export function Pricing() {
  return (
    <section id="planes" className="bg-primary py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center mb-16">
          <span className="inline-block rounded-full bg-accent/20 px-4 py-1.5 text-sm font-medium text-accent-light mb-4">
            Planes
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
            Empieza gratis. Escala cuando lo necesites.
          </h2>
          <p className="text-lg text-gray-300 leading-relaxed">
            La seguridad absoluta va en ambos planes. Premium amplía cuota de
            media y soporte — el cifrado no se vende aparte.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={[
                "relative rounded-2xl p-8 border transition-all duration-300",
                plan.featured
                  ? "bg-surface border-accent/50 shadow-[0_0_40px_rgba(48,176,176,0.18)]"
                  : "bg-surface/60 border-white/10 hover:border-white/25",
              ].join(" ")}
            >
              {plan.featured ? (
                <span className="absolute -top-3 left-8 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-black">
                  Recomendado
                </span>
              ) : null}

              <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
              <p className="mt-2 text-gray-400 text-sm leading-relaxed">{plan.blurb}</p>

              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                <span className="text-sm text-gray-400">{plan.period}</span>
              </div>

              <ul className="mt-8 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-gray-200">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <a
                href={plan.href}
                className={[
                  "mt-8 inline-flex w-full items-center justify-center rounded-xl px-6 py-3.5 font-semibold transition-all",
                  plan.featured
                    ? "bg-accent text-primary hover:bg-accent/90"
                    : "bg-white/10 text-white hover:bg-white/15 border border-white/15",
                ].join(" ")}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">
          Premium: $4.99 USD / mes. Pagás desde Ajustes en la app (Recurrente).
          Play Billing cuando publiquemos en Play Store.
        </p>
      </div>
    </section>
  );
}
