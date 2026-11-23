# Alserla Bingo — Salas en Vivo + La Tómbola Caliente

Plataforma completa con **dos juegos**: el **Bingo 75** en tiempo real (USD) y **La Tómbola Caliente** (juego gratis de puntos, estilo crash/Aviator). Construida con **Next.js 16 (App Router)**, **TypeScript**, **Prisma ORM** y **Tailwind CSS**. Frontend **PWA instalable** con sorteo **determinístico stateless** (sin timers en RAM), **auto-detección de premios**, **economía dual** (USD + Puntos), pagos híbridos y panel de administración.

---

## 🔥 La Tómbola Caliente (juego gratis de puntos)

Juego aditivo de tipo crash (estilo Aviator, nivel superior en adicción visual) con **economía aislada de PUNTOS gratis** (sin tocar el USD del Bingo 75). Los jugadores apuestan puntos, el multiplicador sube cada 2 segundos, y deben **retirar antes de que salga la BOMBA**.

### Experiencia visual premium (nivel Aviator+)

- **Bola de fuego que ASCIENDE**: a medida que sube el multiplicador, una bola de fuego con gradiente dorado→naranja→rojo fuego se eleva por el escenario, dejando una **estela de brasas** (partículas que ascienden y se desvanecen).
- **Aura pulsante**: un halo brillante rodea la bola y pulsa, intensificándose con el multiplicador.
- **Atmósfera que se incendia**: el fondo pasa de verde mesa (felt) a ámbar → naranja → rojo infernal conforme crece el riesgo.
- **Multiplicador pulsante**: el número grande del multiplicador hace un pulso de escala en cada cambio.
- **Eje de altitud vertical**: marcador que asciende por una escala (1x→10x) mostrando la "altura" de la ronda.
- **Estrellas/brillos** que aparecen en multiplicadores altos (≥2.5x).
- **Terremoto + flash rojo** al explotar la BOMBA (sacude toda la pantalla).
- **Ráfaga de monedas doradas** al retirar (18 monedas que saltan y rotan).
- **Botón RETIRAR gigante** con pulso urgente que se vuelve rojo (ring) cuando el multiplicador pasa de 3x.
- **Historial de crashes**: tira de los últimos 12 multiplicadores de rondas anteriores (rojo para altos, ámbar para medios) — genera FOMO viendo los "85.23x" que se escaparon.
- **Audio Web Audio API**: tic-tac por bolilla, monedas al retirar, explosión al crash.
- **Vibración háptica** en bolilla, retiro y explosión.
- **Prueba social en vivo**: lista de quién apostó cuánto y en qué multiplicador retiró.
- **Ranking semanal** Top 10 + **share WhatsApp** con código de referido (+500 puntos por amigo).

### Economía dual aislada (PUNTOS vs. USD)

- **PUNTOS** (gratis): `User.points` (1000 iniciales), independiente del `balance` USD.
- **Bonus diario**: +300 puntos cada 12 horas (`lastDailyPointsAt`).
- **Referidos**: código único por usuario, +500 al invitador.
- **Sin LedgerEntry/PaymentTransaction**: los puntos son una economía simple y aislada.

### Motor determinístico stateless (CERO RAM, compatible Vercel)

- **Provably Fair**: `serverSeed` (SHA-256) + `seedHash` pública + `ballsSequence` precalculada.
- **Fases por timestamp**: betting (6s) → running (2s/bolilla) → crashed (bomba).
- `ballIndex = floor((now - startedAt) / 2000)` — las bolillas reveladas se calculan, no se guardan en memoria.
- **Auto-gestión de rondas**: `/api/tombola/state` crea la siguiente ronda automáticamente si la anterior crasheó hace >4s.
- **Bolillas**: doradas (`+0.2x`, `+0.3x`, `+0.5x`, `x1.5`, `x2`) y la **BOMBA** (posición justa, distribución de cola pesada tipo crash, 4% explosión instantánea).

### Modelos de datos (aditivos, sin tocar el Bingo 75)

```prisma
model User {
  // ... campos existentes intactos ...
  points          Int      @default(1000)   // PUNTOS gratis (Tómbola)
  lastDailyPointsAt DateTime?
  referralCode    String?  @unique
  tombolaBets     HotTombolaBet[]
}
model HotTombolaRound { id, serverSeed, seedHash, status, ballsSequence (Json), bettingEndsAt, startedAt, crashedAt, createdAt }
model HotTombolaBet { id, roundId, userId, pointsWagered, cashedOutAtBall, cashoutMultiplier, pointsWon, status, createdAt }
```

### Endpoints de La Tómbola

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/tombola/state` | Estado completo + auto-gestión de rondas + historial + ranking |
| POST | `/api/tombola/bet` | Apostar puntos (50/100/250/500) |
| POST | `/api/tombola/cashout` | Retirar (verifica `ballIndex < bombIndex`) |
| POST | `/api/tombola/daily-bonus` | +300 puntos cada 12h |
| POST | `/api/tombola/redeem-referral` | Redimir código de referido (+500 al invitador) |

### Integración

- **Banner en el lobby**: "🔥 NUEVO: La Tómbola Caliente" con los puntos actuales.
- **Nav inferior**: botón "Tómbola" (icono 🔥).
- **Página standalone** `/tombola` + integrada como vista en la SPA.

---

## Características principales

- **Motor de sorteo determinístico stateless**: la permutación de 75 bolillas se persiste en la base de datos al iniciar la sala. Las bolillas reveladas se **calculan** con un reloj basado en `startedAt` / `pausedAt` / `pausedElapsedMs` — cero `setInterval`, cero estado en RAM. Sobrevive reinicios y es compatible con entornos serverless / multi-instancia.
- **Auto-detección de premios (nivel casino online)**: cada vez que se revela una bolilla, el servidor evalúa automáticamente todos los cartones activos. Si uno completa **Línea** o **Esquinas** (y es el primero en la sala), la partida se **pausa automáticamente**. Si completa **Bingo**, la partida **finaliza automáticamente** y se proclama al ganador. No depende de que el jugador presione un botón (aunque los botones manuales siguen disponibles como fallback).
- **Multiganancia**: un mismo cartón puede ganar **Línea + Esquinas + Bingo** en la misma partida. Las victorias de Línea/Esquinas se registran vía Claims sin bloquear el cartón — sigue activo y puede ganar Bingo. Solo Bingo (cartón lleno) terminaliza el cartón.
- **Economía en USD (centavos)**: todos los montos (saldo, cartones, premios, recargas, retiros) se almacenan en **centavos de USD** y se muestran como `$X.XX USD`. Bono de bienvenida de **$5.00 USD** al registrarse. Precio mínimo de cartón **$1.00 USD**.
- **Autenticación real**: email + password (bcrypt) con sesión JWT en cookie HTTP-only. Ningún endpoint confía en un `userId` enviado en el body.
- **Integridad transaccional**: `buyCards`, `claim` y `requestPayout` envueltos en `prisma.$transaction` con bloqueo de fila → cero race conditions, cero doble gasto, cero doble premiación.
- **División de premios entre co-ganadores**: los reclamos válidos en el mismo `drawIndex` comparten el premio con ajuste retroactivo (el total acreditado siempre es `floor(prizeTotal / N) * N`).
- **Control de acceso a salas**:
  - **Solo el ADMIN** (operador) puede crear salas. Los jugadores solo se unen.
  - **Lobby condicionado al saldo**: los jugadores con saldo `$0` ven un aviso de recarga en vez de las salas. Las salas muestran "Entrar" deshabilitado si el saldo es menor al precio del cartón.
  - **Salas públicas o privadas**: las públicas aparecen en el lobby; las privadas solo son accesibles mediante el **enlace de invitación** único (`/invite/[inviteToken]`).
- **Pausa manual del admin**: además de la auto-pausa por premio, el anfitrión puede **pausar** y **reanudar** el sorteo manualmente en cualquier momento.
- **Pagos híbridos**:
  - **MercadoPago** Checkout Pro + webhook idempotente (verificación HMAC-SHA256 + consulta autoritativa del pago, en USD).
  - **Transferencias manuales** internacionales aprobadas por admin con acreditación atómica.
- **Modal de cobro de premio + retiros**: al ganar, se abre automáticamente un modal para que el jugador ingrese sus datos de recepción (Argentina: Alias/CBU + titular + banco; Internacional/Cripto: USDT TRC20/BEP20/Polygon, Binance Pay, PayPal, Zelle). El admin gestiona estos retiros desde el panel **"Retiros"** marcándolos como pagados con comprobante.
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

> **Economía USD**: los montos en `.env` están en **centavos** (`INITIAL_CREDITS=500` = $5.00, `CARD_PRICE=100` = $1.00, etc.). La moneda base es USD.
>
> MercadoPago es opcional para dev local. Si no configuras `MERCADOPAGO_ACCESS_TOKEN`, el endpoint de preferencia devuelve 503 y se redirige al flujo de transferencias.

### 3. Inicializar la base de datos

```bash
npx prisma db push
# o: npm run db:push
```

Esto crea las 11 tablas (`User`, `Room`, `RoomParticipant`, `Purchase`, `Ticket`, `Draw`, `Claim`, `PaymentTransaction`, `TransferRequest`, `PrizePayout`, `LedgerEntry`) en SQLite.

> Si la BD tenía datos previos con columnas nuevas non-null y `db:push` falla, usa `npx prisma db push --force-reset --accept-data-loss` (borra los datos).

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

### Flujo de administrador (operador)

1. **Registrarse** con el email definido en `ADMIN_BOOTSTRAP_EMAIL` → obtienes rol **ADMIN** automáticamente y **$5.00 USD** de saldo de bienvenida.

2. **Crear una sala** (Lobby → "Nueva sala de Bingo", solo visible para ADMIN): configura precio de cartón (mín. $1.00 USD), premios (Línea / Esquinas / Bingo en USD), intervalo entre bolillas y si la sala es **pública** o **privada**. Se genera un código de 6 caracteres + un enlace de invitación único `/invite/[inviteToken]`.

3. **Copiar el enlace de invitación**: dentro de la sala, el host ve la sección "Enlace de invitación" con la URL completa y un botón "Copiar". Compártelo con los jugadores.

4. **Iniciar el sorteo** (botón "Iniciar sorteo"): se genera la permutación de 75 bolillas y el reloj determinístico comienza. Verás:
   - La bolilla actual con animación pop y color por letra.
   - El countdown "Próxima en Xs" (reloj determinístico del cliente).
   - Los premios en USD (Línea / Esquinas / Bingo).
   - El locutor de voz (toggle para activar/desactivar) que canta cada bolilla.

5. **Pausa manual**: mientras corre el sorteo, el host puede pulsar **"Pausar"** para congelar el reloj (útil para resolver incidencias) y **"Reanudar"** para continuar.

### Flujo de jugador

1. **Registrarse** → recibes **$5.00 USD** de bienvenida.
2. **Unirse a una sala**: en el lobby, pega en "Unirse" el **enlace de invitación completo** (`http://.../invite/...`) o el **código de 6 caracteres**. El campo acepta ambos formatos automáticamente.
3. **Comprar cartones**: selecciona cantidad (1/2/4/6) y confirma. El saldo se descuenta atómicamente y los cartones 5×5 se generan con la distribución canónica (B:1-15, I:16-30, N:31-45, G:46-60, O:61-75, centro libre).
4. **Auto-detección de premios**: cuando completes Línea, Esquinas o Bingo, el sistema lo detecta automáticamente, acredita el premio, pausa la partida (Línea/Esquinas) o la finaliza (Bingo), y abre el **Modal de Cobro de Premio** para que ingreses tus datos de recepción.
5. **Reclamo manual** (fallback): también puedes pulsar "Línea", "Esquinas" o "Bingo" en tu cartón. Un cartón que ganó Línea sigue activo y puede ganar Bingo (multiganancia).
6. **Re-compra 1 toque**: al finalizar la partida, el host reinicia la ronda y puedes re-comprar con un solo toque.

### Probar recarga + retiros + panel admin

1. **Recarga por transferencia**: Billetera → Recargar → Transferencia. Completa monto (USD), método, país, referencia y nota. Queda PENDING.

2. **Retiro de premio**: al ganar, el modal de cobro se abre. Completa tus datos (Argentina: Alias/CBU + titular + banco; Internacional: USDT/Binance/PayPal/Zelle). El monto se **debita (reserva)** de tu saldo hasta que el admin pague.

3. Entra como **admin** → panel **"Recargas"**: aprueba/rechaza transferencias pendientes (acreditación atómica idempotente).

4. Panel **"Retiros"**: ve las solicitudes de cobro de premios con los datos de cuenta del ganador, el monto en USD y la sala. Pulsa **"Marcar pagado"** y adjunta el comprobante/ID de transacción.

5. Panel **"Métricas"**: usuarios, salas, saldo en circulación (USD), recaudación total y últimos premios cantados.

### Probar MercadoPago (opcional)

1. Configura en `.env`:
   ```env
   MERCADOPAGO_ACCESS_TOKEN="APP_USR-xxxx"
   MERCADOPAGO_PUBLIC_KEY="APP_USR-xxxx"
   MERCADOPAGO_WEBHOOK_SECRET="xxxx"
   NEXT_PUBLIC_APP_URL="https://tu-tunel-ngrok"  # MP necesita alcanzar el webhook
   ```
2. Usa `ngrok` para exponer tu localhost al webhook de MP.
3. Billetera → Recargar → MercadoPago → monto en USD → "Pagar". Se redirige a Checkout Pro.
4. Al pagar, MP notifica a `/api/webhooks/mercadopago`, que verifica la firma, consulta el pago y acredita en centavos (idempotente).

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
3. Configura las **environment variables** en Vercel (montos en centavos USD):
   ```
   DATABASE_URL=postgresql://...neon...?sslmode=require
   AUTH_JWT_SECRET=<clave-aleatoria-64-bytes>
   AUTH_JWT_ISSUER=alserla-bingo
   AUTH_COOKIE_NAME=alserla_session
   ADMIN_BOOTSTRAP_EMAIL=admin@tudominio.com
   NEXT_PUBLIC_APP_URL=https://tu-app.vercel.app
   DEFAULT_CURRENCY=USD
   DRAW_INTERVAL_SEC=5
   INITIAL_CREDITS=500          # $5.00 USD de bienvenida
   CARD_PRICE=100               # $1.00 USD (mínimo)
   PRIZE_LINE=500               # $5.00 USD
   PRIZE_CORNERS=400            # $4.00 USD
   PRIZE_BINGO=2000             # $20.00 USD
   MERCADOPAGO_ACCESS_TOKEN=<production-token>
   MERCADOPAGO_PUBLIC_KEY=<production-key>
   MERCADOPAGO_WEBHOOK_SECRET=<webhook-secret>
   ```
4. Deploy. Vercel detecta Next.js automáticamente (`next build` / `next start`).

### 5. Configurar el webhook de MercadoPago

1. En el [panel de desarrolladores de MP](https://www.mercadopago.com/developers/panel/app), registra la URL del webhook:
   ```
   https://tu-app.vercel.app/api/webhooks/mercadopago
   ```
2. Selecciona el evento **"payments"**.
3. MP enviará un GET de verificación (manejado automáticamente) y POST por cada pago.

### 6. Verificar el despliegue

- Regístrate con el email de `ADMIN_BOOTSTRAP_EMAIL` → debes obtener rol ADMIN y $5.00 USD.
- Crea una sala (pública/privada), copia el enlace de invitación.
- Compra cartones, inicia el sorteo, verifica la auto-detección de premios.
- Prueba una recarga por transferencia y apruébala desde el panel admin.
- Abre el enlace de invitación en otra sesión/navegador para entrar como jugador.

---

## Estructura del proyecto

```
alserla-bingo/
├── prisma/
│   └── schema.prisma              # 11 modelos (portable SQLite↔Postgres, USD centavos)
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
│   │   ├── invite/[token]/        # Redirect al deep-link /?invite=TOKEN
│   │   ├── globals.css            # Tema bingo felt + animaciones (near-miss, confetti, pop)
│   │   └── api/
│   │       ├── auth/              # register, login, logout, me
│   │       ├── rooms/             # CRUD + state + events(SSE) + join/buy/start/pause/resume/reset/claim/schedule + tickets + by-token + by-invite
│   │       ├── payments/          # mercadopago/preference, transfers
│   │       ├── payouts/           # solicitud + listado de retiros de ganancias
│   │       ├── webhooks/          # mercadopago (idempotente)
│   │       ├── admin/             # transfers(approve/reject), payouts(pay), metrics, rooms(config)
│   │       └── wallet/            # saldo+ledger, transactions
│   ├── lib/
│   │   ├── store.ts               # Zustand (user, view, room, logout) + apiFetch
│   │   ├── db.ts                  # Prisma client singleton
│   │   ├── api.ts                 # helpers JSON / errores
│   │   ├── format.ts              # formatUSD / dollarsToCents / constantes USD
│   │   ├── auth/                  # password (bcrypt), jwt (jose), session (cookie HTTP-only)
│   │   ├── bingo/                 # constants, types, engine (cartones), patterns (líneas/esquinas/bingo + near-miss + getWinningCells)
│   │   ├── game/                  # deterministic (reloj), ledger (adjustBalance), room-service (transaccional + evaluateRoomWins auto-detección + creditWin multiganancia)
│   │   └── payments/              # recharge (idempotente), mercadopago (USD), transfers, payouts (retiros)
│   ├── hooks/                     # use-auth, use-room-sse, use-voice, use-haptics, use-deterministic-clock
│   └── components/
│       ├── ui/                    # shadcn/ui (New York)
│       └── bingo/                 # AppShell, AuthView, Header, BottomNav, LobbyView, BingoCard,
│                                 #   RoomView, WalletView, AdminView, PayoutModal, Confetti, SWRegister
├── .env.example
├── package.json
└── README.md
```

---

## API Endpoints

### Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Registro (email+password, cookie JWT, $5.00 USD de bienvenida) |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Usuario actual |

### Salas
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/rooms` | Crear sala (**solo ADMIN**, USD, pública/privada) |
| GET | `/api/rooms/active` | Salas públicas activas (lobby) |
| GET | `/api/rooms/by-token/[token]` | Resolver por código corto |
| GET | `/api/rooms/by-invite/[inviteToken]` | Resolver por enlace de invitación |
| GET | `/api/rooms/[roomId]/state` | Estado público (polling) + auto-detección de premios |
| GET | `/api/rooms/[roomId]/events` | SSE en tiempo real |
| GET | `/api/rooms/[roomId]/tickets` | Cartones del usuario + victorias por tipo (multiganancia) |
| POST | `/api/rooms/[roomId]/join` | Unirse |
| POST | `/api/rooms/[roomId]/buy` | Comprar cartones (transaccional, USD) |
| POST | `/api/rooms/[roomId]/start` | Iniciar sorteo (host) |
| POST | `/api/rooms/[roomId]/pause` | Pausa manual (host) |
| POST | `/api/rooms/[roomId]/resume` | Reanudar (host) |
| POST | `/api/rooms/[roomId]/reset` | Reiniciar ronda (host) |
| POST | `/api/rooms/[roomId]/claim` | Reclamar premio manual (transaccional, co-ganadores) |
| POST | `/api/rooms/[roomId]/schedule` | Programar auto-inicio (host) |

### Pagos / Retiros
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/payments/mercadopago/preference` | Crear preferencia Checkout Pro (USD) |
| POST | `/api/webhooks/mercadopago` | Webhook idempotente (verifica+consulta+acredita centavos) |
| POST/GET | `/api/payments/transfers` | Solicitar/listar recargas por transferencia |
| POST/GET | `/api/payouts` | Solicitar/listar retiros de ganancias (modal de cobro) |

### Admin (rol ADMIN)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/transfers` | Lista recargas pendientes (filtro status) |
| POST | `/api/admin/transfers/[id]/approve` | Acreditar recarga (idempotente) |
| POST | `/api/admin/transfers/[id]/reject` | Rechazar recarga |
| GET | `/api/admin/payouts` | Lista retiros de ganadores pendientes |
| POST | `/api/admin/payouts/[id]/pay` | Marcar retiro como pagado (con comprobante) |
| GET | `/api/admin/metrics` | Dashboard (USD) |
| GET | `/api/admin/rooms` | Todas las salas |
| PATCH | `/api/admin/rooms/[id]` | Configurar premios/precio (USD) |

### Billetera
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/wallet` | Saldo + ledger (USD) |
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

- **User**: email, passwordHash, role (PLAYER/HOST/ADMIN), balance (centavos USD)
- **Room**: token (código 6 char), status (WAITING/RUNNING/PAUSED/ENDED), `ballSequence` (permutación 1..75), `startedAt`, `pausedAt`, `pausedElapsedMs`, `intervalSec`, `lastEvalDrawIndex` (auto-detección), `isPublic`, `inviteToken` (enlace único), premios configurables (centavos USD)
- **RoomParticipant**: (roomId, userId) único
- **Purchase**: cabecera de buyCards (quantity × unitPrice, centavos USD)
- **Ticket**: grid 5×5 (Json), status (ACTIVE/WON_BINGO/CANCELLED) — multiganancia: Línea/Esquinas se trackean vía Claims, no cambian el status
- **Draw**: historial append-only (`@@unique([roomId, order])`, `@@unique([roomId, number])`)
- **Claim**: victoria (LINE/CORNERS/BINGO), valid, drawIndex, prizeAwarded (centavos USD) — un ticket puede tener varios Claims válidos
- **PaymentTransaction**: provider, externalId, amount (centavos), status (`@@unique([provider, externalId])` idempotencia)
- **TransferRequest**: recarga manual pendiente (PENDING/APPROVED/REJECTED)
- **PrizePayout**: solicitud de cobro de premio (PENDING/PAID), amount (centavos USD), country, method, accountData (Json), adminNote (comprobante), `claimId @unique` (1:1 con la victoria)
- **LedgerEntry**: auditoría append-only de toda mutación de balance (PURCHASE/PRIZE/RECHARGE/PAYOUT/REFUND/ADMIN_ADJUST, centavos USD con signo)

---

## Notas de seguridad

- **JWT en cookie HTTP-only**: el token nunca se expone al JS del cliente.
- **Sin userId en el body**: todos los endpoints extraen la identidad de la sesión.
- **Creación de salas solo ADMIN**: los jugadores comunes no pueden crear salas.
- **Idempotencia de pagos**: `@@unique([provider, externalId])` + consulta autoritativa a la API de MercadoPago.
- **Retiros con reserva de fondos**: al solicitar un retiro, el monto se debita inmediatamente (LedgerEntry PAYOUT) para evitar doble-gasto mientras se procesa.
- **Transacciones atómicas**: `buyCards`/`claim`/`requestPayout` con bloqueo de fila (room + user) → cero race conditions.
- **Webhook verificado**: HMAC-SHA256 del header `x-signature` + consulta del pago (no confía en el payload).
- **Ajuste retroactivo de premios**: co-ganadores se re-dividen sin sobre-pago (total exacto `floor(prizeTotal/N)*N`).
- **Auto-detección best-effort**: `evaluateRoomWins` corre en cada `/state` dentro de una transacción con `lastEvalDrawIndex` para evitar re-procesar; nunca bloquea la lectura del estado.

---

## Licencia

Privado. Uso interno.
