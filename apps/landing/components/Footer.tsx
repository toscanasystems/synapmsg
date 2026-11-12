export function Footer() {
  return (
    <footer className="bg-primary text-white">
      <div className="border-b border-white/10">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">
            Synap para Android
          </h2>
          <p className="text-gray-300 mb-8 max-w-xl mx-auto">
            En Privado el servidor no lee tu mensaje. En Nube sí puede, y te
            avisamos. Lo demás todavía no está listo.
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
              Un producto de Toscana Systems.
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
            <h4 className="font-semibold mb-3">Producto</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a href="#demostrado" className="hover:text-accent-light">
                  Demostrado
                </a>
              </li>
              <li>
                <a href="#planes" className="hover:text-accent-light">
                  Planes
                </a>
              </li>
              <li>
                <a href="/support/" className="hover:text-accent-light">
                  Soporte
                </a>
              </li>
              <li>
                <a href="/privacy/" className="hover:text-accent-light">
                  Privacidad
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-3">Código</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a
                  href="https://github.com/toscanasystems/synapmsg"
                  className="hover:text-accent-light"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-10 text-xs text-gray-500">
          © {new Date().getFullYear()} Toscana Systems, S.A.
        </p>
      </div>
    </footer>
  );
}
