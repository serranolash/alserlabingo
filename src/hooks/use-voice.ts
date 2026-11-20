"use client";
// Locutor de voz — Web Speech API en español. Canta cada bolilla nueva.
// El estado "enabled" vive en un store externo (persistido en localStorage)
// para evitar setState-in-effect y permitir suscripción reactiva.
import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "alserla-voice-enabled";
const listeners = new Set<() => void>();
let enabledState = true; // default

function readStored(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "true";
}

// Inicializar desde localStorage (una vez, en el cliente).
if (typeof window !== "undefined") {
  enabledState = readStored();
}

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return enabledState;
}

function getServerSnapshot() {
  return true;
}

export function useVoice() {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const supported = useSyncExternalStore(
    () => () => {},
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    () => false,
  );

  const toggle = useCallback(() => {
    enabledState = !enabledState;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(enabledState));
      if (!enabledState && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }
    notify();
  }, []);

  const speak = useCallback(
    (text: string, opts?: { rate?: number; pitch?: number }) => {
      if (!enabledState || typeof window === "undefined" || !("speechSynthesis" in window))
        return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "es-ES";
      u.rate = opts?.rate ?? 0.95;
      u.pitch = opts?.pitch ?? 1;
      const voices = synth.getVoices();
      const esVoice =
        voices.find((v) => v.lang === "es-ES") ||
        voices.find((v) => v.lang.startsWith("es"));
      if (esVoice) u.voice = esVoice;
      synth.speak(u);
    },
    [],
  );

  return { supported, enabled, toggle, speak };
}
