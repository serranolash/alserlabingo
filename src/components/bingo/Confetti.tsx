"use client";
// Confeti — lluvia de piezas CSS al ganar. Se dispara con `fire()`.
import { useEffect, useRef, useState } from "react";

const COLORS = ["oklch(0.72 0.19 70)", "oklch(0.7 0.17 162)", "oklch(0.65 0.22 16)", "oklch(0.62 0.24 304)", "oklch(0.7 0.18 55)"];

interface Piece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
}

export function Confetti() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const idRef = useRef(0);

  // Se dispara automáticamente al montarse (el padre cambia `key` para re-disparar).
  useEffect(() => {
    const next: Piece[] = Array.from({ length: 90 }, () => ({
      id: idRef.current++,
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 1.8 + Math.random() * 1.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 8 + Math.random() * 8,
    }));
    setPieces(next);
    const t = setTimeout(() => setPieces([]), 3500);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}vw`,
            background: p.color,
            width: `${p.size}px`,
            height: `${p.size * 1.4}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
          }}
        />
      ))}
    </>
  );
}
