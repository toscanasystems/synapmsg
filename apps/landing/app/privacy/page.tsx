import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidad — Synap",
  description:
    "Cómo Synap recolecta, usa y protege tu información. Cifrado extremo a extremo y metadatos mínimos.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-primary-soft text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-accent-light hover:underline">
          ← Volver a Synap
        </Link>
        <h1 className="mt-6 font-serif text-4xl font-bold text-white">Política de Privacidad</h1>
        <p className="mt-2 text-sm text-gray-400">Última actualización: 10 de noviembre de 2026</p>

        <div className="mt-10 space-y-8 text-base leading-relaxed text-gray-300">
          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">1. Quiénes somos</h2>
            <p>
              Synap es operado por Toscana Systems, S.A. (“nosotros”). Esta política describe
              cómo tratamos los datos personales cuando usas la app Synap o el sitio{" "}
              <a href="https://synapmsg.ai" className="text-accent underline">
                synapmsg.ai
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">2. Datos que recolectamos</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Cuenta:</strong> email, nombre de usuario y contraseña (almacenada de forma
                cifrada/hash).
              </li>
              <li>
                <strong>Perfil:</strong> idioma preferido y foto de perfil si la agregas.
              </li>
              <li>
                <strong>Mensajes:</strong> el contenido de los chats se cifra extremo a extremo. No
                leemos el texto legible de tus conversaciones privadas.
              </li>
              <li>
                <strong>Traducción:</strong> el texto a traducir se procesa de forma temporal para
                generar la versión en el idioma del destinatario; no lo usamos para publicidad.
              </li>
              <li>
                <strong>Técnicos:</strong> logs de errores, dispositivo e IP de forma limitada para
                seguridad y operación del servicio.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">3. Cómo usamos los datos</h2>
            <p>Usamos la información solo para:</p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>Proveer mensajería, autenticación y traducción.</li>
              <li>Mantener la seguridad de la plataforma y prevenir abuso.</li>
              <li>Cumplir obligaciones legales cuando aplique.</li>
            </ul>
            <p className="mt-3">No vendemos datos personales ni mostramos anuncios basados en tu contenido.</p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">4. Cifrado y seguridad</h2>
            <p>
              Synap usa cifrado extremo a extremo para el contenido de mensajes entre usuarios.
              Aplicamos medidas técnicas y organizativas razonables para proteger cuentas y
              metadatos de servicio. Ningún sistema es 100% invulnerable; te pedimos usar una
              contraseña fuerte y no compartirla.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">5. Proveedores</h2>
            <p>
              Podemos usar proveedores de infraestructura (hosting, base de datos, traducción) bajo
              contratos que limitan el uso de datos al servicio que nos prestan. Los proveedores no
              están autorizados a usar tu información para sus propios fines de marketing.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">6. Conservación</h2>
            <p>
              Conservamos datos de cuenta mientras mantengas tu cuenta activa. Puedes solicitar
              eliminación escribiendo a soporte. Algunos registros técnicos pueden retenerse por
              plazos cortos por seguridad o requisitos legales.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">7. Tus derechos</h2>
            <p>
              Según tu jurisdicción, puedes solicitar acceso, corrección, portabilidad o
              eliminación de tus datos personales. Contáctanos en{" "}
              <a href="mailto:administrador@toscanasystems.com" className="text-accent underline">
                administrador@toscanasystems.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">8. Menores</h2>
            <p>
              Synap no está dirigido a menores de 13 años. Si crees que un menor nos proporcionó
              datos, escríbenos para eliminarlos.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">9. Cambios</h2>
            <p>
              Podemos actualizar esta política. Publicaremos la versión vigente en esta página con
              la fecha de actualización.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">10. Contacto</h2>
            <p>
              Toscana Systems, S.A. — Guatemala
              <br />
              Email:{" "}
              <a href="mailto:administrador@toscanasystems.com" className="text-accent underline">
                administrador@toscanasystems.com
              </a>
              <br />
              Soporte:{" "}
              <Link href="/support" className="text-accent underline">
                synapmsg.ai/support
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
