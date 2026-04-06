import { describe, it, expect } from 'vitest';
import { buildViewerScript } from '../viewer-script.js';

describe('Virtual Touchpad - buildViewerScript patterns', () => {
  const script = buildViewerScript();

  it('should define CURSOR_SENSITIVITY', () => {
    expect(script).toContain('CURSOR_SENSITIVITY = 1.5');
  });

  it('should define WHEEL_SENSITIVITY', () => {
    expect(script).toContain('WHEEL_SENSITIVITY = 2.0');
  });

  it('should define LONG_PRESS_MS = 800', () => {
    expect(script).toContain('LONG_PRESS_MS = 800');
  });

  it('should get cursor element', () => {
    expect(script).toMatch(/cursor\s*=\s*document\.getElementById\(['"]cursor['"]\)/);
  });

  it('should get touchpad element', () => {
    expect(script).toMatch(/touchpad\s*=\s*document\.getElementById\(['"]touchpad['"]\)/);
  });

  it('should show touchpad on touch device', () => {
    expect(script).toMatch(/touchpad\.style\.display\s*=\s*['"]flex['"]/);
  });

  it('should have touchstart handler on touchpad', () => {
    expect(script).toMatch(/touchpad\.addEventListener\(\s*['"]touchstart['"]/);
  });

  it('should have touchmove handler on touchpad', () => {
    expect(script).toMatch(/touchpad\.addEventListener\(\s*['"]touchmove['"]/);
  });

  it('should have touchend handler on touchpad', () => {
    expect(script).toMatch(/touchpad\.addEventListener\(\s*['"]touchend['"]/);
  });

  it('should have touchcancel handler on touchpad', () => {
    expect(script).toMatch(/touchpad\.addEventListener\(\s*['"]touchcancel['"]/);
  });

  it('should initialize cursor at screen center', () => {
    expect(script).toContain('initCursor');
    expect(script).toContain('cursorInitialized');
  });

  it('should update cursor position via updateCursor', () => {
    expect(script).toContain('updateCursor()');
    expect(script).toMatch(/cursor\.style\.left/);
    expect(script).toMatch(/cursor\.style\.top/);
  });

  it('should clamp cursor within screen bounds', () => {
    expect(script).toContain('clampCursor');
  });

  it('should enter drag mode on long press timeout', () => {
    expect(script).toContain('dragMode = true');
    expect(script).toContain('longPressTimer = setTimeout');
    expect(script).toContain("'mousePressed'");
  });

  it('should send mouseMoved during drag mode', () => {
    expect(script).toMatch(/if\s*\(\s*dragMode\s*\)/);
    expect(script).toContain("'mouseMoved'");
  });

  it('should send mouseReleased on touchend in drag mode', () => {
    expect(script).toContain("'mouseReleased'");
  });

  it('should send mousePressed+mouseReleased on short tap', () => {
    expect(script).toContain("'mousePressed'");
    expect(script).toContain("'mouseReleased'");
  });

  it('should send mouseWheel on two-finger touch on touchpad', () => {
    expect(script).toContain("'mouseWheel'");
    expect(script).toMatch(/twoFingerStartPos/);
  });

  it('should use acceleration for cursor movement', () => {
    expect(script).toContain('CURSOR_SENSITIVITY');
    expect(script).toContain('ACCELERATION');
    expect(script).toContain('computeAcceleration');
    expect(script).toContain('dx * accel');
    expect(script).toContain('dy * accel');
    expect(script).toContain('velocity');
  });

  it('should clear long press timer on touchmove', () => {
    expect(script).toContain('clearTimeout(longPressTimer)');
  });

  it('should reset state in touchcancel', () => {
    expect(script).toMatch(/touchpad\.addEventListener\(\s*['"]touchcancel['"]/);
  });

  it('should use passive:false on all touch listeners', () => {
    const passiveCount = (script.match(/passive:\s*false/g) || []).length;
    expect(passiveCount).toBeGreaterThanOrEqual(4);
  });

  it('should call preventDefault on touchpad touch events', () => {
    const touchpadBlock = script.split("touchpad.addEventListener('touchstart'")[1];
    expect(touchpadBlock).toContain('e.preventDefault()');
  });

  it('should detect touch device', () => {
    expect(script).toMatch(/'ontouchstart'\s*in\s*window/);
    expect(script).toContain('navigator.maxTouchPoints');
  });

  it('should not have screen touch handlers', () => {
    expect(script).not.toMatch(/screen\.addEventListener\(\s*['"]touchstart['"]/);
    expect(script).not.toMatch(/screen\.addEventListener\(\s*['"]touchmove['"]/);
    expect(script).not.toMatch(/screen\.addEventListener\(\s*['"]touchend['"]/);
  });

  it('should not reference old touch variables', () => {
    expect(script).not.toContain('touchDragMode');
    expect(script).not.toContain('TOUCH_MOVE_THRESHOLD');
  });
});

describe('Virtual Touchpad - coordinate mapping', () => {
  it('screenToPage uses getBoundingClientRect for dynamic sizing', () => {
    const script = buildViewerScript();
    expect(script).toContain('screen.getBoundingClientRect()');
  });

  it('screen uses aspect-ratio instead of fixed pixel dimensions', () => {
    const script = buildViewerScript();
    expect(script).toContain('screen.style.aspectRatio');
  });

  it('should handle element mode in screenToPage', () => {
    const script = buildViewerScript();
    expect(script).toContain('metadata.element');
    expect(script).toContain('containerRatio');
    expect(script).toContain('imageRatio');
  });
});

describe('Virtual Touchpad - hidden input positioning', () => {
  it('should have pointer-events:none on hiddenInput', () => {
    const script = buildViewerScript();
    expect(script).toContain('pointer-events:none');
  });

  it('should have font-size:16px on hiddenInput to prevent iOS zoom', () => {
    const script = buildViewerScript();
    expect(script).toContain('font-size:16px');
  });
});
