"use client";
// Billetera: saldo, historial ledger y recarga (MercadoPago + transferencia).
import { useEffect, useState } from "react";
import { apiFetch, useApp } from "@/lib/store";
import { formatUSD, formatUSDShort, dollarsToCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";

interface LedgerEntry {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export function WalletView() {
  const { user, refreshBalance } = useApp();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [rechargeOpen, setRechargeOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await apiFetch<{ balance: number; ledger: LedgerEntry[] }>("/api/wallet");
      setLedger(d.ledger);
      refreshBalance(d.balance);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const typeLabel = (t: string) =>
    t === "PURCHASE" ? "Compra" : t === "PRIZE" ? "Premio" : t === "RECHARGE" ? "Recarga" : t === "PAYOUT" ? "Retiro" : t === "REFUND" ? "Reembolso" : t;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-5">
      {/* Saldo */}
      <Card className="border-gold/30 bg-gradient-to-br from-card to-card/60">
        <CardContent className="pt-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Saldo disponible</div>
          <div className="mt-1 text-4xl font-black text-gold tabular-nums">{formatUSD(user?.balance ?? 0)}</div>
          <div className="mt-1 text-xs text-muted-foreground">disponible</div>
          <Dialog open={rechargeOpen} onOpenChange={setRechargeOpen}>
            <DialogTrigger asChild>
              <Button className="mt-4 w-full gap-1">
                <Plus className="h-4 w-4" /> Recargar créditos
              </Button>
            </DialogTrigger>
            <RechargeDialog onSuccess={() => { load(); setRechargeOpen(false); }} />
          </Dialog>
        </CardContent>
      </Card>

      {/* Historial */}
      <Card className="border-border/60 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Movimientos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : ledger.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Sin movimientos aún</div>
          ) : (
            <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
              {ledger.map((e) => (
                <div key={e.id} className="flex items-center justify-between border-b border-border/30 py-2 last:border-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      e.amount >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                    }`}>
                      {e.amount >= 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{e.description ?? typeLabel(e.type)}</div>
                      <div className="text-[0.7rem] text-muted-foreground">{new Date(e.createdAt).toLocaleString("es")}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold tabular-nums ${e.amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {e.amount >= 0 ? "+" : ""}{formatUSDShort(e.amount)}
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground">{formatUSDShort(e.balanceAfter)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RechargeDialog({ onSuccess }: { onSuccess: () => void }) {
  const [tab, setTab] = useState("mp");
  // MercadoPago (montos en dólares USD)
  const [mpAmount, setMpAmount] = useState(5);
  const [mpBusy, setMpBusy] = useState(false);
  // Transferencia
  const [trAmount, setTrAmount] = useState(5);
  const [trMethod, setTrMethod] = useState("Bank Transfer");
  const [trCountry, setTrCountry] = useState("AR");
  const [trRef, setTrRef] = useState("");
  const [trNote, setTrNote] = useState("");
  const [trBusy, setTrBusy] = useState(false);

  const doMercadoPago = async () => {
    const cents = dollarsToCents(mpAmount);
    if (cents < 100) {
      toast.error("Monto mínimo $1.00 USD");
      return;
    }
    setMpBusy(true);
    try {
      const d = await apiFetch<{ initPoint: string; configured?: boolean; error?: string }>(
        "/api/payments/mercadopago/preference",
        { method: "POST", body: JSON.stringify({ amount: cents }) },
      );
      if (d.initPoint) {
        window.location.href = d.initPoint;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "MercadoPago no disponible. Usa transferencia.");
    } finally {
      setMpBusy(false);
    }
  };

  const doTransfer = async () => {
    const cents = dollarsToCents(trAmount);
    if (cents < 100) {
      toast.error("Monto mínimo $1.00 USD");
      return;
    }
    setTrBusy(true);
    try {
      await apiFetch("/api/payments/transfers", {
        method: "POST",
        body: JSON.stringify({
          amount: cents,
          paymentMethod: trMethod,
          country: trCountry,
          referenceNumber: trRef,
          note: trNote,
        }),
      });
      toast.success("Solicitud enviada. Un admin la revisará.");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setTrBusy(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Recargar créditos</DialogTitle>
      </DialogHeader>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="mp">MercadoPago</TabsTrigger>
          <TabsTrigger value="tr">Transferencia</TabsTrigger>
        </TabsList>

        <TabsContent value="mp" className="space-y-3">
          <div className="space-y-1">
            <Label>Monto (USD)</Label>
            <Input type="number" min={1} step={0.5} value={mpAmount} onChange={(e) => setMpAmount(Number(e.target.value))} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[5, 10, 20, 50].map((v) => (
              <button key={v} onClick={() => setMpAmount(v)}
                className={`rounded px-3 py-1 text-sm ${mpAmount === v ? "bg-primary text-primary-foreground" : "bg-secondary/60"}`}>
                ${v}
              </button>
            ))}
          </div>
          <Button onClick={doMercadoPago} disabled={mpBusy} className="w-full">
            {mpBusy ? "Redirigiendo…" : `Pagar ${formatUSDShort(dollarsToCents(mpAmount))} con MercadoPago`}
          </Button>
          <p className="text-center text-[0.7rem] text-muted-foreground">
            Checkout Pro · Acreditación automática vía webhook
          </p>
        </TabsContent>

        <TabsContent value="tr" className="space-y-3">
          <div className="space-y-1">
            <Label>Monto (USD)</Label>
            <Input type="number" min={1} step={0.5} value={trAmount} onChange={(e) => setTrAmount(Number(e.target.value))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Método</Label>
              <Input value={trMethod} onChange={(e) => setTrMethod(e.target.value)} placeholder="Bank Transfer / Wise / PIX" />
            </div>
            <div className="space-y-1">
              <Label>País</Label>
              <Input value={trCountry} onChange={(e) => setTrCountry(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>N° de referencia</Label>
            <Input value={trRef} onChange={(e) => setTrRef(e.target.value)} placeholder="Comprobante de transferencia" />
          </div>
          <div className="space-y-1">
            <Label>Nota (opcional)</Label>
            <Input value={trNote} onChange={(e) => setTrNote(e.target.value)} placeholder="Detalle adicional" />
          </div>
          <Button onClick={doTransfer} disabled={trBusy || !trRef} className="w-full">
            {trBusy ? "Enviando…" : "Enviar solicitud"}
          </Button>
          <p className="text-center text-[0.7rem] text-muted-foreground">
            Un administrador acreditará los créditos al aprobar.
          </p>
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}
