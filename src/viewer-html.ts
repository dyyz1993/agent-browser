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
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .toolbar {
      background: #16213e;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      border-bottom: 1px solid #0f3460;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #e94560;
    }
    .status-dot.connected { background: #4ecca3; }
    .url-display {
      flex: 1;
      background: #0f3460;
      border: none;
      border-radius: 4px;
      padding: 6px 12px;
      color: #eee;
      font-size: 13px;
      font-family: monospace;
    }
    .quality-badge {
      background: #0f3460;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
    }
    .record-btn {
      background: #e94560;
      border: none;
      border-radius: 4px;
      padding: 6px 12px;
      color: white;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .record-btn:hover { background: #ff6b6b; }
    .record-btn.recording { 
      background: #4ecca3; 
      color: #1a1a2e;
    }
    .record-btn.recording:hover { background: #6ee6bc; }
    .record-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: white;
    }
    .record-btn.recording .record-dot {
      background: #e94560;
      animation: pulse 1s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .viewport {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #0a0a0a;
      position: relative;
    }
    #screen {
      max-width: 100%;
      max-height: 100%;
      object-fit: fill;
      cursor: crosshair;
      -webkit-user-drag: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .connecting {
      position: absolute;
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
    @keyframes spin { to { transform: rotate(360deg); } }
    .tabs {
      background: #16213e;
      padding: 4px 8px;
      display: flex;
      gap: 4px;
      overflow-x: auto;
      border-top: 1px solid #0f3460;
    }
    .tab {
      background: #0f3460;
      border: none;
      border-radius: 4px;
      padding: 6px 12px;
      color: #aaa;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tab.active { 
      background: #4ecca3;
      color: #1a1a2e;
    }
    .tab:hover:not(.active) {
      background: #1a4a7a;
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
    <img id="screen" style="display: none;" draggable="false">
  </div>
  
  <div class="tabs" id="tabs"></div>

  <script>
${script}
  </script>
</body>
</html>`;
}
