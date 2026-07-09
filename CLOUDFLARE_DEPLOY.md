# Deploying Tier Forge to Cloudflare

This version of Tier Forge is **Cloudflare-native**:
- **Frontend + API**: Next.js on Cloudflare Workers (via OpenNext)
- **Database**: Cloudflare D1 (serverless SQLite)
- **Twitch relay**: Cloudflare Durable Object (persistent WebSocket worker)
- **Browser realtime**: Native WebSocket to the Durable Object (no socket.io)

## Prerequisites

1. A Cloudflare account (free tier works)
2. Cloudflare CLI: `npm install -g wrangler` (or use `npx wrangler`)
3. Login: `npx wrangler login`

## Step 1: Create the D1 Database

```bash
npx wrangler d1 create tierforge
```

This outputs a `database_id`. Copy it and paste into `wrangler.jsonc`:
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "tierforge",
    "database_id": "PASTE_YOUR_ID_HERE"
  }
]
```

## Step 2: Run the D1 Migration

```bash
# Production database
npx wrangler d1 execute tierforge --remote --file=prisma/migrations/d1.sql

# Local dev database (for testing with `wrangler dev`)
npx wrangler d1 execute tierforge --local --file=prisma/migrations/d1.sql
```

## Step 3: Build + Deploy

```bash
# Build the OpenNext Worker + Next.js app, then deploy
npx @opennextjs/cloudflare build
npx wrangler deploy
```

Or use the combined script:
```bash
bun run deploy
# or: npm run deploy
```

## Step 4: Apply Durable Object Migrations

The first deploy creates the Durable Object class. If you see an error about a missing DO class, run:

```bash
npx wrangler deploy  # This auto-applies the migration from wrangler.jsonc
```

## Step 5: Use the App

After deploy, wrangler outputs your Worker URL (e.g. `https://tierforge.<your-subdomain>.workers.dev`).

1. Create a tier list (give it a title, click +)
2. Add items by typing in the "Add an item..." box
3. Drag items between S/A/B/C/D/F rows
4. In the Twitch connection panel:
   - Enter your channel name (lowercase, no `#`)
   - Optionally paste a bot OAuth token from [twitchtokengenerator.com](https://twitchtokengenerator.com/) (select `chat:read` + `chat:edit`)
5. Click "Start listening"
6. Click "Go live" on your tier list to enable chat commands
7. Chat can now use: `!additem <name>`, `!moveitem <name> <tier>`, `!vote <name>`, `!resetvotes`

---

## Cloudflare Pages Settings (if deploying via Cloudflare Pages dashboard)

If you're connecting your GitHub repo to Cloudflare Pages instead of using the CLI, use these exact settings:

| Setting | Value |
|---------|-------|
| **Framework preset** | None (don't use the Next.js preset — it conflicts with OpenNext) |
| **Build command** | `npx @opennextjs/cloudflare build && node scripts/patch-worker.mjs` |
| **Deploy command** | `npx wrangler deploy` |
| **Build output directory** | `.open-next` |
| **Root directory** | `/` (leave blank) |
| **Environment variables** | `NODE_VERSION` = `20` (or higher) |

**Important:** 
- The build command has TWO steps: OpenNext build + patch script. The patch script (`node scripts/patch-worker.mjs`) injects the Durable Object class into OpenNext's worker output. Without it, the Twitch relay won't work.
- Do NOT set the build command to `bun run build` or `next build` — that builds the Next.js standalone output, not the Cloudflare Worker.
- You MUST create the D1 database first (Step 1 below) and paste the real `database_id` into `wrangler.jsonc` before deploying. The placeholder `YOUR_D1_DATABASE_ID` will cause the deploy to fail.

---

## Architecture on Cloudflare

```
Browser ──HTTP──→ Cloudflare Worker ──→ Next.js API routes ──→ D1 database
       ──/ws────→ Durable Object (TwitchRelayDO)
                    ├── Browser WebSocket (fan-out)
                    └── Twitch IRC WebSocket (persistent, 25s alarm keeps alive)
```

| Component | Self-hosted | Cloudflare |
|-----------|-------------|------------|
| Next.js app | Port 3000 (Node.js) | Cloudflare Worker (edge) |
| Database | SQLite file on disk | D1 (serverless SQLite) |
| Twitch relay | Separate Bun process (port 3003) | Durable Object (singleton) |
| Browser realtime | socket.io | Native WebSocket to DO |

## Local Development

For local dev, you still use the original Next.js dev server (which uses local SQLite + no relay):

```bash
bun run dev
# or: npm run dev
```

Open `http://localhost:3000`. The database uses local SQLite (no D1 needed). The Twitch relay won't work in this mode (it needs the Durable Object) — but the UI + API + tier list management all work.

To test the full Cloudflare stack locally:

```bash
npx @opennextjs/cloudflare build
npx wrangler dev
```

This starts a local Cloudflare Worker on port 8787 with D1 and DO bindings emulated locally.

## Troubleshooting

### "Service binding 'WORKER_SELF_REFERENCE' references Worker 'nextjs-tailwind-shadcn-ts'"
This was the old error. Fixed by renaming `package.json` → `tierforge` and adding explicit `wrangler.jsonc`.

### "could not determine executable to run for package @opennextjs/cloudflare"
This happened because the deploy command was `npx wrangler deploy` without running OpenNext's build first. Fixed by using `bun run deploy` which chains `opennextjs-cloudflare build && wrangler deploy`.

### "No matching export in @cloudflare/workers-types for import WebSocketPair"
`WebSocketPair` is a global in the Cloudflare Workers runtime — don't import it. Just use it directly.

### "D1 database not found"
Run `npx wrangler d1 list` to verify the database exists. Copy the `database_id` into `wrangler.jsonc`.

### "Durable Object class not found"
Make sure `src/worker/TwitchRelayDO.ts` exports `TwitchRelayDO` and `wrangler.jsonc` has the `migrations` section with `new_classes: ["TwitchRelayDO"]`. The first `wrangler deploy` auto-applies the migration.

### WebSocket not connecting
The browser connects to `/ws` which the Worker routes to the DO. Check Worker logs: `npx wrangler tail`.

### IRC connection drops
Durable Objects can idle out after 30s on the free plan. The DO uses a 25s alarm to keep itself alive. On the paid plan ($5/mo), DOs can run indefinitely.

## Costs

| Resource | Free tier | Paid ($5/mo) |
|----------|-----------|-------------|
| Worker requests | 100K/day | 10M/day |
| D1 reads | 5M/day | 25B/month |
| D1 writes | 100K/day | 50M/month |
| D1 storage | 5GB | 50GB |
| Durable Object requests | 1M/day | Unlimited |
| Durable Object duration | 400K GB-s/day | Unlimited |

The free tier is sufficient for a single streamer's use. The main limitation is the DO 30s idle timeout on free — if no browser is connected and no chat messages arrive for 30s, the IRC connection drops. The alarm reconnects automatically.
