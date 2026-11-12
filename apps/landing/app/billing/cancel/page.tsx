export default function BillingCancelPage() {
  return (
    <main className="min-h-screen bg-primary text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <img
          src="/Synap-logo.png"
          alt="Synap"
          className="mx-auto h-16 w-16 rounded-xl mb-6"
        />
        <h1 className="font-serif text-3xl font-bold mb-3">Pago cancelado</h1>
        <p className="text-gray-300 mb-8 leading-relaxed">
          No se cobró nada. Puedes volver a intentarlo cuando quieras desde Ajustes.
        </p>
        <a
          href="Synap://billing/cancel"
          className="inline-block rounded-xl bg-white/10 border border-white/15 px-8 py-3.5 font-semibold text-white hover:bg-white/15 transition-all"
        >
          Volver a la app
        </a>
      </div>
    </main>
  );
}
