# Deal or No Deal — Twitch Edition

A live **Deal or No Deal** game for Twitch streamers, where chat votes on whether to accept the Banker's offers in real-time. Built with the dark editorial "vault" aesthetic of [petepicsgallery.pages.dev](https://petepicsgallery.pages.dev/).

![Deal or No Deal](download/dond-banker-offer.png)

## Features

### Classic DOND Gameplay
- **26 cases** with the classic US prize board: 1¢ to $1,000,000
- **9 rounds** following the original TV format (6-5-4-3-2-1-1-1-1 case progression)
- **Player's case**: pick one at the start; it stays sealed until the end
- **Banker's offers** calculated with the classic formula (EV × round-based scaling factor, 0.30 → 0.92, with ±5% jitter)
- **Final swap option**: at round 9, trade your case for the last remaining one
- **Two endings**: accept a deal (game ends with offer amount) or play to the end (win your case's contents)

### Twitch Chat Integration (the main focus)
- **IRC listener**: connects to `wss://irc-ws.chat.twitch.tv:443` as anonymous `justinfanNNN` (no OAuth required for listening), or with bot OAuth for sending chat replies
- **Chat commands** (configurable prefix, default `!`):

  **Viewer commands:**
  - `!deal` — vote to ACCEPT the Banker's current offer
  - `!nodeal` — vote to DECLINE the Banker's current offer
  - `!case <number>` — suggest which case to open next

  **Streamer/mod commands:**
  - `!newgame` — start a new game (shuffles prizes into 26 cases)
  - `!opencase <number>` — open a case (auto-announces the amount in chat if bot OAuth is set)
  - `!dealaccept` — accept the Banker's offer
  - `!dealdecline` — decline the Banker's offer
  - `!swap` — at round 9, swap your case for the last remaining case

- **Live vote tally**: a green-vs-red DEAL/NO DEAL bar shows chat's verdict in real-time
- **Configurable vote window**: 15-120 seconds (default 30s)
- **Permission tiers**: broadcaster/mod/VIP badges parsed from IRC tags
- **Auto-reconnect** on disconnect with 5s backoff

### Design
- Background `#020203`, amber accent `#d4a853`, warm muted palette (rust/rose/sage/violet)
- Instrument Serif display + Geist body + Geist Mono uppercase labels
- Animated SVG metaballs background (with "goo" filter) + halftone canvas overlay
- Glass morphism panels, pill-shaped buttons, lift-on-hover cards
- Pulsing live/status dots, shake animation on banker phone, confetti on game finish
- Responsive (mobile tab switcher + desktop 3-column layout)

## Tech Stack
- **Frontend**: Next.js 16 App Router + TypeScript + Tailwind CSS 4 + shadcn/ui
- **Backend**: Next.js API routes + Prisma ORM + SQLite
- **Realtime**: socket.io + Twitch IRC over secure WebSocket
- **Gateway** (optional): Caddy for routing to multiple services

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js client)                                   │
│  - 26-case grid (click to open)                             │
│  - Money board (live strike-through of opened amounts)      │
│  - Banker phone (DEAL / NO DEAL buttons + chat vote bar)    │
│  - Chat feed (live messages, commands, votes, events)       │
│  - Settings panel (channel, OAuth, vote window)             │
└──────────────┬──────────────────────────────────┬───────────┘
               │ HTTP (REST API)                  │ WebSocket (socket.io)
               ▼                                  ▼
┌──────────────────────────────┐   ┌──────────────────────────┐
│  Next.js app (port 3000)     │   │  Twitch Relay            │
│  - /api/games/*              │   │  (port 3003)             │
│  - /api/twitch/config        │   │  - socket.io server      │
│  - Prisma → SQLite           │   │  - Twitch IRC client     │
│  - Banker offer calculator   │   │  - chat command parser   │
│  - Game state machine        │   │  - broadcasts to clients │
└──────────────────────────────┘   └──────────┬───────────────┘
                                              │
                                              ▼
                                   ┌──────────────────────────┐
                                   │  Twitch IRC              │
                                   │  wss://irc-ws.chat.tv    │
                                   └──────────────────────────┘
```

## Setup

### Prerequisites
- Node.js 18+ or [Bun](https://bun.sh) 1.0+
- A Twitch account (optional: a second "bot" account with an OAuth token from [twitchtokengenerator.com](https://twitchtokengenerator.com/) — select the `chat:read` + `chat:edit` scopes)

### Install
```bash
bun install
cd mini-services/twitch-relay && bun install && cd ../..

# Set up the database
bun run db:push
```

### Run
You need two processes running:

**Terminal 1 — Next.js app (port 3000):**
```bash
bun run dev
```

**Terminal 2 — Twitch relay (port 3003):**
```bash
bash scripts/start-relay.sh
# or: cd mini-services/twitch-relay && bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Using Caddy (optional, for cross-origin routing)
If you want to serve both services through a single port, use the included `Caddyfile`:
```bash
caddy run --config Caddyfile
```
This serves the app on port 81 and routes `/?XTransformPort=3003` to the relay.

## Usage

1. **Click "New game"** — shuffles 26 prizes into 26 cases.
2. **Pick your case** — click any case to claim it as yours (gold gradient + ★).
3. **Open cases** — click cases to reveal their amounts. The money board strikes through opened amounts.
4. **Banker calls** — after each round's quota of cases is opened, the Banker makes an offer. The phone shakes, a vote countdown begins, and chat can vote `!deal` or `!nodeal`.
5. **Respond to the offer**:
   - Click **DEAL** (green) to take the money and end the game
   - Click **NO DEAL** (red) to decline and continue
6. **Round 9 swap** — at the final round, you can swap your case for the last remaining one.
7. **Confetti** — when the game ends, confetti rains down with your final prize.

### Connecting Twitch (for chat voting)
1. In the right rail's **"Twitch connection"** panel, enter your channel name (lowercase, no `#`)
2. Optionally paste a bot OAuth token from [twitchtokengenerator.com](https://twitchtokengenerator.com/) (select `chat:read` + `chat:edit` scopes). Without it, the bot listens only.
3. Click **"Start listening"** — the relay connects to Twitch IRC.
4. When the Banker calls, chat votes appear as a green/red bar in real-time.

## Project Structure
```
.
├── prisma/
│   └── schema.prisma              # Game, GameCase, Round, ChatVote, TwitchConfig, ChatLog
├── src/
│   ├── app/
│   │   ├── globals.css            # Design system tokens
│   │   ├── layout.tsx             # Google Fonts loading
│   │   ├── page.tsx               # Main game orchestrator
│   │   └── api/
│   │       ├── games/             # CRUD + cases + offer + votes
│   │       └── twitch/            # config + internal-status
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components
│   │   └── dond/                  # Game-specific components
│   │       ├── MetaballsBackground.tsx
│   │       ├── Halftone.tsx
│   │       ├── CaseBoard.tsx      # 26-case grid
│   │       ├── MoneyBoard.tsx     # Prize board with strike-through
│   │       ├── BankerPhone.tsx    # DEAL/NO DEAL panel with vote bar
│   │       ├── ChatFeed.tsx       # Live chat timeline
│   │       ├── SettingsPanel.tsx  # Twitch config form
│   │       ├── CommandReference.tsx
│   │       ├── useTwitchSocket.ts # socket.io hook
│   │       └── types.ts
│   └── lib/
│       ├── db.ts                  # Prisma client
│       ├── dond.ts                # Game logic: prizes, banker formula, helpers
│       └── utils.ts
├── mini-services/
│   └── twitch-relay/
│       ├── index.ts               # Twitch IRC + socket.io relay (port 3003)
│       └── package.json
├── scripts/
│   ├── start-relay.sh             # Foreground relay launcher
│   └── package-zip.py             # Zip packaging script
├── public/                        # Static assets
├── Caddyfile                      # Optional gateway config (port 81)
├── package.json
└── README.md                      # This file
```

## API Reference

### Games
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/games` | List all games |
| `POST` | `/api/games` | Create a new game (shuffles 26 cases) |
| `GET` | `/api/games/current` | Get the most recent game |
| `GET` | `/api/games/:id` | Get a sanitized game snapshot |
| `POST` | `/api/games/:id/cases` | Pick player case (`{action:"pick_player", caseNumber:7}`) or open a case (`{action:"open", caseNumber:12}`) |
| `POST` | `/api/games/:id/offer` | Respond to banker offer (`{response:"deal"\|"nodeal"\|"swap"}`) |
| `GET` | `/api/games/:id/votes` | Get current vote tally |
| `POST` | `/api/games/:id/votes` | Cast a vote (`{username:"viewer", vote:"deal"\|"nodeal"}`) — toggleable |
| `POST` | `/api/games/:id/reset` | Delete a game |

### Twitch
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/twitch/config` | Get Twitch config |
| `PUT` | `/api/twitch/config` | Update Twitch config |
| `POST` | `/api/twitch/internal-status` | Internal: relay syncs connection state |

### Socket.io Events (relay → client)
- `twitch:status` — connection lifecycle updates
- `chat:message` — every Twitch chat PRIVMSG with badges + tags
- `chat:command` — a parsed command
- `twitch:event` — USERNOTICE events (sub/raid/cheer)
- `case:suggestion` — chat suggested a case number via `!case`
- `config:sync` — relay config broadcast
- `game:updated` — game state has changed (reason + fresh data)

### Socket.io Events (client → relay)
- `twitch:start` / `twitch:stop` — connect/disconnect IRC
- `config:update` — update relay config
- `active-game` — set which game chat commands target
- `bot:say` — send a chat message as the bot (requires OAuth)

## Banker Offer Formula

The Banker uses the classic DOND algorithm:

```
offer = expected_value × scaling_factor(round) × (1 ± random_jitter)
```

Where:
- `expected_value` = average of all remaining unopened case amounts (excluding player's case)
- `scaling_factor` ramps from **0.30** (round 1) to **0.92** (round 8), matching the TV show's pattern of low early offers that approach true EV late
- `random_jitter` = ±5%, to make the Banker feel less mechanical

Early offers are aggressively low (encouraging you to play on); late offers approach the true expected value (making the decision genuinely hard).

## License
MIT — build on it, stream with it, make it yours.

## Credits
- Design inspiration: [petepicsgallery.pages.dev](https://petepicsgallery.pages.dev/)
- Game format: [Deal or No Deal](https://en.wikipedia.org/wiki/Deal_or_No_Deal) (Endemol Shine)
- Built with [Next.js](https://nextjs.org/), [Prisma](https://prisma.io/), [shadcn/ui](https://ui.shadcn.com/), [socket.io](https://socket.io/), [Twitch IRC](https://dev.twitch.tv/docs/irc/)
