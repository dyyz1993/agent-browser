#!/bin/bash
# Test all CLI commands have --help support
# Run this before commits to ensure help documentation is complete

set -e

echo "Testing all CLI commands for --help support..."

# 所有顶级命令列表
COMMANDS=(
  "open" "click" "dblclick" "type" "fill" "press" "hover" "focus"
  "check" "uncheck" "select" "drag" "upload" "download" "scroll" "scrollintoview"
  "wait" "screenshot" "pdf" "snapshot" "eval" "connect" "close"
  "back" "forward" "reload"
  "get" "is" "find" "mouse" "set" "network" "storage" "cookies" "tab"
  "trace" "record" "recorder" "console" "errors" "highlight" "state"
  "viewer" "ask" "config" "device" "dialog" "frame" "window" "tap" "swipe"
  "session"
)

FAILED=()
PASSED=()

for cmd in "${COMMANDS[@]}"; do
  output=$(node dist/cli.js "$cmd" --help 2>&1)
  # 检查输出是否包含用法说明
  if echo "$output" | grep -qi "usage\|agent-browser $cmd"; then
    PASSED+=("$cmd")
  else
    FAILED+=("$cmd")
    echo "FAILED: $cmd"
    echo "Output: $output" | head -5
    echo "---"
  fi
done

echo ""
echo "=== Summary ==="
echo "PASSED: ${#PASSED[@]}"
echo "FAILED: ${#FAILED[@]}"

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "The following commands need --help support:"
  printf '  - %s\n' "${FAILED[@]}"
  exit 1
fi

echo ""
echo "All commands have proper --help support!"
exit 0