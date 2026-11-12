type CellValue = boolean | string;

type Row = {
  feature: string;
  Synap: CellValue;
};

const ROWS: Row[] = [
  {
    feature: "Chat Privado: servidor sin mensaje en claro",
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
    feature: "Todavía no: llamadas de voz y video",
    Synap: "Todavía no",
  },
  {
    feature: "Todavía no: canales y archivos de más de 25 MB",
    Synap: "Todavía no",
  },
];

function cellLabel(v: CellValue): string {
  if (v === true) return "Sí";
  if (v === false) return "No";
  return String(v);
}

export function Comparison() {
  return (
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
  );
}
