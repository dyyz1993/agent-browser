# Recorder (Action Recording & Replay)

Record user interactions as structured steps that can be replayed or exported for LLM processing.

**Related**: [commands.md](commands.md) for full command reference, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [Basic Recording](#basic-recording)
- [Recording Workflow](#recording-workflow)
- [Supported Actions](#supported-actions)
- [YAML Output Format](#yaml-output-format)
- [Replay Feature](#replay-feature)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)

## Basic Recording

```bash
# Start recording session
agent-browser recorder start

# Perform actions
agent-browser open https://example.com
agent-browser snapshot -i
agent-browser click @e1
agent-browser fill @e2 "test input"
agent-browser select @e3 "option"

# Stop recording and save to file
agent-browser recorder stop --output session.yaml
```

## Recording Workflow

The recorder captures all browser interactions including:

1. **Navigation**: Page loads and URL changes
2. **Input**: Text entry in form fields
3. **Selection**: Dropdown choices
4. **Clicks**: Button and link clicks
5. **Scrolling**: Page scroll events
6. **Mouse Movement**: Trajectory data for human-like behavior

```bash
# Example: Complete form submission workflow
agent-browser recorder start --session form-test

# Navigate to form
agent-browser open https://example.com/form
agent-browser snapshot -i

# Fill form fields
agent-browser fill @e1 "John Doe"
agent-browser fill @e2 "john@example.com"
agent-browser select @e3 "United States"
agent-browser check @e4

# Submit form
agent-browser click @e5
agent-browser wait --load networkidle

# Save recording
agent-browser recorder stop --output form-submission.yaml
```

## Supported Actions

| Action | Description | Example |
|--------|-------------|---------|
| `navigate` | Page navigation | `agent-browser open https://example.com` |
| `fill` | Text input | `agent-browser fill @e1 "text"` |
| `select` | Dropdown selection | `agent-browser select @e2 "option"` |
| `click` | Element click | `agent-browser click @e3` |
| `check` | Checkbox check | `agent-browser check @e4` |
| `uncheck` | Checkbox uncheck | `agent-browser uncheck @e5` |
| `scroll` | Page scroll | `agent-browser scroll down 500` |
| `trajectory` | Mouse movement | Captured automatically |

## YAML Output Format

The recorder generates a structured YAML file with:

```yaml
session:
  id: recorder-1234567890
  startTime: 19:46:49
  endTime: 19:48:28
  steps: 83

pages:
  - url: https://example.com
    title: Example Domain
    firstVisitTime: 19:46:53

steps:
  - id: step-1234567890
    time: 19:47:00
    action: fill
    selector: "#username"
    xpath: "//*[@id='username']"
    value: "testuser"

  - id: step-1234567891
    time: 19:47:05
    action: click
    selector: "#submit-btn"
    xpath: "//*[@id='submit-btn']"

  - id: step-1234567892
    time: 19:47:10
    action: scroll
    x: 0
    y: 500

# CLI Commands section contains executable commands
# for direct replay in terminal
```

## Replay Feature

Replay recorded interactions from YAML file:

```bash
# Replay most recent recording
agent-browser recorder replay

# Replay specific file
agent-browser recorder replay form-submission.yaml

# Replay with verbose output
agent-browser recorder replay session.yaml --verbose
```

The replay feature:
1. Parses the YAML file
2. Executes each step in sequence
3. Handles both navigation and interactions
4. Supports all recorded action types

## Use Cases

### 1. Test Automation Documentation

Record manual test sessions for documentation:

```bash
agent-browser recorder start --session checkout-flow

# Perform checkout process
agent-browser open https://shop.example.com/cart
agent-browser snapshot -i
agent-browser fill @e1 "123 Main St"
agent-browser fill @e2 "New York"
agent-browser fill @e3 "10001"
agent-browser click @e4
agent-browser wait --load networkidle

# Save for documentation
agent-browser recorder stop --output docs/checkout-flow.yaml
```

### 2. Regression Testing

Create reusable test scenarios:

```bash
# Record once
agent-browser recorder start
agent-browser open https://app.example.com/login
agent-browser snapshot -i
agent-browser fill @e1 "$USERNAME"
agent-browser fill @e2 "$PASSWORD"
agent-browser click @e3
agent-browser recorder stop --output tests/login.yaml

# Replay in CI/CD
agent-browser recorder replay tests/login.yaml
```

### 3. Workflow Automation

Capture complex workflows for automation:

```bash
# Record multi-step workflow
agent-browser recorder start
agent-browser open https://dashboard.example.com
agent-browser snapshot -i
agent-browser click @e1  # Navigate to reports
agent-browser click @e2  # Select date range
agent-browser click @e3  # Export CSV
agent-browser recorder stop --output workflows/export-data.yaml
```

### 4. Debugging & Analysis

Record sessions for debugging:

```bash
agent-browser recorder start --session debug-$(date +%s)

# Run problematic workflow
agent-browser open https://example.com
# ... interactions ...

# Save for analysis
agent-browser recorder stop --output debug/session.yaml
```

## Best Practices

### 1. Use Session Names

```bash
# Good: Descriptive session names
agent-browser recorder start --session user-registration
agent-browser recorder start --session checkout-payment
agent-browser recorder start --session search-functionality

# Avoid: Generic names
agent-browser recorder start --session test1
agent-browser recorder start --session recording
```

### 2. Add Wait Times for Stability

```bash
agent-browser recorder start

# Add waits after critical actions
agent-browser click @e1
agent-browser wait --load networkidle  # Wait for page load

agent-browser fill @e2 "text"
agent-browser wait 1000  # Wait for dynamic content

agent-browser click @e3
```

### 3. Use Snapshots for Ref Stability

```bash
agent-browser recorder start

# Always snapshot before interactions
agent-browser snapshot -i
agent-browser click @e1

# Re-snapshot after navigation
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser click @e2
```

### 4. Organize Recordings

```bash
# Create organized directory structure
recordings/
├── tests/
│   ├── login.yaml
│   ├── registration.yaml
│   └── checkout.yaml
├── workflows/
│   ├── data-export.yaml
│   └── report-generation.yaml
└── docs/
    ├── user-guide.yaml
    └── api-demo.yaml
```

### 5. Review Generated Commands

The YAML file includes a CLI Commands section at the end with executable commands. Review these commands to:

- Verify the captured selectors
- Check for redundant steps
- Identify opportunities for optimization
- Ensure actions are in correct order

## Advanced Features

### Session-Based Recording

```bash
# Record with specific session
agent-browser recorder start --session my-test --timeout 60000

# Use session for all commands
agent-browser open https://example.com --session my-test
agent-browser snapshot -i --session my-test
agent-browser click @e1 --session my-test

# Stop recording
agent-browser recorder stop --output my-test.yaml --session my-test
```

### Timeout Configuration

```bash
# Set recording timeout (default: 60 seconds)
agent-browser recorder start --timeout 120000  # 2 minutes

# Useful for long-running workflows
```

## Limitations

- Refs (`@e1`, `@e2`) are session-specific and not portable
- Convert to CSS selectors for cross-session reuse
- Some dynamic content may require additional wait handling
- Replay requires same page structure as recording

## See Also

- [snapshot-refs.md](snapshot-refs.md) - Understanding refs and their lifecycle
- [authentication.md](authentication.md) - Recording login flows
- [video-recording.md](video-recording.md) - Video recording for debugging
