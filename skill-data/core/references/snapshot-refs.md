# Snapshot and Refs

Compact element references that reduce context usage dramatically for AI agents.

**Related**: [commands.md](commands.md) for full command reference, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [How Refs Work](#how-refs-work)
- [Snapshot Command](#the-snapshot-command)
- [Using Refs](#using-refs)
- [Ref Lifecycle](#ref-lifecycle)
- [Converting to Shell Scripts](#converting-to-shell-scripts)
- [Best Practices](#best-practices)
- [Ref Notation Details](#ref-notation-details)
- [Troubleshooting](#troubleshooting)

## How Refs Work

Traditional approach:
```
Full DOM/HTML → AI parses → CSS selector → Action (~3000-5000 tokens)
```

agent-browser approach:
```
Compact snapshot → @refs assigned → Direct interaction (~200-400 tokens)
```

## The Snapshot Command

```bash
# Basic snapshot (shows page structure)
agent-browser snapshot

# Interactive snapshot (-i flag) - RECOMMENDED
agent-browser snapshot -i

# Get element paths (xpath, cssPath)
agent-browser snapshot -s "body" --path

# Get element attributes
agent-browser snapshot -s "body" --attrs

# Get both paths and attributes
agent-browser snapshot -s "body" --path --attrs
```

### Path and Attributes Options

When you need to get element paths or attributes, use `--path` and `--attrs`:

```bash
# Get xpath and cssPath for debugging or external tools
agent-browser snapshot --path
agent-browser snapshot -s "body" --path

# Get element attributes for analysis
agent-browser snapshot --attrs
agent-browser snapshot -s "body" --attrs
```

**Note:** Using `--selector` is optional but recommended to limit scope and prevent large responses.

**XPath Generation Rules:**
1. Priority: `id` > `data-testid` > `data-id` > semantic class > position index
2. Maximum 5 levels deep
3. Filters out utility classes (Tailwind, etc.)
4. Uses semantic tags (main, nav, form) as anchors

### Snapshot Output Format

```
Page: Example Site - Home
URL: https://example.com

@e1 [header]
  @e2 [nav]
    @e3 [a] "Home"
    @e4 [a] "Products"
    @e5 [a] "About"
  @e6 [button] "Sign In"

@e7 [main]
  @e8 [h1] "Welcome"
  @e9 [form]
    @e10 [input type="email"] placeholder="Email"
    @e11 [input type="password"] placeholder="Password"
    @e12 [button type="submit"] "Log In"

@e13 [footer]
  @e14 [a] "Privacy Policy"
```

## Using Refs

Once you have refs, interact directly:

```bash
# Click the "Sign In" button
agent-browser click @e6

# Fill email input
agent-browser fill @e10 "user@example.com"

# Fill password
agent-browser fill @e11 "password123"

# Submit the form
agent-browser click @e12
```

## Ref Lifecycle

**IMPORTANT**: Refs are invalidated when the page changes!

```bash
# Get initial snapshot
agent-browser snapshot -i
# @e1 [button] "Next"

# Click triggers page change
agent-browser click @e1

# MUST re-snapshot to get new refs!
agent-browser snapshot -i
# @e1 [h1] "Page 2"  ← Different element now!
```

## Converting to Shell Scripts

**CRITICAL**: Refs (`@e1`, `@e2`, etc.) are session-specific and cannot be used in standalone shell scripts!

### The Problem

When you use `snapshot -i` during an interactive session, refs are dynamically assigned based on the current page state. These refs are stored in memory and only valid for that specific browser session. If you convert your workflow to a shell script, the refs will not match:

```bash
# This works in interactive session
agent-browser snapshot -i
# Output: @e1 [button] "Submit"

agent-browser click @e1  # Works because ref is in memory

# But this FAILS in a shell script
#!/bin/bash
agent-browser open https://example.com
agent-browser click @e1  # ERROR: Ref @e1 not found!
```

### Solution: Use Alternative Locators

When creating reusable shell scripts, use one of these approaches instead of refs:

#### Option 1: Semantic Locators (Recommended)

```bash
#!/bin/bash
agent-browser open https://example.com/login

# Use find command with semantic locators
agent-browser find label "Email" fill "user@example.com"
agent-browser find label "Password" fill "password123"
agent-browser find role button click --name "Sign In"
```

#### Option 2: CSS Selectors

```bash
#!/bin/bash
agent-browser open https://example.com/login

# Use CSS selectors directly
agent-browser fill "#email" "user@example.com"
agent-browser fill "#password" "password123"
agent-browser click "button[type='submit']"
```

#### Option 3: XPath (from snapshot --path)

First, get the xpath during interactive session:

```bash
agent-browser snapshot -s "body" --path
# Output includes: xpath="/html/body/div/form/button"
```

Then use in script:

```bash
#!/bin/bash
agent-browser open https://example.com/login
agent-browser fill "xpath=/html/body/div/form/input[@type='email']" "user@example.com"
agent-browser click "xpath=/html/body/div/form/button"
```

#### Option 4: Snapshot with JSON Parsing

For dynamic pages where selectors may change, parse snapshot output:

```bash
#!/bin/bash
agent-browser open https://example.com

# Get refs in JSON format and parse
SNAPSHOT=$(agent-browser snapshot -i --json)
BUTTON_REF=$(echo "$SNAPSHOT" | jq -r '.data.refs | to_entries[] | select(.value.name == "Submit") | .key')

# Note: This still requires the session to be active
agent-browser click "@$BUTTON_REF"
```

#### Option 5: Use Recorder (Recommended for Complex Workflows)

The recorder captures your interactions and outputs stable selectors (xpath) that work in scripts:

```bash
# Step 1: Start recording
agent-browser recorder start https://example.com

# Step 2: Perform your workflow (use refs normally)
agent-browser snapshot -i
agent-browser click @e1
agent-browser fill @e2 "text"
agent-browser click @e3

# Step 3: Stop recording and save
agent-browser recorder stop --output workflow.yaml
```

The recorder outputs a YAML file with stable selectors:

```yaml
steps:
  - action: click
    xpath: "//a[contains(text(), 'Learn more')]"  # Use this in scripts!
  - action: fill
    xpath: "//input[@id='email']"
    value: "text"
```

**Important:** The recorder's "CLI Commands" section may contain incorrect syntax (like `click "first a"` or `click "@e1"`). Always use the `xpath` field from the YAML output:

```bash
#!/bin/bash
# Convert recorder output to working script
agent-browser open https://example.com
agent-browser click 'xpath=//a[contains(text(), "Learn more")]'
agent-browser fill 'xpath=//input[@id="email"]' "text"
```

### Best Practice: Interactive → Script Workflow

1. **Interactive Phase**: Use refs for quick iteration and testing
2. **Script Phase**: Replace refs with semantic locators or CSS selectors
3. **Verification**: Test the script independently to ensure it works

```bash
# Interactive workflow (with refs)
agent-browser open https://example.com
agent-browser snapshot -i
agent-browser fill @e1 "test@example.com"
agent-browser click @e2

# Converted script (without refs)
#!/bin/bash
agent-browser open https://example.com
agent-browser find placeholder "Email" fill "test@example.com"
agent-browser find role button click --name "Submit"
```

### Quick Reference: Locator Types

| Locator Type | Example | Best For |
|-------------|---------|----------|
| Ref | `@e1` | Interactive sessions only |
| Semantic | `find label "Email"` | Reusable scripts (recommended) |
| CSS | `#email`, `.btn-submit` | Stable page structures |
| XPath | `xpath=//button[@type='submit']` | Complex queries |
| Role | `find role button --name "Submit"` | Accessibility-focused |
| Recorder | `recorder stop --output workflow.yaml` | Complex workflows, auto-capture xpath |

## Best Practices

### 1. Always Snapshot Before Interacting

```bash
# CORRECT
agent-browser open https://example.com
agent-browser snapshot -i          # Get refs first
agent-browser click @e1            # Use ref

# WRONG
agent-browser open https://example.com
agent-browser click @e1            # Ref doesn't exist yet!
```

### 2. Re-Snapshot After Navigation

```bash
agent-browser click @e5            # Navigates to new page
agent-browser snapshot -i          # Get new refs
agent-browser click @e1            # Use new refs
```

### 3. Re-Snapshot After Dynamic Changes

```bash
agent-browser click @e1            # Opens dropdown
agent-browser snapshot -i          # See dropdown items
agent-browser click @e7            # Select item
```

### 4. Snapshot Specific Regions

For complex pages, snapshot specific areas:

```bash
# Snapshot just the form
agent-browser snapshot @e9
```

## Ref Notation Details

```
@e1 [tag type="value"] "text content" placeholder="hint"
│    │   │             │               │
│    │   │             │               └─ Additional attributes
│    │   │             └─ Visible text
│    │   └─ Key attributes shown
│    └─ HTML tag name
└─ Unique ref ID
```

### Common Patterns

```
@e1 [button] "Submit"                    # Button with text
@e2 [input type="email"]                 # Email input
@e3 [input type="password"]              # Password input
@e4 [a href="/page"] "Link Text"         # Anchor link
@e5 [select]                             # Dropdown
@e6 [textarea] placeholder="Message"     # Text area
@e7 [div class="modal"]                  # Container (when relevant)
@e8 [img alt="Logo"]                     # Image
@e9 [checkbox] checked                   # Checked checkbox
@e10 [radio] selected                    # Selected radio
```

## Troubleshooting

### "Ref not found" Error

```bash
# Ref may have changed - re-snapshot
agent-browser snapshot -i
```

### Element Not Visible in Snapshot

```bash
# Scroll to reveal element
agent-browser scroll down 500
agent-browser snapshot -i

# Or wait for dynamic content
agent-browser wait 1000
agent-browser snapshot -i
```

### Too Many Elements

```bash
# Snapshot specific container
agent-browser snapshot @e5

# Or use get text for content-only extraction
agent-browser get text @e5
```
