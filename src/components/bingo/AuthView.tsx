"use client";
// Vista de autenticación simple para adultos mayores.
// Registro: Nombre + Celular (WhatsApp) + PIN de 4 dígitos. Email opcional.
// Login: celular/usuario/email + clave. Texto grande, mostrar/ocultar clave,
// "Recordar mi cuenta en este teléfono" activado por defecto.
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { PWAInstallBanner } from "./PWAInstallBanner";

export function AuthView() {
  const { login, register } = useAuth();
  const [busy, setBusy] = useState(false);

  // Login state
  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginRemember, setLoginRemember] = useState(true);
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Register state
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPin, setRegPin] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regRemember, setRegRemember] = useState(true);
  const [showRegPin, setShowRegPin] = useState(false);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(loginId, loginPass, loginRemember);
      toast.success("¡Bienvenido de nuevo!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register({
        name: regName,
        phone: regPhone || undefined,
        email: regEmail || undefined,
        password: regPin,
        remember: regRemember,
      });
      toast.success("¡Cuenta creada! Recibiste $5.00 USD de bienvenida");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setBusy(false);
    }
  };

  const inputClass = "h-12 text-lg";
  const btnClass = "h-12 text-lg font-bold";

  return (
    <div className="felt-bg flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-gold text-3xl font-black text-[#3a1d05] shadow-lg">
          75
        </div>
        <h1 className="text-3xl font-black tracking-tight text-gold">Alserla Bingo</h1>
        <p className="mt-1 text-sm text-muted-foreground">Salas en vivo · Sorteo automático</p>
      </div>

      <Card className="w-full max-w-md border-border/60 bg-card/90 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-center text-xl">Comenzar a jugar</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="register">
            <TabsList className="grid h-11 w-full grid-cols-2 text-base">
              <TabsTrigger value="register" className="text-base">Crear cuenta</TabsTrigger>
              <TabsTrigger value="login" className="text-base">Ya tengo cuenta</TabsTrigger>
            </TabsList>

            {/* Registro simple */}
            <TabsContent value="register">
              <form onSubmit={doRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rn" className="text-base">Tu Nombre y Apellido</Label>
                  <Input id="rn" autoComplete="name" required value={regName}
                    onChange={(e) => setRegName(e.target.value)} placeholder="Ej: María González" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rp" className="text-base">Tu número de celular (WhatsApp)</Label>
                  <Input id="rp" autoComplete="tel" type="tel" value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)} placeholder="Ej: 11 1234-5678" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rpin" className="text-base">Crea una clave fácil de recordar (ej. 4 números)</Label>
                  <div className="relative">
                    <Input id="rpin" autoComplete="new-password" required type={showRegPin ? "text" : "password"}
                      inputMode="numeric" value={regPin}
                      onChange={(e) => setRegPin(e.target.value)} placeholder="Ej: 1234" className={inputClass} />
                    <button type="button" onClick={() => setShowRegPin((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-gold"
                      aria-label="Ver clave">
                      {showRegPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <button type="button" onClick={() => setShowRegPin((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-gold">
                    {showRegPin ? "Ocultar clave" : "Ver clave"}
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="re" className="text-sm text-muted-foreground">Email (opcional)</Label>
                  <Input id="re" autoComplete="email" type="email" value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)} placeholder="Solo si quieres" className="h-11 text-base" />
                </div>
                <label className="flex items-center gap-2 rounded-md bg-secondary/40 p-2.5">
                  <Checkbox checked={regRemember} onCheckedChange={(v) => setRegRemember(v === true)} />
                  <span className="text-sm font-medium">Recordar mi cuenta en este teléfono</span>
                </label>
                <Button type="submit" disabled={busy} className={`w-full ${btnClass}`}>
                  {busy ? "Creando…" : "Crear mi cuenta"}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Recibes <span className="font-bold text-gold">$5.00 USD</span> de saldo de bienvenida
                </p>
              </form>
            </TabsContent>

            {/* Login */}
            <TabsContent value="login">
              <form onSubmit={doLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="li" className="text-base">Tu celular o usuario</Label>
                  <Input id="li" autoComplete="username" required value={loginId}
                    onChange={(e) => setLoginId(e.target.value)} placeholder="Celular o usuario" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lp" className="text-base">Tu clave</Label>
                  <div className="relative">
                    <Input id="lp" autoComplete="current-password" required type={showLoginPass ? "text" : "password"}
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)} placeholder="Tu clave" className={inputClass} />
                    <button type="button" onClick={() => setShowLoginPass((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-gold"
                      aria-label="Ver clave">
                      {showLoginPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <button type="button" onClick={() => setShowLoginPass((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-gold">
                    {showLoginPass ? "Ocultar clave" : "Ver clave"}
                  </button>
                </div>
                <label className="flex items-center gap-2 rounded-md bg-secondary/40 p-2.5">
                  <Checkbox checked={loginRemember} onCheckedChange={(v) => setLoginRemember(v === true)} />
                  <span className="text-sm font-medium">Recordar mi cuenta en este teléfono</span>
                </label>
                <Button type="submit" disabled={busy} className={`w-full ${btnClass}`}>
                  {busy ? "Ingresando…" : "Ingresar"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Banner de instalación PWA */}
      <div className="mt-5 w-full max-w-md">
        <PWAInstallBanner />
      </div>

      <footer className="mt-auto pt-6 text-center text-xs text-muted-foreground">
        Alserla Bingo · PWA instalable · Pagos en USD
      </footer>
    </div>
  );
}
