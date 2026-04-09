# Viewer / Streaming Mode

## Overview

The viewer mode provides a **real-time visual remote browser interface**. It streams browser frames (JPEG/WebP) over WebSocket and forwards user input (mouse, keyboard, touch) back to the daemon. This enables:

- **Remote debugging** — see what the browser sees in real time
- **Mobile device control** — operate a desktop browser from your phone
- **Presentation/demo** — show browser activity to an audience
- **Collaboration** — share a browser session with others

## Starting the Viewer

```bash
# Prerequisite: have a browser session running
agent-browser open https://example.com

# Start viewer (opens URL in default browser)
agent-browser viewer

# Get connection details as JSON (for scripting/embedding)
agent-browser viewer --json
# Output: {"url":"http://localhost:5005/view?session=default","ws":"ws://...","port":5005}
```

## Viewer URL Parameters

| Parameter          | Description                            |
| ------------------ | -------------------------------------- |
| `?session=<id>`    | Connect to a specific named session    |
| `?instanceId=<id>` | Connect to a specific browser instance |

## Architecture

```
┌─────────────┐    IPC     ┌───────────────────┐   WebSocket   ┌──────────┐
│  Browser    │ ───────→ │  Daemon Process   │ ←────────────→ │  Viewer  │
│  (Playwright) │           │  (:5000 socket)   │               │  (Browser) │
└─────────────┘           └────────┬─────────┘               └──────────┘
                             │
                    standalone HTTP+WS server (:5005)
                    serves viewer.html + proxies messages
```

**Data flow:**

1. **Frames**: Browser -> Daemon -> Standalone Server -> Viewer (binary JPEG/WebP via WS)
2. **Input**: Viewer -> Standalone Server -> Daemon -> Browser (JSON messages)

## Viewer Page Features

### Desktop Mode (PC/Mac)

| Feature      | Description                                                         |
| ------------ | ------------------------------------------------------------------- |
| Screen area  | Shows streamed frame, click/drag/scroll sends input to remote       |
| Toolbar      | URL bar, connection status, quality badge, record button            |
| Hidden input | Invisible capture field for keyboard events (auto-focused on click) |
| Cursor       | Red dot showing remote mouse position                               |

### Mobile Mode (Touch Device)

Automatically activates on touch devices. See [mobile-viewer.md](mobile-viewer.md) for full details.

| Feature          | Description                                         |
| ---------------- | --------------------------------------------------- |
| Touchpad         | Bottom gesture area for cursor simulation           |
| Input Panel      | Text input popup when tapping remote input fields   |
| Keyboard toolbar | Virtual keys: Tab, Arrows, Enter, Backspace, Escape |
| IME support      | Chinese/Japanese composition (pinyin, kana, etc.)   |

## Element Selector / Crop Mode

Crop the video stream to a specific DOM element's bounds:

```bash
# Via viewer UI: click element selector button, then click target element
# The stream is cropped to that element's rectangle
```

When element mode is active:

- Server crops frames to element bounds using Sharp
- Mouse coordinates auto-map to element-local space
- Falls back to "degraded mode" (full page) if element not found or disappears
- `deviceWidth`/`deviceHeight` in metadata reflect element dimensions

Use cases:

- Focus testing on a specific component
- Recording interactions within a widget
- Bandwidth savings (only stream the element, not full page)

## Message Types (Viewer <-> Server)

### Server → Viewer (over WebSocket)

| Type            | Purpose                                                            |
| --------------- | ------------------------------------------------------------------ |
| `frame`         | Binary frame data with metadata (dimensions, format, element info) |
| `status`        | Connection status, viewport changes                                |
| `navigation`    | URL/title changes                                                  |
| `input_focused` | Remote element received focus → triggers input panel (mobile)      |
| `input_value`   | Remote input value changed                                         |
| `input_blur`    | Remote element lost focus                                          |

### Viewer → Server (over WebSocket)

| Type                   | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `input_mouse`          | Mouse move/press/release/wheel                      |
| `input_keyboard`       | Key down/up with modifiers                          |
| `input_fill`           | Full text value sync (mobile input panel)           |
| `input_blur_element`   | Blur remote element (mobile input commit)           |
| `keyboard_insert_text` | Character-by-character insert (desktop hiddenInput) |
| `user_activity`        | Keep-alive signal (resumes streaming if paused)     |
| `selector_element`     | Request crop to specific element                    |

## Troubleshooting

### Black screen

- Check daemon is running: `agent-browser status`
- Verify browser launched: `agent-browser open https://example.com` should work first

### Connection refused

- The viewer command auto-starts the standalone server on port 5005
- If port conflicts, check: `lsof -i :5005`
- Kill stale process: `kill $(lsof -t -i :5005)`

### Laggy updates

- Frame compression is JPEG by default (adjustable)
- Quality badge shows current state: "interacting" / "static" / "compressed"
- Network latency between viewer and server affects frame rate

### Element not found (degraded mode)

- Yellow toast appears: "Element not found, showing full page"
- Element may have been removed by SPA navigation or animation
- Re-select the element or exit selector mode

### Viewer shows but no frame

- Check daemon log: `~/.agent-browser/default.log`
- Look for "Browser not launched" errors
- Ensure `agent-browser open` was called before `agent-browser viewer`
