// Genera iconos PWA (192/512/maskable/apple-touch) desde un SVG bingo ball.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const OUT = "public";

const BALL_SVG = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="felt" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#0f3d2e"/>
      <stop offset="100%" stop-color="#072017"/>
    </radialGradient>
    <radialGradient id="ball" cx="38%" cy="32%" r="75%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="55%" stop-color="#ffe9a8"/>
      <stop offset="100%" stop-color="#e0a838"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#felt)"/>
  <circle cx="256" cy="256" r="150" fill="url(#ball)" stroke="#8a5a18" stroke-width="6"/>
  <ellipse cx="210" cy="200" rx="55" ry="38" fill="#ffffff" opacity="0.55"/>
  <text x="256" y="300" font-family="Arial, sans-serif" font-size="170" font-weight="900"
        text-anchor="middle" fill="#3a1d05">75</text>
</svg>`;

const MASKABLE_SVG = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="felt2" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#0f3d2e"/>
      <stop offset="100%" stop-color="#072017"/>
    </radialGradient>
    <radialGradient id="ball2" cx="38%" cy="32%" r="75%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="55%" stop-color="#ffe9a8"/>
      <stop offset="100%" stop-color="#e0a838"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#felt2)"/>
  <circle cx="256" cy="256" r="120" fill="url(#ball2)" stroke="#8a5a18" stroke-width="6"/>
  <text x="256" y="290" font-family="Arial, sans-serif" font-size="130" font-weight="900"
        text-anchor="middle" fill="#3a1d05">75</text>
</svg>`;

await mkdir(OUT, { recursive: true });

await sharp(Buffer.from(BALL_SVG(192))).png().toFile(`${OUT}/icon-192.png`);
await sharp(Buffer.from(BALL_SVG(512))).png().toFile(`${OUT}/icon-512.png`);
await sharp(Buffer.from(MASKABLE_SVG(512))).png().toFile(`${OUT}/icon-maskable-512.png`);
await sharp(Buffer.from(BALL_SVG(180))).png().toFile(`${OUT}/apple-touch-icon.png`);
await sharp(Buffer.from(BALL_SVG(32))).png().toFile(`${OUT}/favicon-32.png`);

console.log("Iconos PWA generados en public/");
