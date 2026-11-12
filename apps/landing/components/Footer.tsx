export function Footer() {
  return (
    <footer className="bg-primary text-white">
      <div className="border-b border-white/10">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">
            Listo para mensajería con seguridad absoluta
          </h2>
          <p className="text-gray-300 mb-8 max-w-xl mx-auto">
            Descargá Synap para Android hoy. Disponible en todo el mundo.
          </p>
          <a
            href="https://media.synapmsg.ai/downloads/synap-android.apk"
            className="inline-block rounded-xl bg-accent px-8 py-3.5 font-semibold text-black hover:bg-accent/90 transition-all"
          >
            Descargar APK Android
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <img
                src="/synapmsg-logo.png"
                alt="Synap"
                className="h-10 w-10 rounded-lg object-cover"
              />
              <span className="text-xl font-bold">Synap</span>
            </div>
            <p className="text-gray-400 text-sm max-w-sm leading-relaxed">
              Mensajería con seguridad absoluta: E2E, Private Number sin SIM,
              wipe remoto y defensa post-cuántica. Un producto mundial de
              Toscana Systems.
            </p>
            <a
              href="https://toscanasystems.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:border-accent/40 transition-colors"
            >
              <span className="text-xs text-gray-400">Un producto de</span>
              <img
                src="/toscana-logo.png"
                alt="Toscana Systems"
                className="h-7 w-auto max-w-[140px] object-contain"
              />
            </a>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-4 text-accent">Producto</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="/#seguridad" className="hover:text-white transition-colors">Seguridad</a></li>
              <li><a href="/#empezar" className="hover:text-white transition-colors">Cómo empezar</a></li>
              <li><a href="/#planes" className="hover:text-white transition-colors">Planes</a></li>
              <li><a href="/#comparativa" className="hover:text-white transition-colors">Comparativa</a></li>
              <li><a href="https://media.synapmsg.ai/downloads/synap-android.apk" className="hover:text-white transition-colors">Descargar Android</a></li>
              <li><a href="/privacy" className="hover:text-white transition-colors">Privacidad</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-4 text-accent">Empresa</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="/support" className="hover:text-white transition-colors">Soporte</a></li>
              <li><a href="/privacy" className="hover:text-white transition-colors">Privacidad</a></li>
              <li>
                <a
                  href="https://github.com/toscanasystems/synapmsg/blob/main/docs/BUG_BOUNTY.md"
                  className="hover:text-white transition-colors"
                  target="_blank"
                  rel="noreferrer"
                >
                  Bug bounty
                </a>
              </li>
              <li><a href="mailto:soporte@synapmsg.ai" className="hover:text-white transition-colors">Contacto</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-3 text-sm text-gray-400">
            <img
              src="/toscana-logo.png"
              alt="Toscana Systems"
              className="h-6 w-auto max-w-[120px] object-contain opacity-90"
            />
            <p>© 2026 Toscana Systems, S.A. Todos los derechos reservados.</p>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <span>synapmsg.ai</span>
            <span className="font-mono text-xs">Android 1.0.51</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
