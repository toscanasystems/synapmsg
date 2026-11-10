export function Footer() {
  return (
    <footer className="bg-primary text-white">
      {/* CTA Section */}
      <div className="border-b border-white/10">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">
            ¿Listo para chatear sin fronteras?
          </h2>
          <p className="text-gray-300 mb-8 max-w-xl mx-auto">
            Únete a la beta privada. Serás de los primeros en probar Synapmsg.
          </p>
          <a
            href="#top"
            className="inline-block rounded-xl bg-accent px-8 py-3.5 font-semibold text-primary hover:bg-accent/90 transition-all"
          >
            Solicitar acceso beta
          </a>
        </div>
      </div>

      {/* Footer links */}
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary font-bold text-xl">
                S
              </div>
              <span className="text-xl font-bold">Synapmsg</span>
            </div>
            <p className="text-gray-400 text-sm max-w-sm leading-relaxed">
              Mensajería cifrada con traducción nativa. Escribe en tu idioma,
              el destinatario recibe en el suyo. La app bilingüe segura para LatAm.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-sm mb-4 text-accent">Producto</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="#" className="hover:text-white transition-colors">Características</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacidad</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Beta privada</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Roadmap</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-4 text-accent">Empresa</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="#" className="hover:text-white transition-colors">Sobre nosotros</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Términos</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacidad</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contacto</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            © 2025 Toscana Systems, S.A. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <span>Hecho con ❤️ en Guatemala</span>
            <span className="font-mono text-xs">v1.0.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
