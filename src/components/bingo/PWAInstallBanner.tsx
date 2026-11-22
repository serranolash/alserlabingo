"use client";
// Banner de instalación PWA + guía visual paso a paso + botón de ayuda por WhatsApp.
// Pensado para adultos mayores: textos grandes, iconos claros, lenguaje amigable.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Download, MessageCircle, Share, Plus, CheckCircle2 } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches,
  );
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "";

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } else {
      // Sin soporte nativo (iPhone/Safari) → guía visual
      setGuideOpen(true);
    }
  };

  if (installed) {
    return whatsapp ? (
      <a
        href={`https://wa.me/${whatsapp}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white"
      >
        <MessageCircle className="h-5 w-5" /> ¿Necesitas ayuda? Escríbenos por WhatsApp
      </a>
    ) : null;
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <Button
          onClick={handleClick}
          className="h-12 gap-2 bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700"
        >
          <Download className="h-5 w-5" /> Instalar Alserla Bingo en mi celular
        </Button>
        {whatsapp && (
          <a
            href={`https://wa.me/${whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm font-bold text-emerald-400"
          >
            <MessageCircle className="h-5 w-5" /> ¿Necesitas ayuda? Escríbenos por WhatsApp
          </a>
        )}
      </div>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-black text-gold">
              Instalar en tu celular
            </DialogTitle>
            <DialogDescription className="text-center text-base">
              Sigue estos 3 pasos simples para tener el ícono de Alserla Bingo junto a tu WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <GuideStep
              n={1}
              icon={<Share className="h-7 w-7" />}
              title="Toca el botón Compartir"
              text="En iPhone, el cuadrado con la flecha hacia arriba (abajo). En Android, los 3 puntitos arriba a la derecha."
            />
            <GuideStep
              n={2}
              icon={<Plus className="h-7 w-7" />}
              title="Busca 'Agregar a pantalla principal'"
              text="Desplázate y toca la opción 'Agregar a pantalla principal' o 'Instalar aplicación'."
            />
            <GuideStep
              n={3}
              icon={<CheckCircle2 className="h-7 w-7" />}
              title="¡Listo!"
              text="Ahora verás el ícono de Alserla Bingo en tu pantalla de inicio, junto a tus otras apps."
            />
          </div>
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white"
            >
              <MessageCircle className="h-5 w-5" /> Te ayudamos por WhatsApp
            </a>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function GuideStep({ n, icon, title, text }: { n: number; icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-lg bg-secondary/40 p-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold text-lg font-black text-[#3a1d05]">
        {n}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-base font-bold text-foreground">
          <span className="text-gold">{icon}</span>
          {title}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
