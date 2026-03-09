#!/bin/bash
# API Interception Template - Passively capture API responses
# Usage: ./api-interception.sh [target_url] [output_file]

TARGET_URL="${1:-https://example.com/user/profile}"
OUTPUT_FILE="${2:-/tmp/api-response.json}"
REQUEST_PATTERN="${3:-api/}"

echo "=== 1. Close old session ==="
agent-browser close 2>/dev/null
sleep 1

echo ""
echo "=== 2. Open blank page ==="
export https_proxy=http://127.0.0.1:7890
agent-browser open "about:blank"
sleep 1

echo ""
echo "=== 3. Start request listener in background ==="
(agent-browser wait --request "$REQUEST_PATTERN" --timeout 30000 > /tmp/api-captured.json 2>&1) &
WAIT_PID=$!
sleep 1

echo ""
echo "=== 4. Navigate to target page ==="
agent-browser open "$TARGET_URL"

echo ""
echo "=== 5. Wait for API response ==="
wait $WAIT_PID 2>/dev/null

echo ""
echo "=== 6. Process captured data ==="
if [ -f /tmp/api-captured.json ] && [ -s /tmp/api-captured.json ]; then
  # Extract response body
  jq '.body' /tmp/api-captured.json > "$OUTPUT_FILE"
  
  echo "Response saved to: $OUTPUT_FILE"
  echo ""
  echo "=== Preview ==="
  jq '.' "$OUTPUT_FILE" | head -50
else
  echo "Error: No response captured"
  exit 1
fi

echo ""
echo "=== 7. Close browser ==="
agent-browser close

echo ""
echo "=== Done ==="
