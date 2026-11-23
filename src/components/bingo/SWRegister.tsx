"use client";
// Registro del Service Worker (PWA) — client component para evitar script inline.
import { useEffect } from "react";

export function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignora errores de registro */
      });
    }
  }, []);
  return null;
}
