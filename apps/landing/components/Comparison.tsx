const COMPARISON = [
  {
    feature: "Cifrado E2E por defecto",
    whatsapp: true,
    telegram: false,
    wechat: false,
    synapmsg: true,
  },
  {
    feature: "Traducción nativa (100+ idiomas)",
    whatsapp: false,
    telegram: "limitada",
    wechat: "zh↔en",
    synapmsg: true,
  },
  {
    feature: "Sincronización multidispositivo",
    whatsapp: "limitada",
    telegram: true,
    wechat: true,
    synapmsg: true,
  },
  {
    feature: "Grupos masivos (200k miembros)",
    whatsapp: false,
    telegram: true,
    wechat: false,
    synapmsg: true,
  },
  {
    feature: "Archivos hasta 4GB",
    whatsapp: false,
    telegram: true,
    wechat: false,
    synapmsg: true,
  },
  {
    feature: "Login con email (sin SIM)",
    whatsapp: false,
    telegram: false,
    wechat: false,
    synapmsg: true,
  },
  {
    feature: "Sin anuncios",
    whatsapp: false,
    telegram: true,
    wechat: false,
    synapmsg: true,
  },
  {
    feature: "Sin censura",
    whatsapp: "parcial",
    telegram: true,
    wechat: false,
    synapmsg: true,
  },
  {
    feature: "Traducción on-device (privada)",
    whatsapp: false,
    telegram: false,
    wechat: false,
    synapmsg: true,
  },
  {
    feature: "Código abierto (cliente)",
    whatsapp: false,
    telegram: true,
    wechat: false,
    synapmsg: true,
  },
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <div className="flex justify-center">
        <svg className="h-5 w-5 text-success" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="flex justify-center">
        <svg className="h-5 w-5 text-text-secondary opacity-40" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
  return (
    <span className="text-xs text-warning font-medium bg-warning/10 px-2 py-1 rounded-full">
      {value}
    </span>
  );
}

export function Comparison() {
  return (
    <section className="bg-primary-soft py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center mb-12">
          <span className="inline-block rounded-full bg-accent-light px-4 py-1.5 text-sm font-medium text-accent mb-4">
            Comparativa
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-primary mb-4">
            Synapmsg vs las demás
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Las mejores características de cada app, combinadas en una sola.
            Sin compromisos, sin censura, sin límites de idioma.
          </p>
        </div>

        <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-5 text-text-secondary font-semibold text-sm">Característica</th>
                <th className="p-5 text-center font-semibold text-sm">
                  <div className="text-text-secondary">WhatsApp</div>
                </th>
                <th className="p-5 text-center font-semibold text-sm">
                  <div className="text-text-secondary">Telegram</div>
                </th>
                <th className="p-5 text-center font-semibold text-sm">
                  <div className="text-text-secondary">WeChat</div>
                </th>
                <th className="p-5 text-center font-bold text-sm">
                  <div className="bg-accent text-white rounded-lg py-2 px-3">Synapmsg</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, index) => (
                <tr
                  key={index}
                  className={index % 2 === 0 ? "bg-white" : "bg-primary-soft/50"}
                >
                  <td className="p-4 text-sm font-medium text-white">{row.feature}</td>
                  <td className="p-4 text-center"><Cell value={row.whatsapp} /></td>
                  <td className="p-4 text-center"><Cell value={row.telegram} /></td>
                  <td className="p-4 text-center"><Cell value={row.wechat} /></td>
                  <td className="p-4 text-center bg-accent-light/30"><Cell value={row.synapmsg} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-center text-sm text-text-secondary">
          Datos referenciales a noviembre 2025. Basado en información pública de cada plataforma.
        </p>
      </div>
    </section>
  );
}
