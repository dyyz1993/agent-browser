(function() {
  if (window.__recorderInitialized) return;
  window.__recorderInitialized = true;

  console.log('[Recorder] Inject script executing');
  console.log('[Recorder] __recorderSync available:', typeof window.__recorderSync === 'function');

  const TRAJECTORY_INTERVAL = 50;
  const MAX_TRAJECTORY_POINTS = 10;
  const SCROLL_THRESHOLD = 50;

  const isInIframe = window.self !== window.top;
  const iframePrefix = isInIframe ? 'iframe >> ' : '';

  window.__recorderTrajectory = [];
  window.__recorderLastTime = 0;
  let lastScrollX = window.scrollX;
  let lastScrollY = window.scrollY;
  let scrollTimeout = null;
  let pendingScroll = null;
  let lastFillSelector = null;
  let lastFillValue = '';
  let fillTimeout = null;
  let currentViewport = { width: window.innerWidth, height: window.innerHeight };
  let pendingResize = null;
  let resizeTimeout = null;
  const annotations = new Map();
  const markedElements = new Map();

  window.__recorderInitialViewport = { ...currentViewport };

  if (isInIframe) {
    console.log('[Recorder] Running in iframe context');
  }

  // PostMessage support for iframe communication
  const RECORDER_MESSAGE_TYPE = '__recorder_step__';
  
  if (!isInIframe) {
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === RECORDER_MESSAGE_TYPE && event.data.step) {
        if (typeof window.__recorderSync === 'function') {
          try { window.__recorderSync(JSON.stringify(event.data.step)); } catch (e) {}
        }
      }
    });
  }

  document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - window.__recorderLastTime > TRAJECTORY_INTERVAL) {
      window.__recorderTrajectory.push({ x: e.clientX, y: e.clientY, t: now });
      if (window.__recorderTrajectory.length > MAX_TRAJECTORY_POINTS) {
        window.__recorderTrajectory.shift();
      }
      window.__recorderLastTime = now;
    }
  }, true);

  window.__getTrajectory = function() {
    const points = window.__recorderTrajectory.slice(-4);
    window.__recorderTrajectory = [];
    return points;
  };

  function isInRecorderPanel(element) {
    if (!element) return false;
    if (element.closest) {
      return element.closest('.recorder-panel, .recorder-toolbar, .recorder-shadow') !== null;
    }
    return false;
  }

  window.__syncStepDirect = function(step) {
    step.viewport = { width: window.innerWidth, height: window.innerHeight };
    step.url = window.location.href;
    step.iframe = isInIframe;
    
    if (isInIframe) {
      try {
        window.parent.postMessage({ type: RECORDER_MESSAGE_TYPE, step: step }, '*');
      } catch (e) {}
    } else if (typeof window.__recorderSync === 'function') {
      try { 
        window.__recorderSync(JSON.stringify(step)); 
      } catch (e) {
        console.error('[Recorder] __recorderSync failed:', e);
      }
    } else {
      console.warn('[Recorder] __recorderSync is not available, step not saved:', step.action);
    }
  };

  window.__syncStep = function(step) {
    if (pendingResize) {
      window.__syncStepDirect({ id: 'step-' + Date.now(), timestamp: Date.now(), action: 'resize', from: pendingResize.from, to: pendingResize.to });
      pendingResize = null;
    }
    if (pendingScroll) {
      window.__syncStepDirect({ id: 'step-' + Date.now(), timestamp: Date.now(), action: 'scroll', x: pendingScroll.x, y: pendingScroll.y });
      pendingScroll = null;
    }
    const trajectory = window.__getTrajectory();
    if (trajectory.length > 0) {
      window.__syncStepDirect({ id: 'step-' + Date.now(), timestamp: Date.now(), action: 'trajectory', points: trajectory });
    }
    step.viewport = { width: window.innerWidth, height: window.innerHeight };
    step.url = window.location.href;
    step.iframe = isInIframe;
    
    if (isInIframe) {
      try {
        window.parent.postMessage({ type: RECORDER_MESSAGE_TYPE, step: step }, '*');
      } catch (e) {}
    } else if (typeof window.__recorderSync === 'function') {
      try { window.__recorderSync(JSON.stringify(step)); } catch (e) {}
    }
  };

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      if (newWidth !== currentViewport.width || newHeight !== currentViewport.height) {
        pendingResize = { from: { ...currentViewport }, to: { width: newWidth, height: newHeight } };
        currentViewport = { width: newWidth, height: newHeight };
      }
    }, 100);
  }, true);

  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      if (Math.abs(scrollY - lastScrollY) > SCROLL_THRESHOLD || Math.abs(scrollX - lastScrollX) > SCROLL_THRESHOLD) {
        pendingScroll = { x: scrollX, y: scrollY };
        lastScrollX = scrollX;
        lastScrollY = scrollY;
      }
    }, 100);
  }, true);

  function getXPath(element) {
    if (element.id) return '//*[@id="' + element.id + '"]';
    const name = element.getAttribute('name');
    if (name) return '//*[@name="' + name + '"]';
    const semanticAttrs = ['data-testid', 'data-test', 'data-cy', 'aria-label', 'role', 'title', 'placeholder'];
    for (const attr of semanticAttrs) {
      const value = element.getAttribute(attr);
      if (value) return '//*[@' + attr + '="' + value + '"]';
    }
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter(c => c && !c.startsWith('_') && !c.startsWith('css-') && !/^[a-z]{1,2}$/.test(c));
      if (classes.length > 0) return '//*[contains(@class, "' + classes[0] + '")]';
    }
    const text = element.innerText?.trim();
    if (text && text.length < 30 && ['BUTTON', 'A', 'SPAN', 'LABEL'].includes(element.tagName)) {
      return '//' + element.tagName.toLowerCase() + '[contains(text(), "' + text.slice(0, 20) + '")]';
    }
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousSibling;
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) index++;
        sibling = sibling.previousSibling;
      }
      parts.unshift(current.tagName.toLowerCase() + '[' + index + ']');
      current = current.parentNode;
    }
    return '/' + parts.join('/');
  }

  function getSelector(element) {
    if (element.id) return '#' + CSS.escape(element.id);
    const semanticAttrs = ['data-testid', 'data-test', 'data-cy', 'aria-label', 'name', 'role', 'title'];
    for (const attr of semanticAttrs) {
      const value = element.getAttribute(attr);
      if (value) return element.tagName.toLowerCase() + '[' + attr + '="' + CSS.escape(value) + '"]';
    }
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter(c => c && !c.startsWith('_'));
      if (classes.length > 0) return element.tagName.toLowerCase() + '.' + classes.slice(0, 2).join('.');
    }
    return element.tagName.toLowerCase();
  }

  function getElementInfo(element) {
    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id,
      className: element.className,
      text: element.innerText ? element.innerText.slice(0, 50) : '',
      xpath: getXPath(element)
    };
  }

  function recordStep(action, data) {
    const step = {
      id: 'step-' + Date.now(),
      timestamp: Date.now(),
      action: action,
      selector: iframePrefix + (data.selector || ''),
      xpath: iframePrefix + (data.xpath || ''),
      value: data.value,
      elementInfo: data.elementInfo,
      annotation: data.annotation,
      iframe: isInIframe
    };
    window.__syncStep(step);
  }

  document.addEventListener('click', (e) => {
    console.log('[Recorder] Click event detected:', e.target);
    const path = e.composedPath();
    const element = path[0] || e.target;
    
    if (isInRecorderPanel(element)) {
      console.log('[Recorder] Click ignored: in recorder panel');
      return;
    }
    if (element === document.body || element === document.documentElement) {
      console.log('[Recorder] Click ignored: body or documentElement');
      return;
    }

    console.log('[Recorder] Recording click on:', element.tagName, element.id, element.className);

    const link = element.closest('a[href]');
    if (link) {
      const href = link.href;
      const target = link.target || '_self';
      let isExternal = target === '_blank';
      if (!isExternal && href.startsWith('http')) {
        try {
          const linkHost = new URL(href).host;
          isExternal = linkHost !== window.location.host;
        } catch (e) {}
      }
      
      recordStep('link_click', {
        selector: getSelector(link),
        xpath: getXPath(link),
        value: href,
        elementInfo: { ...getElementInfo(link), target: target, isExternal: isExternal }
      });
      return;
    }

    recordStep('click', {
      selector: getSelector(element),
      xpath: getXPath(element),
      elementInfo: getElementInfo(element)
    });

    if (!isInIframe) addMarker(element, 'default');
  }, true);

  document.addEventListener('input', (e) => {
    const element = e.target;
    if (!element || !element.tagName) return;
    if (isInRecorderPanel(element)) return;

    const selector = getSelector(element);
    const value = element.value;

    clearTimeout(fillTimeout);
    
    if (lastFillSelector === selector) {
      lastFillValue = value;
    } else {
      if (lastFillSelector && lastFillValue) {
        recordStep('fill', { selector: lastFillSelector, value: lastFillValue });
      }
      lastFillSelector = selector;
      lastFillValue = value;
    }

    fillTimeout = setTimeout(() => {
      if (lastFillSelector && lastFillValue) {
        recordStep('fill', { selector: lastFillSelector, value: lastFillValue });
        lastFillSelector = null;
        lastFillValue = '';
      }
    }, 500);
  }, true);

  document.addEventListener('change', (e) => {
    const element = e.target;
    if (!element || element.tagName !== 'SELECT') return;
    if (isInRecorderPanel(element)) return;

    recordStep('select', {
      selector: getSelector(element),
      xpath: getXPath(element),
      value: element.value,
      elementInfo: getElementInfo(element)
    });
  }, true);

  window.addEventListener('beforeunload', () => {
    if (lastFillSelector && lastFillValue) {
      window.__syncStepDirect({
        id: 'step-' + Date.now(),
        timestamp: Date.now(),
        action: 'fill',
        selector: lastFillSelector,
        value: lastFillValue
      });
    }
    window.__syncStepDirect({
      id: 'step-' + Date.now(),
      timestamp: Date.now(),
      action: 'navigate',
      value: window.location.href
    });
  });

  // ========== UI Overlay (only in main page) ==========
  if (!isInIframe) {
    function createRecorderOverlay() {
      if (!document.body) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', createRecorderOverlay);
        } else {
          setTimeout(createRecorderOverlay, 10);
        }
        return;
      }

      // Styles
      const style = document.createElement('style');
      style.textContent = `
        .recorder-panel { position: fixed; right: 20px; top: 20px; width: 320px; background: white; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 2147483647; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .recorder-panel-header { padding: 12px 15px; background: #333; color: white; display: flex; justify-content: space-between; align-items: center; }
        .recorder-panel-header h3 { font-size: 14px; font-weight: 500; margin: 0; }
        .recorder-panel-header button { padding: 4px 10px; font-size: 12px; border: none; border-radius: 4px; cursor: pointer; background: #555; color: white; }
        .recorder-panel-header button:hover { background: #666; }
        .recorder-panel-body { flex: 1; overflow-y: auto; padding: 10px; max-height: 400px; }
        .recorder-step { padding: 8px 10px; border-radius: 4px; margin-bottom: 6px; background: #f5f5f5; font-size: 12px; border-left: 3px solid #4CAF50; }
        .recorder-step.click { border-left-color: #4CAF50; }
        .recorder-step.fill { border-left-color: #2196F3; }
        .recorder-step.select { border-left-color: #FF9800; }
        .recorder-step.link_click { border-left-color: #9C27B0; }
        .recorder-step.navigate { border-left-color: #607D8B; }
        .recorder-step.annotate { border-left-color: #E91E63; }
        .recorder-step .action { font-weight: 500; color: #333; }
        .recorder-step .selector { color: #666; word-break: break-all; margin-top: 4px; font-size: 11px; }
        .recorder-step .value { color: #888; margin-top: 2px; font-size: 11px; }
        .recorder-step .annotation { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-top: 4px; background: #E8F5E9; color: #388E3C; }
        .recorder-empty { color: #999; text-align: center; padding: 20px; font-size: 13px; }
        .recorder-status { padding: 8px 15px; background: #f0f0f0; font-size: 11px; color: #666; border-top: 1px solid #eee; }
        .recorder-shadow { position: absolute; pointer-events: none; border: 2px solid #4CAF50; background: rgba(76, 175, 80, 0.1); border-radius: 4px; z-index: 2147483646; transition: all 0.15s ease; }
        .recorder-shadow.login { border-color: #2196F3; background: rgba(33, 150, 243, 0.1); }
        .recorder-shadow.data { border-color: #FF9800; background: rgba(255, 152, 0, 0.1); }
        .recorder-shadow.pagination { border-color: #9C27B0; background: rgba(156, 39, 176, 0.1); }
        .recorder-toolbar { position: absolute; z-index: 2147483647; background: white; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); padding: 4px; display: flex; gap: 2px; }
        .recorder-toolbar.horizontal { flex-direction: row; }
        .recorder-toolbar.vertical { flex-direction: column; }
        .recorder-toolbar button { padding: 5px 8px; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; white-space: nowrap; }
        .recorder-toolbar button:hover { transform: scale(1.02); }
        .recorder-toolbar .btn-login { background: #E3F2FD; color: #1976D2; }
        .recorder-toolbar .btn-data { background: #FFF3E0; color: #F57C00; }
        .recorder-toolbar .btn-page { background: #F3E5F5; color: #7B1FA2; }
        .recorder-toolbar .btn-note { background: #E8F5E9; color: #388E3C; }
        .recorder-markers-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483645; }
        .recorder-marker { position: absolute; pointer-events: none; border: 2px solid rgba(76, 175, 80, 0.6); border-radius: 4px; transition: all 0.15s ease; }
        .recorder-marker.login { border-color: rgba(33, 150, 243, 0.8); }
        .recorder-marker.data { border-color: rgba(255, 152, 0, 0.8); }
        .recorder-marker.pagination { border-color: rgba(156, 39, 176, 0.8); }
        .recorder-marker.custom { border-color: rgba(76, 175, 80, 0.8); }
        #recorder-canvas { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483644; }
      `;
      (document.head || document.documentElement).appendChild(style);

      // Panel
      const panel = document.createElement('div');
      panel.className = 'recorder-panel';
      panel.innerHTML = `
        <div class="recorder-panel-header">
          <h3>📝 Recorder</h3>
          <div>
            <button id="recorder-clear">Clear</button>
          </div>
        </div>
        <div class="recorder-panel-body" id="recorder-steps">
          <div class="recorder-empty">No steps recorded yet</div>
        </div>
        <div class="recorder-status" id="recorder-status">Steps: 0</div>
      `;
      document.body.appendChild(panel);

      // Markers container
      const markersContainer = document.createElement('div');
      markersContainer.className = 'recorder-markers-container';
      markersContainer.id = 'recorder-markers';
      document.body.appendChild(markersContainer);

      // Canvas for trajectory
      const canvas = document.createElement('canvas');
      canvas.id = 'recorder-canvas';
      document.body.appendChild(canvas);

      // Shadow box
      const shadowBox = document.createElement('div');
      shadowBox.className = 'recorder-shadow';
      shadowBox.style.display = 'none';
      document.body.appendChild(shadowBox);

      // Toolbar
      const toolbar = document.createElement('div');
      toolbar.className = 'recorder-toolbar';
      toolbar.innerHTML = `
        <button class="btn-login" data-type="login">🔐 Login</button>
        <button class="btn-data" data-type="data">📊 Data</button>
        <button class="btn-page" data-type="pagination">📄 Page</button>
        <button class="btn-note" data-type="custom">📝 Note</button>
      `;
      toolbar.style.display = 'none';
      document.body.appendChild(toolbar);

      // Store UI state
      window.__recorderUISteps = [];
      let currentElement = null;
      let mouseX = 0, mouseY = 0, currentEdge = null;
      const EDGE_THRESHOLD = 30;

      // Update UI function - uses __recorderSteps from Node.js
      window.__updateRecorderUI = function() {
        const container = document.getElementById('recorder-steps');
        const status = document.getElementById('recorder-status');
        if (!container || !status) return;
        
        const steps = window.__recorderSteps || [];
        status.textContent = 'Steps: ' + steps.length;
        
        if (steps.length === 0) {
          container.innerHTML = '<div class="recorder-empty">No steps recorded yet</div>';
          return;
        }
        
        container.innerHTML = steps.slice(-20).map((step) => {
          const action = step.action || 'unknown';
          const selector = step.selector || '';
          const value = step.value || '';
          let extra = '';
          if (action === 'trajectory' && step.points) {
            extra = '<div class="selector">🖱️ ' + step.points.length + ' points</div>';
          } else if (action === 'scroll') {
            extra = '<div class="selector">📜 (' + step.x + ', ' + step.y + ')</div>';
          } else if (action === 'resize') {
            extra = '<div class="selector">📐 ' + step.to.width + 'x' + step.to.height + '</div>';
          } else if (action === 'link_click') {
            extra = '<div class="selector">🔗 ' + (value || '') + '</div>';
          }
          return '<div class="recorder-step ' + action + '">' +
            '<div class="action">' + action.toUpperCase() + '</div>' +
            (selector ? '<div class="selector">' + selector + '</div>' : '') +
            (value && !['trajectory', 'scroll', 'resize', 'link_click'].includes(action) ? '<div class="value">"' + value.slice(0, 30) + (value.length > 30 ? '...' : '') + '"</div>' : '') +
            extra +
            (step.annotation ? '<span class="annotation">🏷️ ' + step.annotation.label + '</span>' : '') +
          '</div>';
        }).join('');
        
        container.scrollTop = container.scrollHeight;
      };

      // Listen for steps update event from Node.js
      window.addEventListener('recorder:steps', function(e) {
        window.__recorderSteps = e.detail;
        window.__updateRecorderUI();
      });

      // Initial fetch of history data
      if (typeof window.__recorderSync === 'function') {
        window.__recorderSync('');  // Empty payload to fetch history
      }

      // Clear button
      document.getElementById('recorder-clear').addEventListener('click', function() {
        window.__recorderSteps = [];
        document.getElementById('recorder-markers').innerHTML = '';
        markedElements.clear();
        annotations.clear();
        window.__updateRecorderUI();
      });

      // Marker functions
      function addMarker(element, type) {
        if (!element || markedElements.has(element)) return;
        const markersContainer = document.getElementById('recorder-markers');
        if (!markersContainer) return;
        
        const marker = document.createElement('div');
        marker.className = 'recorder-marker' + (type !== 'default' ? ' ' + type : '');
        markersContainer.appendChild(marker);
        markedElements.set(element, { marker, type });
        updateMarkerPosition(element);
      }

      function updateMarkerPosition(element) {
        const data = markedElements.get(element);
        if (!data) return;
        const rect = element.getBoundingClientRect();
        data.marker.style.left = rect.left + 'px';
        data.marker.style.top = rect.top + 'px';
        data.marker.style.width = rect.width + 'px';
        data.marker.style.height = rect.height + 'px';
        data.marker.style.display = 'block';
      }

      function updateAllMarkers() {
        markedElements.forEach((data, element) => updateMarkerPosition(element));
      }

      window.addEventListener('scroll', updateAllMarkers, true);
      window.addEventListener('resize', updateAllMarkers);

      // Shadow box functions
      function updateShadowBox(element) {
        if (!element) { shadowBox.style.display = 'none'; return; }
        const rect = element.getBoundingClientRect();
        shadowBox.style.left = rect.left + window.scrollX + 'px';
        shadowBox.style.top = rect.top + window.scrollY + 'px';
        shadowBox.style.width = rect.width + 'px';
        shadowBox.style.height = rect.height + 'px';
        shadowBox.style.display = 'block';
        const annotation = annotations.get(element);
        shadowBox.className = 'recorder-shadow' + (annotation ? ' ' + annotation.type : '');
      }

      // Toolbar functions
      function calculateToolbarPosition(rect) {
        const GAP = 2, TOOLBAR_H = 32, TOOLBAR_W = 220, TOOLBAR_V_W = 45, TOOLBAR_V_H = 140;
        const scrollX = window.scrollX, scrollY = window.scrollY;
        const mouseRelX = mouseX - rect.left, mouseRelY = mouseY - rect.top;
        const distances = [
          { edge: 'top', dist: mouseRelY },
          { edge: 'bottom', dist: rect.height - mouseRelY },
          { edge: 'left', dist: mouseRelX },
          { edge: 'right', dist: rect.width - mouseRelX }
        ];
        distances.sort((a, b) => a.dist - b.dist);
        const nearestEdge = distances[0].edge, nearestDist = distances[0].dist;
        let edge = nearestEdge;
        if (currentEdge) {
          const currentDist = distances.find(d => d.edge === currentEdge)?.dist || Infinity;
          if (nearestDist < currentDist - EDGE_THRESHOLD) { edge = nearestEdge; currentEdge = edge; }
          else { edge = currentEdge; }
        } else { currentEdge = edge; }
        
        if (edge === 'top') return { left: rect.left + scrollX + (rect.width - TOOLBAR_W) / 2, top: rect.top + scrollY - TOOLBAR_H - GAP, orientation: 'horizontal' };
        if (edge === 'bottom') return { left: rect.left + scrollX + (rect.width - TOOLBAR_W) / 2, top: rect.bottom + scrollY + GAP, orientation: 'horizontal' };
        if (edge === 'left') return { left: rect.left + scrollX - TOOLBAR_V_W - GAP, top: mouseY + scrollY - TOOLBAR_V_H / 2, orientation: 'vertical' };
        return { left: rect.right + scrollX + GAP, top: mouseY + scrollY - TOOLBAR_V_H / 2, orientation: 'vertical' };
      }

      function updateToolbar(element) {
        if (!element) { toolbar.style.display = 'none'; return; }
        const rect = element.getBoundingClientRect();
        const pos = calculateToolbarPosition(rect);
        toolbar.style.left = pos.left + 'px';
        toolbar.style.top = pos.top + 'px';
        toolbar.className = 'recorder-toolbar ' + pos.orientation;
        toolbar.style.display = 'flex';
      }

      // Annotate function
      function annotateElement(element, type) {
        if (!element) return;
        const selector = getSelector(element);
        const labels = { login: 'Login', data: 'Data', pagination: 'Pagination', custom: 'Note' };
        let annotation = null;
        if (type === 'custom') {
          const note = prompt('Enter note:');
          if (note) annotation = { type: 'custom', label: note };
          else return;
        } else {
          annotation = { type, label: labels[type] };
        }
        annotations.set(element, annotation);
        addMarker(element, type);
        
        recordStep('annotate', {
          selector: selector,
          xpath: getXPath(element),
          annotation: annotation,
          elementInfo: getElementInfo(element)
        });

        // Flash effect
        shadowBox.style.transition = 'none';
        shadowBox.style.boxShadow = '0 0 20px 5px rgba(76, 175, 80, 0.8)';
        setTimeout(() => { shadowBox.style.transition = 'box-shadow 0.3s ease'; shadowBox.style.boxShadow = ''; }, 200);
        
        updateShadowBox(element);
      }

      // Toolbar button handlers
      toolbar.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          annotateElement(currentElement, btn.dataset.type);
        });
      });

      // Mouse move for overlay
      document.addEventListener('mousemove', (e) => {
        const element = e.composedPath()[0] || e.target;
        mouseX = e.clientX;
        mouseY = e.clientY;
        
        if (element === shadowBox || element === toolbar || toolbar.contains(element)) return;
        if (isInRecorderPanel(element)) { updateShadowBox(null); updateToolbar(null); return; }
        if (element === document.body || element === document.documentElement) { updateShadowBox(null); updateToolbar(null); currentEdge = null; return; }
        
        currentElement = element;
        updateShadowBox(element);
        updateToolbar(element);
      }, true);

      // Canvas trajectory visualization
      const ctx = canvas.getContext('2d');
      function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      setInterval(() => {
        if (!window.__recorderTrajectory || window.__recorderTrajectory.length < 2) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
        const points = window.__recorderTrajectory;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(76, 175, 80, 0.5)';
        ctx.lineWidth = 2;
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
        points.forEach((p, i) => {
          ctx.beginPath();
          ctx.fillStyle = 'rgba(76, 175, 80, ' + (0.3 + (i / points.length) * 0.7) + ')';
          ctx.arc(p.x, p.y, 3 + (i / points.length) * 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }, 100);

      console.log('[Recorder] UI Overlay created');
    }

    createRecorderOverlay();
  }

  console.log('[Recorder] Inject script initialized');
})();
