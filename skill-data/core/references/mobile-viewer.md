# Mobile Remote Control (Viewer Mode)

## Overview

When the agent-browser viewer is opened on a **touch device** (phone, tablet), it automatically enters **mobile mode** with a touch-optimized UI. This is distinct from iOS Simulator mode — it works on ANY phone/tablet browser via the web viewer, requiring no simulator installation.

## Touchpad System

The touchpad occupies the bottom portion of the viewer screen and simulates mouse input on the remote browser:

| Gesture             | Action                               | Visual Feedback                         |
| ------------------- | ------------------------------------ | --------------------------------------- |
| Single tap          | Click at virtual cursor position     | Cursor flashes red briefly              |
| Single finger drag  | Move virtual cursor on remote screen | Cursor follows finger                   |
| Long press (~800ms) | Enter drag mode (hold mouse down)    | Cursor turns orange, shows "DRAG" badge |
| Two-finger drag     | Scroll wheel (vertical/horizontal)   | Shows "SCROLL" badge                    |
| Two-finger release  | Momentum scroll (deceleration)       | Smooth deceleration after release       |

**Implementation details:**

- All touch listeners use `{ passive: false }` + `preventDefault()` to prevent browser gestures
- Movement uses acceleration curve for natural feel (`computeAcceleration()`)
- Scroll uses separate wheel acceleration (`computeWheelAccel()`)
- Cooldown period after two-finger scroll prevents accidental clicks
- Momentum scroll uses RAF loop with 0.92 decay factor

## Virtual Keyboard Toolbar

Collapsible toolbar at the top of the touchpad area:

| Button      | Key Sent    | Code         |
| ----------- | ----------- | ------------ |
| Tab         | Tab         | `Tab`        |
| Up Arrow    | Arrow Up    | `ArrowUp`    |
| Left Arrow  | Arrow Left  | `ArrowLeft`  |
| Down Arrow  | Arrow Down  | `ArrowDown`  |
| Right Arrow | Arrow Right | `ArrowRight` |
| Enter       | Enter       | `Enter`      |
| Backspace   | Backspace   | `Backspace`  |
| Escape      | Escape      | `Escape`     |

- **Collapsed state** (default): Shows only expand button (+ icon)
- **Expanded state**: Shows all 8 keys in wrapped layout
- Tap any key to send immediately to remote browser (no need to switch to keyboard app)

## Text Input (Input Panel)

This is the key innovation for mobile remote control — typing text into remote input fields from your phone.

### Flow Diagram

```
User taps remote <input> on viewer screen
        ↓
Daemon detects focus event via injected listener
        ↓
Daemon sends {type: "input_focused", value: "...", ...} to viewer
        ↓
Viewer enters INPUT MODE:
  - Hides virtual cursor
  - Shows #input-panel at screen bottom
  - Pre-fills local input field with current value
  - Sets window._currentTargetSelector for fill targeting
        ↓
User types in local input field (with IME if needed)
        ↓
Text syncs to remote via {type: "input_fill", text: "...", selector: "..."}
        ↓
User taps Send (arrow icon) or presses Enter:
  - Sends final input_fill + Enter keydown/keyup
  - Exits input mode
        ↓
OR user taps Escape or clicks outside panel:
  - Sends input_blur_element to remote
  - Exits input mode, restores touchpad
```

### IME / CJK Composition Support

Critical for Chinese, Japanese, Korean input methods:

| Event                    | Handling                                                 | Prevents                                    |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------- |
| `compositionstart`       | Sets `_fieldComposing = true`                            | Intermediate pinyin sent to remote          |
| `compositionupdate`      | (ignored while composing)                                | Garbage characters                          |
| `compositionend`         | Sets `_fieldComposing = false`, double-RAF deferred sync | Partial commits sent early                  |
| RAF poll (30ms interval) | Skips sync while `_fieldComposing === true`              | Race condition with IME candidate selection |

**Key insight:** Only fully committed characters (after user selects from IME candidate list) are synced to the remote browser. Intermediate pinyin/kana composition is completely filtered out.

### Input Panel Layout

```
┌─────────────────────────────────────────┐
│ target: input[type="email"]            │  <- label row
├─────────────────────────────────────────┤
│ [________________________] [>]             │  <- input + send button
└─────────────────────────────────────────┘
```

- Label shows: input type + placeholder (if different from value)
- Input field: `border-radius: 18px`, `font-size:16px` (prevents iOS zoom)
- Send button: Blue circle with arrow SVG icon
- Dismissal: Tap outside panel or press Escape

### Keyboard Awareness on Mobile

On mobile devices, the viewer intentionally suppresses keyboard-related events to prevent interference:

- `hiddenInput` (#hidden-input) is **NOT created** on touch devices (unlike desktop mode)
- Document-level `keydown`/`keyup` listeners check `event.target` — ignores events from `#input-field`
- This allows the native mobile keyboard to work normally for text input without conflicting with remote keyboard forwarding

## DeviceMode Dynamic Switching

The viewer does NOT detect device type once at startup. It uses a reactive architecture that can switch at runtime:

### Detection Function

```javascript
function detectDeviceMode() {
  var uaMatch = /iphone|ipod|android(?=.*mobile)|mobile|tablet|ipad/i.test(ua);
  var hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return uaMatch || hasTouch ? 'mobile' : 'desktop';
}
```

### Singleton Architecture

```javascript
const DeviceMode = {
  _current: detectDeviceMode(), // Initial detection
  _listeners: [], // Change callbacks

  get current() {
    return this._current;
  },

  onModeChange(fn) {
    this._listeners.push(fn);
  },

  switchTo(mode) {
    if (mode === this._current) return; // No-op for same mode
    var prev = this._current;
    this._current = mode;
    if (mode === 'desktop') {
      MobileModule.detach(); // Hide touchpad, show cursor
      DesktopModule.attach(); // Create hiddenInput, focus it
    } else {
      DesktopModule.detach(); // Remove hiddenInput
      MobileModule.attach(); // Show touchpad, init cursor
    }
    this._listeners.forEach((fn) => fn(mode, prev));
  },
};
```

### Module Lifecycle

**DesktopModule** (PC mode):

- `attach()`: Creates invisible `#hidden-input`, focuses it (captures keyboard for remote forwarding)
- `detach()`: Blurs and removes hiddenInput

**MobileModule** (touch mode):

- `attach()`: Shows touchpad (display:flex), initializes virtual cursor, sets up toolbar
- `detach()`: Hides input-panel, shows cursor again

### Auto-Switching Triggers

| Trigger                                 | Handler                   | Use Case                                          |
| --------------------------------------- | ------------------------- | ------------------------------------------------- |
| `resize` event                          | Debounced 100ms re-detect | Phone rotation, window resize                     |
| `orientationchange`                     | Delayed 200ms re-detect   | Portrait<->Landscape                              |
| `matchMedia("(pointer:coarse)")` change | Immediate switch          | Stylus connect/disconnect, tablet keyboard attach |

## Mobile-Specific CSS Considerations

| Issue                                  | Solution                                                  |
| -------------------------------------- | --------------------------------------------------------- |
| iOS keyboard pushes content up         | `min/max-height: 100dvh` on html/body, `position: fixed`  |
| VisualViewport API for keyboard height | Listener resizes input panel above keyboard               |
| iOS auto-scroll during input           | `setInterval` scroll guard (100ms) fights browser scroll  |
| Browser gesture conflicts              | `touch-action: none` on body during input mode            |
| Safe area (notch phones)               | `padding-bottom: env(safe-area-inset-bottom)` on touchpad |
| Small tap targets                      | Minimum 44px height on buttons (iOS guideline)            |
