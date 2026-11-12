type CellValue = boolean | string;

type Row = {
  feature: string;
  Synap: CellValue;
  zangi: CellValue;
  signal: CellValue;
  telegram: CellValue;
  wechat: CellValue;
  whatsapp: CellValue;
  highlight?: boolean;
};

/**
 * Orden: Synap → Zangi → Signal → Telegram → WeChat → WhatsApp
 * Zangi (Secret Phone): E2E siempre, sin SIM, Private Number, historial en device,
 * wipe passcode Premium, VPN tunneling Premium; closed-source / sin auditoría pública.
 */
const COMPARISON: Row[] = [
  {
    feature: "E2E por defecto (mensajes + llamadas)",
    Synap: true,
    zangi: true,
    signal: true,
    telegram: "solo secretos",
    wechat: false,
    whatsapp: true,
  },
  {
    feature: "Modo nube opcional por chat (híbrido)",
    Synap: true,
    zangi: false,
    signal: false,
    telegram: true,
    wechat: true,
    whatsapp: "backup",
  },
  {
    feature: "Sin SIM · identidad privada",
    Synap: "Private Number + email",
    zangi: "Private Number",
    signal: "requiere tel.",
    telegram: true,
    wechat: false,
    whatsapp: false,
    highlight: true,
  },
  {
    feature: "Sin directorio público (no te encuentran solos)",
    Synap: true,
    zangi: true,
    signal: "por número",
    telegram: "username",
    wechat: false,
    whatsapp: "por número",
    highlight: true,
  },
  {
    feature: "Historial E2E solo en dispositivo",
    Synap: true,
    zangi: true,
    signal: true,
    telegram: "cloud",
    wechat: "servidor",
    whatsapp: "backup",
  },
  {
    feature: "Traducción nativa en tiempo real",
    Synap: true,
    zangi: false,
    signal: false,
    telegram: "limitada",
    wechat: "zh↔en",
    whatsapp: false,
    highlight: true,
  },
  {
    feature: "Traducción on-device (plaintext no sale)",
    Synap: true,
    zangi: false,
    signal: false,
    telegram: false,
    wechat: false,
    whatsapp: false,
    highlight: true,
  },
  {
    feature: "Wipe / passcode de borrado bajo amenaza",
    Synap: "★ + señuelo",
    zangi: "Premium",
    signal: false,
    telegram: false,
    wechat: false,
    whatsapp: false,
    highlight: true,
  },
  {
    feature: "Chats ocultos con PIN",
    Synap: true,
    zangi: true,
    signal: false,
    telegram: "carpetas",
    wechat: false,
    whatsapp: false,
    highlight: true,
  },
  {
    feature: "★ Post-cuántica híbrida (ML-KEM)",
    Synap: true,
    zangi: false,
    signal: "piloto PQXDH",
    telegram: false,
    wechat: false,
    whatsapp: false,
    highlight: true,
  },
  {
    feature: "★ Key Transparency Log",
    Synap: true,
    zangi: false,
    signal: "en desarrollo",
    telegram: false,
    wechat: false,
    whatsapp: "cerrado",
    highlight: true,
  },
  {
    feature: "★ Dead Man's Switch",
    Synap: true,
    zangi: false,
    signal: false,
    telegram: false,
    wechat: false,
    whatsapp: false,
    highlight: true,
  },
  {
    feature: "★ FIDO2 / WebAuthn (anti SIM-swap)",
    Synap: true,
    zangi: false,
    signal: false,
    telegram: false,
    wechat: false,
    whatsapp: false,
    highlight: true,
  },
  {
    feature: "VPN / túnel anti-censura del tráfico",
    Synap: "roadmap",
    zangi: "Premium",
    signal: false,
    telegram: "proxy MTProto",
    wechat: false,
    whatsapp: false,
  },
  {
    feature: "Protocolo abierto / auditable",
    Synap: "AGPL + PQ",
    zangi: "cerrado",
    signal: true,
    telegram: "parcial",
    wechat: false,
    whatsapp: false,
  },
  {
    feature: "Sin anuncios (plan de pago / nonprofit)",
    Synap: "Premium",
    zangi: true,
    signal: true,
    telegram: "Premium",
    wechat: false,
    whatsapp: false,
  },
];

function Cell({ value }: { value: CellValue }) {
  if (value === true) {
    return (
      <div className="flex justify-center">
        <svg className="h-5 w-5 text-success" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="flex justify-center">
        <svg className="h-5 w-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    );
  }
  return (
    <span className="text-xs text-warning font-medium bg-warning/15 px-2 py-1 rounded-full">
      {value}
    </span>
  );
}

export function Comparison() {
  return (
    <section id="comparativa" className="bg-primary-soft py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-12">
          <span className="inline-block rounded-full bg-accent/20 px-4 py-1.5 text-sm font-medium text-accent-light mb-4">
            Comparativa · Norte
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
            Synap frente al resto
          </h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Orden: Synap → Zangi → Signal → Telegram → WeChat → WhatsApp.
            De Zangi tomamos lo mejor (sin SIM, sin directorio, wipe, E2E
            device-only) y sumamos el paquete de seguridad absoluta abierta (AGPL).
          </p>
        </div>

        <div className="rounded-2xl bg-surface border border-white/10 overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-5 text-gray-400 font-semibold text-sm">
                  Característica
                </th>
                <th className="p-5 text-center font-bold text-sm">
                  <div className="bg-accent text-black rounded-lg py-2 px-3">
                    Synap
                  </div>
                </th>
                <th className="p-5 text-center font-semibold text-sm text-gray-300">
                  Zangi
                </th>
                <th className="p-5 text-center font-semibold text-sm text-gray-400">
                  Signal
                </th>
                <th className="p-5 text-center font-semibold text-sm text-gray-400">
                  Telegram
                </th>
                <th className="p-5 text-center font-semibold text-sm text-gray-400">
                  WeChat
                </th>
                <th className="p-5 text-center font-semibold text-sm text-gray-400">
                  WhatsApp
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, index) => (
                <tr
                  key={row.feature}
                  className={
                    row.highlight
                      ? "bg-accent/5"
                      : index % 2 === 0
                        ? "bg-surface"
                        : "bg-white/[0.03]"
                  }
                >
                  <td className="p-4 text-sm font-medium text-white">
                    {row.feature}
                  </td>
                  <td className="p-4 text-center bg-accent/10">
                    <Cell value={row.Synap} />
                  </td>
                  <td className="p-4 text-center">
                    <Cell value={row.zangi} />
                  </td>
                  <td className="p-4 text-center">
                    <Cell value={row.signal} />
                  </td>
                  <td className="p-4 text-center">
                    <Cell value={row.telegram} />
                  </td>
                  <td className="p-4 text-center">
                    <Cell value={row.wechat} />
                  </td>
                  <td className="p-4 text-center">
                    <Cell value={row.whatsapp} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-center text-sm text-gray-400 max-w-3xl mx-auto">
          Zangi: claims públicos (AES-GCM E2E, Private Number, device-only,
          Wipe Passcode / VPN Premium) — closed-source sin auditoría pública
          verificada. Synap: monorepo vivo + AGPL norte. Nov 2026.
        </p>
      </div>
    </section>
  );
}
