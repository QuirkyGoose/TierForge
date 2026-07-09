#!/bin/bash
# Twitch Relay — startup script
# Run this in a separate terminal to start the Twitch IRC + socket.io relay.
# The relay listens on port 3003 and bridges Twitch chat to the Tier Forge Next.js app.
#
# Usage:
#   bash /home/z/my-project/scripts/start-relay.sh
#
# Logs are written to:
#   /home/z/my-project/mini-services/twitch-relay/relay.log

set -e

RELAY_DIR="/home/z/my-project/mini-services/twitch-relay"
LOG_FILE="$RELAY_DIR/relay.log"

# Kill any existing relay
pkill -9 -f "twitch-relay/index" 2>/dev/null || true
pkill -9 -f "bun.*index.ts" 2>/dev/null || true
sleep 1

cd "$RELAY_DIR"

echo "Starting Twitch relay on port 3003..."
echo "Logs: $LOG_FILE"
echo "Press Ctrl+C to stop."

# Foreground execution — this is meant to be run in a dedicated terminal
exec bun index.ts 2>&1 | tee "$LOG_FILE"
