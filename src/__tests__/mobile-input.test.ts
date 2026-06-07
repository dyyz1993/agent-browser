import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Mobile input mode - injected focus listener', () => {
  let viewerScript: string;
  let viewerHtml: string;
  let standaloneCode: string;
  let protocolCode: string;
  let browserCode: string;

  beforeAll(() => {
    viewerScript = fs.readFileSync(path.join(__dirname, '../viewer/app.js'), 'utf-8');
    viewerHtml = fs.readFileSync(path.join(__dirname, '../viewer/styles.css'), 'utf-8') + fs.readFileSync(path.join(__dirname, '../viewer/index.html'), 'utf-8');
    standaloneCode = fs.readFileSync(
      path.join(__dirname, '../stream-server-standalone.ts'),
      'utf-8'
    );
    protocolCode = fs.readFileSync(path.join(__dirname, '../protocol.ts'), 'utf-8');
    browserCode = fs.readFileSync(path.join(__dirname, '../browser/browser-manager.ts'), 'utf-8');
  });

  it('has inputMode state variable', () => {
    expect(viewerScript).toContain('var inputMode = false');
  });

  it('has enterInputMode function', () => {
    expect(viewerScript).toContain('function enterInputMode');
  });

  it('has exitInputMode function', () => {
    expect(viewerScript).toContain('function exitInputMode');
  });

  it('has sendInputText function', () => {
    expect(viewerScript).toContain('function sendInputText');
  });

  it('does NOT have handleFocusResult function (removed)', () => {
    expect(viewerScript).not.toContain('function handleFocusResult');
  });

  it('does NOT send focus_at_point on single tap', () => {
    expect(viewerScript).not.toContain("'focus_at_point'");
    expect(viewerScript).not.toContain('"focus_at_point"');
  });

  it('touchend sends only mousePressed + mouseReleased for single tap', () => {
    // Match touchpad's touchend handler specifically (contains lastTouchPos)
    const teMatch = viewerScript.match(
      /touchpad\.addEventListener\('touchend'[\s\S]*?lastTouchPos = null/s
    );
    expect(teMatch).not.toBeNull();
    const teBlock = teMatch![0];
    expect(teBlock).toContain('mousePressed');
    expect(teBlock).toContain('mouseReleased');
    expect(teBlock).not.toContain('focus_at_point');
  });

  it('handles input_focused message in WS handler', () => {
    expect(viewerScript).toContain("case 'input_focused'");
  });

  it('handles input_value message in WS handler', () => {
    expect(viewerScript).toContain("case 'input_value'");
  });

  it('handles input_blur message in WS handler', () => {
    expect(viewerScript).toContain("case 'input_blur'");
  });

  it('touchpad is at bottom of screen on touch devices', () => {
    // Mobile mode activates touchpad via CSS class + JS position/zIndex
    expect(viewerScript).toContain("classList.add('mobile-mode')");
    expect(viewerScript).toContain("touchpad.style.position = 'relative'");
    expect(viewerScript).toContain('touchpad.style.zIndex');
    expect(viewerHtml).toContain('#touchpad');
  });

  it('touchpad has visible styling on mobile (not transparent)', () => {
    // Touchpad visible styling is in CSS (gradient background, border-top)
    expect(viewerHtml).toContain('#touchpad');
    expect(viewerHtml).toContain('background');
    expect(viewerHtml).toContain('border-top');
  });

  it('touchpad is visible at bottom on touch devices', () => {
    // Mobile mode class + JS positioning; visible styling via CSS
    expect(viewerScript).toContain("classList.add('mobile-mode')");
    expect(viewerScript).toContain("touchpad.style.position = 'relative'");
    expect(viewerScript).toContain('touchpad.style.zIndex');
  });

  it('screen has direct touch handlers for mobile touch mode', () => {
    const hasScreenTouchStart = viewerScript.includes("screen.addEventListener('touchstart'");
    const hasScreenTouchEnd = viewerScript.includes("screen.addEventListener('touchend'");
    expect(hasScreenTouchStart).toBe(true);
    expect(hasScreenTouchEnd).toBe(true);
  });

  it('input_focused case calls enterInputMode with value/type/placeholder', () => {
    // Verify input_focused handler exists and delegates to enterInputMode
    const ifMatch = viewerScript.match(/case\s+['"]input_focused['"]/);
    expect(ifMatch).not.toBeNull();
    // Verify enterInputMode is called somewhere after input_focused (in same function scope)
    const funcBody = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
    expect(funcBody).not.toBeNull();
    // Verify enterInputMode receives value/inputType/placeholder as params
    const body = funcBody![0];
    expect(body).toContain('initialValue');
    expect(body).toContain('inputType');
    expect(body).toContain('placeholder');
  });

  it('input_value case updates input-field value', () => {
    const ivMatch = viewerScript.match(/case\s+['"]input_value['"][\s\S]*?break\s*;/m);
    expect(ivMatch).not.toBeNull();
    const block = ivMatch![0];
    expect(block).toContain('input-field');
    expect(block).toContain('msg.text');
  });

  it('input_blur case calls exitInputMode', () => {
    const ibMatch = viewerScript.match(/case\s+['"]input_blur['"][\s\S]*?break\s*;/m);
    expect(ibMatch).not.toBeNull();
    const block = ibMatch![0];
    expect(block).toContain('exitInputMode()');
  });

  it('enterInputMode accepts initialValue parameter and pre-fills field', () => {
    const emMatch = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
    expect(emMatch).not.toBeNull();
    const emBlock = emMatch![0];
    expect(emBlock).toContain('initialValue');
    expect(emBlock).toContain('field.value = initialValue');
    expect(emBlock).not.toContain('targetX');
    expect(emBlock).not.toContain('targetY');
  });

  it('enterInputMode accepts and records selector for fillValue', () => {
    const emMatch = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
    expect(emMatch).not.toBeNull();
    const emBlock = emMatch![0];
    expect(emBlock).toContain('selector');
    expect(emBlock).toContain('_currentTargetSelector');
  });

  it('enterInputMode shows type/placeholder label instead of coordinates', () => {
    const emMatch = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
    expect(emMatch).not.toBeNull();
    const emBlock = emMatch![0];
    expect(emBlock).toContain('labelParts');
    expect(emBlock).toContain('inputType');
    expect(emBlock).toContain('placeholder');
    expect(emBlock).not.toContain('target:');
  });

  it('enterInputMode hides cursor, shows input-panel, hides touchpad', () => {
    const emMatch = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
    expect(emMatch).not.toBeNull();
    const emBlock = emMatch![0];
    expect(emBlock).toContain("cursor.style.display = 'none'");
    expect(emBlock).toContain("classList.add('input-mode')");
    expect(emBlock).toContain('input-panel');
    // touchpad hiding is via CSS: body.input-mode #touchpad
    expect(viewerHtml).toContain('body.input-mode #touchpad');
  });

  it('exitInputMode restores cursor, hides input-panel, clears field', () => {
    const exMatch = viewerScript.match(/function exitInputMode[\s\S]*?^    \}/m);
    expect(exMatch).not.toBeNull();
    const exBlock = exMatch![0];
    expect(exBlock).toContain("cursor.style.display = 'block'");
    expect(exBlock).toContain('input-panel');
    expect(exBlock).toContain("field.value = ''");
  });

  it('sendInputText sends input_fill + Enter key then exits', () => {
    const smMatch = viewerScript.match(/function sendInputText[\s\S]*?^    \}/m);
    expect(smMatch).not.toBeNull();
    const smBlock = smMatch![0];
    expect(smBlock).toContain("'input_fill'");
    expect(smBlock).toContain("'Enter'");
    expect(smBlock).toContain('exitInputMode()');
  });

  it('input_focused case constructs selector from id', () => {
    const ifMatch = viewerScript.match(/case\s+['"]input_focused['"]/);
    expect(ifMatch).not.toBeNull();
    const block = viewerScript.substring(
      viewerScript.indexOf(ifMatch![0]),
      viewerScript.indexOf(ifMatch![0]) + 400
    );
    expect(block).toContain('msg.id');
    expect(block).toContain('#');
  });

  it('syncInputToRemote always includes non-empty selector', () => {
    const sirMatch = viewerScript.match(/function syncInputToRemote[\s\S]*?^    \}/m);
    expect(sirMatch).not.toBeNull();
    const block = sirMatch![0];
    expect(block).toMatch(/['"]?selector['"]?\s*:/);
    expect(block).toMatch(/selector:\s*window\._currentTargetSelector/);
  });

  it('syncInputToRemote sends input_fill type with selector', () => {
    const sirMatch = viewerScript.match(/function syncInputToRemote[\s\S]*?^    \}/m);
    expect(sirMatch).not.toBeNull();
    const sirBlock = sirMatch![0];
    expect(sirBlock).toContain("'input_fill'");
    expect(sirBlock).toContain('_currentTargetSelector');
  });

  it('listens to compositionend for CJK/IME input sync', () => {
    // Chinese/Japanese IME may not fire 'input' event reliably during composition.
    // compositionend ensures final composed text is synced.
    const ifBlock = viewerScript.match(
      /inputField\.addEventListener\('input'[\s\S]*?inputField\.addEventListener\('keydown'/
    );
    expect(ifBlock).not.toBeNull();
    const block = ifBlock![0];
    expect(block).toContain("'compositionend'");
    expect(block).toContain('syncInputToRemote');
  });

  it('has _inputPollRaf variable for RAF polling', () => {
    expect(viewerScript).toContain('_inputPollRaf');
  });

  it('enterInputMode starts requestAnimationFrame poll for value change detection', () => {
    // The poll should call syncInputToRemote when field.value changes
    const emMatch = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
    expect(emMatch).not.toBeNull();
    const block = emMatch![0];
    expect(block).toContain('requestAnimationFrame');
    expect(block).toContain('syncInputToRemote');
    expect(block).toContain('_lastPolled');
  });

  it('RAF poll guards against IME composition (suppresses pinyin leak)', () => {
    // During CJK IME composition, RAF poll must NOT sync intermediate pinyin text.
    // Only after compositionend should the committed Chinese text be synced.
    const emMatch = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
    expect(emMatch).not.toBeNull();
    const block = emMatch![0];
    expect(block).toContain('compositionstart');
    expect(block).toContain('compositionend');
    expect(block).toContain('window._fieldComposing');
    // The guard: skip sync when composing
    expect(block).toMatch(/if\s*\(\s*!window\._fieldComposing\s*\)/);
  });

  it('input event listener guards against IME composition', () => {
    const ifBlock = viewerScript.match(
      /inputField\.addEventListener\('input'[\s\S]*?inputField\.addEventListener\('keydown'/
    );
    expect(ifBlock).not.toBeNull();
    const block = ifBlock![0];
    // input handler should return early during composition
    expect(block).toContain('window._fieldComposing');
    expect(block).toMatch(/if\s*\(\s*window\._fieldComposing\s*\)\s*return/);
  });

  it('keydown handler suppresses keyboard events when target is #input-field', () => {
    const kdMatch = viewerScript.match(
      /document\.addEventListener\(['"]keydown['"],\s*\(e\)\s*=>\s*\{[\s\S]*?^    \}\)/m
    );
    expect(kdMatch).not.toBeNull();
    const block = kdMatch![0];
    const mobileInputField = "document.getElementById('input-field')";
    expect(block).toContain(mobileInputField);
    expect(block).toMatch(
      /if\s*\(\s*mobileInputField\s*&&\s*e\.target\s*===\s*mobileInputField\s*\)\s*return/
    );
  });

  it('keyup handler suppresses keyboard events when target is #input-field', () => {
    const kuMatch = viewerScript.match(
      /document\.addEventListener\(['"]keyup['"],\s*\(e\)\s*=>\s*\{[\s\S]*?^    \}\)/m
    );
    expect(kuMatch).not.toBeNull();
    const block = kuMatch![0];
    const mobileInputField = "document.getElementById('input-field')";
    expect(block).toContain(mobileInputField);
    expect(block).toMatch(
      /if\s*\(\s*mobileInputField\s*&&\s*e\.target\s*===\s*mobileInputField\s*\)\s*return/
    );
  });

  it('exitInputMode cancels requestAnimationFrame poll', () => {
    const exMatch = viewerScript.match(/function exitInputMode[\s\S]*?^    \}/m);
    expect(exMatch).not.toBeNull();
    const block = exMatch![0];
    expect(block).toContain('cancelAnimationFrame');
    expect(block).toContain('_inputPollRaf');
  });

  it('does NOT have inputTargetInfo variable (removed)', () => {
    expect(viewerScript).not.toContain('inputTargetInfo');
  });

  it('HTML has input-panel inside touchpad', () => {
    expect(viewerHtml).toContain('id="input-panel"');
  });

  it('HTML uses reference-demo-style layout (top-aligned screen + fixed capsule input)', () => {
    // Screen container aligned to top (not centered)
    expect(viewerHtml).toContain('align-items: flex-start');
    // Input panel is fixed position like reference kb-input-footer
    expect(viewerHtml).toContain('position:fixed');
    expect(viewerHtml).toContain('z-index:9999');
    // Capsule-style rounded input like reference demo
    expect(viewerHtml).toContain('border-radius:18px');
    // White background like reference demo
    expect(viewerHtml).toContain('rgba(255,255,255,0.95)');
  });

  it('html/body has position:fixed to prevent keyboard push-up', () => {
    expect(viewerHtml).toContain('position: fixed');
    expect(viewerHtml).toContain('overflow: hidden');
    expect(viewerHtml).toContain('100dvh');
  });
});

describe('Protocol schemas for injected listener', () => {
  let protocolCode: string;

  beforeAll(() => {
    protocolCode = fs.readFileSync(path.join(__dirname, '../protocol.ts'), 'utf-8');
  });

  it('has inputFocusedSchema', () => {
    expect(protocolCode).toContain('inputFocusedSchema');
  });

  it('has inputTextSchema (or inputValueSchema)', () => {
    expect(protocolCode).toMatch(/input(?:Text|Value)Schema/);
  });

  it('has inputBlurSchema', () => {
    expect(protocolCode).toContain('inputBlurSchema');
  });

  it('does NOT have focusAtPointSchema (removed)', () => {
    expect(protocolCode).not.toContain('focusAtPointSchema');
  });

  it('does NOT have focusResultSchema (removed)', () => {
    expect(protocolCode).not.toContain('focusResultSchema');
  });

  it('inputFocusedSchema has correct fields', () => {
    expect(protocolCode).toContain("z.literal('input_focused')");
    expect(protocolCode).toMatch(/tag:\s*z\.string\(\)/);
    expect(protocolCode).toMatch(/inputType:\s*z\.string\(\)/);
    expect(protocolCode).toMatch(/value:\s*z\.string\(\)/);
    expect(protocolCode).toMatch(/placeholder:\s*z\.string\(\)/);
    expect(protocolCode).toMatch(/id:\s*z\.string\(\)/);
  });
});

describe('Standalone server handling', () => {
  let standaloneCode: string;

  beforeAll(() => {
    standaloneCode = fs.readFileSync(
      path.join(__dirname, '../stream-server-standalone.ts'),
      'utf-8'
    );
  });

  it('handles input_focused case', () => {
    expect(standaloneCode).toContain("case 'input_focused'");
  });

  it('handles input_value case', () => {
    expect(standaloneCode).toContain("case 'input_value'");
  });

  it('handles input_blur case', () => {
    expect(standaloneCode).toContain("case 'input_blur'");
  });

  it('does NOT handle focus_at_point (removed)', () => {
    expect(standaloneCode).not.toContain("case 'focus_at_point'");
  });

  it('does NOT handle focus_result (removed)', () => {
    expect(standaloneCode).not.toContain("case 'focus_result'");
  });

  it('sends inject_focus_listener action to daemon on register', () => {
    expect(standaloneCode).toContain('inject_focus_listener');
    expect(standaloneCode).toContain("action: 'inject_focus_listener'");
  });

  it('includes input_fill in forwardableTypes', () => {
    expect(standaloneCode).toContain("'input_fill'");
  });
});

describe('Browser injectFocusListener method', () => {
  let browserCode: string;

  beforeAll(() => {
    browserCode = fs.readFileSync(path.join(__dirname, '../browser/browser-manager.ts'), 'utf-8');
  });

  it('has injectFocusListener method', () => {
    expect(browserCode).toContain('injectFocusListener');
  });

  it('uses Runtime.addBinding for callback bridge', () => {
    expect(browserCode).toContain('Runtime.addBinding');
    expect(browserCode).toContain('__abInputEvent');
  });

  it('uses addInitScript or evaluateOnNewDocument for injection', () => {
    const hasAddInit = browserCode.includes('addInitScript');
    const hasEvalNewDoc = browserCode.includes('evaluateOnNewDocument');
    expect(hasAddInit || hasEvalNewDoc).toBe(true);
  });

  it('injects focus event listener for INPUT/TEXTAREA/contentEditable', () => {
    expect(browserCode).toContain("addEventListener('focus'");
    expect(browserCode).toContain("'INPUT'");
    expect(browserCode).toContain("'TEXTAREA'");
    expect(browserCode).toContain('isContentEditable');
  });

  it('injects input event listener for value sync', () => {
    expect(browserCode).toContain("addEventListener('input'");
    expect(browserCode).toContain("'input_value'");
  });

  it('injects blur event listener for exit', () => {
    expect(browserCode).toContain("addEventListener('blur'");
    expect(browserCode).toContain("'input_blur'");
  });

  it('guards against double injection', () => {
    expect(browserCode).toContain('__agentBrowserListenerInjected');
  });

  it('has fillValue method (React-safe fill)', () => {
    expect(browserCode).toContain('fillValue');
    expect(browserCode).toContain('async fillValue');
  });

  it('has pressKey method', () => {
    expect(browserCode).toContain('pressKey');
    expect(browserCode).toContain('async pressKey');
  });
});

describe('Standalone server IPC data handler (Bug 1 fix)', () => {
  let standaloneCode: string;

  beforeAll(() => {
    standaloneCode = fs.readFileSync(
      path.join(__dirname, '../stream-server-standalone.ts'),
      'utf-8'
    );
  });

  it('connectToDaemon has data handler on socket', () => {
    // The connectToDaemon method should have socket.on('data', ...) to receive
    // focus events written back by the daemon
    const ctdMatch = standaloneCode.match(/private connectToDaemon[\s\S]*?^  \}/m);
    expect(ctdMatch).not.toBeNull();
    const block = ctdMatch![0];
    expect(block).toContain("socket.on('data'");
  });

  it('data handler parses JSON lines from daemon', () => {
    const ctdMatch = standaloneCode.match(/private connectToDaemon[\s\S]*?^  \}/m);
    expect(ctdMatch).not.toBeNull();
    const block = ctdMatch![0];
    expect(block).toContain('JSON.parse');
    expect(block).toContain("split('\\n')");
  });

  it('data handler forwards input_focused to WS clients', () => {
    const ctdMatch = standaloneCode.match(/private connectToDaemon[\s\S]*?^  \}/m);
    expect(ctdMatch).not.toBeNull();
    const block = ctdMatch![0];
    expect(block).toContain("'input_focused'");
    expect(block).toContain('client.send');
  });

  it('data handler forwards input_value to WS clients', () => {
    const ctdMatch = standaloneCode.match(/private connectToDaemon[\s\S]*?^  \}/m);
    expect(ctdMatch).not.toBeNull();
    const block = ctdMatch![0];
    expect(block).toContain("'input_value'");
  });

  it('data handler forwards input_blur to WS clients', () => {
    const ctdMatch = standaloneCode.match(/private connectToDaemon[\s\S]*?^  \}/m);
    expect(ctdMatch).not.toBeNull();
    const block = ctdMatch![0];
    expect(block).toContain("'input_blur'");
  });
});

describe('Daemon pre-validation: type/action field normalization (Bug fix)', () => {
  let daemonCode: string;
  let standaloneCode: string;

  beforeAll(() => {
    daemonCode = fs.readFileSync(path.join(__dirname, '../daemon.ts'), 'utf-8');
    standaloneCode = fs.readFileSync(
      path.join(__dirname, '../stream-server-standalone.ts'),
      'utf-8'
    );
  });

  it('normalizes action from type or action field', () => {
    // The pre-validation block should extract action from either field
    expect(daemonCode).toContain('quickParse.action || quickParse.type');
  });

  it('uses normalized action variable for inject_focus_listener check', () => {
    const pvBlock = daemonCode.match(
      /Handle custom actions before schema validation[\s\S]*?fall through to normal parsing/
    );
    expect(pvBlock).not.toBeNull();
    const block = pvBlock![0];
    // Should use `action` variable (normalized) not raw quickParse.action
    expect(block).toMatch(/action\s*===\s*['"]inject_focus_listener['"]/);
  });

  it('uses normalized action variable for input_fill check', () => {
    const pvBlock = daemonCode.match(
      /Handle custom actions before schema validation[\s\S]*?fall through to normal parsing/
    );
    expect(pvBlock).not.toBeNull();
    const block = pvBlock![0];
    expect(block).toMatch(/action\s*===\s*['"]input_fill['"]/);
  });

  it('uses normalized action variable for blur_element check', () => {
    const pvBlock = daemonCode.match(
      /Handle custom actions before schema validation[\s\S]*?fall through to normal parsing/
    );
    expect(pvBlock).not.toBeNull();
    const block = pvBlock![0];
    expect(block).toMatch(/action\s*===\s*['"]blur_element['"]/);
    expect(block).toMatch(/action\s*===\s*['"]input_blur_element['"]/);
  });

  it('viewer sends messages with type field (not action)', () => {
    // Viewer uses 'type' for message routing
    const viewerScript = fs.readFileSync(path.join(__dirname, '../viewer/app.js'), 'utf-8');
    expect(viewerScript).toMatch(/type:\s*['"]input_fill['"]/);
    expect(viewerScript).toMatch(/type:\s*['"]input_blur_element['"]/);
  });

  it('standalone connectToDaemon sends with action field (not type)', () => {
    // Standalone commands use 'action' when talking to daemon
    expect(standaloneCode).toContain("action: 'inject_focus_listener'");
  });

  it('standalone forwards viewer messages as-is (preserves type field)', () => {
    // handleClientMessage forwards the raw message object from viewer
    expect(standaloneCode).toContain('JSON.stringify(message)');
  });
});

describe('Viewer CSS integrity', () => {
  let viewerHtml: string;

  beforeAll(() => {
    viewerHtml = fs.readFileSync(path.join(__dirname, '../viewer/styles.css'), 'utf-8') + fs.readFileSync(path.join(__dirname, '../viewer/index.html'), 'utf-8');
  });

  it('CSS braces are balanced (no stray closing braces)', () => {
    const cssMatches = viewerHtml.match(/\{[^{}]*\}/g);
    expect(cssMatches).not.toBeNull();
    const opens = (viewerHtml.match(/\{/g) || []).length;
    const closes = (viewerHtml.match(/\}/g) || []).length;
    expect(opens).toBe(closes);
  });

  it('input-panel CSS rules are present and correct', () => {
    expect(viewerHtml).toContain('#input-panel { display: none');
    expect(viewerHtml).toContain('body.input-mode #input-panel { display: flex');
    expect(viewerHtml).toContain('body.input-mode #touchpad { display: none');
  });
});

describe('enterInputMode variable integrity', () => {
  let viewerScript: string;

  beforeAll(() => {
    viewerScript = fs.readFileSync(path.join(__dirname, '../viewer/app.js'), 'utf-8');
  });

  it('enterInputMode defines ip variable before using it in keyboardVvHandler', () => {
    const fnMatch = viewerScript.match(
      /function enterInputMode[\s\S]*?function exitInputMode/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect(fnBody).toContain("var ip = document.getElementById('input-panel')");
  });
});
