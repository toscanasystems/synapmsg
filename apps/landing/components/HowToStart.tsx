const STEPS = [
  {
    n: "01",
    title: "Descargá Synap para Android",
    body: "APK lista hoy. Instalá, abrí la app y creá tu cuenta con email o Private Number. Sin SIM.",
  },
  {
    n: "02",
    title: "Recibí tu Private Number",
    body: "Un número virtual de 10 dígitos (XX-XXXX-XXXX). No es celular: solo te encuentran si lo compartís.",
  },
  {
    n: "03",
    title: "Activá el paquete de seguridad",
    body: "E2E privado por defecto, bloqueo de app, wipe remoto y PIN de coacción cuando lo necesites.",
  },
  {
    n: "04",
    title: "Invitá y chateá",
    body: "Pedile a tu contacto su Private Number o email. Empezá un chat en modo Privado E2E.",
  },
];

export function HowToStart() {
  return (
    <section id="empezar" className="bg-primary-soft py-24 border-t border-white/5">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-3xl mb-14">
          <p className="text-accent-light text-sm font-medium uppercase tracking-wider mb-3">
            Cómo empezar
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
            Android GA listo · iOS pendiente
          </h2>
          <p className="text-lg text-gray-300 leading-relaxed">
            Descargá la APK, creá tu cuenta y entrá con seguridad absoluta desde
            el primer mensaje. iOS llega en TestFlight / App Store a continuación.
          </p>
        </div>

        <ol className="grid gap-8 md:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-5">
              <span className="font-mono text-accent text-sm pt-1">{s.n}</span>
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">{s.title}</h3>
                <p className="text-gray-300 leading-relaxed">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-14 flex flex-wrap gap-3">
          <a
            href="https://media.synapmsg.ai/downloads/synap-android.apk"
            className="rounded-xl bg-accent px-6 py-3.5 font-semibold text-black hover:bg-accent/90 transition-colors"
          >
            Descargar APK Android
          </a>
          <a
            href="#planes"
            className="rounded-xl border border-white/20 px-6 py-3.5 font-semibold text-white hover:border-accent/50 transition-colors"
          >
            Ver planes
          </a>
        </div>
      </div>
    </section>
  );
}
