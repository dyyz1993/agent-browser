#!/bin/bash
# Data Extraction Template - Universal pattern for web scraping
# Usage: ./data-extraction.sh <url> [output_file] [mode]
#
# Modes:
#   dom       - Extract from DOM elements (default)
#   js        - Extract from JavaScript global variables
#   api       - Intercept API responses
#   scroll    - Infinite scroll collection
#
# Examples:
#   ./data-extraction.sh https://example.com/products
#   ./data-extraction.sh https://example.com/api/data output.json api
#   ./data-extraction.sh https://example.com/list items.json scroll

set -euo pipefail

TARGET_URL="${1:?Usage: $0 <url> [output_file] [mode]}"
OUTPUT_FILE="${2:-/tmp/extracted-data.json}"
MODE="${3:-dom}"
REQUEST_PATTERN="${4:-api/}"

echo "=== Data Extraction Template ==="
echo "URL: $TARGET_URL"
echo "Mode: $MODE"
echo "Output: $OUTPUT_FILE"
echo ""

echo "=== 1. Close old session ==="
agent-browser close 2>/dev/null
sleep 1

case "$MODE" in
  api)
    echo ""
    echo "=== 2. API Interception Mode ==="
    export https_proxy=${PROXY_URL:-http://127.0.0.1:7890}
    agent-browser open "about:blank"
    sleep 1
    
    echo ""
    echo "=== 3. Start request listener ==="
    (agent-browser wait --request "$REQUEST_PATTERN" --timeout 30000 > /tmp/api-response.json 2>&1) &
    WAIT_PID=$!
    sleep 1
    
    echo ""
    echo "=== 4. Navigate to trigger API ==="
    agent-browser open "$TARGET_URL"
    
    echo ""
    echo "=== 5. Wait for response ==="
    wait $WAIT_PID 2>/dev/null || true
    
    if [ -f /tmp/api-response.json ] && [ -s /tmp/api-response.json ]; then
      jq '.' /tmp/api-response.json > "$OUTPUT_FILE"
      echo "API response saved to: $OUTPUT_FILE"
    else
      echo "Warning: No API response captured, falling back to DOM extraction"
      agent-browser eval 'document.body.innerText' > "$OUTPUT_FILE"
    fi
    ;;
    
  scroll)
    echo ""
    echo "=== 2. Infinite Scroll Mode ==="
    export https_proxy=${PROXY_URL:-http://127.0.0.1:7890}
    agent-browser open "$TARGET_URL"
    sleep 2
    
    ALL_DATA="[]"
    PREV_COUNT=0
    MAX_ITERATIONS=50
    
    for i in $(seq 1 $MAX_ITERATIONS); do
      CURRENT=$(agent-browser eval '
        JSON.stringify(
          Array.from(document.querySelectorAll("a, .item, .card"))
            .slice(0, 100)
            .map(el => ({
              text: el.textContent?.trim()?.substring(0, 200),
              href: el.href || null
            }))
            .filter(item => item.text && item.text.length > 0)
        )
      ')
      
      ALL_DATA=$(echo "$ALL_DATA" "$CURRENT" | python3 -c "
import sys, json
data = []
for line in sys.stdin:
    line = line.strip()
    if line:
        try:
            d = json.loads(line)
            if isinstance(d, list): data.extend(d)
        except: pass
seen = set()
unique = []
for item in data:
    key = item.get('href') or item.get('text', '')[:50]
    if key not in seen:
        seen.add(key)
        unique.append(item)
print(json.dumps(unique, ensure_ascii=False))
      " 2>/dev/null || echo "[]")
      
      COUNT=$(echo "$ALL_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
      echo "[$i] Collected: $COUNT items"
      
      if [ "$COUNT" -eq "$PREV_COUNT" ] && [ "$COUNT" -gt 0 ]; then
        echo "No new items, reached end"
        break
      fi
      PREV_COUNT=$COUNT
      
      agent-browser scroll down 500
      sleep 0.5
    done
    
    echo "$ALL_DATA" | python3 -m json.tool > "$OUTPUT_FILE" 2>/dev/null || echo "$ALL_DATA" > "$OUTPUT_FILE"
    echo "Scroll data saved to: $OUTPUT_FILE"
    ;;
    
  js)
    echo ""
    echo "=== 2. JS Variable Extraction Mode ==="
    export https_proxy=${PROXY_URL:-http://127.0.0.1:7890}
    agent-browser open "$TARGET_URL"
    sleep 3
    
    agent-browser eval '
      const result = {
        url: window.location.href,
        title: document.title,
        
        __INITIAL_STATE__: window.__INITIAL_STATE__ || null,
        __NEXT_DATA__: window.__NEXT_DATA__ || null,
        __NUXT__: window.__NUXT__ || null,
        dataLayer: window.dataLayer || null,
        
        custom: {}
      };
      
      JSON.stringify(result, (k, v) => {
        if (typeof v === "function") return "[Function]";
        return v;
      }, 2);
    ' > "$OUTPUT_FILE"
    echo "JS variables saved to: $OUTPUT_FILE"
    ;;
    
  dom|*)
    echo ""
    echo "=== 2. DOM Extraction Mode ==="
    export https_proxy=${PROXY_URL:-http://127.0.0.1:7890}
    agent-browser open "$TARGET_URL"
    sleep 2
    
    agent-browser eval '
      const extractText = (sel) => {
        const el = document.querySelector(sel);
        return el?.textContent?.trim() || null;
      };
      
      const extractAll = (sel, mapFn) => {
        return Array.from(document.querySelectorAll(sel))
          .map(mapFn)
          .filter(Boolean);
      };
      
      const data = {
        url: window.location.href,
        title: document.title,
        meta: {
          description: extractText("meta[name=\"description\"]"),
          keywords: extractText("meta[name=\"keywords\"]")
        },
        headings: extractAll("h1, h2, h3", el => ({
          level: el.tagName,
          text: el.textContent?.trim()
        })),
        links: extractAll("a[href]", el => ({
          text: el.textContent?.trim()?.substring(0, 100),
          href: el.href
        })).slice(0, 50),
        images: extractAll("img[src]", el => ({
          alt: el.alt,
          src: el.src
        })).slice(0, 20),
        bodyText: document.body.innerText.substring(0, 5000)
      };
      
      JSON.stringify(data, null, 2);
    ' > "$OUTPUT_FILE"
    echo "DOM data saved to: $OUTPUT_FILE"
    ;;
esac

echo ""
echo "=== 6. Preview results ==="
head -100 "$OUTPUT_FILE"

echo ""
echo "=== 7. Close browser ==="
agent-browser close

echo ""
echo "=== Extraction Complete ==="
echo "Total items: $(wc -l < "$OUTPUT_FILE") lines"
