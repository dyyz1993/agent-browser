#!/usr/bin/env bash
# Template: Form Automation Workflow
# Purpose: Fill and submit web forms with validation
# Usage: ./form-automation.sh <form-url>
#
# Demonstrates: snapshot -> interact -> verify pattern

set -euo pipefail

FORM_URL="${1:?Usage: $0 <form-url>}"
SESSION="form-$(date +%s)"

echo "=== Form Automation: $FORM_URL ==="

# Step 1: Navigate to form
agent-browser --session "$SESSION" open "$FORM_URL"
agent-browser --session "$SESSION" wait --load networkidle

# Step 2: Snapshot to discover form elements
echo ""
echo "Form structure:"
agent-browser --session "$SESSION" snapshot -i

# Step 3: Fill form fields (customize refs based on snapshot output above)
#
# Common field types:
#   agent-browser fill @e1 "John Doe"           # Text input
#   agent-browser fill @e2 "user@example.com"   # Email input
#   agent-browser fill @e3 "SecureP@ss123"      # Password input
#   agent-browser select @e4 "Option Value"     # Dropdown
#   agent-browser check @e5                     # Checkbox
#   agent-browser click @e6                     # Radio button / Submit button
#   agent-browser fill @e7 "Multi-line text"   # Textarea
#   agent-browser upload @e8 /path/to/file.pdf # File upload
#
# Uncomment and modify:
# agent-browser --session "$SESSION" fill @e1 "Test User"
# agent-browser --session "$SESSION" fill @e2 "test@example.com"
# agent-browser --session "$SESSION" click @e3  # Submit button

# Step 4: Wait for submission to complete
agent-browser --session "$SESSION" wait --load networkidle
# agent-browser --session "$SESSION" wait --url "**/success"  # Or wait for redirect

# Step 5: Verify result
echo ""
echo "Result:"
agent-browser --session "$SESSION" get url
agent-browser --session "$SESSION" snapshot -i

# Optional: Capture evidence
agent-browser --session "$SESSION" screenshot /tmp/form-result.png
echo "Screenshot saved: /tmp/form-result.png"

# Cleanup
agent-browser close
echo "Done"
