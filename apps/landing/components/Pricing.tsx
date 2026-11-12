const PLANS = [
  {
    id: "free",
    name: "Gratis",
    price: "$0",
    period: "/ mes",
    blurb: "Chat Privado y cuenta sin SIM.",
    cta: "Descargar Android",
    href: "https://media.synapmsg.ai/downloads/synap-android.apk",
    featured: false,
    features: [
      "Modo Privado: el servidor no lee el mensaje",
      "Modo Nube opcional con aviso",
      "Registro con correo",
      "Cuota de media limitada",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "$4.99",
    period: "/ mes",
    blurb: "Más cuota de media. El modo Privado no se vende aparte.",
    cta: "Activar en la app",
    href: "#empezar",
    featured: true,
    features: [
      "Todo lo del plan Gratis",
      "Más almacenamiento de media",
      "Sin anuncios (objetivo de producto)",
      "Pago con Recurrente cuando esté configurado",
    ],
  },
];

export function Pricing() {
  return (
    <section id="planes" className="bg-primary-soft py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center mb-16">
          <span className="inline-block rounded-full bg-accent/20 px-4 py-1.5 text-sm font-medium text-accent-light mb-4">
            Planes
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
            Gratis para empezar
          </h2>
          <p className="text-lg text-gray-300 leading-relaxed">
            Premium amplía cuota. No vendemos promesas de seguridad.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={[
                "relative rounded-2xl p-8 border",
                plan.featured
                  ? "bg-surface border-accent/50"
                  : "bg-surface/60 border-white/10",
              ].join(" ")}
            >
              <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
              <p className="mt-2 text-gray-400 text-sm leading-relaxed">{plan.blurb}</p>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                <span className="text-sm text-gray-400">{plan.period}</span>
              </div>
              <ul className="mt-6 space-y-2 text-sm text-gray-300">
                {plan.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              <a
                href={plan.href}
                className={[
                  "mt-8 inline-block rounded-xl px-6 py-3 font-semibold",
                  plan.featured
                    ? "bg-accent text-black"
                    : "border border-white/20 text-white",
                ].join(" ")}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
