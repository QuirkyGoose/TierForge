#!/usr/bin/env node
/**
 * Post-build patcher: injects the TwitchRelayDO Durable Object class + routing
 * into OpenNext's generated worker.js
 *
 * OpenNext's deploy command uses .open-next/worker.js as the Worker entry,
 * which only contains the Next.js handler. This script patches it to also:
 *   1. Export the TwitchRelayDO class (required by wrangler.jsonc bindings)
 *   2. Route /ws and /api/twitch/relay/* to the Durable Object
 *   3. Pass everything else to OpenNext's Next.js handler
 *
 * Run after `opennextjs-cloudflare build` and before `wrangler deploy`.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { resolve } from "path";

const workerPath = resolve(".open-next/worker.js");
const doSrcPath = resolve("src/worker/TwitchRelayDO.ts");
const doDestPath = resolve(".open-next/TwitchRelayDO.ts");

if (!existsSync(workerPath)) {
  console.error("✗ .open-next/worker.js not found. Run opennextjs-cloudflare build first.");
  process.exit(1);
}

if (!existsSync(doSrcPath)) {
  console.error("✗ src/worker/TwitchRelayDO.ts not found.");
  process.exit(1);
}

// 1. Copy the DO source into .open-next/ so wrangler can bundle it
copyFileSync(doSrcPath, doDestPath);
console.log("✓ Copied TwitchRelayDO.ts to .open-next/");

// 2. Read the generated worker.js
const original = readFileSync(workerPath, "utf8");

// Check if already patched
if (original.includes("// TIERFORGE_PATCH_APPLIED")) {
  console.log("✓ worker.js already patched");
  process.exit(0);
}

// 3. Find and replace `export default {` with `const __tierforgeOriginal = {`
// This captures the original OpenNext handler so we can delegate to it.
const exportDefaultIdx = original.indexOf("export default {");
if (exportDefaultIdx === -1) {
  console.error("✗ Could not find 'export default {' in worker.js");
  console.error("  OpenNext output format may have changed. Check .open-next/worker.js");
  process.exit(1);
}

// Build the patched file:
// - Prepend the DO import + export
// - Replace `export default {` with `const __tierforgeOriginal = {`
// - Append our routing wrapper as the new `export default`

const before = original.slice(0, exportDefaultIdx);
const after = original.slice(exportDefaultIdx + "export default {".length);

const patched =
  // Prepend: DO import + export
  `// TIERFORGE_PATCH_APPLIED
// === Tier Forge: Durable Object + WebSocket routing ===
// Injected by scripts/patch-worker.mjs after OpenNext build.
// @ts-ignore — TypeScript source, wrangler bundles it
import { TwitchRelayDO } from "./TwitchRelayDO.ts";
export { TwitchRelayDO };
// === End Tier Forge patch ===

` +
  before +
  // Replace `export default {` with `const __tierforgeOriginal = {`
  `const __tierforgeOriginal = {` +
  after +
  // Append: routing wrapper as the new default export
  `

// === Tier Forge: routing default export ===
const __tierforgeDoId = "twitch-relay";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route WebSocket upgrades to the Durable Object
    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      const id = env.TWITCH_RELAY.idFromName(__tierforgeDoId);
      const stub = env.TWITCH_RELAY.get(id);
      return stub.fetch(request);
    }

    // Route relay control endpoints to the Durable Object
    if (url.pathname.startsWith("/api/twitch/relay/")) {
      const id = env.TWITCH_RELAY.idFromName(__tierforgeDoId);
      const stub = env.TWITCH_RELAY.get(id);
      const newPath = url.pathname.replace("/api/twitch/relay", "");
      const newUrl = new URL(newPath + url.search, url.origin);
      const newRequest = new Request(newUrl, request);
      return stub.fetch(newRequest);
    }

    // Everything else → Next.js (via OpenNext)
    return __tierforgeOriginal.fetch(request, env, ctx);
  },
};
// === End Tier Forge routing ===
`;

// 4. Write the patched file
writeFileSync(workerPath, patched);
console.log("✓ Patched .open-next/worker.js with TwitchRelayDO export + routing");
console.log("  - DO class: exported from ./TwitchRelayDO.ts");
console.log("  - /ws → Durable Object (WebSocket)");
console.log("  - /api/twitch/relay/* → Durable Object (HTTP control)");
console.log("  - everything else → OpenNext Next.js handler");
