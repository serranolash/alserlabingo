"use client";
// Háptica — vibración en móvil para near-miss y victorias.
import { useCallback, useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () =>
  typeof navigator !== "undefined" && "vibrate" in navigator;
const getServerSnapshot = () => false;

export function useHaptics() {
  const supported = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const vibrate = useCallback((pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        /* ignora */
      }
    }
  }, []);

  return { supported, vibrate };
}
