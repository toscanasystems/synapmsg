export function TranslationDemo() {
  return (
    <section className="bg-primary py-24 text-white">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text */}
          <div>
            <span className="inline-block rounded-full bg-accent/20 px-4 py-1.5 text-sm font-medium text-accent mb-4">
              Cómo funciona
            </span>
            <h2 className="font-serif text-4xl md:text-5xl font-bold mb-6 leading-tight">
              Tu idioma, su idioma,
              <br />
              <span className="gradient-text">sin fricción</span>
            </h2>
            <p className="text-lg text-gray-300 mb-8 leading-relaxed">
              Escribes en tu idioma nativo. Detectamos automáticamente el idioma del destinatario.
              Traducimos en milisegundos antes de enviar. El receptor ve el mensaje en su idioma
              con una etiqueta discreta.
            </p>

            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-primary text-xs font-bold">
                  1
                </div>
                <div>
                  <strong className="text-white">Tú escribes</strong>
                  <span className="text-gray-300"> en español: "Hola, ¿cómo estás?"</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-primary text-xs font-bold">
                  2
                </div>
                <div>
                  <strong className="text-white">Detectamos</strong>
                  <span className="text-gray-300"> que tu contacto prefiere inglés</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-primary text-xs font-bold">
                  3
                </div>
                <div>
                  <strong className="text-white">Él recibe</strong>
                  <span className="text-gray-300">: "Hi, how are you?" con etiqueta 🌐</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-primary text-xs font-bold">
                  4
                </div>
                <div>
                  <strong className="text-white">Toca la etiqueta</strong>
                  <span className="text-gray-300"> para ver el texto original en español</span>
                </div>
              </li>
            </ul>
          </div>

          {/* Right: Phone mockup */}
          <div className="relative">
            <div className="mx-auto w-full max-w-sm">
              {/* Phone frame */}
              <div className="relative rounded-[2.5rem] bg-gray-900 p-3 shadow-2xl glow">
                {/* Notch */}
                <div className="absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-gray-900" />

                {/* Screen */}
                <div className="rounded-[2rem] bg-primary-soft overflow-hidden h-[600px] flex flex-col">
                  {/* Chat header */}
                  <div className="flex items-center gap-3 bg-primary px-4 py-3 text-white">
                    <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center text-primary font-bold text-sm">
                      JL
                    </div>
                    <div>
                      <p className="font-semibold text-sm">John Lee</p>
                      <p className="text-xs text-accent">🇨🇳 → 🇪🇸 Español</p>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {/* Received message (translated) */}
                    <div className="max-w-[80%]">
                      <div className="bg-white rounded-2xl rounded-tl-sm p-3 shadow-sm">
                        <p className="text-sm text-white">Hola, ¿cómo estás?</p>
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-light px-2 py-0.5 text-xs text-accent">
                        🌐 Traducido del chino
                      </div>
                      <p className="mt-0.5 text-xs text-text-secondary">10:32 AM</p>
                    </div>

                    {/* Sent message */}
                    <div className="max-w-[80%] ml-auto">
                      <div className="bg-accent rounded-2xl rounded-tr-sm p-3 text-white shadow-sm">
                        <p className="text-sm">¡Hola John! Muy bien, ¿y tú?</p>
                      </div>
                      <p className="mt-0.5 text-right text-xs text-text-secondary">10:33 AM</p>
                    </div>

                    {/* Received message (translated) */}
                    <div className="max-w-[80%]">
                      <div className="bg-white rounded-2xl rounded-tl-sm p-3 shadow-sm">
                        <p className="text-sm text-white">Bien también. ¿Nos reunimos mañana?</p>
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-light px-2 py-0.5 text-xs text-accent">
                        🌐 Traducido del chino
                      </div>
                      <p className="mt-0.5 text-xs text-text-secondary">10:34 AM</p>
                    </div>
                  </div>

                  {/* Input */}
                  <div className="border-t border-gray-200 bg-white p-3 flex items-center gap-2">
                    <div className="flex-1 rounded-full bg-primary-soft px-4 py-2 text-sm text-text-secondary">
                      Escribe un mensaje...
                    </div>
                    <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center">
                      <svg className="h-4 w-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 003.058.943L8 13.236V18a2 2 0 104 0v-4.764l2.836 5.26a1 1 0 003.058-.943l-7-14z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
