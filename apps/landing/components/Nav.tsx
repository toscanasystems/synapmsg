"use client";

import { useEffect, useState } from "react";

const LINKS = [
  { href: "#seguridad", label: "Seguridad" },
  { href: "#empezar", label: "Cómo empezar" },
  { href: "#comparativa", label: "Comparativa" },
  { href: "#planes", label: "Planes" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors ${
        scrolled || open
          ? "bg-primary/95 border-b border-white/10 backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <a href="#top" className="flex items-center gap-3 min-w-0">
          <img
            src="/synapmsg-logo.png"
            alt=""
            className="h-9 w-9 rounded-lg object-cover ring-1 ring-accent/40"
          />
          <span className="text-lg font-bold tracking-tight text-white truncate">
            Synap
          </span>
        </a>

        <nav className="hidden md:flex items-center gap-8 text-sm text-gray-300">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="hover:text-accent-light transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <a
            href="https://media.synapmsg.ai/downloads/synap-android.apk"
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-black hover:bg-accent/90 transition-colors"
          >
            Descargar Android
          </a>
        </div>

        <button
          type="button"
          className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-white"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="text-xl leading-none">{open ? "×" : "☰"}</span>
        </button>
      </div>

      {open ? (
        <div className="md:hidden border-t border-white/10 bg-primary px-6 py-4 space-y-3">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="block py-2 text-gray-200 hover:text-accent-light"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <a
            href="https://media.synapmsg.ai/downloads/synap-android.apk"
            onClick={() => setOpen(false)}
            className="mt-2 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-black"
          >
            Descargar Android
          </a>
        </div>
      ) : null}
    </header>
  );
}
