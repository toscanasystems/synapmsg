import {
  IlluNoPlainOnServer,
  IlluPrivateOrCloud,
  IlluTranslateOnDevice,
  IlluKeyChangeWarn,
} from "./Illustrations";

const CARDS = [
  {
    title: "Tus mensajes no van en claro por el servidor",
    body: "En un chat Privado, el servidor guarda un sobre cifrado. Si alguien roba la base, no encuentra lo que escribiste.",
    Illu: IlluNoPlainOnServer,
  },
  {
    title: "Elige por chat: Privado o Nube",
    body: "Privado: nadie más lo lee. Nube: el servidor sí puede leerlo, y la app te avisa antes de que lo crees. Tú decides, chat por chat.",
    Illu: IlluPrivateOrCloud,
  },
  {
    title: "Traduce sin que el texto salga de tu teléfono",
    body: "En un chat Privado la traducción ocurre en tu aparato. Probado con la red cortada. Ni Signal, ni Telegram, ni WhatsApp, ni Zangi lo hacen.",
    Illu: IlluTranslateOnDevice,
  },
  {
    title: "Si cambian tu llave, te avisa",
    body: "Si la llave de un contacto cambia, la app te pregunta si confías en ese teléfono. No manda nada en silencio.",
    Illu: IlluKeyChangeWarn,
  },
] as const;

export function HowItWorks() {
  return (
    <section
      id="en-tus-palabras"
      className="bg-primary-soft py-24 border-t border-white/5"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-3xl mb-12">
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
            Cómo funciona, sin tecnicismos
          </h2>
          <p className="text-sm text-gray-500">
            Cada cosa que ves aquí pasó una prueba. La lista completa está en
            docs/HECHO.md.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          {CARDS.map((card) => (
            <article
              key={card.title}
              className="flex flex-col gap-4 border-t border-white/10 pt-6"
            >
              <card.Illu className="h-24 w-32" />
              <h3 className="text-lg font-semibold text-white leading-snug">
                {card.title}
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed max-w-md">
                {card.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
