const FEATURES = [
  {
    title: "Modo Privado",
    description:
      "El servidor guarda un paquete cifrado. No puede leer el mensaje.",
  },
  {
    title: "Modo Nube (opcional)",
    description:
      "Si lo elegís, el servidor puede leer y traducir el chat. Te avisamos antes.",
  },
  {
    title: "Traducción en la nube",
    description:
      "12 idiomas: español, inglés, portugués, francés, italiano, alemán, chino, japonés, coreano, árabe, ruso e hindi. Eso es la traducción en la nube (chat Nube), no la traducción dentro del teléfono — esa todavía no está lista.",
  },
  {
    title: "Cuenta sin SIM",
    description:
      "Registro con correo. Private Number virtual para que te encuentren solo si lo compartís.",
  },
  {
    title: "Código abierto",
    description:
      "Repositorio público. Lo que aún no está listo, lo decimos.",
  },
];

export function Features() {
  return (
    <section id="features" className="bg-primary py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center mb-16">
          <span className="inline-block rounded-full bg-accent/20 px-4 py-1.5 text-sm font-medium text-accent-light mb-4">
            Producto
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
            Lo que podemos afirmar hoy
          </h2>
          <p className="text-lg text-gray-300 leading-relaxed">
            Sin promesas vacías. Sin “seguridad absoluta”.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl bg-surface p-8 border border-white/10"
            >
              <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
              <p className="text-gray-300 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
