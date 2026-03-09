#!/bin/bash
# Network Interception Data Collection Template
# Usage: ./network-intercept-crawl.sh <url> <output-dir> [max-scrolls]
#
# This script demonstrates how to capture API data using network interception.
# It handles infinite scroll pages that load data via AJAX/fetch calls.
#
# Prerequisites:
#   - agent-browser installed and in PATH
#   - jq for JSON processing
#
# Environment Variables:
#   SCROLL_CONTAINER - CSS selector for scroll container (default: auto-detect)
#   SCROLL_DELAY     - Seconds to wait after scroll (default: 2)
#   MAX_NO_NEW       - Stop after N scrolls with no new data (default: 3)
#
# Examples:
#   ./network-intercept-crawl.sh https://example.com/feed ./output 20
#   SCROLL_CONTAINER=".feed-list" ./network-intercept-crawl.sh https://example.com/products ./data

set -e

# Configuration
TARGET_URL="${1:-https://example.com}"
OUTPUT_DIR="${2:-./collected-data}"
MAX_SCROLLS="${3:-20}"
SCROLL_CONTAINER="${SCROLL_CONTAINER:-}"  # CSS selector for scroll container (empty = auto-detect)
SCROLL_DELAY="${SCROLL_DELAY:-2}"          # Seconds to wait after scroll
MAX_NO_NEW="${MAX_NO_NEW:-3}"              # Stop after N scrolls with no new data

mkdir -p "$OUTPUT_DIR"

echo "=========================================="
echo "  Network Interception Data Collection"
echo "=========================================="
echo "  URL: $TARGET_URL"
echo "  Output: $OUTPUT_DIR"
echo "  Max scrolls: $MAX_SCROLLS"
echo "=========================================="

# Cleanup function
cleanup() {
    echo ""
    echo "[Cleanup] Closing browser..."
    agent-browser kill 2>/dev/null || true
}
trap cleanup EXIT

# Step 1: Start fresh
echo ""
echo "[Step 1] Starting browser session..."
agent-browser kill 2>/dev/null || true
sleep 1

# Step 2: Enable network interception
echo "[Step 2] Enabling network request capture..."
agent-browser network requests --capture-response

# Step 3: Navigate to target page
echo "[Step 3] Opening target URL..."
agent-browser open "$TARGET_URL"
agent-browser wait --load networkidle
sleep 2

# Step 4: Auto-detect scroll container if not specified
if [ -z "$SCROLL_CONTAINER" ]; then
    echo "[Step 4] Auto-detecting scroll container..."
    DETECTED_CONTAINER=$(agent-browser eval --stdin <<'EOF'
(() => {
    // Check for common scroll container patterns
    const selectors = [
        '.simulation-area',
        '.feed-container',
        '.scroll-container',
        '[class*="scroll"]',
        '[class*="feed"]',
        '[class*="list"]',
        '.content',
        'main'
    ];

    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.scrollHeight > el.clientHeight) {
            return sel;
        }
    }
    return '';  // Use window scroll
})()
EOF
)
    # Extract container from JSON response
    SCROLL_CONTAINER=$(echo "$DETECTED_CONTAINER" | jq -r '.' 2>/dev/null || echo "")

    if [ -n "$SCROLL_CONTAINER" ] && [ "$SCROLL_CONTAINER" != "null" ] && [ "$SCROLL_CONTAINER" != "" ]; then
        echo "  Detected container: $SCROLL_CONTAINER"
    else
        echo "  No container detected, using window scroll"
        SCROLL_CONTAINER=""
    fi
else
    echo "[Step 4] Using specified container: $SCROLL_CONTAINER"
fi

# Step 5: Extract initial data
echo "[Step 5] Extracting initial captured requests..."

# Function to get all captured requests
get_all_requests() {
    agent-browser network requests --capture-response --type json --json 2>/dev/null
}

# Function to count requests with response bodies
count_valid_requests() {
    local json_data="$1"
    echo "$json_data" | jq '.data.requests | map(select(.responseBody != null)) | length' 2>/dev/null || echo "0"
}

# Function to count unique IDs in data
count_unique_ids() {
    local json_data="$1"
    local id_field="${2:-id}"
    echo "$json_data" | jq -c "[.data.requests[].responseBody | select(. != null) | .[]?.${id_field}] | unique | length" 2>/dev/null || echo "0"
}

# Initialize tracking - cumulative approach (no clearing!)
ALL_DATA_FILE="$OUTPUT_DIR/all-captures.json"
PROCESSED_COUNT=0  # Track how many requests we've already processed

# Get initial data
get_all_requests > "$ALL_DATA_FILE"
TOTAL_REQUESTS=$(count_valid_requests "$(cat "$ALL_DATA_FILE")")
INITIAL_IDS=$(count_unique_ids "$(cat "$ALL_DATA_FILE")")
PROCESSED_COUNT=$TOTAL_REQUESTS

echo "  Initial capture: $TOTAL_REQUESTS requests, ~$INITIAL_IDS unique items"
echo "  Using cumulative mode (no data loss from clearing)"

# Step 6: Scroll to load more data
echo ""
echo "[Step 6] Scrolling to load more data..."

NO_NEW_COUNT=0
SCROLL_COUNT=0

while [ $SCROLL_COUNT -lt $MAX_SCROLLS ]; do
    SCROLL_COUNT=$((SCROLL_COUNT + 1))

    # Perform scroll
    if [ -n "$SCROLL_CONTAINER" ]; then
        # Scroll within specific container
        agent-browser eval --stdin <<EOF
(() => {
    const container = document.querySelector('$SCROLL_CONTAINER');
    if (container) {
        container.scrollTop = container.scrollHeight;
        return { scrolled: true, scrollTop: container.scrollTop };
    }
    return { scrolled: false, error: 'Container not found' };
})()
EOF
    else
        # Scroll the page
        agent-browser scroll down 1000
    fi

    # Wait for new requests
    sleep "$SCROLL_DELAY"

    # Get ALL requests (cumulative, no clearing!)
    get_all_requests > "$ALL_DATA_FILE"

    # Count total requests now
    NEW_TOTAL=$(count_valid_requests "$(cat "$ALL_DATA_FILE")")

    # Calculate how many new requests we got (offset from last processed)
    NEW_COUNT=$((NEW_TOTAL - PROCESSED_COUNT))

    if [ "$NEW_COUNT" -le 0 ]; then
        echo "  Scroll $SCROLL_COUNT: No new requests captured (total: $NEW_TOTAL)"
        NO_NEW_COUNT=$((NO_NEW_COUNT + 1))

        if [ $NO_NEW_COUNT -ge $MAX_NO_NEW ]; then
            echo ""
            echo "  [Stop] Consecutive $MAX_NO_NEW scrolls with no new data"
            break
        fi
    else
        echo "  Scroll $SCROLL_COUNT: Captured $NEW_COUNT new requests (total: $NEW_TOTAL)"

        # Extract only NEW requests using offset
        if [ $PROCESSED_COUNT -gt 0 ]; then
            jq ".data.requests[$PROCESSED_COUNT:]" "$ALL_DATA_FILE" > "$OUTPUT_DIR/scroll-${SCROLL_COUNT}-new.json" 2>/dev/null || true
        else
            jq '.data.requests' "$ALL_DATA_FILE" > "$OUTPUT_DIR/scroll-${SCROLL_COUNT}-new.json" 2>/dev/null || true
        fi

        # Update processed count
        PROCESSED_COUNT=$NEW_TOTAL
        NO_NEW_COUNT=0
    fi
done

# Step 7: Extract and save final data
echo ""
echo "[Step 7] Processing collected data..."

# Extract response bodies from all captured requests
OUTPUT_DATA="$OUTPUT_DIR/collected-data.json"
jq '
    .data.requests |
    map(select(.responseBody != null)) |
    map({
        url: .url,
        method: .method,
        status: .status,
        contentType: .contentType,
        timestamp: .timestamp,
        data: .responseBody
    })
' "$ALL_DATA_FILE" > "$OUTPUT_DATA" 2>/dev/null || echo "[]" > "$OUTPUT_DATA"

TOTAL_ITEMS=$(jq 'map(select(.data != null and .data != [])) | length' "$OUTPUT_DATA")
UNIQUE_IDS=$(count_unique_ids "$(cat "$ALL_DATA_FILE")")

echo "  Total API responses captured: $TOTAL_ITEMS"
echo "  Unique items identified: $UNIQUE_IDS"

# Save summary
SUMMARY_FILE="$OUTPUT_DIR/summary.json"
jq -n "
{
    collectedAt: \"$(date -Iseconds)\",
    targetUrl: \"$TARGET_URL\",
    scrollContainer: \"$SCROLL_CONTAINER\",
    totalScrolls: $SCROLL_COUNT,
    totalRequests: $TOTAL_ITEMS,
    uniqueItems: $UNIQUE_IDS,
    mode: \"cumulative-no-clear\",
    outputFiles: [
        \"collected-data.json\",
        \"all-captures.json\"
    ]
}
" > "$SUMMARY_FILE"

echo ""
echo "=========================================="
echo "  Collection Complete"
echo "=========================================="
echo "  Output directory: $OUTPUT_DIR"
echo "  Total responses: $TOTAL_ITEMS"
echo "  Files created:"
ls -la "$OUTPUT_DIR"
echo "=========================================="