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
      background: #0f3460;
      border: 1px solid #1a4a7a;
      color: #eee;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      flex-shrink: 0;
    }
    .record-btn:hover { background: #1a4a7a; }
    .record-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #e94560;
    }
    .recording .record-dot {
      animation: pulse 1s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    .viewport {
      flex: 1;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      overflow: hidden;
      position: relative;
      background: #111;
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
    #touchpad {
      flex: 0 0 auto;
      height: clamp(100px, 38dvh, 280px);
      max-height: 35dvh;
      background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
      border-top: 2px solid #4ecca3;
      position: relative;
      touch-action: none;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
    .touchpad-hint {
      color: #4ecca3;
      font-size: 11px;
      opacity: 0.5;
      text-align: center;
      pointer-events: none;
    }
    @media (max-width: 600px) {
      .toolbar { padding: 4px 8px; gap: 4px; }
      .status span { display: none; }
      .url-display { font-size: 16px; padding: 4px 6px; }
      .quality-badge { font-size: 10px; padding: 3px 6px; }
      .record-btn { padding: 4px 8px; font-size: 11px; min-height: 44px; }
      .record-btn span { display: none; }
    }
    @media (hover: none) {
      .record-btn { min-height: 44px; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="status">
      <div class="status-dot" id="statusDot"></div>
      <span id="statusText">Connecting...</span>
    </div>
    <input type="text" class="url-display" id="urlDisplay" readonly placeholder="No page loaded">
    <div class="quality-badge" id="qualityBadge">--</div>
    <button class="record-btn" id="recordBtn" title="Toggle Recording">
      <div class="record-dot"></div>
      <span id="recordText">Record</span>
    </button>
  </div>
  
  <div class="viewport">
    <div class="connecting" id="connecting">
      <div class="spinner"></div>
      <span>Connecting to browser...</span>
    </div>
    <div class="screen-container" id="screenContainer">
      <img id="screen" style="display: none;" draggable="false">
      <div id="cursor"></div>
      <div id="debug-overlay"></div>
    </div>
  </div>

  <div id="input-panel" style="display:none;position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:10px 15px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));background:rgba(255,255,255,0.95);border-top:1px solid #eee;box-sizing:border-box;">
    <div id="input-target" style="color:#999;font-size:11px;margin-bottom:4px;">target: --</div>
    <div style="display:flex;gap:8px;align-items:center;">
      <input id="input-field" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="输入内容..."
        style="flex:1;height:42px;border:1px solid #dcdcdc;border-radius:24px;padding:0 18px;font-size:16px;outline:none;background:#fff;color:#333;" />
      <button id="input-send" style="height:42px;padding:0 20px;background:#4285F4;color:#fff;border:none;border-radius:24px;font-size:14px;font-weight:600;cursor:pointer;">Send</button>
      <button id="input-cancel" style="height:42px;padding:0 16px;background:#f0f0f0;color:#666;border:none;border-radius:24px;font-size:14px;cursor:pointer;">Cancel</button>
    </div>
  </div>
  
  <div id="touchpad">
    <div class="touchpad-hint" id="touchpadHint">Touchpad: move / long-press drag / two-finger scroll</div>
    <div id="modeBadge" style="display:none;color:#fff;font-size:12px;padding:3px 10px;border-radius:4px;pointer-events:none;font-weight:bold;"></div>
  </div>

  <script>
${script}
  </script>
</body>
</html>`;
}
