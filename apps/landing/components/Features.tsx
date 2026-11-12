const FEATURES = [
  {
    icon: "🛡️",
    title: "Seguridad absoluta",
    description:
      "E2E por defecto, wipe remoto firmado, PIN de coacción con cuenta señuelo, KTL, Dead Man's Switch, FLAG_SECURE y FIDO2. Lo que WhatsApp y Telegram no empaquetan juntos.",
    highlight: "Paquete ★",
  },
  {
    icon: "🔐",
    title: "Post-cuántica híbrida",
    description:
      "Handshake X3DH + Double Ratchet + ML-KEM768. Defensa real contra harvest-now-decrypt-later, no theater.",
    highlight: "ML-KEM",
  },
  {
    icon: "📵",
    title: "Private Number · sin SIM",
    description:
      "Al crear la cuenta te damos un Private Number único (XX-XXXX-XXXX). No es un celular: solo te encuentran si lo compartís.",
    highlight: "Sin SIM",
  },
  {
    icon: "🧨",
    title: "Wipe remoto + coacción",
    description:
      "Vacía el dispositivo a distancia. El PIN de coacción abre un señuelo — no tu vault real.",
  },
  {
    icon: "⚖️",
    title: "Híbrido por chat",
    description:
      "Privado E2E o nube sincronizada — lo elegís por conversación. Servidor sin plaintext cuando el chat es E2E.",
  },
  {
    icon: "📜",
    title: "AGPL · auditable",
    description:
      "Código abierto y bug bounty. Seguridad verificable, no marketing opaco.",
  },
];

export function Features() {
  return (
    <section id="features" className="bg-primary py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center mb-16">
          <span className="inline-block rounded-full bg-accent/20 px-4 py-1.5 text-sm font-medium text-accent-light mb-4">
            Lo mejor de Synap
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
            Seguridad absoluta. Sin teatro.
          </h2>
          <p className="text-lg text-gray-300 leading-relaxed">
            Paquete de seguridad absoluta para el mundo entero — E2E, wipe,
            coacción, post-cuántica y Private Number sin SIM.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group relative rounded-2xl bg-surface p-8 border border-white/10 hover:border-accent/40 hover:shadow-[0_0_30px_rgba(48,176,176,0.15)] transition-all duration-300"
            >
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-accent/15 text-3xl group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>

              <h3 className="text-xl font-bold text-white mb-3 flex flex-wrap items-center gap-2">
                {feature.title}
                {feature.highlight ? (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-black">
                    {feature.highlight}
                  </span>
                ) : null}
              </h3>

              <p className="text-gray-300 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
