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
  tabsContainer: HTMLDivElement;
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
    fixedSize: false
  };
}

export function buildWebSocketUrl(config: ViewerConfig): string {
  const wsParam = config.instanceId 
    ? 'instanceId=' + config.instanceId 
    : 'session=' + config.session;
  return config.wsProtocol + '//' + config.hostname + ':' + config.port + '?' + wsParam;
}

export function parseConfigFromLocation(): ViewerConfig {
  const wsProtocol = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'wss:' : 'ws:';
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
    session 
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

export function screenToPage(
  screenX: number, 
  screenY: number, 
  screenWidth: number, 
  screenHeight: number,
  deviceWidth: number,
  deviceHeight: number
): { x: number; y: number } {
  const scaleX = deviceWidth / screenWidth;
  const scaleY = deviceHeight / screenHeight;
  
  return {
    x: Math.round(screenX * scaleX),
    y: Math.round(screenY * scaleY)
  };
}

export function updateModifiers(e: MouseEvent | KeyboardEvent): number {
  let modifiers = 0;
  if (e.altKey) modifiers |= 1;
  if (e.ctrlKey) modifiers |= 2;
  if (e.metaKey) modifiers |= 4;
  if (e.shiftKey) modifiers |= 8;
  return modifiers;
}

export function shouldSendText(key: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean): boolean {
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
    const wsParam = instanceId ? 'instanceId=' + instanceId : 'session=' + session;
    const wsUrl = wsProtocol + '//' + location.hostname + ':' + port + '?' + wsParam;
    
    const screen = document.getElementById('screen');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const urlDisplay = document.getElementById('urlDisplay');
    const qualityBadge = document.getElementById('qualityBadge');
    const tabsContainer = document.getElementById('tabs');
    const connecting = document.getElementById('connecting');
    
    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'text';
    hiddenInput.style.cssText = 'position:fixed;right:8px;bottom:8px;opacity:0.01;width:1px;height:1px;border:none;outline:none;padding:0;margin:0;';
    hiddenInput.id = 'hidden-input';
    hiddenInput.setAttribute('autocomplete', 'off');
    hiddenInput.setAttribute('autocorrect', 'off');
    hiddenInput.setAttribute('autocapitalize', 'off');
    hiddenInput.setAttribute('spellcheck', 'false');
    document.body.appendChild(hiddenInput);
    
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
    
    function connect() {
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      
      ws.onopen = () => {
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected';
        connecting.style.display = 'none';
      };
      
      ws.onclose = () => {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
        connecting.style.display = 'flex';
        setTimeout(connect, 2000);
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
        
        switch (msg.type) {
          case 'frame':
            pendingBinary = true;
            metadata = msg.metadata;
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
            }
            break;
            
          case 'navigation':
            urlDisplay.value = msg.data.url;
            document.title = msg.data.title + ' - Agent Browser Viewer';
            break;
            
          case 'tab_created':
            addTab(msg.data.index, msg.data.url, msg.data.title, false);
            break;
            
          case 'tab_closed':
            removeTab(msg.data.index);
            break;
            
          case 'tab_switched':
            setActiveTab(msg.data.toIndex);
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
      };
      
      screen.onload = cleanup;
      screen.onerror = cleanup;
      screen.src = url;
      
      if (!fixedSize) {
        screen.style.width = metadata.deviceWidth + 'px';
        screen.style.height = metadata.deviceHeight + 'px';
        fixedSize = true;
      }
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
      const scaleX = metadata.deviceWidth / rect.width;
      const scaleY = metadata.deviceHeight / rect.height;
      
      return {
        x: Math.round((screenX - rect.left) * scaleX),
        y: Math.round((screenY - rect.top) * scaleY)
      };
    }
    
    function updateModifiers(e) {
      modifiers = 0;
      if (e.altKey) modifiers |= 1;
      if (e.ctrlKey) modifiers |= 2;
      if (e.metaKey) modifiers |= 4;
      if (e.shiftKey) modifiers |= 8;
    }
    
    function focusHiddenInput() {
      hiddenInput.focus();
      hiddenInput.select();
    }
    
    screen.addEventListener('dragstart', (e) => e.preventDefault());
    
    screen.addEventListener('click', () => {
      focusHiddenInput();
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
      
      safeSend(JSON.stringify({
        type: 'keyboard_up',
        key: e.key
      }));
    });
    
    screen.addEventListener('touchstart', (e) => {
      sendUserActivity();
      focusHiddenInput();
      const touchPoints = Array.from(e.touches).map(t => {
        const pos = screenToPage(t.clientX, t.clientY);
        return { x: pos.x, y: pos.y, id: t.identifier };
      });
      safeSend(JSON.stringify({
        type: 'input_touch',
        eventType: 'touchStart',
        touchPoints: touchPoints
      }));
      e.preventDefault();
    }, { passive: false });
    
    screen.addEventListener('touchmove', (e) => {
      const touchPoints = Array.from(e.touches).map(t => {
        const pos = screenToPage(t.clientX, t.clientY);
        return { x: pos.x, y: pos.y, id: t.identifier };
      });
      safeSend(JSON.stringify({
        type: 'input_touch',
        eventType: 'touchMove',
        touchPoints: touchPoints
      }));
      e.preventDefault();
    }, { passive: false });
    
    screen.addEventListener('touchend', (e) => {
      const touchPoints = Array.from(e.changedTouches).map(t => {
        const pos = screenToPage(t.clientX, t.clientY);
        return { x: pos.x, y: pos.y, id: t.identifier };
      });
      safeSend(JSON.stringify({
        type: 'input_touch',
        eventType: 'touchEnd',
        touchPoints: touchPoints
      }));
      e.preventDefault();
    }, { passive: false });
    
    function addTab(index, url, title, active) {
      let tab = document.getElementById('tab-' + index);
      if (!tab) {
        tab = document.createElement('button');
        tab.id = 'tab-' + index;
        tab.className = 'tab';
        tab.onclick = () => {
          safeSend(JSON.stringify({ id: 'tab-' + Date.now(), action: 'tab_switch', index }));
        };
        tabsContainer.appendChild(tab);
      }
      tab.textContent = title || url || 'New Tab';
      tab.title = url;
      tab.classList.toggle('active', active);
    }
    
    function removeTab(index) {
      const tab = document.getElementById('tab-' + index);
      if (tab) tab.remove();
    }
    
    function setActiveTab(index) {
      document.querySelectorAll('.tab').forEach((t, i) => {
        t.classList.toggle('active', t.id === 'tab-' + index);
      });
    }
    
    // Recorder functionality
    const recordBtn = document.getElementById('recordBtn');
    const recordText = document.getElementById('recordText');
    let isRecording = false;
    
    recordBtn.onclick = () => {
      if (isRecording) {
        // Stop recording
        safeSend(JSON.stringify({ id: 'recorder-stop-' + Date.now(), action: 'recorder_stop' }));
      } else {
        // Start recording
        safeSend(JSON.stringify({ id: 'recorder-start-' + Date.now(), action: 'recorder_start' }));
      }
    };
    
    // Handle recorder responses
    const originalOnMessage = ws.onmessage;
    ws.onmessage = (event) => {
      try {
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
        
        // Call original handler
        if (originalOnMessage) {
          originalOnMessage.call(ws, event);
        }
      } catch (e) {
        // Not JSON or other error, pass to original handler
        if (originalOnMessage) {
          originalOnMessage.call(ws, event);
        }
      }
    };
    
    focusHiddenInput();
    connect();
`;
}
