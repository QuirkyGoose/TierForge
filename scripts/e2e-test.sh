#!/bin/bash
# End-to-end test: start relay, drive the UI, capture screenshot
set -e

echo "=== Step 1: Kill any existing relay ==="
pkill -9 -f "twitch-relay/index" 2>/dev/null || true
sleep 1

echo "=== Step 2: Start relay ==="
cd /home/z/my-project/mini-services/twitch-relay
bun index.ts > /home/z/my-project/mini-services/twitch-relay/relay.log 2>&1 &
RELAY_PID=$!
disown
echo "Relay PID: $RELAY_PID"

# Wait for relay to be ready
for i in 1 2 3 4 5 6 7 8; do
  if curl -s "http://127.0.0.1:3003/?EIO=4&transport=polling" 2>/dev/null | grep -q "sid"; then
    echo "Relay ready after ${i}s"
    break
  fi
  sleep 1
done

echo "=== Step 3: Reload page via Caddy ==="
agent-browser open http://localhost:81/ 2>&1 | tail -1
agent-browser wait 2500

echo "=== Step 4: Click 'Start listening' ==="
START_REF=$(agent-browser snapshot -i 2>&1 | grep -oE 'button "Start listening" \[ref=e[0-9]+\]' | grep -oE 'e[0-9]+' | head -1)
echo "Start button ref: @$START_REF"
agent-browser click @$START_REF 2>&1 | tail -1

echo "=== Step 5: Wait for IRC connection ==="
agent-browser wait 4000

echo "=== Step 6: Take screenshot ==="
agent-browser screenshot /home/z/my-project/download/e2e-twitch-connected.png --full 2>&1 | tail -1

echo "=== Step 7: Check page state ==="
agent-browser snapshot 2>&1 | grep -iE "joined|connecting|listening|stop listening|live|idle" | head -10

echo "=== Step 8: Final relay log ==="
tail -10 /home/z/my-project/mini-services/twitch-relay/relay.log

echo "=== Step 9: Final screenshot ==="
agent-browser screenshot /home/z/my-project/download/e2e-final.png --full 2>&1 | tail -1

echo "=== DONE ==="
