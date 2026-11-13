const DEMOSTRADO = [
  {
    title: "Chat Privado",
    body: "El servidor no guarda el mensaje legible. Guarda un paquete cifrado que no puede leer.",
  },
  {
    title: "Chat Nube",
    body: "Si lo elegís, el servidor sí puede leer y traducir ese chat. La app te avisa antes de activarlo.",
  },
  {
    title: "Traducción en la nube",
    body: "12 idiomas: español, inglés, portugués, francés, italiano, alemán, chino, japonés, coreano, árabe, ruso e hindi. Es la traducción en la nube (chat Nube).",
  },
  {
    title: "Traducción en el teléfono (Privado)",
    body: "ML Kit on-device. Probado: inglés y español. Se baja una vez; después no sale del teléfono. Sin DeepL en Privado.",
  },
  {
    title: "Cuenta sin SIM",
    body: "Al instalar se te asigna un número de 10 dígitos. Sin correo y sin SIM. El correo es opcional para recuperar.",
  },
  {
    title: "Llamadas de voz y video (1 a 1)",
    body: "WebRTC con relé TURN: la IP del peer no se comparte. Probado entre teléfonos reales.",
  },
  {
    title: "Llamadas de voz en grupo",
    body: "Hasta 8 en malla (sin mezclador en el servidor). Salir no corta la llamada para los demás. Relé TURN igual que en 1 a 1. La prueba en vivo con tres teléfonos sigue pendiente.",
  },
];

const TODAVIA_NO = [
  "Wipe remoto, PIN de coacción y llaves físicas como paquete cerrado.",
  "Más pares on-device que inglés↔español demostrados en dispositivo.",
  "Prueba en vivo de llamada de grupo con tres teléfonos (matriz de 5).",
];
export function SecurityExplained() {
  return (
    <section id="demostrado" className="bg-primary-soft py-24 border-t border-white/5">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-3xl mb-14">
          <p className="text-accent-light text-sm font-medium uppercase tracking-wider mb-3">
            Honestidad
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
            Demostrado vs todavía no
          </h2>
          <p className="text-lg text-gray-300 leading-relaxed">
            Decimos solo lo que ya funciona. Lo demás espera su turno.
          </p>
        </div>

        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <h3 className="text-xl font-semibold text-white mb-6">Demostrado</h3>
            <ul className="space-y-8">
              {DEMOSTRADO.map((p) => (
                <li key={p.title} className="border-l-2 border-accent/60 pl-6">
                  <h4 className="text-lg font-semibold text-white mb-2">{p.title}</h4>
                  <p className="text-gray-300 leading-relaxed">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white mb-6">Todavía no</h3>
            <ul className="space-y-4 text-gray-300">
              {TODAVIA_NO.map((item) => (
                <li key={item} className="border-l-2 border-white/15 pl-6 leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
