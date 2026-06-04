#!/usr/bin/env bash
# Template: Recorder Workflow
# Purpose: Record browser actions, save as YAML, replay later
# Usage: ./recorder-workflow.sh [url] [output.yaml]
#
# Records your interactions into a replayable YAML workflow file.
# Useful for test automation, demo creation, and regression testing.

set -euo pipefail

URL="${1:?https://example.com/form}"
OUTPUT="${2:-recording-$(date +%Y%m%d-%H%M%S).yaml}"
SESSION="record-$(date +%s)"

echo "=== Recorder Workflow: $URL ==="

# Step 1: Start recording
agent-browser recorder start --session "$SESSION"
echo "Recording started on session: $SESSION"

# Step 2: Navigate and perform workflow
agent-browser --session "$SESSION" open "$URL"
agent-browser --session "$SESSION" wait --load networkidle

echo ""
echo "Form structure (copy refs from below):"
agent-browser --session "$SESSION" snapshot -i

# Step 3: Perform your actions here (uncomment/customize):
#
# agent-browser --session "$SESSION" fill @e1 "user@example.com"
# agent-browser --session "$SESSION" fill @e2 "password123"
# agent-browser --session "$SESSION" click @e3
# agent-browser --session "$SESSION" wait --load networkidle
# agent-browser --session "$SESSION" snapshot -i  # Verify

echo ""
echo "Waiting ${TIMEOUT:-10}s before stopping recording..."
sleep "${TIMEOUT:-10}"

# Step 4: Stop recording and save
agent-browser recorder stop --session "$SESSION" --output "$OUTPUT"
echo ""
echo "Saved recording to: $OUTPUT"
echo ""
echo "To replay:"
echo "  agent-browser recorder replay $OUTPUT"

# Cleanup
agent-browser --session "$SESSION" close
echo "Done"
