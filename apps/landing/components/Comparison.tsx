type CellValue = boolean | string;

type Row = {
  feature: string;
  Synap: CellValue;
};

const ROWS: Row[] = [
  {
    feature: "Chat Privado: servidor sin mensaje legible",
    Synap: true,
  },
  {
    feature: "Chat Nube opcional con aviso (el servidor puede leer)",
    Synap: true,
  },
  {
    feature: "Chats de 2 personas y grupos con la librería de Signal",
    Synap: true,
  },
  {
    feature: "Traducción en el teléfono (Privado), probado inglés a español",
    Synap: true,
  },
  {
    feature: "Traducción en la nube (12 idiomas, chat Nube)",
    Synap: true,
  },
  {
    feature: "Alta sin correo, número propio de 10 dígitos",
    Synap: true,
  },
  {
    feature: "PIN, PIN de coacción y borrado remoto, probado entre dos teléfonos",
    Synap: true,
  },
  {
    feature: "Llave física (FIDO2), registro de claves e inactividad",
    Synap: true,
  },
  {
    feature: "Claves guardadas en el almacén seguro del teléfono",
    Synap: true,
  },
  {
    feature: "Grupos, archivos sellados, autodestrucción, edición 48 h, encuestas, temas",
    Synap: true,
  },
  {
    feature: "Llamadas de voz y video",
    Synap: "Sí, con la IP oculta",
  },
  {
    feature: "Canales y archivos de más de 25 MB",
    Synap: "Todavía no",
  },
];

type SixRow = {
  feature: string;
  synap: string;
  session: string;
  zangi: string;
  signal: string;
  telegram: string;
  whatsapp: string;
};

const SIX_ROWS: SixRow[] = [
  {
    feature: "Cifrado por defecto",
    synap: "Sí, en chats de 2 y grupos, con la librería de Signal",
    session: "Sí, protocolo propio sobre libsodium",
    zangi: "AES-256 propio (cerrado)",
    signal: "Sí, no se puede apagar",
    telegram: "No. Solo en chats secretos",
    whatsapp: "Sí, en chats y llamadas",
  },
  {
    feature: "Código abierto",
    synap: "Repositorio visible. Licencia propietaria",
    session: "Sí, app y servidor",
    zangi: "No",
    signal: "Sí, app y servidor",
    telegram: "App sí; servidor no",
    whatsapp: "No",
  },
  {
    feature: "Auditoría de terceros",
    synap: "No todavía",
    session: "Sí, Quarkslab revisó los clientes",
    zangi: "Sin auditoría pública conocida",
    signal: "Sí",
    telegram: "Parcial",
    whatsapp: "Sí, del protocolo",
  },
  {
    feature: "IP oculta en los mensajes",
    synap: "No todavía",
    session: "Sí, enrutado en capas",
    zangi: "Dicen que sí, sin comprobar",
    signal: "No",
    telegram: "No",
    whatsapp: "No",
  },
  {
    feature: "IP oculta en las llamadas",
    synap: "Sí, tras el relé. Probado entre dos redes",
    session: "No. Ellos avisan que la IP se comparte",
    zangi: "Dicen que sí",
    signal: "No",
    telegram: "No",
    whatsapp: "No",
  },
  {
    feature: "Alta sin teléfono ni correo",
    synap: "Sí, número propio de 10 dígitos",
    session: "Sí, código de cuenta",
    zangi: "Sí, número de 10 dígitos",
    signal: "No en la app normal",
    telegram: "No",
    whatsapp: "No",
  },
  {
    feature: "Traducción dentro de la app",
    synap: "En el teléfono: inglés a español, probado. En la nube: 12 idiomas",
    session: "No",
    zangi: "No",
    signal: "No",
    telegram: "Con Premium, del cliente",
    whatsapp: "No",
  },
  {
    feature: "Traducir sin que el texto salga del teléfono",
    synap: "Sí, en chat Privado",
    session: "No",
    zangi: "No",
    signal: "No",
    telegram: "No",
    whatsapp: "No",
  },
  {
    feature: "El servidor puede leer tus mensajes",
    synap: "En Privado no. En Nube sí, y lo avisa",
    session: "No, y tampoco sabe quién eres",
    zangi: "Dicen que no",
    signal: "No",
    telegram: "Sí, en los chats normales",
    whatsapp: "No en chats; sí mucha metadata",
  },
  {
    feature: "PIN de coacción y borrado remoto",
    synap: "Sí, probado entre dos teléfonos",
    session: "No",
    zangi: "Sí, en Premium",
    signal: "No como paquete",
    telegram: "No",
    whatsapp: "No",
  },
  {
    feature: "Llamadas de voz y video",
    synap: "Sí, con la IP oculta",
    session: "Sí, en beta",
    zangi: "Sí",
    signal: "Hasta 30",
    telegram: "Hasta 40",
    whatsapp: "Hasta 32",
  },
  {
    feature: "Grupos",
    synap: "Hasta 8 en llamada; chat de grupo cifrado",
    session: "100",
    zangi: "1.000 en conferencia",
    signal: "Sobre 1.000",
    telegram: "200.000",
    whatsapp: "1.024",
  },
  {
    feature: "Archivos",
    synap: "25 MB, cifrados",
    session: "10 MB",
    zangi: "Tamaño original con Premium",
    signal: "200 MB",
    telegram: "2 GB (4 GB Premium)",
    whatsapp: "2 GB",
  },
];

function cellLabel(v: CellValue): string {
  if (v === true) return "Sí";
  if (v === false) return "No";
  return String(v);
}

function cellTone(text: string): string {
  const t = text.trim();
  if (t === "Sí" || t.startsWith("Sí,") || t.startsWith("Sí ")) {
    return "text-emerald-400";
  }
  if (t === "No" || t.startsWith("No.") || t.startsWith("No ") || t.startsWith("No,")) {
    return "text-gray-500";
  }
  if (t === "Todavía no" || t.startsWith("Todavía no") || t.startsWith("No todavía")) {
    return "text-amber-400";
  }
  return "text-gray-300";
}

export function Comparison() {
  return (
    <>
      <section id="comparativa" className="bg-primary py-24 border-t border-white/5">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-3xl mb-12">
            <p className="text-accent-light text-sm font-medium uppercase tracking-wider mb-3">
              Comparativa
            </p>
            <h2 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
              Sin tabla de marketing
            </h2>
            <p className="text-lg text-gray-300 leading-relaxed">
              Solo lo que ya funciona. No comparamos con otras apps fila por fila
              hasta tener cada fila demostrada.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface text-gray-300">
                <tr>
                  <th className="px-5 py-4 font-medium">Capacidad</th>
                  <th className="px-5 py-4 font-medium">Synap hoy</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.feature} className="border-t border-white/10">
                    <td className="px-5 py-4 text-white">{row.feature}</td>
                    <td className="px-5 py-4 text-gray-300">{cellLabel(row.Synap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-sm text-gray-500">
            Comparado con otras apps cuando cada fila esté probada en un teléfono.
          </p>
        </div>
      </section>

      <section
        id="comparativa-cinco"
        className="bg-primary pb-24 border-t border-white/5"
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-3xl mb-10 pt-16">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-white mb-3">
              Seis apps, una fila a la vez
            </h2>
            <p className="text-base text-gray-300 leading-relaxed">
              Synap solo con lo demostrado. Las demás, con lo que publican hoy.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead>
                <tr className="bg-surface text-gray-300">
                  <th className="px-4 py-4 font-medium sticky left-0 bg-surface z-10 min-w-[140px]">
                    Capacidad
                  </th>
                  <th className="px-4 py-4 font-medium bg-accent/10 text-accent min-w-[200px]">
                    Synap
                    <span className="block text-xs font-normal text-accent-light/80 mt-0.5">
                      en desarrollo
                    </span>
                  </th>
                  <th className="px-4 py-4 font-medium min-w-[160px]">Session</th>
                  <th className="px-4 py-4 font-medium min-w-[160px]">Zangi</th>
                  <th className="px-4 py-4 font-medium min-w-[160px]">Signal</th>
                  <th className="px-4 py-4 font-medium min-w-[160px]">Telegram</th>
                  <th className="px-4 py-4 font-medium min-w-[160px]">WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {SIX_ROWS.map((row) => (
                  <tr key={row.feature} className="border-t border-white/10 align-top">
                    <td className="px-4 py-4 text-white font-medium sticky left-0 bg-primary z-10">
                      {row.feature}
                    </td>
                    <td className={`px-4 py-4 bg-accent/10 ${cellTone(row.synap)}`}>
                      {row.synap}
                    </td>
                    <td className={`px-4 py-4 ${cellTone(row.session)}`}>
                      {row.session}
                    </td>
                    <td className={`px-4 py-4 ${cellTone(row.zangi)}`}>
                      {row.zangi}
                    </td>
                    <td className={`px-4 py-4 ${cellTone(row.signal)}`}>
                      {row.signal}
                    </td>
                    <td className={`px-4 py-4 ${cellTone(row.telegram)}`}>
                      {row.telegram}
                    </td>
                    <td className={`px-4 py-4 ${cellTone(row.whatsapp)}`}>
                      {row.whatsapp}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-sm text-gray-500 max-w-4xl">
            Datos de las otras apps: fuentes públicas, 13 de noviembre de 2026.
            La columna de Synap solo incluye lo demostrado en docs/HECHO.md.
          </p>
        </div>
      </section>
    </>
  );
}
