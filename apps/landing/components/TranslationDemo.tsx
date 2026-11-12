export function TranslationDemo() {
  return (
    <section className="bg-primary py-24 text-white">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="inline-block rounded-full bg-accent/20 px-4 py-1.5 text-sm font-medium text-accent-light mb-4">
              Cómo funciona
            </span>
            <h2 className="font-serif text-4xl md:text-5xl font-bold mb-6 leading-tight text-white">
              Tu idioma, su idioma,
              <br />
              <span className="gradient-text">sin fricción</span>
            </h2>
            <p className="text-lg text-gray-300 mb-8 leading-relaxed">
              En un chat Nube escribes en tu idioma; el servidor puede traducir al del
              destinatario. 12 idiomas: español, inglés, portugués, francés, italiano,
              alemán, chino, japonés, coreano, árabe, ruso e hindi. Eso es traducción en
              la nube — la traducción dentro del teléfono todavía no está lista.
            </p>

            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-black text-xs font-bold">
                  1
                </div>
                <div>
                  <strong className="text-white">Tú escribes</strong>
                  <span className="text-gray-300"> en español: &quot;Hola, ¿cómo estás?&quot;</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-black text-xs font-bold">
                  2
                </div>
                <div>
                  <strong className="text-white">Detectamos</strong>
                  <span className="text-gray-300"> que tu contacto prefiere inglés</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-black text-xs font-bold">
                  3
                </div>
                <div>
                  <strong className="text-white">Él recibe</strong>
                  <span className="text-gray-300">: &quot;Hi, how are you?&quot; con etiqueta 🌐</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-black text-xs font-bold">
                  4
                </div>
                <div>
                  <strong className="text-white">Toca la etiqueta</strong>
                  <span className="text-gray-300"> para ver el texto original en español</span>
                </div>
              </li>
            </ul>
          </div>

          <div className="relative">
            <div className="mx-auto w-full max-w-sm">
              <div className="relative rounded-[2.5rem] bg-gray-900 p-3 shadow-2xl glow">
                <div className="absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-gray-900" />

                <div className="rounded-[2rem] bg-[#0f1419] overflow-hidden h-[600px] flex flex-col">
                  <div className="flex items-center gap-3 bg-primary px-4 py-3 text-white border-b border-white/10">
                    <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center text-black font-bold text-sm">
                      JL
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-white">John Lee</p>
                      <p className="text-xs text-accent-light">🇨🇳 → 🇪🇸 Español</p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <div className="max-w-[80%]">
                      <div className="bg-white rounded-2xl rounded-tl-sm p-3 shadow-sm">
                        <p className="text-sm text-gray-900">Hola, ¿cómo estás?</p>
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent-light">
                        🌐 Traducido del chino
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">10:32 AM</p>
                    </div>

                    <div className="max-w-[80%] ml-auto">
                      <div className="bg-accent rounded-2xl rounded-tr-sm p-3 text-black shadow-sm">
                        <p className="text-sm font-medium">¡Hola John! Muy bien, ¿y tú?</p>
                      </div>
                      <p className="mt-0.5 text-right text-xs text-gray-400">10:33 AM</p>
                    </div>

                    <div className="max-w-[80%]">
                      <div className="bg-white rounded-2xl rounded-tl-sm p-3 shadow-sm">
                        <p className="text-sm text-gray-900">Bien también. ¿Nos reunimos mañana?</p>
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent-light">
                        🌐 Traducido del chino
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">10:34 AM</p>
                    </div>
                  </div>

                  <div className="border-t border-white/10 bg-[#121820] p-3 flex items-center gap-2">
                    <div className="flex-1 rounded-full bg-white/5 px-4 py-2 text-sm text-gray-400">
                      Escribe un mensaje...
                    </div>
                    <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center">
                      <svg className="h-4 w-4 text-black" fill="currentColor" viewBox="0 0 20 20">
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
