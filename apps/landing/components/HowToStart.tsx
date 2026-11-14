const STEPS = [
  {
    n: "01",
    title: "Descargá Synap para Android",
    body: "Instalá la app y ya tienes cuenta: se te asigna un número de 10 dígitos. Sin correo y sin SIM.",
  },
  {
    n: "02",
    title: "Empezá en modo Privado",
    body: "El servidor no guarda el mensaje legible: guarda un paquete que no puede leer.",
  },
  {
    n: "03",
    title: "Si elegís Nube, leé el aviso",
    body: "En Nube el servidor sí puede leer ese chat. La app te lo dice antes de crearlo.",
  },
];

export function HowToStart() {
  return (
    <section id="empezar" className="bg-primary-soft py-24 border-t border-white/5 scroll-mt-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-3xl mb-14">
          <p className="text-accent-light text-sm font-medium uppercase tracking-wider mb-3">
            Cómo empezar
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
            Android disponible
          </h2>
          <p className="text-lg text-gray-300 leading-relaxed">
            iOS todavía no. Lo demás del roadmap espera su prueba.
          </p>
        </div>

        <ol className="grid gap-8 md:grid-cols-3">
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
        </div>
      </div>
    </section>
  );
}
