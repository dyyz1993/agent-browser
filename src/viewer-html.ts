import { buildViewerScript } from './viewer-script.js';

export function getViewerHtml(): string {
  const script = buildViewerScript();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Browser Viewer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    body {
      width: 100%;
      height: 100%;
      min-height: 100vh;
      min-height: 100dvh;
      max-height: 100vh;
      max-height: 100dvh;
      overflow: hidden;
      position: fixed;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      display: flex;
      flex-direction: column;
      -webkit-overflow-scrolling: touch;
      touch-action: none;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }
    .toolbar {
      background: #16213e;
      padding: 6px 12px;
      padding-top: max(6px, env(safe-area-inset-top, 0px));
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid #0f3460;
      flex-shrink: 0;
      min-height: 40px;
      overflow: hidden;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      flex-shrink: 0;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #e94560;
      flex-shrink: 0;
    }
    .status.connected .status-dot { background: #4ecca3; }
    .url-display {
      flex: 1;
      min-width: 0;
      background: #0f3460;
      border: 1px solid #1a4a7a;
      color: #eee;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      outline: none;
    }
    .quality-badge {
      background: #0f3460;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      color: #4ecca3;
      flex-shrink: 0;
    }
    .record-btn {
      background: #1a4a5e;
      color: #fff;
      border: none;
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .mode-btn {
      background: #2a2a4a;
      color: #4ecca3;
      border: 1px solid #4ecca3;
      padding: 5px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .mode-btn:hover { background: #1a4a5e; }
    .record-btn:hover { background: #1a4a7a; }
    .record-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #e94560;
      flex-shrink: 0;
    }
    .record-btn.recording .record-dot { background: #4ecca3; animation: pulse 1s infinite; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    .recording .record-dot {
      animation: pulse 1s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    .viewport {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      overflow: hidden;
      position: relative;
      background: #111;
      flex: 1 1 auto;
      min-height: 0;
    }
    .screen-container {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }
    #screen {
      max-width: 100%;
      max-height: 100%;
      object-fit: fill;
      -webkit-user-drag: none;
      -webkit-touch-callout: none;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }
    #cursor {
      position: fixed;
      width: 12px;
      height: 12px;
      background: rgba(255, 0, 0, 0.9);
      border-radius: 50%;
      pointer-events: none;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 6px rgba(255, 0, 0, 0.6);
      z-index: 1000;
      display: none;
      transition: width 0.15s, height 0.15s, background 0.15s, box-shadow 0.15s;
    }
    #debug-overlay {
      position: fixed;
      top: 50px;
      left: 8px;
      background: rgba(0,0,0,0.85);
      color: #4ecca3;
      font-size: 11px;
      font-family: monospace;
      padding: 6px 10px;
      border-radius: 4px;
      z-index: 2000;
      max-width: 90vw;
      word-break: break-all;
      pointer-events: none;
      display: none;
      transition: width 0.15s, height 0.15s, background 0.15s, box-shadow 0.15s;
    }
    #cursor.cursor-move {
      background: rgba(68, 140, 255, 0.9);
      box-shadow: 0 0 8px rgba(68, 140, 255, 0.6);
    }
    #cursor.cursor-drag {
      background: rgba(255, 165, 0, 0.9);
      box-shadow: 0 0 10px rgba(255, 165, 0, 0.6);
      width: 18px;
      height: 18px;
      transform: translate(-50%, -50%);
    }
    #cursor.cursor-longpress {
      animation: cursorPulse 0.6s ease-in-out infinite;
    }
    @keyframes cursorPulse {
      0%, 100% { transform: translate(-50%, -50%) scale(1); }
      50% { transform: translate(-50%, -50%) scale(1.8); }
    }
    .connecting {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      z-index: 20;
    }
    .connecting-card {
      background: rgba(22, 33, 62, 0.95);
      border: 1px solid #4ecca3;
      border-radius: 12px;
      padding: 28px 32px;
      text-align: center;
      max-width: 300px;
      box-shadow: 0 8px 32px rgba(78, 204, 163, 0.15);
    }
    .connecting-icon {
      font-size: 36px;
      margin-bottom: 8px;
    }
    .connecting-text {
      font-size: 15px;
      color: #eee;
      line-height: 1.5;
    }
    .connecting-text-hint {
      font-size: 12px;
      color: #888;
      margin-top: 6px;
    }

    .disconnected-page {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 100;
      background: #1a1a2e;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px;
    }
    .disconnected-page.active { display: flex; }
    .disconnected-icon {
      font-size: 56px;
      margin-bottom: 16px;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.05); }
    }
    .disconnected-title {
      font-size: 22px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 8px;
    }
    .disconnected-desc {
      font-size: 14px;
      color: #aaa;
      line-height: 1.6;
      max-width: 280px;
      margin-bottom: 4px;
    }
    .disconnected-hint {
      font-size: 12px;
      color: #666;
      margin-top: 16px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #0f3460;
      border-top-color: #4ecca3;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    #input-panel { display: none !important; }
    body.input-mode #input-panel { display: flex !important; }
    #touchpad { display: none; flex: 1 1 auto; min-height: 80px; background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%); border-top: 2px solid #4ecca3; position: relative; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; flex-direction: column; align-items: center; justify-content: flex-start; gap: 0; padding-bottom: env(safe-area-inset-bottom, 0px); }
    body.mobile-mode #touchpad { display: flex !important; max-height: 35vh; }
    body.mobile-mode .viewport {
      max-height: 45vh;
      flex: 0 1 auto;
    }
    .touchpad-hint {
      color: #4ecca3;
      font-size: 11px;
      opacity: 0.5;
      text-align: center;
      pointer-events: none;
    }
    .touchpad-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px 10px;
      justify-content: center;
      width: 100%;
      flex-shrink: 0;
      border-bottom: 1px solid rgba(78,204,163,0.15);
    }
    .touchpad-toolbar.collapsed {
      flex-wrap: nowrap;
      overflow: hidden;
    }
    .touchpad-toolbar.collapsed .tpk-expand {
      display: flex;
    }
    .touchpad-toolbar.collapsed .tpk-collapse {
      display: none;
    }
    .touchpad-toolbar:not(.collapsed) .tpk-expand {
      display: none;
    }
    .touchpad-toolbar:not(.collapsed) .tpk-collapse {
      display: flex;
    }
    .tpk-btn {
      width: 38px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(78,204,163,0.12);
      border: 1px solid rgba(78,204,163,0.25);
      border-radius: 6px;
      color: #4ecca3;
      font-size: 15px;
      cursor: pointer;
      padding: 0;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
    }
    .tpk-btn:active {
      background: rgba(78,204,163,0.3);
    }
    .tpk-btn svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: #4ecca3;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .tpk-toggle {
      width: 28px;
      font-size: 10px;
      color: rgba(78,204,163,0.5);
    }
    .tpk-toggle svg {
      width: 12px;
      height: 12px;
      stroke: rgba(78,204,163,0.5);
    }
    body.mobile-mode .toolbar { padding: 4px 6px; gap: 4px; }
    body.mobile-mode .status span { display: none; }
    body.mobile-mode .url-display { font-size: 12px; padding: 4px 6px; }
    body.mobile-mode .quality-badge { font-size: 9px; padding: 2px 4px; }
    body.mobile-mode .record-btn { display: none !important; }
    body.mobile-mode .mode-btn { padding: 4px 6px; font-size: 10px; min-height: 44px; min-width: 36px; flex-shrink: 0; }
    @media (max-width: 600px) {
      .toolbar { padding: 4px 6px; gap: 4px; }
      .status span { display: none; }
      .url-display { font-size: 12px; padding: 4px 6px; }
      .quality-badge { font-size: 9px; padding: 2px 4px; }
      .record-btn { display: none !important; }
      .mode-btn { padding: 4px 6px; font-size: 10px; min-height: 44px; min-width: 36px; flex-shrink: 0; }
      .mode-btn span { display: inline; }
      .viewport {
        max-height: 40vh;
        flex-shrink: 1;
      }
    }
    @media (min-width: 601px) and (max-width: 1024px) {
      .toolbar { padding: 5px 8px; gap: 6px; }
      .status span { display: none; }
      .url-display { font-size: 12px; padding: 5px 8px; }
      .quality-badge { font-size: 10px; padding: 3px 6px; }
      .record-btn { display: none !important; }
      .mode-btn { padding: 5px 8px; font-size: 11px; min-height: 44px; min-width: 40px; flex-shrink: 0; }
      .mode-btn span { display: inline; }
      .viewport {
        max-height: 45vh;
        flex-shrink: 1;
      }
    }
    @media (max-width: 400px) {
      .toolbar { padding: 3px 4px; gap: 3px; }
      .quality-badge { display: none; }
    }
    @media (hover: none) {
      .record-btn { min-height: 44px; }
      .mode-btn { min-height: 44px; }
    }
  </style>
</head>
<body>
  <div class="disconnected-page" id="disconnectedPage">
    <div class="disconnected-icon" id="disconnectedIcon">&#x1F4CF;&#xFE0F;</div>
    <div class="disconnected-title" id="disconnectedTitle">Disconnected</div>
    <div class="disconnected-desc" id="disconnectedDesc">The browser session has ended.</div>
    <div class="disconnected-hint" id="disconnectedHint">Please start a new browser session to continue.</div>
  </div>

  <div class="toolbar">
    <div class="status">
      <div class="status-dot" id="statusDot"></div>
      <span id="statusText">Connecting...</span>
    </div>
    <input type="text" class="url-display" id="urlDisplay" readonly placeholder="No page loaded">
    <div class="quality-badge" id="qualityBadge">--</div>
    <button class="mode-btn" id="modeBtn" title="Switch interaction mode">
      <span id="modeText">Desktop</span>
    </button>
    <button class="record-btn" id="recordBtn" title="Toggle Recording">
      <div class="record-dot"></div>
      <span id="recordText">Record</span>
    </button>
  </div>
  
  <div class="viewport">
    <div class="connecting" id="connecting">
      <div class="connecting-card">
        <div class="connecting-icon" id="connectingIcon">&#x1F4CF;&#xFE0F;</div>
        <div class="spinner" id="connectingSpinner" style="display:none;"></div>
        <div class="connecting-text" id="connectingText">Connecting to browser...</div>
        <div class="connecting-text-hint" id="connectingHint"></div>
      </div>
    </div>
    <div class="screen-container" id="screenContainer">
      <img id="screen" style="display: none;" draggable="false">
      <div id="cursor"></div>
      <div id="debug-overlay"></div>
    </div>
  </div>

  <div id="input-panel" style="position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:6px 12px;padding-bottom:calc(6px + env(safe-area-inset-bottom,0px));background:rgba(255,255,255,0.95);border-top:1px solid #eee;box-sizing:border-box;flex-direction:column;">
    <div id="input-target" style="color:#999;font-size:11px;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">target: --</div>
    <div style="display:flex;gap:8px;align-items:center;width:100%;">
      <input id="input-field" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="..."
        style="flex:1;min-width:0;height:36px;border:1px solid #dcdcdc;border-radius:18px;padding:0 14px;font-size:16px;outline:none;background:#fff;color:#333;" />
      <button id="input-send" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:#4285F4;color:#fff;border:none;border-radius:50%;cursor:pointer;padding:0;flex-shrink:0;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  </div>
  
  <div id="touchpad">
    <div class="touchpad-toolbar collapsed" id="touchpadToolbar">
      <button class="tpk-btn tpk-key" data-key="Tab" data-code="Tab" title="Tab">
        <svg viewBox="0 0 24 24"><path d="M3 21V3h2v18H3z M21 12H7l4-4M7 12l4 4"/></svg>
      </button>
      <button class="tpk-btn tpk-key" data-key="ArrowUp" data-code="ArrowUp" title="Up">
        <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
      <button class="tpk-btn tpk-key" data-key="ArrowLeft" data-code="ArrowLeft" title="Left">
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button class="tpk-btn tpk-key" data-key="ArrowDown" data-code="ArrowDown" title="Down">
        <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <button class="tpk-btn tpk-key" data-key="ArrowRight" data-code="ArrowRight" title="Right">
        <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button class="tpk-btn tpk-key" data-key="Enter" data-code="Enter" title="Enter">
        <svg viewBox="0 0 24 24"><path d="M7 13l5 5 5-5M12 18V6"/><line x1="5" y1="21" x2="19" y2="21"/></svg>
      </button>
      <button class="tpk-btn tpk-key" data-key="Backspace" data-code="Backspace" title="Backspace">
        <svg viewBox="0 0 24 24"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
      </button>
      <button class="tpk-btn tpk-key" data-key="Escape" data-code="Escape" title="Esc">
        <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <button class="tpk-btn tpk-toggle tpk-expand" id="tpkExpand" title="More">
        <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <button class="tpk-btn tpk-toggle tpk-collapse" id="tpkCollapse" title="Less">
        <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
    </div>
    <div class="touchpad-body">
      <div class="touchpad-hint" id="touchpadHint">Touchpad: move / long-press drag / two-finger scroll</div>
      <div id="modeBadge" style="display:none;color:#fff;font-size:12px;padding:3px 10px;border-radius:4px;pointer-events:none;font-weight:bold;"></div>
    </div>
  </div>

  <script>
${script}
  </script>
</body>
</html>`;
}
