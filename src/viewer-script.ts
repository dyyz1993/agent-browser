const RECONNECT_DELAY_MS = 2000;

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
  if (ws && ws.readyState === 1) {
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
  }, RECONNECT_DELAY_MS);

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
    let reconnectAttempts = 0;
    let everConnected = false;
    const BACKGROUND_TIMEOUT = 60000; // 60 seconds
    
    const screen = document.getElementById('screen');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const urlDisplay = document.getElementById('urlDisplay');
    const qualityBadge = document.getElementById('qualityBadge');
    const connecting = document.getElementById('connecting');
    const disconnectedPage = document.getElementById('disconnectedPage');
    const disconnectedIcon = document.getElementById('disconnectedIcon');
    const disconnectedTitle = document.getElementById('disconnectedTitle');
    const disconnectedDesc = document.getElementById('disconnectedDesc');
    const disconnectedHint = document.getElementById('disconnectedHint');

    const ua = (navigator.userAgent || '').toLowerCase();

    function detectDeviceMode() {
      var uaMatch = /iphone|ipod|android(?=.*mobile)|mobile|tablet|ipad/i.test(ua);
      return uaMatch ? 'mobile' : 'desktop';
    }

    var _deviceCurrent = detectDeviceMode();

    const DeviceMode = {
      _current: _deviceCurrent,
      _listeners: [],
      _manualOverride: null,
      get current() { return this._current; },
      onModeChange: function(fn) { this._listeners.push(fn); },
      setManual: function(mode) {
        this._manualOverride = mode;
        this.switchTo(mode);
      },
      clearManual: function() {
        this._manualOverride = null;
      },
      switchTo: function(mode) {
        if (mode === this._current) return;
        var prev = this._current;
        this._current = mode;
        if (mode === 'desktop') {
          MobileModule.detach();
          DesktopModule.attach();
        } else {
          DesktopModule.detach();
          MobileModule.attach();
        }
        this._listeners.forEach(function(fn) { fn(mode, prev); });
      },
      autoDetectAndSwitch: function() {
        if (this._manualOverride !== null) return;
        var newMode = detectDeviceMode();
        if (newMode !== this._current) this.switchTo(newMode);
      }
    };

    const modeBtn = document.getElementById('modeBtn');
    const modeText = document.getElementById('modeText');

    function updateModeButton() {
      if (!modeText) return;
      var mode = DeviceMode.current;
      modeText.textContent = mode === 'desktop' ? '🖥️ Desktop' : '📱 Mobile';
      if (modeBtn) {
        modeBtn.title = 'Switch to ' + (mode === 'desktop' ? 'Mobile' : 'Desktop') + ' mode';
      }
    }

    if (modeBtn) {
      modeBtn.addEventListener('click', function() {
        var newMode = DeviceMode.current === 'desktop' ? 'mobile' : 'desktop';
        DeviceMode.setManual(newMode);
      });
    }

    DeviceMode.onModeChange(function(mode) {
      updateModeButton();
    });

    updateModeButton();

    var hiddenInput = null;
    let cursorInitialized = false;

    const DesktopModule = {
      attach: function() {
        if (hiddenInput && hiddenInput.parentNode) return;
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'text';
        hiddenInput.style.cssText = 'position:fixed;right:8px;bottom:80px;opacity:0.01;width:1px;height:1px;border:none;outline:none;padding:0;margin:0;font-size:16px;pointer-events:none;';
        hiddenInput.id = 'hidden-input';
        hiddenInput.setAttribute('autocomplete', 'off');
        hiddenInput.setAttribute('autocorrect', 'off');
        hiddenInput.setAttribute('autocapitalize', 'off');
        hiddenInput.setAttribute('spellcheck', 'false');
        document.body.appendChild(hiddenInput);

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

        focusHiddenInput();
      },
      detach: function() {
        if (hiddenInput) { hiddenInput.blur(); if (hiddenInput.parentNode) hiddenInput.parentNode.removeChild(hiddenInput); hiddenInput = null; }
      }
    };

    const MobileModule = {
      attach: function() {
        document.body.classList.add('mobile-mode');
        if (touchpad) { touchpad.style.position = 'relative'; touchpad.style.zIndex = '10'; }
        setupToolbar();
        cursorInitialized = false;
        setTimeout(initCursor, 100);
      },
      detach: function() {
        document.body.classList.remove('mobile-mode');
        var ip = document.getElementById('input-panel');
        if (ip) { ip.style.display = 'none'; ip.style.bottom = '0px'; }
        if (touchpad) { touchpad.style.display = ''; }
        if (cursor) cursor.style.display = 'block';
      }
    };

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
        hideDisconnectedPage();
        reconnectTimer = null;
        reconnectAttempts = 0;
        everConnected = true;
      };

      ws.onclose = () => {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
        reconnectAttempts++;

        if (!everConnected) {
          var iconEl = document.getElementById('connectingIcon');
          var spinnerEl = document.getElementById('connectingSpinner');
          var textEl = document.getElementById('connectingText');
          if (iconEl) iconEl.style.display = 'none';
          if (spinnerEl) spinnerEl.style.display = '';
          if (textEl) textEl.textContent = 'Connecting to browser...';
          connecting.style.display = 'flex';
        } else if (reconnectAttempts > 3) {
          showDisconnectedPage(
            'Session Closed',
            'The browser session has ended or was killed.',
            'Please start a new browser session to continue.',
            '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
          );
        } else {
          showDisconnectedPage(
            'Disconnected',
            'Connection to the browser was lost.',
            'Reconnecting (' + reconnectAttempts + ')...',
            '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f39c12" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1112.73 12.73"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="12" y1="21" x2="12" y2="23"/></svg>'
          );
        }

        if (shouldReconnect && reconnectAttempts <= 10) {
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

        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (_e) {
          return;
        }

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
              if (msg.url) {
                urlDisplay.value = msg.url;
              }
              if (msg.title) {
                document.title = msg.title + ' - Agent Browser Viewer';
              }
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
            var sel = msg.selector || (msg.id ? '#' + msg.id : '');
            enterInputMode(msg.value || '', msg.inputType || msg.tag || '', msg.placeholder || '', sel, msg.rect);
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
        if (!cursorInitialized && DeviceMode.current === 'mobile') {
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
      var vp = document.querySelector('.viewport');
      var container = vp || screen.parentElement;
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
      if (ws && ws.readyState === 1) {
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
      if (DeviceMode.current === 'desktop') focusHiddenInput();
    });

    let screenTouchStartPos = null;
    let screenTouchMoved = false;
    let screenDragMode = false;
    let screenLongPressTimer = null;

    function cancelScreenLongPress() {
      if (screenLongPressTimer) {
        clearTimeout(screenLongPressTimer);
        screenLongPressTimer = null;
      }
    }

    function enterScreenDragMode() {
      screenDragMode = true;
      cancelScreenLongPress();
      updateScreenRect();
      cursor.classList.add('cursor-drag');
      var pagePos = screenToPage(cursorPos.x, cursorPos.y);
      safeSend(JSON.stringify({ type: 'input_mouse', eventType: 'mousePressed', x: pagePos.x, y: pagePos.y, button: 'left', clickCount: 1, modifiers: 0 }));
    }

    screen.addEventListener('touchstart', (e) => {
      if (DeviceMode.current !== 'mobile' && DeviceMode.current !== 'desktop') return;
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        screenTouchStartPos = { x: t.clientX, y: t.clientY };
        screenTouchMoved = false;
        screenDragMode = false;
        cancelScreenLongPress();
        updateScreenRect();
        if (!cursorInitialized && screenRect && screenRect.width > 0) {
          cursorPos = { x: screenRect.left + screenRect.width / 2, y: screenRect.top + screenRect.height / 2 };
          updateCursor();
          cursor.style.display = 'block';
          cursorInitialized = true;
        }
        screenLongPressTimer = setTimeout(function() {
          if (!screenTouchMoved && screenTouchStartPos) {
            enterScreenDragMode();
          }
        }, 400);
      } else if (e.touches.length === 2) {
        cancelScreenLongPress();
        if (screenDragMode) {
          screenDragMode = false;
          cursor.classList.remove('cursor-drag');
          updateScreenRect();
          var pagePos = screenToPage(cursorPos.x, cursorPos.y);
          safeSend(JSON.stringify({ type: 'input_mouse', eventType: 'mouseReleased', x: pagePos.x, y: pagePos.y, button: 'left', clickCount: 1, modifiers: 0 }));
        }
        screenTouchStartPos = null;
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        twoFingerStartPos = {
          lastMidX: (t0.clientX + t1.clientX) / 2,
          lastMidY: (t0.clientY + t1.clientY) / 2,
        };
      }
    }, { passive: false });

    screen.addEventListener('touchmove', (e) => {
      if (DeviceMode.current !== 'mobile' && DeviceMode.current !== 'desktop') return;
      e.preventDefault();

      if (e.touches.length === 2 && twoFingerStartPos) {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const midX = (t0.clientX + t1.clientX) / 2;
        const midY = (t0.clientY + t1.clientY) / 2;
        const rawDX = midX - twoFingerStartPos.lastMidX;
        const rawDY = midY - twoFingerStartPos.lastMidY;
        twoFingerStartPos.lastMidX = midX;
        twoFingerStartPos.lastMidY = midY;
        updateScreenRect();
        const pagePos = screenToPage(cursorPos.x, cursorPos.y);
        safeSend(JSON.stringify({
          type: 'input_mouse',
          eventType: 'mouseWheel',
          x: pagePos.x,
          y: pagePos.y,
          deltaX: rawDX * 1.5,
          deltaY: rawDY * 1.5,
          modifiers: 0
        }));
        return;
      }

      if (e.touches.length === 1 && screenTouchStartPos) {
        const t = e.touches[0];
        const dx = t.clientX - screenTouchStartPos.x;
        const dy = t.clientY - screenTouchStartPos.y;
        if (!screenTouchMoved && Math.sqrt(dx * dx + dy * dy) > 3) {
          screenTouchMoved = true;
          cancelScreenLongPress();
        }
        if (screenTouchMoved) {
          updateScreenRect();
          var accel = computeAcceleration(dx, dy);
          cursorPos.x = clampCursor(cursorPos.x + dx * accel, screenRect.left, screenRect.right);
          cursorPos.y = clampCursor(cursorPos.y + dy * accel, screenRect.top, screenRect.bottom);
          updateCursor();
          const pagePos = screenToPage(cursorPos.x, cursorPos.y);
          if (screenDragMode) {
            safeSend(JSON.stringify({
              type: 'input_mouse',
              eventType: 'mouseMoved',
              x: pagePos.x,
              y: pagePos.y,
              button: 'left',
              clickCount: 1,
              modifiers: 0
            }));
          } else {
            safeSend(JSON.stringify({
              type: 'input_mouse',
              eventType: 'mouseMoved',
              x: pagePos.x,
              y: pagePos.y,
              button: 'none',
              clickCount: 1,
              modifiers: 0
            }));
          }
          screenTouchStartPos = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });

    screen.addEventListener('touchend', (e) => {
      if (DeviceMode.current !== 'mobile' && DeviceMode.current !== 'desktop') return;
      e.preventDefault();
      cancelScreenLongPress();
      if (e.touches.length === 0) {
        if (screenDragMode) {
          updateScreenRect();
          var pagePos = screenToPage(cursorPos.x, cursorPos.y);
          safeSend(JSON.stringify({ type: 'input_mouse', eventType: 'mouseReleased', x: pagePos.x, y: pagePos.y, button: 'left', clickCount: 1, modifiers: 0 }));
          screenDragMode = false;
          cursor.classList.remove('cursor-drag');
        } else if (!screenTouchMoved) {
          updateScreenRect();
          var tapPos = screenToPage(cursorPos.x, cursorPos.y);
          safeSend(JSON.stringify({ type: 'input_mouse', eventType: 'mousePressed', x: tapPos.x, y: tapPos.y, button: 'left', clickCount: 1, modifiers: 0 }));
          safeSend(JSON.stringify({ type: 'input_mouse', eventType: 'mouseReleased', x: tapPos.x, y: tapPos.y, button: 'left', clickCount: 1, modifiers: 0 }));
        }
        screenTouchStartPos = null;
        screenTouchMoved = false;
        twoFingerStartPos = null;
      }
    }, { passive: false });

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

    // Initialize modules based on detected mode
    if (DeviceMode.current === 'desktop') {
      DesktopModule.attach();
    } else {
      MobileModule.attach();
    }

    let cursorPos = { x: 0, y: 0 };
    let dragMode = false;
    let isMouseDown = false;
    let lastTouchPos = null;
    let touchMoved = false;
    let twoFingerStartPos = null;
    let longPressTimer = null;
    let longPressHintTimer = null;

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

    function showDisconnectedPage(title, desc, hint, icon) {
      var toolbar = document.querySelector('.toolbar');
      var viewport = document.querySelector('.viewport');
      var touchpadEl = document.getElementById('touchpad');
      var inputPanel = document.getElementById('input-panel');
      if (toolbar) toolbar.style.display = 'none';
      if (viewport) viewport.style.display = 'none';
      if (touchpadEl) touchpadEl.style.display = 'none';
      if (inputPanel) inputPanel.style.display = 'none';
      document.body.style.background = '#0d1117';

      if (disconnectedTitle) disconnectedTitle.textContent = title || '';
      if (disconnectedDesc) disconnectedDesc.textContent = desc || '';
      if (disconnectedHint) { disconnectedHint.textContent = hint || ''; disconnectedHint.style.display = hint ? '' : 'none'; }
      if (disconnectedIcon) disconnectedIcon.innerHTML = icon || '';

      if (!document.getElementById('dcPage')) {
        var dp = document.createElement('div');
        dp.id = 'dcPage';
        var iid = (typeof URLSearchParams !== 'undefined' && typeof location !== 'undefined') ? (new URLSearchParams(location.search)).get('instanceId') : '';
        dp.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0d1117;padding:24px;text-align:center;';
        dp.innerHTML =
          '<div id="dcIcon" style="width:64px;height:64px;margin-bottom:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);"></div>' +
          '<div id="dcTitle" style="font-size:22px;font-weight:600;color:#fff;margin-bottom:8px;"></div>' +
          '<div id="dcDesc" style="font-size:14px;color:#aaa;line-height:1.6;max-width:300px;"></div>' +
          '<div id="dcHint" style="font-size:12px;color:#555;margin-top:16px;display:none;"></div>' +
          (iid ? '<div style="margin-top:24px;padding:10px 16px;background:rgba(255,255,255,0.05);border-radius:8px;max-width:320px;">' +
            '<div style="font-size:11px;color:#555;margin-bottom:4px;">SESSION INFO</div>' +
            '<div style="font-size:13px;color:#888;font-family:monospace;word-break:break-all;">' + iid + '</div>' +
            '<div id="dcTime" style="font-size:11px;color:#555;margin-top:6px;"></div>' +
            '</div>' : '');
        document.body.appendChild(dp);
      }

      var dcTime = document.getElementById('dcTime');
      if (dcTime) dcTime.textContent = 'Disconnected at: ' + new Date().toLocaleString();

      var dcIcon = document.getElementById('dcIcon');
      var dcTitle = document.getElementById('dcTitle');
      var dcDesc = document.getElementById('dcDesc');
      var dcHint = document.getElementById('dcHint');
      if (dcIcon) dcIcon.innerHTML = icon || '';
      if (dcTitle) dcTitle.textContent = title || '';
      if (dcDesc) dcDesc.textContent = desc || '';
      if (dcHint) { dcHint.textContent = hint || ''; dcHint.style.display = hint ? '' : 'none'; }
    }

    function hideDisconnectedPage() {
      var toolbar = document.querySelector('.toolbar');
      var viewport = document.querySelector('.viewport');
      var touchpadEl = document.getElementById('touchpad');
      var dcPage = document.getElementById('dcPage');
      if (toolbar) toolbar.style.display = '';
      if (viewport) viewport.style.display = '';
      if (touchpadEl) touchpadEl.style.display = '';
      document.body.style.background = '#1a1a2e';
      if (dcPage) dcPage.remove();
      if (disconnectedPage) disconnectedPage.classList.remove('active');
    }

    function enterInputMode(initialValue, inputType, placeholder, selector, rect) {
      if (inputMode) return;
      inputMode = true;

      cursor.style.display = 'none';

      document.body.classList.add('input-mode');

      var ip = document.getElementById('input-panel');

      // PC/desktop: position input panel near the focused element
      if (DeviceMode.current === 'desktop' && ip && rect) {
        var screenImg = document.getElementById('screen');
        var imgRect = screenImg ? screenImg.getBoundingClientRect() : null;
        if (imgRect && imgRect.width > 0) {
          var pageDevWidth = parseInt(screenImg.style.width) || imgRect.width;
          var pageDevHeight = parseInt(screenImg.style.height) || imgRect.height;
          var scaleX = imgRect.width / pageDevWidth;
          var scaleY = imgRect.height / pageDevHeight;
          var screenX = imgRect.left + rect.x * scaleX;
          var screenY = imgRect.top + rect.y * scaleY;
          var elH = rect.height * scaleY;

          var panelW = 320;
          var left = screenX + (rect.width * scaleX - panelW) / 2;
          left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8));

          var top = screenY + elH + 6;
          if (top + 80 > window.innerHeight) top = screenY - 80;

          ip.style.position = 'fixed';
          ip.style.left = left + 'px';
          ip.style.top = top + 'px';
          ip.style.right = 'auto';
          ip.style.bottom = 'auto';
          ip.style.borderRadius = '12px';
          ip.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4)';
          ip.style.maxWidth = panelW + 'px';
        }
      }

      var labelParts = [];
      if (inputType) labelParts.push(inputType);
      if (placeholder && placeholder !== initialValue) labelParts.push(placeholder);
      var targetEl = document.getElementById('input-target');
      if (targetEl) targetEl.textContent = labelParts.length > 0 ? labelParts.join(' | ') : 'input';

      window._currentTargetSelector = selector || '';

      var field = document.getElementById('input-field');
      if (field) {
        field.value = initialValue || '';
        field.dataset.lastSent = initialValue || '';
      }

      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;

      document.body.style.touchAction = 'none';
      document.documentElement.style.touchAction = 'none';

      setTimeout(function() {
        if (!field) return;

        // Desktop mode: just focus the field, no keyboard handling needed
        if (DeviceMode.current === 'desktop') {
          field.focus();
          field.click();
          return;
        }

        // Mobile: handle virtual keyboard, scroll guards, IME polling
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

        field.focus();

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

      document.body.classList.remove('input-mode');

      // Reset PC floating panel styles
      var ip = document.getElementById('input-panel');
      if (ip) {
        ip.style.left = '';
        ip.style.top = '';
        ip.style.right = '';
        ip.style.bottom = '';
        ip.style.borderRadius = '';
        ip.style.boxShadow = '';
        ip.style.maxWidth = '';
        ip.style.position = '';
      }

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
      if (!screenRect || screenRect.width <= 0 || screenRect.height <= 0) {
        setTimeout(initCursor, 100);
        return;
      }
      cursorPos = { x: screenRect.left + screenRect.width / 2, y: screenRect.top + screenRect.height / 2 };
      updateCursor();
      cursor.style.display = 'block';
      cursorInitialized = true;
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

    // Touchpad toolbar setup (always available when mobile module is active)
    var _toolbarSetupDone = false;
    function setupToolbar() {
      if (_toolbarSetupDone) return;
      _toolbarSetupDone = true;
      var toolbar = document.getElementById('touchpadToolbar');
      if (toolbar) {
        toolbar.addEventListener('click', function(e) {
          var btn = e.target.closest ? e.target.closest('.tpk-key') : null;
          if (!btn) return;
          e.preventDefault();
          e.stopPropagation();
          sendUserActivity();
          var key = btn.dataset.key || '';
          var code = btn.dataset.code || '';
          safeSend(JSON.stringify({ type: 'input_keyboard', eventType: 'keyDown', key: key, code: code, modifiers: 0 }));
          safeSend(JSON.stringify({ type: 'input_keyboard', eventType: 'keyUp', key: key, code: code, modifiers: 0 }));
        });

        var expandBtn = document.getElementById('tpkExpand');
        var collapseBtn = document.getElementById('tpkCollapse');
        if (expandBtn) expandBtn.addEventListener('click', function(e) { e.stopPropagation(); toolbar.classList.remove('collapsed'); });
        if (collapseBtn) collapseBtn.addEventListener('click', function(e) { e.stopPropagation(); toolbar.classList.add('collapsed'); });
      }
    }

    // Touch event handlers (always registered; guarded by DeviceMode.current)
    touchpad.addEventListener('touchstart', (e) => {
      if (DeviceMode.current !== 'mobile') return;
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
          updateScreenRect();
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
      if (DeviceMode.current !== 'mobile') return;
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
        if (DeviceMode.current !== 'mobile') return;
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
            updateScreenRect();
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
        if (DeviceMode.current !== 'mobile') return;
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
      resizeTimer = setTimeout(function() {
        fitImageToContainer();
        DeviceMode.autoDetectAndSwitch();
      }, 100);
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(function() {
        DeviceMode.autoDetectAndSwitch();
      }, 200);
    });

    // matchMedia pointer:coarse as additional trigger
    if (window.matchMedia) {
      try {
        var mql = window.matchMedia('(pointer:coarse)');
        if (mql && typeof mql.addEventListener === 'function') {
          mql.addEventListener('change', function(e) {
            var newMode = e.matches ? 'mobile' : 'desktop';
            DeviceMode.switchTo(newMode);
          });
        }
      } catch(err) {}
    }

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
          if (ws && ws.readyState === 1) {
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
        if (!ws || ws.readyState === 3) {
          connect();
        }
      }
    });

    if (DeviceMode.current === 'desktop') focusHiddenInput();
    connect();
`;
}
