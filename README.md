# Alserla Bingo — Salas en Vivo

Plataforma completa de Alserla Bingo en tiempo real, construida con **Next.js 16 (App Router)**, **TypeScript**, **Prisma ORM** y **Tailwind CSS**. Frontend **PWA instalable** con sorteo **determinístico stateless** (sin timers en RAM), pagos híbridos (MercadoPago + transferencias manuales) y panel de administración.

---

## Características principales

- **Motor de sorteo determinístico stateless**: la permutación de 75 bolillas se persiste en la base de datos al iniciar la sala. Las bolillas reveladas se **calculan** con un reloj basado en `startedAt` / `pausedAt` / `pausedElapsedMs` — cero `setInterval`, cero estado en RAM. Sobrevive reinicios y es compatible con entornos serverless / multi-instancia.
- **Autenticación real**: email + password (bcrypt) con sesión JWT en cookie HTTP-only. Ningún endpoint confía en un `userId` enviado en el body.
- **Integridad transaccional**: `buyCards` y `claim` envueltos en `prisma.$transaction` con bloqueo de fila → cero race conditions, cero doble gasto, cero doble premiación.
- **División de premios entre co-ganadores**: los reclamos válidos en el mismo `drawIndex` comparten el premio con ajuste retroactivo (el total acreditado siempre es `floor(prizeTotal / N) * N`).
- **Pagos híbridos**:
  - **MercadoPago** Checkout Pro + webhook idempotente (verificación HMAC-SHA256 + consulta autoritativa al pago).
  - **Transferencias manuales** internacionales aprobadas por admin con acreditación atómica.
- **PWA de alta retención**: instalable, Service Worker offline-ready, locutor de voz (Web Speech API en español), vibración háptica, detector "a 1 bolilla" (near-miss) con pulso dorado, auto-ordenamiento de cartones por cercanía de victoria, termómetro de tensión en sala, confeti al ganar y re-compra en 1 toque.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript 5 |
| Estilos | Tailwind CSS 4 + shadcn/ui (New York) + Lucide icons |
| Base de datos | Prisma ORM (SQLite en dev local, PostgreSQL/Neon en producción) |
| Estado cliente | Zustand |
| Autenticación | bcryptjs + jose (JWT edge-compatible, cookie HTTP-only) |
| Tiempo real | SSE (Server-Sent Events) serverless-compatible |
| Pagos | MercadoPago Checkout Pro + webhook + transferencias manuales |
| PWA | manifest.json + Service Worker + iconos (generados con sharp) |

---

## Requisitos

- **Node.js** 20+ (recomendado 22+) o **Bun** 1.3+
- Para producción: una cuenta de **Neon** (PostgreSQL serverless) y **Vercel**

---

## Instalación (local)

### 1. Clonar e instalar dependencias

```bash
npm install
# o con bun:
# bun install
```

> El script `postinstall` ejecuta `prisma generate` automáticamente.

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y completa los valores mínimos para dev local:

```env
DATABASE_URL="file:./db/custom.db"
AUTH_JWT_SECRET="genera-una-clave-aleatoria-de-64-bytes"  # openssl rand -base64 48
ADMIN_BOOTSTRAP_EMAIL="tu-email-admin@dominio.com"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

> MercadoPago es opcional para dev local. Si no configuras `MERCADOPAGO_ACCESS_TOKEN`, el endpoint de preferencia devuelve 503 y se redirige al flujo de transferencias.

### 3. Inicializar la base de datos

```bash
npx prisma db push
# o: npm run db:push
```

Esto crea las 10 tablas (`User`, `Room`, `RoomParticipant`, `Purchase`, `Ticket`, `Draw`, `Claim`, `PaymentTransaction`, `TransferRequest`, `LedgerEntry`) en SQLite.

### 4. (Opcional) Regenerar iconos PWA

Los iconos ya están incluidos en `public/`. Si quieres modificarlos, edita `scripts/gen-icons.mjs` y ejecuta:

```bash
npm run gen-icons
```

### 5. Iniciar el servidor de desarrollo

```bash
npm run dev
# o: bun run dev
```

Abre **http://localhost:3000** en tu navegador (o usa el panel de preview).

---

## Guía de pruebas en local

### Flujo de jugador + anfitrión

1. **Registrarse**: en la pantalla de inicio, pestaña "Registrarse". Al registrarte con el email definido en `ADMIN_BOOTSTRAP_EMAIL` obtienes rol **ADMIN** automáticamente. Recibirás 1000 créditos de bienvenida.

2. **Crear una sala** (Lobby → "Nueva sala de Bingo"): configura precio de cartón, premios (Línea / Esquinas / Bingo) e intervalo entre bolillas. Se genera un código de 6 caracteres (ej. `2HCCSC`).

3. **Comprar cartones**: selecciona cantidad (1/2/4/6) y confirma. El saldo se descuenta atómicamente y los cartones 5×5 se generan con la distribución canónica (B:1-15, I:16-30, N:31-45, G:46-60, O:61-75, centro libre).

4. **Iniciar sorteo** (botón "Iniciar sorteo", solo anfitrión): se genera la permutación de 75 bolillas y se persiste. El reloj determinístico comienza. Verás:
   - La bolilla actual con animación pop y color por letra.
   - El countdown "Próxima en Xs" (reloj determinístico del cliente).
   - El historial de bolillas cantadas.
   - El locutor de voz (toggle para activar/desactivar) que canta cada bolilla.

5. **Reclamar premios**: cuando completes un patrón, pulsa "Línea", "Esquinas" o "Bingo" en tu cartón. La validación es transaccional y atómica. Si hay co-ganadores en el mismo instante, el premio se divide.

6. **Pausa por 1ra Línea**: al cantar la primera Línea válida, el reloj se congela (`pausedAt`). El anfitrión debe pulsar "Reanudar" para continuar.

### Probar recarga por transferencia + panel admin

1. Como jugador, ve a **Billetera → Recargar créditos → Transferencia**. Completa monto, método (Bank Transfer / Wise / PIX / Zelle), país, número de referencia y nota. La solicitud queda PENDING.

2. Cierra sesión y **entra como admin** (el email configurado en `ADMIN_BOOTSTRAP_EMAIL`).

3. En el **panel Admin** (pestaña "Transferencias") verás las solicitudes pendientes. Pulsa "Aprobar" — los créditos se acreditan atómicamente (idempotente: aprobar dos veces no duplica).

4. Verifica en "Métricas": usuarios, salas, créditos en circulación, recaudación total y últimos premios cantados.

### Probar MercadoPago (opcional)

1. Configura en `.env`:
   ```env
   MERCADOPAGO_ACCESS_TOKEN="APP_USR-xxxx"
   MERCADOPAGO_PUBLIC_KEY="APP_USR-xxxx"
   MERCADOPAGO_WEBHOOK_SECRET="xxxx"
   NEXT_PUBLIC_APP_URL="https://tu-tunel-ngrok"  # MP necesita alcanzar el webhook
   ```
2. Usa `ngrok` para exponer tu localhost al webhook de MP.
3. Billetera → Recargar → MercadoPago → monto → "Pagar". Se redirige a Checkout Pro.
4. Al pagar, MP notifica a `/api/webhooks/mercadopago`, que verifica la firma, consulta el pago y acredita (idempotente).

### Atajos útiles

- **Prisma Studio** (inspeccionar la BD): `npm run db:studio`
- **Lint**: `npm run lint`

---

## Guía de despliegue en la nube (Neon + Vercel)

### 1. Crear la base de datos en Neon

1. Regístrate en [neon.tech](https://neon.tech) (gratis).
2. Crea un proyecto y una base de datos.
3. Copia la **connection string** (usa la variante `-pooler` para serverless):

   ```
   postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require
   ```

### 2. Cambiar el provider de Prisma a PostgreSQL

En `prisma/schema.prisma`, cambia **una sola línea**:

```prisma
datasource db {
  provider = "postgresql"   // era "sqlite"
  url      = env("DATABASE_URL")
}
```

> El resto del schema no cambia: los campos `Json` mapean a `jsonb` en Neon, los "enum-like" `String` se validan en la app. El motor determinístico lee `ballSequence` como `number[]` sin importar el tipo físico.
>
> Opcional (Neon puro): puedes cambiar `ballSequence Json?` → `ballSequence Int[]` y usar enums nativos de Postgres. No afecta la lógica.

### 3. Crear las tablas en Neon

```bash
# con DATABASE_URL apuntando a Neon:
npx prisma db push
npx prisma generate
```

### 4. Desplegar en Vercel

1. Sube el repositorio a GitHub.
2. En [vercel.com](https://vercel.com), importa el repo.
3. Configura las **environment variables** en Vercel:
   ```
   DATABASE_URL=postgresql://...neon...?sslmode=require
   AUTH_JWT_SECRET=<clave-aleatoria-64-bytes>
   ADMIN_BOOTSTRAP_EMAIL=admin@tudominio.com
   NEXT_PUBLIC_APP_URL=https://tu-app.vercel.app
   DEFAULT_CURRENCY=ARS
   DRAW_INTERVAL_SEC=5
   INITIAL_CREDITS=1000
   CARD_PRICE=100
   PRIZE_LINE=100
   PRIZE_CORNERS=80
   PRIZE_BINGO=300
   MERCADOPAGO_ACCESS_TOKEN=<production-token>
   MERCADOPAGO_PUBLIC_KEY=<production-key>
   MERCADOPAGO_WEBHOOK_SECRET=<webhook-secret>
   ```
4. Deploy. Vercel detecta Next.js automáticamente (`next build` / `next start`).

### 5. Configurar el webhook de MercadoPago

1. En el [panel de desarrolladores de MP](https://www.mercadopago.com.ar/developers/panel/app), registra la URL del webhook:
   ```
   https://tu-app.vercel.app/api/webhooks/mercadopago
   ```
2. Selecciona el evento **"payments"**.
3. MP enviará un GET de verificación (manejado automáticamente) y POST por cada pago.

### 6. Verificar el despliegue

- Regístrate con el email de `ADMIN_BOOTSTRAP_EMAIL` → debes obtener rol ADMIN.
- Crea una sala, compra cartones, inicia el sorteo.
- Confirma que las bolillas se revelan con el reloj determinístico.
- Prueba una recarga por transferencia y apruébala desde el panel admin.

---

## Estructura del proyecto

```
alserla-bingo/
├── prisma/
│   └── schema.prisma              # 10 modelos (portable SQLite↔Postgres)
├── public/
│   ├── manifest.json              # PWA manifest
│   ├── sw.js                      # Service Worker (offline-ready)
│   ├── icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
│   └── favicon-32.png
├── scripts/
│   └── gen-icons.mjs              # Genera iconos PWA desde SVG (sharp)
├── src/
│   ├── app/
│   │   ├── layout.tsx             # PWA meta + sonner Toaster + SW register
│   │   ├── page.tsx               # AppShell (SPA: auth → lobby → room → wallet → admin)
│   │   ├── globals.css            # Tema bingo felt + animaciones (near-miss, confetti, pop)
│   │   └── api/
│   │       ├── auth/              # register, login, logout, me
│   │       ├── rooms/             # CRUD + state + events(SSE) + join/buy/start/resume/reset/claim/schedule + tickets
│   │       ├── payments/          # mercadopago/preference, transfers
│   │       ├── webhooks/          # mercadopago (idempotente)
│   │       ├── admin/             # transfers(approve/reject), metrics, rooms(config)
│   │       └── wallet/            # saldo+ledger, transactions
│   ├── lib/
│   │   ├── store.ts               # Zustand (user, view, room, logout) + apiFetch
│   │   ├── db.ts                  # Prisma client singleton
│   │   ├── api.ts                 # helpers JSON / errores
│   │   ├── auth/                  # password (bcrypt), jwt (jose), session (cookie HTTP-only)
│   │   ├── bingo/                 # constants, types, engine (cartones), patterns (líneas/esquinas/bingo + near-miss)
│   │   ├── game/                  # deterministic (reloj), ledger (adjustBalance), room-service (transaccional)
│   │   └── payments/              # recharge (idempotente), mercadopago, transfers
│   ├── hooks/                     # use-auth, use-room-sse, use-voice, use-haptics, use-deterministic-clock
│   └── components/
│       ├── ui/                    # shadcn/ui (New York)
│       └── bingo/                 # AppShell, AuthView, Header, BottomNav, LobbyView, BingoCard, RoomView, WalletView, AdminView, Confetti, SWRegister
├── .env.example
├── package.json
└── README.md
```

---

## API Endpoints

### Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Registro (email+password, cookie JWT) |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Usuario actual |

### Salas
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/rooms` | Crear sala (host) |
| GET | `/api/rooms/active` | Salas activas (lobby) |
| GET | `/api/rooms/by-token/[token]` | Resolver por código |
| GET | `/api/rooms/[roomId]/state` | Estado público (polling) |
| GET | `/api/rooms/[roomId]/events` | SSE en tiempo real |
| GET | `/api/rooms/[roomId]/tickets` | Cartones del usuario |
| POST | `/api/rooms/[roomId]/join` | Unirse |
| POST | `/api/rooms/[roomId]/buy` | Comprar cartones (transaccional) |
| POST | `/api/rooms/[roomId]/start` | Iniciar sorteo (host) |
| POST | `/api/rooms/[roomId]/resume` | Reanudar (host) |
| POST | `/api/rooms/[roomId]/reset` | Reiniciar ronda (host) |
| POST | `/api/rooms/[roomId]/claim` | Reclamar premio (transaccional, co-ganadores) |
| POST | `/api/rooms/[roomId]/schedule` | Programar auto-inicio (host) |

### Pagos
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/payments/mercadopago/preference` | Crear preferencia Checkout Pro |
| POST | `/api/webhooks/mercadopago` | Webhook idempotente (verifica+consulta+acredita) |
| POST/GET | `/api/payments/transfers` | Solicitar/listar transferencias |

### Admin (rol ADMIN)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/transfers` | Lista solicitudes (filtro status) |
| POST | `/api/admin/transfers/[id]/approve` | Acreditar (idempotente) |
| POST | `/api/admin/transfers/[id]/reject` | Rechazar |
| GET | `/api/admin/metrics` | Dashboard |
| GET | `/api/admin/rooms` | Todas las salas |
| PATCH | `/api/admin/rooms/[id]` | Configurar premios/precio |

### Billetera
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/wallet` | Saldo + ledger |
| GET | `/api/wallet/transactions` | Historial recargas |

---

## Scripts disponibles

```bash
npm run dev          # Servidor de desarrollo (puerto 3000)
npm run build        # Build de producción
npm run start        # Servidor de producción
npm run lint         # ESLint
npm run gen-icons    # Regenerar iconos PWA (sharp)
npm run db:push      # Sincronizar schema con la BD
npm run db:generate  # Generar cliente Prisma
npm run db:studio    # Prisma Studio (inspeccionar BD)
npm run db:migrate   # Crear migración
npm run db:reset     # Resetear BD
```

---

## Modelo de datos (resumen)

- **User**: email, passwordHash, role (PLAYER/HOST/ADMIN), balance
- **Room**: token, status (WAITING/RUNNING/PAUSED/ENDED), `ballSequence` (permutación 1..75), `startedAt`, `pausedAt`, `pausedElapsedMs`, `intervalSec`, premios configurables
- **RoomParticipant**: (roomId, userId) único
- **Purchase**: cabecera de buyCards (quantity × unitPrice)
- **Ticket**: grid 5×5 (Json), status (ACTIVE/WON_LINE/WON_CORNERS/WON_BINGO/CANCELLED)
- **Draw**: historial append-only (`@@unique([roomId, order])`, `@@unique([roomId, number])`)
- **Claim**: type, valid, drawIndex, prizeAwarded (auditoría)
- **PaymentTransaction**: provider, externalId, amount, status (`@@unique([provider, externalId])` idempotencia)
- **TransferRequest**: recarga manual pendiente (PENDING/APPROVED/REJECTED)
- **LedgerEntry**: auditoría append-only de toda mutación de balance (PURCHASE/PRIZE/RECHARGE/REFUND/ADMIN_ADJUST)

---

## Notas de seguridad

- **JWT en cookie HTTP-only**: el token nunca se expone al JS del cliente.
- **Sin userId en el body**: todos los endpoints extraen la identidad de la sesión.
- **Idempotencia de pagos**: `@@unique([provider, externalId])` + consulta autoritativa a la API de MercadoPago.
- **Transacciones atómicas**: `buyCards`/`claim` con bloqueo de fila (room + user) → cero race conditions.
- **Webhook verificado**: HMAC-SHA256 del header `x-signature` + consulta del pago (no confía en el payload).
- **Ajuste retroactivo de premios**: co-ganadores se re-dividen sin sobre-pago (total exacto `floor(prizeTotal/N)*N`).

---

## Licencia

Privado. Uso interno.
