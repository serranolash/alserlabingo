"use client";
// Hook de autenticación: carga el usuario al montar, login, registro, logout.
import { useCallback, useEffect } from "react";
import { apiFetch, useApp } from "@/lib/store";

export function useAuth() {
  const { user, authReady, setUser, setAuthReady } = useApp();

  useEffect(() => {
    let active = true;
    apiFetch<{ user: unknown }>("/api/auth/me")
      .then((d) => {
        if (active) setUser(d.user as never);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
    };
  }, [setUser, setAuthReady]);

  const login = useCallback(
    async (identifier: string, password: string, remember: boolean) => {
      const d = await apiFetch<{ user: unknown }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password, remember }),
      });
      setUser(d.user as never);
      return d.user;
    },
    [setUser],
  );

  const register = useCallback(
    async (params: {
      name: string;
      phone?: string;
      username?: string;
      email?: string;
      password: string;
      remember: boolean;
    }) => {
      const d = await apiFetch<{ user: unknown }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(params),
      });
      setUser(d.user as never);
      return d.user;
    },
    [setUser],
  );

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, [setUser]);

  return { user, authReady, login, register, logout };
}
