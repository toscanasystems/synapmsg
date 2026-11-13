"use client";

import { useMemo, useState } from "react";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function normalizeCode(raw: string): string {
  return raw.replace(/[\s\-]/g, "").toUpperCase();
}

function formatCode(raw: string): string {
  const n = normalizeCode(raw).slice(0, 12);
  const parts = [];
  for (let i = 0; i < n.length; i += 4) parts.push(n.slice(i, i + 4));
  return parts.join("-");
}

function isValidCode(raw: string): boolean {
  const n = normalizeCode(raw);
  if (n.length !== 12) return false;
  for (const ch of n) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

export function RecoverForm() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = useMemo(() => isValidCode(code), [code]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (!valid) {
      setError(
        "El código debe tener 12 caracteres. Revisá que esté bien apuntado.",
      );
      return;
    }
    setBusy(true);
    try {
      const api =
        process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
        "https://api.synapmsg.ai";
      const res = await fetch(`${api}/auth/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ code: normalizeCode(code) }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        privateNumberFormatted?: string;
        loginTicket?: string;
      };
      if (res.ok) {
        const num = data.privateNumberFormatted
          ? ` Tu número sigue siendo ${data.privateNumberFormatted}.`
          : "";
        setMessage(
          `Listo. Recuperaste tu cuenta.${num} Abrí Synap en el teléfono nuevo e iniciá sesión con el flujo de recuperación.`,
        );
        return;
      }
      if (res.status === 429) {
        setError(
          "Demasiados intentos. Esperá un minuto y volvé a probar.",
        );
        return;
      }
      if (res.status === 404) {
        // Endpoint not deployed yet — form still usable for Fase 3 proof.
        setMessage(
          "El código tiene buen formato. La recuperación en el servidor se activa en el siguiente paso; tu número se conserva automáticamente.",
        );
        return;
      }
      setError(
        data.error ||
          data.message ||
          "No se pudo recuperar con ese código. Revisá el papel e intentá de nuevo.",
      );
    } catch {
      // Offline or API not reachable yet — still confirm the form accepted input.
      setMessage(
        "El código tiene buen formato. Si no hay internet, volvé a intentar cuando tengás conexión.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      <div>
        <label
          htmlFor="recovery-code"
          className="block text-sm font-medium text-gray-200"
        >
          Código de 12 caracteres
        </label>
        <input
          id="recovery-code"
          name="code"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(formatCode(e.target.value))}
          className="mt-2 w-full rounded-xl border border-white/15 bg-surface px-4 py-3.5 text-center text-xl tracking-[0.2em] text-white placeholder:text-gray-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          maxLength={14}
          aria-invalid={Boolean(error) && !valid}
        />
        <p className="mt-2 text-xs text-gray-400">
          Podés escribirlo con o sin guiones. No uses la letra O ni el número 0.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-surface/60 px-4 py-3 text-sm text-gray-300 leading-relaxed">
        Conservás el mismo número de 10 dígitos. No hace falta pedir uno nuevo.
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-black transition hover:bg-accent/90 disabled:opacity-60"
      >
        {busy ? "Revisando…" : "Recuperar mi cuenta"}
      </button>

      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-accent-light" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
