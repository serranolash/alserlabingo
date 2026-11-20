"use client";
// Vista de autenticación: login / registro con email + password.
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function AuthView() {
  const { login, register } = useAuth();
  const [busy, setBusy] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");

  // Register state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(loginEmail, loginPass);
      toast.success("Sesión iniciada");
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
      await register(regEmail, regName, regPass);
      toast.success("Cuenta creada. ¡Bienvenido!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="felt-bg flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-gold text-3xl font-black text-[#3a1d05] shadow-lg">
          75
        </div>
        <h1 className="text-3xl font-black tracking-tight text-gold">Alserla Bingo</h1>
        <p className="mt-1 text-sm text-muted-foreground">Salas en vivo · Sorteo determinístico</p>
      </div>

      <Card className="w-full max-w-sm border-border/60 bg-card/90 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-center text-lg">Comenzar a jugar</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Ingresar</TabsTrigger>
              <TabsTrigger value="register">Registrarse</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={doLogin} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="le">Email</Label>
                  <Input id="le" type="email" required value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)} placeholder="tu@email.com" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lp">Contraseña</Label>
                  <Input id="lp" type="password" required value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)} placeholder="••••••" />
                </div>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "Ingresando…" : "Ingresar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={doRegister} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="rn">Nombre</Label>
                  <Input id="rn" required value={regName}
                    onChange={(e) => setRegName(e.target.value)} placeholder="Tu nombre" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="re">Email</Label>
                  <Input id="re" type="email" required value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)} placeholder="tu@email.com" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rp">Contraseña (mín. 6)</Label>
                  <Input id="rp" type="password" required value={regPass}
                    onChange={(e) => setRegPass(e.target.value)} placeholder="••••••" />
                </div>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "Creando…" : "Crear cuenta"}
                </Button>
                <p className="text-center text-[0.7rem] text-muted-foreground">
                  Recibes $5.00 USD de saldo de bienvenida
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <footer className="mt-auto pt-8 text-center text-[0.7rem] text-muted-foreground">
        Alserla Bingo · PWA instalable · Pagos híbridos
      </footer>
    </div>
  );
}
