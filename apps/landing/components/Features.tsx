const FEATURES = [
  {
    icon: "🌐",
    title: "Traducción nativa integrada",
    description:
      "Escribe en español, tu contacto recibe en inglés, chino, portugués o cualquiera de los 100+ idiomas soportados. Sin copiar y pegar a Google Translate.",
    highlight: "Diferenciador clave",
  },
  {
    icon: "🔒",
    title: "Cifrado extremo a extremo",
    description:
      "Signal Protocol por defecto en todos los chats. Ni nosotros podemos leer tus mensajes. Tu privacidad no es negociable.",
  },
  {
    icon: "☁️",
    title: "Sincronización en la nube",
    description:
      "Tus chats disponibles en todos tus dispositivos. Modo híbrido: elige entre E2E puro o nube sincronizada por cada conversación.",
  },
  {
    icon: "⚡",
    title: "Tiempo real",
    description:
      "Mensajes instantáneos vía WebSocket. Sin latencia perceptible. La traducción ocurre en milisegundos antes de enviar.",
  },
  {
    icon: "🤖",
    title: "Modo privacidad on-device",
    description:
      "La traducción puede ocurrir localmente en tu dispositivo con Whisper.cpp. Ningún mensaje sale de tu teléfono. Ideal para conversaciones sensibles.",
  },
  {
    icon: "🚫",
    title: "Sin anuncios, sin tracking",
    description:
      "Tu información no se vende. Modelo freemium transparente: gratis con límites razonables, Premium sin anuncios ni límites.",
  },
];

export function Features() {
  return (
    <section className="bg-primary-soft py-24">
      <div className="mx-auto max-w-6xl px-6">
        {/* Section header */}
        <div className="mx-auto max-w-3xl text-center mb-16">
          <span className="inline-block rounded-full bg-accent-light px-4 py-1.5 text-sm font-medium text-accent mb-4">
            Características
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-primary mb-4">
            Lo mejor de cada app, sin lo peor de ninguna
          </h2>
          <p className="text-lg text-text-secondary leading-relaxed">
            Combinamos la privacidad de WhatsApp, la flexibilidad de Telegram, la potencia de WeChat —
            y añadimos traducción nativa que ninguna tiene.
          </p>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, index) => (
            <div
              key={index}
              className="group relative rounded-2xl bg-white p-8 shadow-sm border border-gray-100 hover:shadow-lg hover:border-accent/30 transition-all duration-300"
            >
              {/* Icon */}
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-accent-light text-3xl group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-primary mb-3 flex items-center gap-2">
                {feature.title}
                {feature.highlight && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white">
                    {feature.highlight}
                  </span>
                )}
              </h3>

              {/* Description */}
              <p className="text-text-secondary leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
