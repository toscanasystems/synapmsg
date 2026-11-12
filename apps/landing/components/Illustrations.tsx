/** Line SVGs — accent `#30B0B0` + gray. No faces, flags, or stock photos. */

const ACCENT = "#30B0B0";
const GRAY = "#8A8A8A";

type SvgProps = { className?: string };

export function IlluPhoneNumber({ className }: SvgProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="28" y="8" width="44" height="78" rx="6" stroke={ACCENT} strokeWidth="2" />
      <rect x="36" y="18" width="28" height="48" rx="2" stroke={GRAY} strokeWidth="1.5" />
      <circle cx="50" cy="76" r="3" stroke={GRAY} strokeWidth="1.5" />
      <text
        x="50"
        y="46"
        textAnchor="middle"
        fill={ACCENT}
        fontSize="7"
        fontFamily="monospace"
      >
        4729679274
      </text>
      {/* key crossed out */}
      <path
        d="M78 28h18v8h-4v10h-6V36h-8V28z"
        stroke={GRAY}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="84" cy="32" r="3" stroke={GRAY} strokeWidth="1.5" />
      <path d="M76 22l28 28" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IlluShareNoSearch({ className }: SvgProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text x="8" y="28" fill={ACCENT} fontSize="9" fontFamily="monospace">
        10 dígitos
      </text>
      <path
        d="M48 24h18M66 24l-6-5M66 24l-6 5"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M48 40h18M66 40l-6-5M66 40l-6 5"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="72" y="10" width="22" height="28" rx="3" stroke={GRAY} strokeWidth="1.5" />
      <rect x="72" y="48" width="22" height="28" rx="3" stroke={GRAY} strokeWidth="1.5" />
      {/* magnifier crossed */}
      <circle cx="30" cy="72" r="12" stroke={GRAY} strokeWidth="1.5" />
      <path d="M38 80l10 10" stroke={GRAY} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M18 60l28 28" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IlluEncryptBeforeServer({ className }: SvgProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="6" y="28" width="32" height="20" rx="4" stroke={GRAY} strokeWidth="1.5" />
      <path d="M14 38h16" stroke={GRAY} strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M42 38h16M58 38l-5-4M58 38l-5 4"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* lock */}
      <rect x="62" y="30" width="22" height="18" rx="3" stroke={ACCENT} strokeWidth="2" />
      <path
        d="M68 30v-6a5 5 0 0110 0v6"
        stroke={ACCENT}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="73" cy="39" r="2" fill={ACCENT} />
      <path
        d="M88 38h10M98 38l-5-4M98 38l-5 4"
        stroke={GRAY}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* server box */}
      <rect x="88" y="55" width="26" height="28" rx="3" stroke={GRAY} strokeWidth="1.5" />
      <path d="M94 64h14M94 72h14" stroke={GRAY} strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M73 52v10M73 62l8 8"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IlluNoPlainOnServer({ className }: SvgProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="18" y="22" width="84" height="52" rx="6" stroke={GRAY} strokeWidth="1.5" />
      <path d="M18 36h84" stroke={GRAY} strokeWidth="1.5" />
      <circle cx="28" cy="29" r="2.5" fill={ACCENT} />
      <circle cx="38" cy="29" r="2.5" fill={GRAY} />
      <circle cx="48" cy="29" r="2.5" fill={GRAY} />
      <rect x="36" y="48" width="48" height="16" rx="3" stroke={ACCENT} strokeWidth="2" />
      <path
        d="M52 48v-5a8 8 0 0116 0v5"
        stroke={ACCENT}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <text x="60" y="59" textAnchor="middle" fill={ACCENT} fontSize="7" fontFamily="monospace">
        ···
      </text>
    </svg>
  );
}

export function IlluPrivateOrCloud({ className }: SvgProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="10" y="28" width="42" height="44" rx="6" stroke={ACCENT} strokeWidth="2" />
      <path
        d="M26 48h10v10H26z"
        stroke={ACCENT}
        strokeWidth="1.5"
      />
      <path
        d="M29 48v-5a6 6 0 0112 0v5"
        stroke={ACCENT}
        strokeWidth="1.5"
      />
      <text x="31" y="82" textAnchor="middle" fill={ACCENT} fontSize="7">
        Privado
      </text>
      <rect x="68" y="28" width="42" height="44" rx="6" stroke={GRAY} strokeWidth="1.5" />
      <path
        d="M78 52c0-8 6-12 11-12s11 4 11 12"
        stroke={GRAY}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M78 52h22v10H78z" stroke={GRAY} strokeWidth="1.5" />
      <text x="89" y="82" textAnchor="middle" fill={GRAY} fontSize="7">
        Nube
      </text>
    </svg>
  );
}

export function IlluTranslateOnDevice({ className }: SvgProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="34" y="8" width="40" height="70" rx="5" stroke={ACCENT} strokeWidth="2" />
      <rect x="40" y="16" width="28" height="44" rx="2" stroke={GRAY} strokeWidth="1.5" />
      <text x="54" y="32" textAnchor="middle" fill={GRAY} fontSize="7">
        Hello
      </text>
      <path d="M54 36v8" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M50 42l4 4 4-4" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
      <text x="54" y="56" textAnchor="middle" fill={ACCENT} fontSize="7">
        Hola
      </text>
      {/* wifi off */}
      <path
        d="M88 28c8 6 8 18 0 24M94 32c5 4 5 12 0 16"
        stroke={GRAY}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="88" cy="40" r="2" fill={GRAY} />
      <path d="M80 24l24 28" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IlluKeyChangeWarn({ className }: SvgProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="24" y="22" width="72" height="48" rx="6" stroke={GRAY} strokeWidth="1.5" />
      <path
        d="M40 42h16v10H40z"
        stroke={ACCENT}
        strokeWidth="1.5"
      />
      <path
        d="M44 42v-5a6 6 0 0112 0v5"
        stroke={ACCENT}
        strokeWidth="1.5"
      />
      <path d="M68 38l8 8M76 38l-8 8" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
      <text x="60" y="84" textAnchor="middle" fill={ACCENT} fontSize="7">
        ¿Confías?
      </text>
    </svg>
  );
}
