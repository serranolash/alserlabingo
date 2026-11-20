"use client";
// Modal de Cobro de Premio — se abre al ganar para que el jugador ingrese
// sus datos de recepción de fondos (Argentina o Internacional/Cripto).
import { useState } from "react";
import { apiFetch } from "@/lib/store";
import { formatUSD } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  claimId: string | null;
  amount: number; // centavos USD
  prizeType: string;
  onSubmitted: () => void;
}

export function PayoutModal({ open, onOpenChange, claimId, amount, prizeType, onSubmitted }: Props) {
  const [country, setCountry] = useState<"AR" | "INTERNACIONAL">("AR");
  // AR
  const [arMethod, setArMethod] = useState("ALIAS");
  const [alias, setAlias] = useState("");
  const [cbu, setCbu] = useState("");
  const [titular, setTitular] = useState("");
  const [banco, setBanco] = useState("");
  // Internacional
  const [intlMethod, setIntlMethod] = useState("USDT");
  const [wallet, setWallet] = useState("");
  const [network, setNetwork] = useState("TRC20");
  const [intlEmail, setIntlEmail] = useState("");
  const [intlTitular, setIntlTitular] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setAlias(""); setCbu(""); setTitular(""); setBanco("");
    setWallet(""); setIntlEmail(""); setIntlTitular(""); setNotes("");
  };

  const handleSubmit = async () => {
    if (!claimId) return;
    if (country === "AR" && !titular.trim()) {
      toast.error("Ingresa el nombre del titular");
      return;
    }
    if (country === "INTERNACIONAL" && (!wallet.trim() && !intlEmail.trim())) {
      toast.error("Ingresa la wallet o correo de recepción");
      return;
    }
    const method = country === "AR" ? arMethod : intlMethod;
    const accountData =
      country === "AR"
        ? arMethod === "ALIAS"
          ? { titular: titular.trim(), alias: alias.trim(), banco: banco.trim() }
          : { titular: titular.trim(), cbu: cbu.trim(), banco: banco.trim() }
        : intlMethod === "USDT"
          ? { titular: intlTitular.trim(), wallet: wallet.trim(), network }
          : { titular: intlTitular.trim(), id: (intlEmail || wallet).trim(), method: intlMethod };

    setBusy(true);
    try {
      await apiFetch("/api/payouts", {
        method: "POST",
        body: JSON.stringify({ claimId, country, method, accountData, notes: notes.trim() || undefined }),
      });
      toast.success("Solicitud de cobro enviada. El admin procesará tu pago.");
      reset();
      onOpenChange(false);
      onSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gold">¡Premio ganado! Cobro de {prizeType}</DialogTitle>
          <DialogDescription>
            Monto: <span className="font-bold text-gold">{formatUSD(amount)}</span>. Ingresa tus
            datos de recepción para recibir el pago.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={country} onValueChange={(v) => setCountry(v as "AR" | "INTERNACIONAL")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="AR">Argentina</TabsTrigger>
            <TabsTrigger value="INTERNACIONAL">Internacional / Cripto</TabsTrigger>
          </TabsList>

          {/* Argentina */}
          <TabsContent value="AR" className="space-y-3">
            <div className="flex gap-2">
              {["ALIAS", "CBU"].map((m) => (
                <button
                  key={m}
                  onClick={() => setArMethod(m)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-bold ${
                    arMethod === m ? "bg-primary text-primary-foreground" : "bg-secondary/60"
                  }`}
                >
                  {m === "ALIAS" ? "Alias" : "CBU/CVU"}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label>Nombre del titular</Label>
              <Input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Nombre y apellido" />
            </div>
            {arMethod === "ALIAS" ? (
              <div className="space-y-1">
                <Label>Alias</Label>
                <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="tu.alias.mp" />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>CBU/CVU</Label>
                <Input value={cbu} onChange={(e) => setCbu(e.target.value)} placeholder="0000003100000000000000" />
              </div>
            )}
            <div className="space-y-1">
              <Label>Banco / Billetera</Label>
              <Input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="MercadoPago / Ualá / Brubank / Banco..." />
            </div>
          </TabsContent>

          {/* Internacional / Cripto */}
          <TabsContent value="INTERNACIONAL" className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {["USDT", "BINANCE", "PAYPAL", "ZELLE"].map((m) => (
                <button
                  key={m}
                  onClick={() => setIntlMethod(m)}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold ${
                    intlMethod === m ? "bg-primary text-primary-foreground" : "bg-secondary/60"
                  }`}
                >
                  {m === "USDT" ? "USDT" : m === "BINANCE" ? "Binance Pay" : m === "PAYPAL" ? "PayPal" : "Zelle"}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label>Titular</Label>
              <Input value={intlTitular} onChange={(e) => setIntlTitular(e.target.value)} placeholder="Nombre del titular" />
            </div>
            {intlMethod === "USDT" ? (
              <>
                <div className="space-y-1">
                  <Label>Red</Label>
                  <select
                    value={network}
                    onChange={(e) => setNetwork(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="TRC20">TRC20 (Tron)</option>
                    <option value="BEP20">BEP20 (BSC)</option>
                    <option value="POLYGON">Polygon</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Wallet USDT</Label>
                  <Input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="Dirección de wallet" />
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <Label>{intlMethod === "BINANCE" ? "Binance Pay ID" : intlMethod === "PAYPAL" ? "Email PayPal" : "Email / teléfono Zelle"}</Label>
                <Input value={intlEmail} onChange={(e) => setIntlEmail(e.target.value)} placeholder={intlMethod === "PAYPAL" ? "tu@email.com" : "ID o email"} />
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="space-y-1">
          <Label>Notas (opcional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Aclaraciones adicionales" rows={2} />
        </div>

        <Button onClick={handleSubmit} disabled={busy} className="w-full">
          {busy ? "Enviando…" : `Solicitar cobro de ${formatUSD(amount)}`}
        </Button>
        <p className="text-center text-[0.7rem] text-muted-foreground">
          El administrador procesará tu pago y marcará como pagado con comprobante.
        </p>
      </DialogContent>
    </Dialog>
  );
}
