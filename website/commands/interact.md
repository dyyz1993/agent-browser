# interact

Multi-step browser automation with click, type, scroll, and wait actions.

## Syntax

```bash
agent-browser interact <url> --steps '<json>' [options]
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--steps` | - | JSON array of actions to perform |
| `--timeout` | `15000` | Page load timeout in milliseconds |
| `--output` | `screenshot` | Output type: `screenshot`, `content`, `html` |

## Step Actions

Each step is an object with an `action` field:

### click

Click on an element:

```json
{ "action": "click", "selector": "#submit-button" }
```

### type

Type text into an input:

```json
{ "action": "type", "selector": "#search-input", "value": "hello world" }
```

### scroll

Scroll the page:

```json
{ "action": "scroll", "direction": "down", "amount": 500 }
```

### wait

Wait for an element or duration:

```json
{ "action": "wait", "selector": ".results" }
{ "action": "wait", "duration": 2000 }
```

### screenshot

Take a screenshot:

```json
{ "action": "screenshot" }
```

## Examples

### Search and extract results

```bash
agent-browser interact https://example.com \
  --steps '[{"action":"type","selector":"#search","value":"test"},{"action":"click","selector":"#search-btn"},{"action":"wait","selector":".results"},{"action":"screenshot"}]'
```

### Fill a form

```bash
agent-browser interact https://example.com/form \
  --steps '[
    {"action":"type","selector":"#name","value":"John"},
    {"action":"type","selector":"#email","value":"john@example.com"},
    {"action":"click","selector":"#submit"},
    {"action":"wait","duration":2000},
    {"action":"screenshot"}
  ]'
```

## Notes

- Steps execute sequentially
- If any step fails, the interaction stops and returns an error
- Screenshots are saved as PNG files
- Use `--output content` to extract final page content instead of screenshot
