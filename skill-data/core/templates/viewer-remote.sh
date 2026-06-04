#!/usr/bin/env bash
# Template: Viewer Remote Control Workflow
# Purpose: Open browser, start viewer, interact remotely via streaming UI
# Usage: ./viewer-remote.sh [url] [timeout-seconds]
#
# The viewer streams real-time browser frames to your local browser.
# On touch devices, you get touchpad + input panel for mobile control.

set -euo pipefail

URL="${1:?https://www.baidu.com}"
TIMEOUT="${2:-300}"
SESSION="viewer-$(date +%s)"

echo "=== Viewer Remote Control: $URL ==="

# Step 1: Launch browser (headed so you can see it locally too)
agent-browser --session "$SESSION" --headed open "$URL"
agent-browser --session "$SESSION" wait --load networkidle

# Step 2: Start viewer and get connection URL
VIEWER_INFO=$(agent-browser --session "$SESSION" viewer --json)
echo "Viewer info: $VIEWER_INFO"

# Extract URL (requires jq)
VIEWER_URL=$(echo "$VIEWER_INFO" | jq -r '.url // 2>/dev/null || echo "Check port 5005 manually")
echo ""
echo "Open this URL in your browser:"
echo "  $VIEWER_URL"
echo ""
echo "Tips:"
echo "  - Desktop: Click/drag/scroll on the streamed screen area"
echo "  - Mobile: Use touchpad at bottom for cursor, tap inputs for text panel"
echo "  - Tap a remote input field to open mobile text input"
echo ""
echo "Viewer will auto-close after ${TIMEOUT}s..."
sleep "$TIMEOUT"

# Cleanup
agent-browser --session "$SESSION" close
echo "Done"
