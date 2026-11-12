export default function BillingSuccessPage() {
  return (
    <main className="min-h-screen bg-primary text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <img
          src="/Synap-logo.png"
          alt="Synap"
          className="mx-auto h-16 w-16 rounded-xl mb-6"
        />
        <h1 className="font-serif text-3xl font-bold mb-3">Pago recibido</h1>
        <p className="text-gray-300 mb-8 leading-relaxed">
          Synap Premium se activa en segundos. Vuelve a la app para ver tu plan.
        </p>
        <a
          href="Synap://billing/success"
          className="inline-block rounded-xl bg-accent px-8 py-3.5 font-semibold text-black hover:bg-accent/90 transition-all"
        >
          Abrir Synap
        </a>
        <p className="mt-6 text-sm text-gray-500">
          Si la app no abre, ábrela manualmente y entra a Ajustes → Plan.
        </p>
      </div>
    </main>
  );
}
