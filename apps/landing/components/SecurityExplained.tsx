const PILLARS = [
  {
    title: "Cifrado de extremo a extremo por defecto",
    body: "En modo Privado, el servidor solo ve ciphertext. Ni Toscana ni un intermediario leen el chat. Opción Nube por conversación solo si vos la elegís.",
  },
  {
    title: "Private Number — sin SIM",
    body: "Al registrarte recibís un número virtual de 10 dígitos (XX-XXXX-XXXX). No es tu celular: solo te encuentran si lo compartís. También podés entrar con email.",
  },
  {
    title: "Wipe remoto + PIN de coacción",
    body: "Vacía el dispositivo a distancia. Si alguien te obliga a desbloquear, el PIN de coacción abre una cuenta señuelo — no tu vault real.",
  },
  {
    title: "Post-cuántica + Key Transparency",
    body: "Handshake híbrido clásico + ML-KEM768 contra harvest-now-decrypt-later. KTL para detectar reemplazo silencioso de claves. FIDO2 opcional.",
  },
];

export function SecurityExplained() {
  return (
    <section id="seguridad" className="bg-primary-soft py-24 border-t border-white/5">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-3xl mb-14">
          <p className="text-accent-light text-sm font-medium uppercase tracking-wider mb-3">
            Seguridad absoluta
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
            Privacidad real, sin teatro
          </h2>
          <p className="text-lg text-gray-300 leading-relaxed">
            Synap documenta qué está shipped: E2E, wipe, coacción, post-cuántica,
            KTL y FIDO2. Código abierto (AGPL) y auditable — para todo el mundo.
          </p>
        </div>

        <div className="grid gap-10 md:grid-cols-2">
          {PILLARS.map((p) => (
            <article key={p.title} className="border-l-2 border-accent/60 pl-6">
              <h3 className="text-xl font-semibold text-white mb-3">{p.title}</h3>
              <p className="text-gray-300 leading-relaxed">{p.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
