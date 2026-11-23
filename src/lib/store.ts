"use client";
// Estado global de la app (Zustand): usuario, vista activa y sala abierta.
import { create } from "zustand";

export type PublicUser = {
  id: string;
  email: string | null;
  phone: string | null;
  username: string | null;
  name: string;
  role: "PLAYER" | "HOST" | "ADMIN";
  balance: number;
  points?: number; // La Tómbola Caliente (puntos gratis)
};

export type AppView = "lobby" | "room" | "wallet" | "admin" | "tombola";

interface AppState {
  user: PublicUser | null;
  authReady: boolean;
  view: AppView;
  roomId: string | null;
  roomToken: string | null;
  setUser: (u: PublicUser | null) => void;
  setAuthReady: (v: boolean) => void;
  setView: (v: AppView) => void;
  openRoom: (roomId: string, token: string) => void;
  closeRoom: () => void;
  refreshBalance: (balance: number) => void;
  refreshPoints: (points: number) => void;
  logout: () => Promise<void>;
}

export const useApp = create<AppState>((set) => ({
  user: null,
  authReady: false,
  view: "lobby",
  roomId: null,
  roomToken: null,
  setUser: (u) => set({ user: u, authReady: true }),
  setAuthReady: (v) => set({ authReady: v }),
  setView: (v) => set({ view: v }),
  openRoom: (roomId, token) => set({ roomId, roomToken: token, view: "room" }),
  closeRoom: () => set({ roomId: null, roomToken: null, view: "lobby" }),
  refreshBalance: (balance) =>
    set((s) => (s.user ? { user: { ...s.user, balance } } : s)),
  refreshPoints: (points) =>
    set((s) => (s.user ? { user: { ...s.user, points } } : s)),
  logout: async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    set({ user: null, view: "lobby", roomId: null, roomToken: null });
  },
}));

/** Helper para llamadas autenticadas (incluye cookie automáticamente). */
export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && typeof data === "object" && "error" in data)
      ? String((data as { error: unknown }).error)
      : `Error ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}
