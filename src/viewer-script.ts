export interface ViewerConfig {
  wsProtocol: string;
  hostname: string;
  port: number;
  instanceId: string | null;
  session: string;
}

export interface ViewerElements {
  screen: HTMLImageElement;
  statusDot: HTMLDivElement;
  statusText: HTMLSpanElement;
  urlDisplay: HTMLInputElement;
  qualityBadge: HTMLDivElement;
  connecting: HTMLDivElement;
  hiddenInput: HTMLInputElement;
}

export interface ViewerState {
  ws: WebSocket | null;
  metadata: {
    deviceWidth: number;
    deviceHeight: number;
    pageScaleFactor: number;
    format: string;
    element?: {
      selector: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  userActivityTimeout: ReturnType<typeof setTimeout> | null;
  pendingBinary: boolean;
  modifiers: number;
  clickCount: number;
  clickTimer: ReturnType<typeof setTimeout> | null;
  isComposing: boolean;
  lastInputValue: string;
  fixedSize: boolean;
}

export function createInitialState(): ViewerState {
  return {
    ws: null,
    metadata: { deviceWidth: 1280, deviceHeight: 720, pageScaleFactor: 1, format: 'jpeg' },
    userActivityTimeout: null,
    pendingBinary: false,
    modifiers: 0,
    clickCount: 0,
    clickTimer: null,
    isComposing: false,
    lastInputValue: '',
    fixedSize: false,
  };
}

export function buildWebSocketUrl(config: ViewerConfig): string {
  const wsParam = config.instanceId
    ? 'instanceId=' + config.instanceId
    : 'session=' + config.session;
  return config.wsProtocol + '//' + config.hostname + ':' + config.port + '?' + wsParam;
}

export function parseConfigFromLocation(): ViewerConfig {
  const wsProtocol =
    typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
  const defaultPort = 5005;
  const port = (typeof location !== 'undefined' && parseInt(location.port, 10)) || defaultPort;
  let instanceId: string | null = null;
  let session = 'default';

  if (typeof URLSearchParams !== 'undefined' && typeof location !== 'undefined') {
    const urlParams = new URLSearchParams(location.search);
    instanceId = urlParams.get('instanceId');
    session = urlParams.get('session') || 'default';
  }

  return {
    wsProtocol,
    hostname: typeof location !== 'undefined' ? location.hostname : 'localhost',
    port,
    instanceId,
    session,
  };
}

export function safeSend(ws: WebSocket | null, data: string): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}

export function sendUserActivity(
  state: ViewerState,
  qualityBadge: HTMLElement,
  ws: WebSocket | null
): void {
  safeSend(ws, JSON.stringify({ type: 'user_activity' }));

  if (state.userActivityTimeout !== null) {
    clearTimeout(state.userActivityTimeout);
  }
  state.userActivityTimeout = setTimeout(() => {
    qualityBadge.textContent = 'static';
  }, 2000);

  qualityBadge.textContent = 'interacting';
}

export interface ScreenToPageRect {
  width: number;
  height: number;
  left: number;
  top: number;
}

export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function screenToPage(
  screenX: number,
  screenY: number,
  rect: ScreenToPageRect,
  deviceWidth: number,
  deviceHeight: number,
  element?: ElementBox | null
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };

  const scaleX = deviceWidth / rect.width;
  const scaleY = deviceHeight / rect.height;
  let pageX = Math.round((screenX - rect.left) * scaleX);
  let pageY = Math.round((screenY - rect.top) * scaleY);

  if (element) {
    pageX += element.x;
    pageY += element.y;
  }
  return { x: pageX, y: pageY };
}

export function updateModifiers(e: MouseEvent | KeyboardEvent): number {
  let modifiers = 0;
  if (e.altKey) modifiers |= 1;
  if (e.ctrlKey) modifiers |= 2;
  if (e.metaKey) modifiers |= 4;
  if (e.shiftKey) modifiers |= 8;
  return modifiers;
}

export function shouldSendText(
  key: string,
  ctrlKey: boolean,
  metaKey: boolean,
  altKey: boolean
): boolean {
  return key.length === 1 && !ctrlKey && !metaKey && !altKey;
}

export function buildViewerScript(): string {
  return `
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const defaultPort = 5005;
    const port = parseInt(location.port, 10) || defaultPort;
    const urlParams = new URLSearchParams(location.search);
    const instanceId = urlParams.get('instanceId');
    const session = urlParams.get('session') || 'default';
    const rawSelector = urlParams.get('selector');
    const selector = rawSelector ? decodeURIComponent(rawSelector) : undefined;
    const wsParam = instanceId ? 'instanceId=' + instanceId : 'session=' + session;

    const wsUrl = wsProtocol + '//' + location.hostname + ':' + port + '?' + wsParam + (selector ? '&selector=' + encodeURIComponent(selector) : '');

    // Background management
    let shouldReconnect = true;
    let reconnectTimer = null;
    let backgroundTimer = null;
    const BACKGROUND_TIMEOUT = 60000; // 60 seconds
    
    const screen = document.getElementById('screen');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const urlDisplay = document.getElementById('urlDisplay');
    const qualityBadge = document.getElementById('qualityBadge');
    const connecting = document.getElementById('connecting');

    const ua = (navigator.userAgent || '').toLowerCase();
    const isTouchDevice = /iphone|ipod|android(?=.*mobile)|mobile|tablet|ipad/i.test(ua);

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'text';
    hiddenInput.style.cssText = 'position:fixed;right:8px;bottom:80px;opacity:0.01;width:1px;height:1px;border:none;outline:none;padding:0;margin:0;font-size:16px;pointer-events:none;';
    hiddenInput.id = 'hidden-input';
    hiddenInput.setAttribute('autocomplete', 'off');
    hiddenInput.setAttribute('autocorrect', 'off');
    hiddenInput.setAttribute('autocapitalize', 'off');
    hiddenInput.setAttribute('spellcheck', 'false');
    if (!isTouchDevice) {
      document.body.appendChild(hiddenInput);
    }

    const degradedToast = document.createElement('div');
    degradedToast.id = 'degraded-toast';
    degradedToast.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:rgba(255,200,0,0.9);color:#000;padding:10px 20px;border-radius:4px;font-family:sans-serif;font-size:14px;z-index:9999;display:none;pointer-events:none;';
    degradedToast.textContent = 'Element not found, showing full page';
    document.body.appendChild(degradedToast);

    let ws = null;
    let metadata = { deviceWidth: 1280, deviceHeight: 720, pageScaleFactor: 1, format: 'jpeg' };
    let userActivityTimeout = null;
    let pendingBinary = false;
    let modifiers = 0;
    let clickCount = 0;
    let clickTimer = null;
    let isComposing = false;
    let lastInputValue = '';
    let fixedSize = false;
    let isRecording = false;
    var _inputPollRaf = null;

    function connect() {
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected';
        connecting.style.display = 'none';
        reconnectTimer = null;
      };

      ws.onclose = () => {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
        connecting.style.display = 'flex';

        // Only reconnect if we should (page is visible)
        if (shouldReconnect) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
      
      ws.onerror = () => {
        statusText.textContent = 'Connection error';
      };
      
      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          handleBinary(event.data);
          return;
        }

        const msg = JSON.parse(event.data);

        // Handle recorder responses
        if (msg.id && msg.id.startsWith('recorder-')) {
          if (msg.id.startsWith('recorder-start-') && msg.success) {
            isRecording = true;
            recordBtn.classList.add('recording');
            recordText.textContent = 'Stop';
          } else if (msg.id.startsWith('recorder-stop-') && msg.success) {
            isRecording = false;
            recordBtn.classList.remove('recording');
            recordText.textContent = 'Record';

            // Download YAML
            if (msg.data && msg.data.yaml) {
              const blob = new Blob([msg.data.yaml], { type: 'text/yaml' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'session-' + Date.now() + '.yaml';
              a.click();
              URL.revokeObjectURL(url);
              alert('Recording stopped. ' + msg.data.steps + ' steps recorded.');
            }
          }
          return;
        }

        switch (msg.type) {
          case 'frame':
            pendingBinary = true;
            const prevElement = metadata.element;
            metadata = msg.metadata;
            if (prevElement && !metadata.element) {
              metadata.element = prevElement;
            }
            if (metadata.element) {
              metadata.deviceWidth = metadata.element.width;
              metadata.deviceHeight = metadata.element.height;
            }
            if (msg.format) metadata.format = msg.format;
            if (msg.state) {
              qualityBadge.textContent = msg.state;
            }
            break;

          case 'status':
            if (msg.connected === false) {
              statusDot.classList.remove('connected');
              statusText.textContent = 'Instance not found';
              const p = connecting.querySelector('p');
              if (p) p.textContent = 'The browser instance has been closed or not found.';
              connecting.style.display = 'flex';
            } else {
              if (msg.viewportWidth) {
                metadata.deviceWidth = msg.viewportWidth;
                metadata.deviceHeight = msg.viewportHeight;
              }
              if (msg.element) {
                metadata.element = msg.element;
              } else {
                metadata.element = undefined;
                if (selector && msg.degraded) {
                  showDegradedMessage();
                }
              }
              if (screen.src && metadata.deviceWidth && metadata.deviceHeight) {
                fitImageToContainer();
              }
            }
            break;

          case 'navigation':
            urlDisplay.value = msg.data.url;
            document.title = msg.data.title + ' - Agent Browser Viewer';
            break;

          case 'input_focused':
            if (inputMode) return;
            if (!isTouchDevice) return;
            var sel = msg.selector || (msg.id ? '#' + msg.id : '');
            enterInputMode(msg.value || '', msg.inputType || msg.tag || '', msg.placeholder || '', sel);
            break;

          case 'input_value':
            if (!inputMode) {
              var field = document.getElementById('input-field');
              if (field && typeof msg.text === 'string') {
                field.value = msg.text;
              }
            }
            break;

          case 'input_blur':
            exitInputMode();
            break;
        }
      };
    }
    
    function handleBinary(data) {
      if (!pendingBinary) return;
      pendingBinary = false;

      const blob = new Blob([data], {
        type: metadata.format === 'webp' ? 'image/webp' : 'image/jpeg'
      });
      const url = URL.createObjectURL(blob);

      const cleanup = () => {
        URL.revokeObjectURL(url);
        connecting.style.display = 'none';
        screen.style.display = 'block';
        fitImageToContainer();
        if (!cursorInitialized && isTouchDevice) {
          cursorInitialized = true;
          setTimeout(initCursor, 50);
        }
      };

      screen.onload = cleanup;
      screen.onerror = cleanup;
      screen.src = url;
    }

    function fitImageToContainer() {
      if (!metadata.deviceWidth || !metadata.deviceHeight) return;
      var container = screen.parentElement;
      if (!container) return;
      var cw = container.clientWidth;
      var ch = container.clientHeight;
      if (cw <= 0 || ch <= 0) return;

      var imgW = metadata.deviceWidth;
      var imgH = metadata.deviceHeight;
      var imgRatio = imgW / imgH;
      var contRatio = cw / ch;

      var dw, dh;
      if (imgRatio > contRatio) {
        dw = cw;
        dh = cw / imgRatio;
      } else {
        dh = ch;
        dw = ch * imgRatio;
      }

      screen.style.width = Math.round(dw) + 'px';
      screen.style.height = Math.round(dh) + 'px';

    }
    
    function safeSend(data) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
    
    function sendUserActivity() {
      safeSend(JSON.stringify({ type: 'user_activity' }));
      
      clearTimeout(userActivityTimeout);
      userActivityTimeout = setTimeout(() => {
        qualityBadge.textContent = 'static';
      }, 2000);
      
      qualityBadge.textContent = 'interacting';
    }
    
    function screenToPage(screenX, screenY) {
      const rect = screen.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };

      var scaleX = metadata.deviceWidth / rect.width;
      var scaleY = metadata.deviceHeight / rect.height;
      var pageX = Math.round((screenX - rect.left) * scaleX);
      var pageY = Math.round((screenY - rect.top) * scaleY);

      if (metadata.element) {
        pageX += metadata.element.x;
        pageY += metadata.element.y;
      }

      return { x: pageX, y: pageY };
    }
    
    function updateModifiers(e) {
      modifiers = 0;
      if (e.altKey) modifiers |= 1;
      if (e.ctrlKey) modifiers |= 2;
      if (e.metaKey) modifiers |= 4;
      if (e.shiftKey) modifiers |= 8;
    }

    function showDegradedMessage() {
      degradedToast.style.display = 'block';
      setTimeout(() => {
        degradedToast.style.display = 'none';
      }, 3000);
    }

    function focusHiddenInput() {
      hiddenInput.focus();
      hiddenInput.select();
    }
    
    screen.addEventListener('dragstart', (e) => e.preventDefault());
    
    screen.addEventListener('click', () => {
      if (!isTouchDevice) focusHiddenInput();
    });
    
    screen.addEventListener('mousemove', (e) => {
      sendUserActivity();
      const pos = screenToPage(e.clientX, e.clientY);
      safeSend(JSON.stringify({
        type: 'input_mouse',
        eventType: 'mouseMoved',
        x: pos.x,
        y: pos.y
      }));
    });
    
    screen.addEventListener('mousedown', (e) => {
      sendUserActivity();
      updateModifiers(e);
      
      if (clickTimer) {
        clickCount++;
      } else {
        clickCount = 1;
        clickTimer = setTimeout(() => {
          clickCount = 0;
          clickTimer = null;
        }, 300);
      }
      
      const pos = screenToPage(e.clientX, e.clientY);
      const buttonMap = { 0: 'left', 1: 'middle', 2: 'right' };
      safeSend(JSON.stringify({
        type: 'input_mouse',
        eventType: 'mousePressed',
        x: pos.x,
        y: pos.y,
        button: buttonMap[e.button] || 'left',
        clickCount: clickCount,
        modifiers: modifiers
      }));
    });
    
    screen.addEventListener('mouseup', (e) => {
      updateModifiers(e);
      const pos = screenToPage(e.clientX, e.clientY);
      const buttonMap = { 0: 'left', 1: 'middle', 2: 'right' };
      safeSend(JSON.stringify({
        type: 'input_mouse',
        eventType: 'mouseReleased',
        x: pos.x,
        y: pos.y,
        button: buttonMap[e.button] || 'left',
        clickCount: clickCount,
        modifiers: modifiers
      }));
    });
    
    screen.addEventListener('wheel', (e) => {
      sendUserActivity();
      updateModifiers(e);
      const pos = screenToPage(e.clientX, e.clientY);
      safeSend(JSON.stringify({
        type: 'input_mouse',
        eventType: 'mouseWheel',
        x: pos.x,
        y: pos.y,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        modifiers: modifiers
      }));
      e.preventDefault();
    });
    
    hiddenInput.addEventListener('compositionstart', () => {
      isComposing = true;
      lastInputValue = hiddenInput.value;
      console.log('[Viewer] compositionstart, lastInputValue:', lastInputValue);
    });
    
    hiddenInput.addEventListener('compositionend', (e) => {
      isComposing = false;
      const newText = hiddenInput.value.slice(lastInputValue.length);
      console.log('[Viewer] compositionend, newText:', newText, 'hiddenInput.value:', hiddenInput.value);
      if (newText) {
        sendUserActivity();
        safeSend(JSON.stringify({
          type: 'keyboard_insert_text',
          text: newText
        }));
      }
      lastInputValue = '';
      hiddenInput.value = '';
    });
    
    hiddenInput.addEventListener('input', (e) => {
      console.log('[Viewer] input event, isComposing:', isComposing, 'hiddenInput.value:', hiddenInput.value);
      if (isComposing) return;
      
      const newValue = hiddenInput.value;
      if (newValue.length > 0) {
        sendUserActivity();
        safeSend(JSON.stringify({
          type: 'keyboard_insert_text',
          text: newValue
        }));
      }
      hiddenInput.value = '';
      lastInputValue = '';
    });
    
    hiddenInput.addEventListener('paste', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const text = e.clipboardData.getData('text');
      console.log('[Viewer] paste event, text:', text);
      if (text) {
        sendUserActivity();
        safeSend(JSON.stringify({
          type: 'keyboard_insert_text',
          text: text
        }));
      }
    });
    
    document.addEventListener('keydown', (e) => {
      console.log('[Viewer] keydown, key:', e.key, 'target:', e.target === hiddenInput ? 'hiddenInput' : 'other', 'metaKey:', e.metaKey, 'ctrlKey:', e.ctrlKey);
      if (e.target === hiddenInput) {
        if (e.key === 'Tab') {
          e.preventDefault();
        }
        
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          sendUserActivity();
          safeSend(JSON.stringify({
            type: 'keyboard_down',
            key: e.key
          }));
          return;
        }
        
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !isComposing) {
          console.log('[Viewer] single char in hiddenInput, waiting for input event');
          return;
        }
      }

      const mobileInputField = document.getElementById('input-field');
      if (mobileInputField && e.target === mobileInputField) return;

      if (isComposing) return;
      
      sendUserActivity();
      
      safeSend(JSON.stringify({
        type: 'keyboard_down',
        key: e.key
      }));
      
      if (e.key === 'Tab' || (e.key === 'Backspace' && !e.target.matches('input, textarea'))) {
        e.preventDefault();
      }
    });
    
    document.addEventListener('keyup', (e) => {
      console.log('[Viewer] keyup, key:', e.key);
      if (isComposing && e.target === hiddenInput) return;
      const mobileInputField = document.getElementById('input-field');
      if (mobileInputField && e.target === mobileInputField) return;
      
      safeSend(JSON.stringify({
        type: 'keyboard_up',
        key: e.key
      }));
    });
    
    const cursor = document.getElementById('cursor');
    const touchpad = document.getElementById('touchpad');
    const screenContainer = document.getElementById('screenContainer');

    // Ensure touchpad is hidden on non-touch devices
    if (touchpad && !isTouchDevice) {
      touchpad.style.display = 'none';
    }

    let cursorPos = { x: 0, y: 0 };
    let dragMode = false;
    let isMouseDown = false;
    let lastTouchPos = null;
    let touchMoved = false;
    let twoFingerStartPos = null;
    let longPressTimer = null;
    let longPressHintTimer = null;
    let cursorInitialized = false;

    const CURSOR_SENSITIVITY = 1.5;
    const WHEEL_SENSITIVITY = 2.0;
    const LONG_PRESS_MS = 800;
    const COOLDOWN_MS = 200;
    const MOVE_THRESHOLD = 5;
    const ACCELERATION = 0.8;
    const ACCEL_MAX_VELOCITY = 3.0;

    let lastMoveTime = 0;

    function computeAcceleration(dx, dy) {
      const now = Date.now();
      const dt = now - lastMoveTime;
      lastMoveTime = now;
      if (dt <= 0 || dt > 200) return CURSOR_SENSITIVITY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const velocity = Math.min(dist / dt, ACCEL_MAX_VELOCITY);
      return CURSOR_SENSITIVITY * (1 + ACCELERATION * velocity);
    }

    function computeWheelAccel(dx, dy) {
      const now = Date.now();
      const dt = now - lastMoveTime;
      lastMoveTime = now;
      if (dt <= 0 || dt > 200) return WHEEL_SENSITIVITY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const velocity = Math.min(dist / dt, ACCEL_MAX_VELOCITY);
      return WHEEL_SENSITIVITY * (1 + ACCELERATION * velocity);
    }

    let screenRect = null;
    let moveAllowed = false;
    var inputMode = false;
    let moveCooldownUntil = 0;
    let lastWheelDeltaX = 0;
    let lastWheelDeltaY = 0;
    let momentumActive = false;
    let keyboardVvHandler = null;
    let _scrollGuard = null;

    function updateScreenRect() {
      screenRect = screen.getBoundingClientRect();
    }

    function enterInputMode(initialValue, inputType, placeholder, selector) {
      if (inputMode) return;
      inputMode = true;

      cursor.style.display = 'none';

      const ip = document.getElementById('input-panel');
      const tp = document.getElementById('touchpad');
      
      if (ip) {
        ip.style.display = 'flex';
        ip.style.bottom = '0px';
      }
      if (tp) tp.style.display = 'none';

      var labelParts = [];
      if (inputType) labelParts.push(inputType);
      if (placeholder && placeholder !== initialValue) labelParts.push(placeholder);
      var targetEl = document.getElementById('input-target');
      if (targetEl) targetEl.textContent = labelParts.length > 0 ? labelParts.join(' | ') : 'input';

      // Record target selector for fillValue calls
      window._currentTargetSelector = selector || '';

      var field = document.getElementById('input-field');
      if (field) {
        field.value = initialValue || '';
        field.dataset.lastSent = initialValue || '';
      }

      // Anti-scroll: force scroll to top BEFORE focus (reference demo technique)
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;

      // Lock touch action
      document.body.style.touchAction = 'none';
      document.documentElement.style.touchAction = 'none';

      // Delay: wait for panel to render before capturing viewport & focusing
      setTimeout(function() {
        if (!field) return;

        // Capture original viewport height AFTER panel is visible, BEFORE focus
        var origVh = window.visualViewport ? window.visualViewport.height : window.innerHeight;

        // Register visualViewport listener for keyboard detection
        if (window.visualViewport) {
          var kbTolerance = Math.floor(window.innerHeight * 0.1);

          keyboardVvHandler = function() {
            if (!inputMode || !ip) return;
            var currentH = window.visualViewport.height;
            var kbHeight = Math.max(0, origVh - currentH);
            // Fallback: use innerHeight difference
            if (kbHeight < kbTolerance) {
              kbHeight = Math.max(kbHeight, Math.max(0, window.innerHeight - currentH));
            }
            if (kbHeight > kbTolerance) {
              ip.style.bottom = kbHeight + 'px';
            } else {
              ip.style.bottom = '0px';
            }
          };
          window.visualViewport.addEventListener('resize', keyboardVvHandler);
        }

        // Focus input to trigger soft keyboard
        field.focus();

        // Anti-scroll again after focus (browser may auto-scroll on focus)
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;

        // Delayed check: wait for keyboard animation to complete (~300ms)
        setTimeout(function() {
          if (keyboardVvHandler) keyboardVvHandler();
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
          document.documentElement.scrollTop = 0;
        }, 350);

        // Scroll guard interval: continuously fight iOS auto-scroll (reference demo)
        if (!_scrollGuard) {
          _scrollGuard = setInterval(function() {
            if (!inputMode) return;
            if (window.scrollY > 0 || document.body.scrollTop > 0 ||
                document.documentElement.scrollTop > 0) {
              window.scrollTo(0, 0);
              document.body.scrollTop = 0;
              document.documentElement.scrollTop = 0;
            }
          }, 100);
        }

        // RAF poll: reliable value-change detection for IME/CJK/clipboard/paste
        var _pollField = field;
        var _lastPolled = _pollField.value || '';
        window._fieldComposing = false;

        _pollField.addEventListener('compositionstart', function() {
          window._fieldComposing = true;
        });
        _pollField.addEventListener('compositionend', function() {
          window._fieldComposing = false;
          // Double-RAF: yields current frame + next paint cycle.
          // On mobile browsers (iOS Safari, Android WebView), .value may
          // not be updated until 1-2 frames after compositionend fires.
          requestAnimationFrame(function() {
            requestAnimationFrame(function() {
              syncInputToRemote(_pollField);
            });
          });
        });

        (function startPoll() {
          function poll() {
            if (!inputMode || !_pollField) { _inputPollRaf = null; return; }
            var cur = _pollField.value;
            if (cur !== _lastPolled) {
              _lastPolled = cur;
              if (!window._fieldComposing) {
                syncInputToRemote(_pollField);
              }
            }
            _inputPollRaf = requestAnimationFrame(poll);
          }
          _inputPollRaf = requestAnimationFrame(poll);
        })();
      }, 100);
    }

    function exitInputMode() {
      if (!inputMode) return;
      inputMode = false;

      if (_inputPollRaf) { cancelAnimationFrame(_inputPollRaf); _inputPollRaf = null; }
      window._fieldComposing = false;

      cursor.style.display = 'block';

      const field = document.getElementById('input-field');
      if (field) { field.value = ''; field.blur(); delete field.dataset.lastSent; }

      const ip = document.getElementById('input-panel');
      const tp = document.getElementById('touchpad');
      
      if (ip) {
        ip.style.display = 'none';
        ip.style.bottom = '0px';
      }
      if (tp) tp.style.display = isTouchDevice ? 'flex' : 'none';

      // Cleanup visualViewport handler
      if (keyboardVvHandler && window.visualViewport) {
        window.visualViewport.removeEventListener('resize', keyboardVvHandler);
        keyboardVvHandler = null;
      }

      // Cleanup scroll guard
      if (_scrollGuard) {
        clearInterval(_scrollGuard);
        _scrollGuard = null;
      }

      // Restore touch action
      document.body.style.touchAction = '';
      document.documentElement.style.touchAction = '';

      safeSend(JSON.stringify({
        type: 'input_blur_element',
        selector: window._currentTargetSelector || ''
      }));
    }

    var _syncDebounceTimer = null;
    function syncInputToRemote(field) {
      if (!field || !inputMode) return;
      var current = field.value;
      var lastSent = field.dataset.lastSent || '';
      if (current === lastSent) return;

      var isFirstSync = !field.dataset.lastSent;
      function doSend() {
        safeSend(JSON.stringify({
          type: 'input_fill',
          text: current,
          selector: window._currentTargetSelector || ''
        }));
        field.dataset.lastSent = current;
      }

      if (isFirstSync) {
        doSend();
      } else {
        clearTimeout(_syncDebounceTimer);
        _syncDebounceTimer = setTimeout(doSend, 30);
      }
    }

    function sendInputText() {
      const field = document.getElementById('input-field');
      if (!field || !field.value.trim()) return;
      
      var finalText = field.value;
      var sel = window._currentTargetSelector || '';
      
      // Send final text via input_fill + Enter key
      safeSend(JSON.stringify({
        type: 'input_fill',
        text: finalText,
        selector: sel
      }));
      safeSend(JSON.stringify({
        type: 'input_keyboard',
        eventType: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        modifiers: 0,
        selector: sel
      }));
      safeSend(JSON.stringify({
        type: 'input_keyboard',
        eventType: 'keyUp',
        key: 'Enter',
        code: 'Enter',
        modifiers: 0,
        selector: sel
      }));
      
      field.value = '';
      exitInputMode();
    }

    function startMomentum() {
      momentumActive = true;
      var frame = function() {
        if (!momentumActive) return;
        lastWheelDeltaX *= 0.92;
        lastWheelDeltaY *= 0.92;
        if (Math.abs(lastWheelDeltaX) < 0.5 && Math.abs(lastWheelDeltaY) < 0.5) {
          momentumActive = false;
          return;
        }
        var pagePos = screenToPage(cursorPos.x, cursorPos.y);
        safeSend(JSON.stringify({
          type: 'input_mouse',
          eventType: 'mouseWheel',
          x: pagePos.x,
          y: pagePos.y,
          deltaX: lastWheelDeltaX,
          deltaY: lastWheelDeltaY,
          modifiers: 0
        }));
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }

    function initCursor() {
      updateScreenRect();
      cursorPos = { x: screenRect.left + screenRect.width / 2, y: screenRect.top + screenRect.height / 2 };
      updateCursor();
      cursor.style.display = 'block';
    }

    function updateCursor() {
      cursor.style.left = cursorPos.x + 'px';
      cursor.style.top = cursorPos.y + 'px';
    }

    function clampCursor(val, min, max) {
      return Math.max(min, Math.min(max, val));
    }

    function setCursorMode(mode) {
      cursor.className = '';
      if (mode === 'move') cursor.classList.add('cursor-move');
      else if (mode === 'drag') cursor.classList.add('cursor-drag');
      else if (mode === 'longpress') cursor.classList.add('cursor-longpress');
    }

    function showModeBadge(text, color) {
      var badge = document.getElementById('modeBadge');
      if (!badge) return;
      badge.textContent = text;
      badge.style.background = color;
      badge.style.display = 'block';
    }

    function hideModeBadge() {
      var badge = document.getElementById('modeBadge');
      if (!badge) return;
      badge.style.display = 'none';
    }

    if (isTouchDevice) {
      // On touch devices, touchpad is at bottom of screen (CSS clamp + dvh height)
      // Input panel floats above it (position:fixed overlay)
      touchpad.style.display = 'flex';
      touchpad.style.position = 'relative';
      touchpad.style.background = 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)';
      touchpad.style.borderTop = '2px solid #4ecca3';
      touchpad.style.justifyContent = 'center';
      touchpad.style.zIndex = '10';

      touchpad.addEventListener('touchstart', (e) => {
        e.preventDefault();
        sendUserActivity();

        if (e.touches.length === 2) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          dragMode = false;
          moveAllowed = false;
          lastTouchPos = null;
          momentumActive = false;
          setCursorMode(null);
          hideModeBadge();
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          twoFingerStartPos = {
            lastMidX: (t0.clientX + t1.clientX) / 2,
            lastMidY: (t0.clientY + t1.clientY) / 2,
          };
          lastMoveTime = Date.now();
          return;
        }

        if (e.touches.length === 1) {
          if (Date.now() < moveCooldownUntil) return;
          moveAllowed = true;
          setCursorMode('move');
          showModeBadge('MOVE', 'rgba(68, 140, 255, 0.7)');
          const t = e.touches[0];
          lastTouchPos = { x: t.clientX, y: t.clientY };
          lastMoveTime = Date.now();
          touchMoved = false;

          clearTimeout(longPressTimer);
          clearTimeout(longPressHintTimer);
          longPressTimer = setTimeout(() => {
            longPressTimer = null;
            longPressHintTimer = null;
            dragMode = true;
            isMouseDown = true;
            touchMoved = true;
            setCursorMode('drag');
            showModeBadge('DRAG', 'rgba(255, 165, 0, 0.8)');
            const pagePos = screenToPage(cursorPos.x, cursorPos.y);
            safeSend(JSON.stringify({
              type: 'input_mouse',
              eventType: 'mousePressed',
              x: pagePos.x,
              y: pagePos.y,
              button: 'left',
              clickCount: 1,
              modifiers: 0
            }));
          }, LONG_PRESS_MS);
        }
      }, { passive: false });

      touchpad.addEventListener('touchend', (e) => {
        e.preventDefault();
        clearTimeout(longPressTimer);
        clearTimeout(longPressHintTimer);
        if (e.touches.length === 0) {
          if (twoFingerStartPos) {
            moveCooldownUntil = Date.now() + COOLDOWN_MS;
            if (Math.abs(lastWheelDeltaX) > 2 || Math.abs(lastWheelDeltaY) > 2) {
              startMomentum();
            }
          }
          moveAllowed = false;
          setCursorMode(null);
          hideModeBadge();
          if (dragMode) {
            const pagePos = screenToPage(cursorPos.x, cursorPos.y);
            safeSend(JSON.stringify({
              type: 'input_mouse',
              eventType: 'mouseReleased',
              x: pagePos.x,
              y: pagePos.y,
              button: 'left',
              clickCount: 1,
              modifiers: 0
            }));
            dragMode = false;
            isMouseDown = false;
          } else if (!touchMoved) {
            // Single tap/click: send click event, then attempt focus
            const pagePos = screenToPage(cursorPos.x, cursorPos.y);
            
            safeSend(JSON.stringify({
              type: 'input_mouse',
              eventType: 'mousePressed',
              x: pagePos.x,
              y: pagePos.y,
              button: 'left',
              clickCount: 1,
              modifiers: 0
            }));
            safeSend(JSON.stringify({
              type: 'input_mouse',
              eventType: 'mouseReleased',
              x: pagePos.x,
              y: pagePos.y,
              button: 'left',
              clickCount: 1,
              modifiers: 0
            }));


          }
          lastTouchPos = null;
          twoFingerStartPos = null;
          touchMoved = false;
        }
      }, { passive: false });

      touchpad.addEventListener('touchmove', (e) => {
        e.preventDefault();

        if (e.touches.length === 2 && twoFingerStartPos) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          dragMode = false;
          moveAllowed = false;
          lastTouchPos = null;
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          const midX = (t0.clientX + t1.clientX) / 2;
          const midY = (t0.clientY + t1.clientY) / 2;
          const rawDX = midX - twoFingerStartPos.lastMidX;
          const rawDY = midY - twoFingerStartPos.lastMidY;
          const wMult = computeWheelAccel(rawDX, rawDY);
          const deltaX = rawDX * wMult;
          const deltaY = rawDY * wMult;
          lastWheelDeltaX = deltaX;
          lastWheelDeltaY = deltaY;
          const pagePos = screenToPage(cursorPos.x, cursorPos.y);
          safeSend(JSON.stringify({
            type: 'input_mouse',
            eventType: 'mouseWheel',
            x: pagePos.x,
            y: pagePos.y,
            deltaX: deltaX,
            deltaY: deltaY,
            modifiers: 0
          }));
          twoFingerStartPos.lastMidX = midX;
          twoFingerStartPos.lastMidY = midY;
          return;
        }

        if (e.touches.length === 1 && lastTouchPos && moveAllowed) {
          const t = e.touches[0];
          const dx = t.clientX - lastTouchPos.x;
          const dy = t.clientY - lastTouchPos.y;

          if (!touchMoved && Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
            touchMoved = true;
            clearTimeout(longPressTimer);
            clearTimeout(longPressHintTimer);
            longPressTimer = null;
            longPressHintTimer = null;
            setCursorMode('move');
            showModeBadge('MOVE', 'rgba(68, 140, 255, 0.7)');
          }

          lastTouchPos = { x: t.clientX, y: t.clientY };

          if (touchMoved) {
            sendUserActivity();
            if (!screenRect) updateScreenRect();
            const accel = computeAcceleration(dx, dy);
            cursorPos.x = clampCursor(cursorPos.x + dx * accel, screenRect.left, screenRect.right);
            cursorPos.y = clampCursor(cursorPos.y + dy * accel, screenRect.top, screenRect.bottom);
            updateCursor();

            const pagePos = screenToPage(cursorPos.x, cursorPos.y);
            var dbg = document.getElementById('debug-overlay');
            if (dbg && (!window._moveDebugCount)) window._moveDebugCount = 0;
            if (dbg && window._moveDebugCount < 8) {
              window._moveDebugCount++;
              dbg.textContent += ' | cur:' + Math.round(cursorPos.x) + ',' + Math.round(cursorPos.y)
                + ' -> page:' + pagePos.x + ',' + pagePos.y;
            }

            safeSend(JSON.stringify({
              type: 'input_mouse',
              eventType: 'mouseMoved',
              x: pagePos.x,
              y: pagePos.y,
              button: dragMode ? 'left' : 'none',
              clickCount: 1,
              modifiers: 0
            }));
          }
        }
      }, { passive: false });

      touchpad.addEventListener('touchcancel', () => {
        clearTimeout(longPressTimer);
        clearTimeout(longPressHintTimer);
        momentumActive = false;
        if (dragMode) {
          const pagePos = screenToPage(cursorPos.x, cursorPos.y);
          safeSend(JSON.stringify({
            type: 'input_mouse',
            eventType: 'mouseReleased',
            x: pagePos.x,
            y: pagePos.y,
            button: 'left',
            clickCount: 1,
            modifiers: 0
          }));
        }
        dragMode = false;
        isMouseDown = false;
        moveAllowed = false;
        setCursorMode(null);
        hideModeBadge();
        moveCooldownUntil = twoFingerStartPos ? Date.now() + COOLDOWN_MS : 0;
        lastTouchPos = null;
        twoFingerStartPos = null;
        touchMoved = false;
      }, { passive: false });
    }
    
    var inputSendBtn = document.getElementById('input-send');
    if (inputSendBtn) inputSendBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      sendInputText();
    });

    document.addEventListener('pointerdown', function(e) {
      if (!inputMode) return;
      var panel = document.getElementById('input-panel');
      if (panel && !panel.contains(e.target)) {
        exitInputMode();
      }
    });

    var inputField = document.getElementById('input-field');
    if (inputField) {
      inputField.addEventListener('input', function(e) {
        if (window._fieldComposing) return;
        syncInputToRemote(inputField);
      });
      inputField.addEventListener('compositionend', function(e) {
        window._fieldComposing = false;
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            syncInputToRemote(inputField);
          });
        });
      });
      inputField.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendInputText();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          exitInputMode();
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
          // Let it fall through - the field value will change,
          // then syncInputToRemote will pick up the change and send input_fill
        }
      });
    }
    
    // Image sizing: re-fit on container resize (phone rotation, window resize)
    var resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fitImageToContainer, 100);
    });

    // Recorder functionality
    const recordBtn = document.getElementById('recordBtn');
    const recordText = document.getElementById('recordText');

    recordBtn.onclick = () => {
      if (isRecording) {
        // Stop recording
        safeSend(JSON.stringify({ id: 'recorder-stop-' + Date.now(), action: 'recorder_stop' }));
      } else {
        // Start recording
        safeSend(JSON.stringify({ id: 'recorder-start-' + Date.now(), action: 'recorder_start' }));
      }
    };

    // Page visibility management
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Page going to background: stop reconnect attempts
        shouldReconnect = false;

        // Start background timer - disconnect after timeout
        backgroundTimer = setTimeout(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close(1000, 'Page in background');
          }
        }, BACKGROUND_TIMEOUT);
      } else {
        // Page coming back to foreground
        shouldReconnect = true;

        // Clear background timer if page is visible again
        if (backgroundTimer) {
          clearTimeout(backgroundTimer);
          backgroundTimer = null;
        }

        // Reconnect immediately if disconnected
        if (!ws || ws.readyState === WebSocket.CLOSED) {
          connect();
        }
      }
    });

    if (!isTouchDevice) focusHiddenInput();
    connect();
`;
}
