(function() {
  const TRAJECTORY_INTERVAL = 50;
  const MAX_TRAJECTORY_POINTS = 10;
  const SCROLL_THRESHOLD = 50;
  const HIGHLIGHT_THROTTLE = 100;
  const TOOLBAR_HIDE_DELAY = 500;
  const CACHE_TTL = 100;

  const isInIframe = window.self !== window.top;
  const iframePrefix = isInIframe ? 'iframe >> ' : '';

  if (window.__recorderInitialized) return;
  window.__recorderInitialized = true;

  // Step ID generator (6 digits)
  let stepIdCounter = 0;
  function generateStepId() {
    stepIdCounter = (stepIdCounter + 1) % 1000000;
    return String(stepIdCounter).padStart(6, '0');
  }

  // Unified API for recorder actions
  window.__recorderAction = function(action) {
    if (!action || !action.type) {
      return { success: false, steps: window.__recorderSteps || [], error: 'Invalid action' };
    }
    
    const steps = window.__recorderSteps || [];
    
    switch (action.type) {
      case 'add':
        if (!action.data) {
          return { success: false, steps, error: 'Missing data for add action' };
        }
        const newStep = { ...action.data, id: action.data.id || generateStepId() };
        steps.push(newStep);
        window.__recorderSteps = steps;
        return { success: true, steps };
        
      case 'update':
        if (!action.id) {
          return { success: false, steps, error: 'Missing id for update action' };
        }
        const updateIndex = steps.findIndex(s => s.id === action.id);
        if (updateIndex >= 0) {
          steps[updateIndex] = { ...steps[updateIndex], ...action.data };
          window.__recorderSteps = steps;
          return { success: true, steps };
        }
        return { success: false, steps, error: 'Step not found' };
        
      case 'delete':
        if (!action.id) {
          return { success: false, steps, error: 'Missing id for delete action' };
        }
        const deleteIndex = steps.findIndex(s => s.id === action.id);
        if (deleteIndex >= 0) {
          steps.splice(deleteIndex, 1);
          window.__recorderSteps = steps;
          return { success: true, steps };
        }
        return { success: false, steps, error: 'Step not found' };
        
      case 'list':
        return { success: true, steps };
        
      case 'clear':
        window.__recorderSteps = [];
        return { success: true, steps: [] };
        
      default:
        return { success: false, steps, error: 'Unknown action type' };
    }
  };

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
  const selectorCache = new WeakMap();
  const xpathCache = new WeakMap();
  const highlightCache = new WeakMap();

  window.__recorderInitialViewport = { ...currentViewport };

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'NOSCRIPT', 'BR', 'HR', 'SVG', 'PATH', 'TITLE', 'BASE', 'WBR', 'AREA', 'MAP', 'COL', 'COLGROUP']);

  function shouldHighlightElement(element) {
    if (!element || !element.tagName) return false;
    if (SKIP_TAGS.has(element.tagName)) return false;

    const now = Date.now();
    const cached = highlightCache.get(element);
    if (cached && (now - cached.time) < CACHE_TTL) {
      return cached.result;
    }

    if (element.closest) {
      const recorderEl = element.closest('.recorder-panel, .recorder-toolbar, .recorder-shadow, .recorder-markers-container');
      if (recorderEl) {
        highlightCache.set(element, { time: now, result: false });
        return false;
      }
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) {
      highlightCache.set(element, { time: now, result: false });
      return false;
    }

    // 排除尺寸接近视口的大元素（超过视口 70% 的元素）
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const widthRatio = rect.width / viewportWidth;
    const heightRatio = rect.height / viewportHeight;
    if (widthRatio > 0.7 || heightRatio > 0.7) {
      highlightCache.set(element, { time: now, result: false });
      return false;
    }

    const style = window.getComputedStyle(element);
    const result = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) !== 0;

    highlightCache.set(element, { time: now, result });
    return result;
  }

  window.__recorderAddMarker = function(element, type) {
    if (!element || markedElements.has(element)) return;
    const markersContainer = document.getElementById('recorder-markers');
    if (!markersContainer) return;
    
    const marker = document.createElement('div');
    marker.className = 'recorder-marker' + (type !== 'default' ? ' ' + type : '');
    markersContainer.appendChild(marker);
    markedElements.set(element, { marker, type });
    
    const rect = element.getBoundingClientRect();
    marker.style.left = rect.left + 'px';
    marker.style.top = rect.top + 'px';
    marker.style.width = rect.width + 'px';
    marker.style.height = rect.height + 'px';
    marker.style.display = 'block';
  };

  const RECORDER_MESSAGE_TYPE = '__recorder_step__';
  
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === RECORDER_MESSAGE_TYPE && event.data.step) {
      if (!isInIframe) {
        if (typeof window.__recorderSync === 'function') {
          try { window.__recorderSync(JSON.stringify(event.data.step)); } catch (e) {}
        }
      } else {
        try {
          window.parent.postMessage({ type: RECORDER_MESSAGE_TYPE, step: event.data.step }, '*');
        } catch (e) {}
      }
    }
  });

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

  let recorderPanelElement = null;
  function isInRecorderPanel(element) {
    if (!element) return false;
    
    // Check if in recorder-panel
    if (!recorderPanelElement) {
      recorderPanelElement = document.querySelector('.recorder-panel');
    }
    if (recorderPanelElement && (element === recorderPanelElement || recorderPanelElement.contains(element))) {
      return true;
    }
    
    // Check if in recorder-toolbar
    const toolbar = document.querySelector('.recorder-toolbar');
    if (toolbar && (element === toolbar || toolbar.contains(element))) {
      return true;
    }
    
    return false;
  }

  window.__syncStepDirect = function(step) {
    // 生成 id（如果没有）
    if (!step.id) {
      step.id = 'step-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    }
    step.viewport = { width: window.innerWidth, height: window.innerHeight };
    step.url = window.location.href;
    step.iframe = isInIframe;

    // 使用统一 API 添加步骤
    const result = window.__recorderAction({ type: 'add', data: step });
    
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
      window.__syncStepDirect({ timestamp: Date.now(), action: 'resize', from: pendingResize.from, to: pendingResize.to });
      pendingResize = null;
    }
    if (pendingScroll) {
      window.__syncStepDirect({ timestamp: Date.now(), action: 'scroll', x: pendingScroll.x, y: pendingScroll.y });
      pendingScroll = null;
    }
    const trajectory = window.__getTrajectory();
    if (trajectory.length > 0) {
      window.__syncStepDirect({ timestamp: Date.now(), action: 'trajectory', points: trajectory });
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

  window.__clearPendingSteps = function() {
    pendingResize = null;
    pendingScroll = null;
    trajectory = [];
    lastTrajectoryLength = 0;
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

  function isUniqueXPath(xpath) {
    try {
      return document.evaluate(
        'count(' + xpath + ')',
        document,
        null,
        XPathResult.NUMBER_TYPE,
        null
      ).numberValue === 1;
    } catch (e) {
      return false;
    }
  }

  function buildUniqueXPath(element, maxDepth = 5) {
    const parts = [];
    let current = element;
    let depth = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && depth < maxDepth) {
      let index = 1;
      let sibling = current.previousSibling;
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) index++;
        sibling = sibling.previousSibling;
      }
      
      let part = current.tagName.toLowerCase() + '[' + index + ']';
      
      if (current.id) {
        part = '*[@id="' + current.id + '"]';
        parts.unshift(part);
        break;
      }
      
      const semanticAttrs = ['data-testid', 'data-test', 'data-cy', 'aria-label', 'name'];
      for (const attr of semanticAttrs) {
        const value = current.getAttribute(attr);
        if (value) {
          part = '*[@' + attr + '="' + value + '"]';
          break;
        }
      }
      
      parts.unshift(part);
      
      const fullXPath = '/' + parts.join('/');
      if (isUniqueXPath(fullXPath)) {
        return fullXPath;
      }
      
      current = current.parentNode;
      depth++;
    }

    return '/' + parts.join('/');
  }

  function getXPath(element) {
    if (xpathCache.has(element)) {
      return xpathCache.get(element);
    }
    
    let result = null;
    
    if (element.id) {
      const xpath = '//*[@id="' + element.id + '"]';
      if (isUniqueXPath(xpath)) result = xpath;
    }
    
    if (!result) {
      const semanticAttrs = ['data-testid', 'data-test', 'data-cy', 'aria-label', 'name', 'role', 'title', 'placeholder'];
      for (const attr of semanticAttrs) {
        const value = element.getAttribute(attr);
        if (value) {
          const xpath = '//*[@' + attr + '="' + value + '"]';
          if (isUniqueXPath(xpath)) {
            result = xpath;
            break;
          }
        }
      }
    }
    
    if (!result) {
      const text = element.innerText?.trim();
      if (text && text.length < 30 && ['BUTTON', 'A', 'SPAN', 'LABEL'].includes(element.tagName)) {
        const xpath = '//' + element.tagName.toLowerCase() + '[contains(text(), "' + text.slice(0, 20) + '")]';
        if (isUniqueXPath(xpath)) result = xpath;
      }
    }
    
    if (!result) {
      if (element.className && typeof element.className === 'string') {
        const classes = element.className.trim().split(/\s+/).filter(c => c && !c.startsWith('_') && !c.startsWith('css-') && !/^[a-z]{1,2}$/.test(c));
        if (classes.length > 0) {
          const xpath = '//*[contains(@class, "' + classes[0] + '")]';
          if (isUniqueXPath(xpath)) result = xpath;
        }
      }
    }
    
    if (!result) {
      result = buildUniqueXPath(element);
    }
    
    xpathCache.set(element, result);
    return result;
  }

  function isUniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (e) {
      return false;
    }
  }

  function getBaseSelector(element) {
    let selector = element.tagName.toLowerCase();
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/)
        .filter(c => c && !c.startsWith('_') && !c.startsWith('css-') && !/^[a-z]{1,2}$/.test(c));
      if (classes.length > 0) {
        selector += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
      }
    }
    return selector;
  }

  function makeUniqueWithNth(element, baseSelector) {
    const parent = element.parentElement;
    if (!parent) return baseSelector;

    const siblings = Array.from(parent.children);
    const sameTagSiblings = siblings.filter(s => s.tagName === element.tagName);
    
    if (sameTagSiblings.length === 1) {
      return baseSelector;
    }
    
    const index = siblings.indexOf(element) + 1;
    return baseSelector + ':nth-child(' + index + ')';
  }

  function buildUniquePath(element, maxDepth = 5) {
    const parts = [];
    let current = element;
    let depth = 0;

    while (current && current !== document.body && depth < maxDepth) {
      const baseSelector = getBaseSelector(current);
      const selector = makeUniqueWithNth(current, baseSelector);
      parts.unshift(selector);
      
      const fullSelector = parts.join(' > ');
      if (isUniqueSelector(fullSelector)) {
        return fullSelector;
      }
      
      current = current.parentElement;
      depth++;
    }

    if (parts.length > 0) {
      return parts.join(' > ');
    }
    
    return null;
  }

  function getShadowHost(element) {
    let current = element;
    while (current) {
      if (current.getRootNode() instanceof ShadowRoot) {
        return current.getRootNode().host;
      }
      current = current.parentElement;
    }
    return null;
  }

  function getSelectorWithShadow(element) {
    const shadowHost = getShadowHost(element);
    if (shadowHost) {
      const hostSelector = getSelector(shadowHost);
      const innerSelector = getSelectorInternal(element);
      return hostSelector + ' >>> ' + innerSelector;
    }
    return getSelectorInternal(element);
  }

  function getSelectorInternal(element) {
    if (selectorCache.has(element)) {
      return selectorCache.get(element);
    }
    
    let result = null;
    
    if (element.id) {
      const selector = '#' + CSS.escape(element.id);
      try {
        if (element.getRootNode().querySelectorAll(selector).length === 1) result = selector;
      } catch (e) {}
    }
    
    if (!result) {
      const semanticAttrs = ['data-testid', 'data-test', 'data-cy', 'aria-label', 'name', 'role', 'title'];
      for (const attr of semanticAttrs) {
        const value = element.getAttribute(attr);
        if (value) {
          const selector = element.tagName.toLowerCase() + '[' + attr + '="' + CSS.escape(value) + '"]';
          try {
            if (element.getRootNode().querySelectorAll(selector).length === 1) {
              result = selector;
              break;
            }
          } catch (e) {}
        }
      }
    }
    
    if (!result) {
      const baseSelector = getBaseSelector(element);
      const uniqueSelector = makeUniqueWithNth(element, baseSelector);
      try {
        if (element.getRootNode().querySelectorAll(uniqueSelector).length === 1) result = uniqueSelector;
      } catch (e) {}
    }
    
    if (!result) {
      const pathSelector = buildUniquePath(element);
      if (pathSelector) result = pathSelector;
    }
    
    if (!result) {
      result = element.tagName.toLowerCase();
    }
    
    selectorCache.set(element, result);
    return result;
  }

  function getSelector(element) {
    return getSelectorWithShadow(element);
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
    // 检查是否暂停录制
    if (window.__recorderPaused) return;

    const step = {
      id: 'step-' + Date.now() + '-' + Math.random().toString(36).substr(2, 10),
      timestamp: Date.now(),
      action: action,
      selector: iframePrefix + (data.selector || ''),
      xpath: iframePrefix + (data.xpath || ''),
      value: data.value,
      elementInfo: data.elementInfo,
      annotation: data.annotation,
      iframe: isInIframe
    };

    // keyboard 类型不需要 selector/xpath/elementInfo
    if (action === 'keyboard') {
      delete step.selector;
      delete step.xpath;
      delete step.elementInfo;
    }

    window.__syncStep(step);
  }

  document.addEventListener('click', (e) => {
    const path = e.composedPath();
    const element = path[0] || e.target;
    
    if (isInRecorderPanel(element)) {
      return;
    }
    if (element === document.body || element === document.documentElement) {
      return;
    }

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

    if (!isInIframe && typeof window.__recorderAddMarker === 'function') {
      window.__recorderAddMarker(element, 'default');
    }
  }, true);

  document.addEventListener('input', (e) => {
    const element = e.target;
    if (!element || !element.tagName) return;
    if (isInRecorderPanel(element)) return;

    const selector = getSelector(element);
    const value = element.value;

    clearTimeout(fillTimeout);
    
    if (lastFillSelector && lastFillSelector !== selector && lastFillValue) {
      recordStep('fill', { selector: lastFillSelector, value: lastFillValue });
    }
    
    lastFillSelector = selector;
    lastFillValue = value;

    fillTimeout = setTimeout(() => {
      if (lastFillSelector && lastFillValue) {
        recordStep('fill', { selector: lastFillSelector, value: lastFillValue });
        lastFillSelector = null;
        lastFillValue = '';
      }
    }, 300);
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

  document.addEventListener('keydown', (e) => {
    const element = document.activeElement;
    if (isInRecorderPanel(element)) return;

    const specialKeys = ['Enter', 'Tab', 'Escape', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

    if (specialKeys.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) {
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !specialKeys.includes(e.key)) {
        return;
      }

      recordStep('keyboard', {
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        selector: element ? getSelector(element) : '',
        xpath: element ? getXPath(element) : '',
        elementInfo: element ? getElementInfo(element) : null
      });
    }
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

  if (!isInIframe) {
    // 检查录制会话是否激活
    if (!window.__recorderSessionActive) {
      console.log('[Recorder] Session not active, skipping panel creation');
      return;
    }

    let uiElements = {};
    let toolbarHideTimeout = null;
    let isOverToolbar = false;
    let currentElement = null;
    let mouseX = 0, mouseY = 0, currentEdge = null;
    const EDGE_THRESHOLD = 30;
    let animationFrameId = null;
    let highlightRafId = null;
    let pendingHighlightElement = null;
    let lastTrajectoryLength = 0;
    let currentStepIndex = -1;
    let currentStepId = null;

    function createRecorderOverlay() {
      if (!document.body) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', createRecorderOverlay);
        } else {
          setTimeout(createRecorderOverlay, 10);
        }
        return;
      }

      // 检查面板是否已存在
      const existingPanel = document.getElementById('recorder-panel');
      
      // 检查并创建样式（样式可能被销毁）
      let style = document.getElementById('recorder-styles');
      if (!style) {
        style = document.createElement('style');
        style.id = 'recorder-styles';
        style.textContent = `
        .recorder-panel { position: fixed; right: 20px; top: 20px; width: 320px; background: white; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 2147483647; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .recorder-panel-header { padding: 12px 15px; background: #333; color: white; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none; }
        .recorder-panel-header h3 { font-size: 14px; font-weight: 500; margin: 0; }
        .recorder-panel-header button { padding: 4px 10px; font-size: 12px; border: none; border-radius: 4px; cursor: pointer; background: #555; color: white; }
        .recorder-panel-header button:hover { background: #666; }
        .recorder-panel-body { flex: 1; overflow-y: auto; padding: 10px; max-height: 400px; }
        .recorder-step { padding: 8px 10px; border-radius: 4px; margin-bottom: 6px; background: #f5f5f5; font-size: 12px; border-left: 3px solid #4CAF50; position: relative; }
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
        .recorder-step.selected { background: #e3f2fd; border-left-color: #2196F3; }
        .recorder-step:hover { background: #f0f0f0; }
        .recorder-step.selected:hover { background: #e3f2fd; }
        .recorder-delete-btn { position: absolute; right: 8px; bottom: 8px; padding: 2px 6px; font-size: 12px; border: none; border-radius: 3px; background: #ffebee; cursor: pointer; opacity: 0.8; }
        .recorder-delete-btn:hover { background: #ffcdd2; opacity: 1; }
        .recorder-empty { color: #999; text-align: center; padding: 20px; font-size: 13px; }
        .recorder-status { padding: 8px 15px; background: #f0f0f0; font-size: 11px; color: #666; border-top: 1px solid #eee; }
        .recorder-panel-tools { padding: 8px 10px; background: #fafafa; border-top: 1px solid #eee; }
        .recorder-tools-label { font-size: 11px; color: #666; margin-bottom: 6px; font-weight: 500; }
        .recorder-tools-list { display: flex; flex-wrap: wrap; gap: 4px; }
        .recorder-tools-list .tool-btn { padding: 4px 8px; font-size: 10px; border: 1px solid #ddd; border-radius: 3px; background: white; cursor: pointer; transition: all 0.2s; }
        .recorder-tools-list .tool-btn:hover { background: #f0f0f0; border-color: #bbb; }
        .recorder-tools-list .tool-btn:active { transform: scale(0.95); }
        #recorder-collapse { padding: 4px 8px; font-size: 14px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer; background: #555; color: white; margin-right: 5px; }
        #recorder-collapse:hover { background: #666; }
        .recorder-shadow { position: absolute; pointer-events: none; border: 2px solid #4CAF50; background: rgba(76, 175, 80, 0.1); border-radius: 4px; z-index: 2147483646; transition: all 0.2s ease-out; will-change: transform, width, height; }
        .recorder-shadow.login { border-color: #2196F3; background: rgba(33, 150, 243, 0.1); }
        .recorder-shadow.data { border-color: #FF9800; background: rgba(255, 152, 0, 0.1); }
        .recorder-shadow.pagination { border-color: #9C27B0; background: rgba(156, 39, 176, 0.1); }
        .recorder-toolbar { position: absolute; z-index: 2147483647; background: white; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); padding: 4px; display: flex; gap: 2px; pointer-events: auto; }
        .recorder-toolbar.horizontal { flex-direction: row; }
        .recorder-toolbar.vertical { flex-direction: column; }
        .recorder-toolbar button { padding: 5px 8px; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; white-space: nowrap; pointer-events: auto; }
        .recorder-toolbar button:hover { transform: scale(1.02); }
        .recorder-toolbar .btn-login { background: #E3F2FD; color: #1976D2; }
        .recorder-toolbar .btn-data { background: #FFF3E0; color: #F57C00; }
        .recorder-toolbar .btn-page { background: #F3E5F5; color: #7B1FA2; }
        .recorder-toolbar .btn-note { background: #E8F5E9; color: #388E3C; }
        .recorder-toolbar .btn-wait { background: #FFF8E1; color: #F9A825; }
        .recorder-toolbar .btn-container { background: #E0F7FA; color: #00838F; }
        .recorder-toolbar .btn-item { background: #FFF3E0; color: #F57C00; }
        .recorder-toolbar .btn-check { background: #E8F5E9; color: #2E7D32; }
        .recorder-markers-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483645; }
        .recorder-marker { position: absolute; pointer-events: none; border: 2px solid rgba(76, 175, 80, 0.6); border-radius: 4px; transition: all 0.2s ease-out; }
        .recorder-marker.login { border-color: rgba(33, 150, 243, 0.8); }
        .recorder-marker.data { border-color: rgba(255, 152, 0, 0.8); }
        .recorder-marker.pagination { border-color: rgba(156, 39, 176, 0.8); }
        .recorder-marker.custom { border-color: rgba(76, 175, 80, 0.8); }
        #recorder-canvas { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483644; }
      `;
        (document.head || document.documentElement).appendChild(style);
      }
      
      // 检查面板是否已存在
      if (existingPanel) {
        return;
      }

      const panel = document.createElement('div');
      panel.className = 'recorder-panel';
      panel.id = 'recorder-panel';
      panel.innerHTML = `
        <div class="recorder-panel-header">
          <h3>📝 Recorder</h3>
          <div>
            <button id="recorder-collapse">−</button>
            <button id="recorder-clear">Clear</button>
          </div>
        </div>
        <div class="recorder-panel-body" id="recorder-steps">
          <div class="recorder-empty">No steps recorded yet</div>
        </div>
        <div class="recorder-panel-tools" id="recorder-tools">
          <div class="recorder-tools-label">+ Tool:</div>
          <div class="recorder-tools-list">
            <button class="tool-btn" data-tool="wait_element">⏳ Wait</button>
            <button class="tool-btn" data-tool="data_container">📦 Container</button>
            <button class="tool-btn" data-tool="data_item">📊 Item</button>
            <button class="tool-btn" data-tool="pagination">📄 Page</button>
            <button class="tool-btn" data-tool="login_check">🔐 Login</button>
            <button class="tool-btn" data-tool="checkpoint">✅ Check</button>
            <button class="tool-btn" data-tool="custom">📝 Note</button>
          </div>
        </div>
        <div class="recorder-status" id="recorder-status">Steps: 0</div>
      `;
      document.body.appendChild(panel);
      recorderPanelElement = panel;

      // Panel collapse functionality
      let isCollapsed = false;
      let autoScroll = true;
      const collapseBtn = document.getElementById('recorder-collapse');
      const panelBody = document.getElementById('recorder-steps');
      const panelTools = document.getElementById('recorder-tools');
      const panelStatus = document.getElementById('recorder-status');
      
      collapseBtn.addEventListener('click', () => {
        isCollapsed = !isCollapsed;
        if (isCollapsed) {
          panelBody.style.display = 'none';
          panelTools.style.display = 'none';
          panelStatus.style.display = 'none';
          collapseBtn.textContent = '+';
        } else {
          panelBody.style.display = 'block';
          panelTools.style.display = 'block';
          panelStatus.style.display = 'block';
          collapseBtn.textContent = '−';
        }
      });

      // Prevent scroll穿透
      panelBody.addEventListener('wheel', (e) => {
        const { scrollTop, scrollHeight, clientHeight } = panelBody;
        const atTop = scrollTop === 0;
        const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
        
        if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
          e.preventDefault();
        }
      }, { passive: false });

      // Track scroll position for auto-scroll
      panelBody.addEventListener('scroll', () => {
        const isAtBottom = panelBody.scrollHeight - panelBody.scrollTop - panelBody.clientHeight < 10;
        autoScroll = isAtBottom;
      });

      // Tool selection for current step
      panelTools.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!currentStepId) {
            const steps = window.__recorderSteps || [];
            if (steps.length > 0) {
              currentStepId = steps[steps.length - 1].id;
            } else {
              return;
            }
          }
          const toolType = btn.dataset.tool;
          addToolAnnotation(currentStepId, toolType);
        });
      });

      // Panel drag functionality
      let isDragging = false;
      let dragStartX = 0, dragStartY = 0;
      let panelStartX = 0, panelStartY = 0;

      const header = panel.querySelector('.recorder-panel-header');
      header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = panel.getBoundingClientRect();
        panelStartX = rect.left;
        panelStartY = rect.top;
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        const newLeft = Math.max(0, Math.min(window.innerWidth - 320, panelStartX + dx));
        const newTop = Math.max(0, Math.min(window.innerHeight - 100, panelStartY + dy));
        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
        panel.style.right = 'auto';
      });

      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          try {
            localStorage.setItem('recorder-panel-pos', JSON.stringify({
              left: panel.style.left,
              top: panel.style.top
            }));
          } catch(e) {}
        }
      });

      // Restore saved position
      try {
        const savedPos = localStorage.getItem('recorder-panel-pos');
        if (savedPos) {
          const pos = JSON.parse(savedPos);
          if (pos.left && pos.top) {
            panel.style.left = pos.left;
            panel.style.top = pos.top;
            panel.style.right = 'auto';
          }
        }
      } catch(e) {}

      const markersContainer = document.createElement('div');
      markersContainer.className = 'recorder-markers-container';
      markersContainer.id = 'recorder-markers';
      document.body.appendChild(markersContainer);

      const canvas = document.createElement('canvas');
      canvas.id = 'recorder-canvas';
      document.body.appendChild(canvas);

      const shadowBox = document.createElement('div');
      shadowBox.className = 'recorder-shadow';
      shadowBox.id = 'recorder-shadow';
      shadowBox.style.display = 'none';
      document.body.appendChild(shadowBox);

      const toolbar = document.createElement('div');
      toolbar.className = 'recorder-toolbar';
      toolbar.id = 'recorder-toolbar';
      toolbar.innerHTML = `
        <button class="btn-wait" data-type="wait_element">⏳ Wait</button>
        <button class="btn-container" data-type="data_container">📦 Container</button>
        <button class="btn-item" data-type="data_item">📊 Item</button>
        <button class="btn-page" data-type="pagination">📄 Page</button>
        <button class="btn-login" data-type="login_check">🔐 Login</button>
        <button class="btn-check" data-type="checkpoint">✅ Check</button>
        <button class="btn-note" data-type="custom">📝 Note</button>
      `;
      toolbar.style.display = 'none';
      document.body.appendChild(toolbar);

      uiElements = { panel, markersContainer, canvas, shadowBox, toolbar, style };

      window.__recorderUISteps = [];

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
        
        const displaySteps = steps.slice(-20);
        
        container.innerHTML = displaySteps.map((step) => {
          const action = step.action || 'unknown';
          const selector = step.selector || '';
          const value = step.value || '';
          const stepId = step.id || '';
          
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
          
          const hasAnnotation = step.annotation && step.annotation.label;
          const isSelected = stepId === currentStepId;
          
          return '<div class="recorder-step ' + action + (isSelected ? ' selected' : '') + '" data-step-id="' + stepId + '">' +
            '<div class="action">' + action.toUpperCase() + '</div>' +
            (selector ? '<div class="selector">' + selector + '</div>' : '') +
            (value && !['trajectory', 'scroll', 'resize', 'link_click'].includes(action) ? '<div class="value">"' + value.slice(0, 30) + (value.length > 30 ? '...' : '') + '"</div>' : '') +
            extra +
            (hasAnnotation ? '<span class="annotation">🏷️ ' + step.annotation.label + '</span>' : '') +
            (isSelected ? '<button class="recorder-delete-btn" data-step-id="' + stepId + '" title="Delete step">🗑️</button>' : '') +
          '</div>';
        }).join('');
        
        // Click to select step
        container.querySelectorAll('.recorder-step').forEach(stepEl => {
          stepEl.addEventListener('click', (e) => {
            // 如果点击的是删除按钮，不选中步骤
            if (e.target.classList.contains('recorder-delete-btn')) return;
            
            const stepId = stepEl.dataset.stepId;
            currentStepId = stepId;
            window.__recorderCurrentStepId = stepId;
            window.__updateRecorderUI();
          });
        });
        
        // Delete button click
        container.querySelectorAll('.recorder-delete-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const stepId = btn.dataset.stepId;
            deleteStep(stepId);
          });
        });
        
        // Only auto-scroll if user is at bottom
        if (typeof autoScroll !== 'undefined' && autoScroll) {
          container.scrollTop = container.scrollHeight;
        }
      };

      function addToolAnnotation(stepId, toolType) {
        if (!stepId) {
          // 如果没有传入 ID，使用当前选中的步骤 ID
          stepId = currentStepId;
          if (!stepId) {
            const steps = window.__recorderSteps || [];
            if (steps.length > 0) {
              stepId = steps[steps.length - 1].id;
            } else {
              return;
            }
          }
        }
        
        const steps = window.__recorderSteps || [];
        const step = steps.find(s => s.id === stepId);
        if (!step) return;
        
        const labels = {
          wait_element: 'Wait',
          data_container: 'Container',
          data_item: 'Item',
          pagination: 'Pagination',
          login_check: 'Login',
          checkpoint: 'Check',
          custom: 'Custom'
        };
        
        let annotation = null;
        
        if (toolType === 'custom') {
          const note = prompt('Enter custom annotation:');
          if (note) {
            annotation = { type: 'custom', label: note };
          } else {
            return;
          }
        } else if (toolType === 'wait_element') {
          const timeout = prompt('Enter wait timeout (ms, default 10000):', '10000');
          annotation = { 
            type: toolType, 
            label: labels[toolType],
            waitTimeout: parseInt(timeout) || 10000
          };
        } else if (toolType === 'data_container') {
          const itemSelector = prompt('Enter item selector (e.g., .product-item):');
          annotation = { 
            type: toolType, 
            label: labels[toolType],
            itemSelector: itemSelector || ''
          };
        } else {
          annotation = { type: toolType, label: labels[toolType] };
        }
        
        // 使用统一 API 更新步骤
        const result = window.__recorderAction({ type: 'update', id: stepId, data: { annotation } });
        
        if (result.success) {
          // 同步到主进程
          if (typeof window.__recorderSync === 'function') {
            try {
              window.__recorderSync(JSON.stringify({ action: '__update_step__', id: stepId, data: { annotation } }));
            } catch (e) {}
          }
          
          window.__updateRecorderUI();
        }
      }

      function deleteStep(stepId) {
        if (!stepId) return;
        
        const result = window.__recorderAction({ type: 'delete', id: stepId });
        
        if (result.success) {
          // 同步到主进程
          if (typeof window.__recorderSync === 'function') {
            try {
              window.__recorderSync(JSON.stringify({ action: '__delete_step__', id: stepId }));
            } catch (e) {}
          }
          
          // 清除选中状态
          currentStepIndex = -1;
          currentStepId = null;
          window.__recorderCurrentStepIndex = -1;
          window.__recorderCurrentStepId = null;
          
          window.__updateRecorderUI();
        }
      }

      window.addEventListener('recorder:steps', function(e) {
        window.__recorderSteps = e.detail;
        window.__updateRecorderUI();
      });

      if (typeof window.__recorderSync === 'function') {
        window.__recorderSync('');
      }

      document.getElementById('recorder-clear').addEventListener('click', function() {
        window.__recorderSteps = [];
        document.getElementById('recorder-markers').innerHTML = '';
        markedElements.clear();
        annotations.clear();
        window.__updateRecorderUI();
        if (typeof window.__recorderSync === 'function') {
          try { window.__recorderSync(JSON.stringify({ action: '__clear__' })); } catch (e) {}
        }
      });

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

      function updateShadowBox(element) {
        if (!element) { 
          shadowBox.style.display = 'none'; 
          return; 
        }
        const rect = element.getBoundingClientRect();
        shadowBox.style.left = rect.left + window.scrollX + 'px';
        shadowBox.style.top = rect.top + window.scrollY + 'px';
        shadowBox.style.width = rect.width + 'px';
        shadowBox.style.height = rect.height + 'px';
        shadowBox.style.display = 'block';
        const annotation = annotations.get(element);
        shadowBox.className = 'recorder-shadow' + (annotation ? ' ' + annotation.type : '');
      }

      function calculateToolbarPosition(rect) {
        const GAP = 10;
        const TOOLBAR_W = 280;
        const TOOLBAR_H = 32;
        const scrollX = window.scrollX, scrollY = window.scrollY;
        
        // Priority: place toolbar near mouse position
        let left = mouseX + GAP;
        let top = mouseY + GAP;
        
        // Boundary detection
        if (left + TOOLBAR_W > window.innerWidth - 10) {
          left = mouseX - TOOLBAR_W - GAP;
        }
        if (top + TOOLBAR_H > window.innerHeight - 10) {
          top = mouseY - TOOLBAR_H - GAP;
        }
        
        // Ensure toolbar stays within screen
        left = Math.max(10, Math.min(window.innerWidth - TOOLBAR_W - 10, left));
        top = Math.max(10, Math.min(window.innerHeight - TOOLBAR_H - 10, top));
        
        return { left: left + scrollX, top: top + scrollY, orientation: 'horizontal' };
      }

      function updateToolbar(element) {
        if (!element) { 
          toolbar.style.display = 'none'; 
          return; 
        }
        const rect = element.getBoundingClientRect();
        const pos = calculateToolbarPosition(rect);
        toolbar.style.left = pos.left + 'px';
        toolbar.style.top = pos.top + 'px';
        toolbar.className = 'recorder-toolbar ' + pos.orientation;
        toolbar.style.display = 'flex';
      }

      function showToolbar() {
        clearTimeout(toolbarHideTimeout);
        toolbar.style.display = 'flex';
      }

      function hideToolbarDelayed() {
        clearTimeout(toolbarHideTimeout);
        toolbarHideTimeout = setTimeout(() => {
          if (!isOverToolbar) {
            toolbar.style.display = 'none';
          }
        }, TOOLBAR_HIDE_DELAY);
      }

      function annotateElement(element, type) {
        if (!element) return;
        const selector = getSelector(element);
        const labels = {
          wait_element: 'Wait',
          data_container: 'Container',
          data_item: 'Item',
          pagination: 'Pagination',
          login_check: 'Login',
          checkpoint: 'Check',
          custom: 'Note'
        };
        let annotation = null;
        if (type === 'custom') {
          const note = prompt('Enter note:');
          if (note) annotation = { type: 'custom', label: note };
          else return;
        } else if (type === 'wait_element') {
          const timeout = prompt('Enter wait timeout (ms, default 10000):', '10000');
          annotation = { 
            type, 
            label: labels[type],
            selector: selector,
            waitTimeout: parseInt(timeout) || 10000
          };
        } else if (type === 'data_container') {
          const itemSelector = prompt('Enter item selector (e.g., .product-item):');
          annotation = { 
            type, 
            label: labels[type],
            selector: selector,
            itemSelector: itemSelector || ''
          };
        } else {
          annotation = { type, label: labels[type], selector: selector };
        }
        annotations.set(element, annotation);
        if (typeof window.__recorderAddMarker === 'function') {
          window.__recorderAddMarker(element, type);
        }
        
        recordStep('annotate', {
          selector: selector,
          xpath: getXPath(element),
          annotation: annotation,
          elementInfo: getElementInfo(element)
        });

        shadowBox.style.transition = 'none';
        shadowBox.style.boxShadow = '0 0 20px 5px rgba(76, 175, 80, 0.8)';
        setTimeout(() => { shadowBox.style.transition = 'box-shadow 0.3s ease'; shadowBox.style.boxShadow = ''; }, 200);
        
        updateShadowBox(element);
      }

      toolbar.addEventListener('mouseenter', () => {
        isOverToolbar = true;
        showToolbar();
      });

      toolbar.addEventListener('mouseleave', () => {
        isOverToolbar = false;
        hideToolbarDelayed();
      });

      toolbar.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          annotateElement(currentElement, btn.dataset.type);
        });
      });

      let lastHighlightTime = 0;

      function throttledHighlight(element) {
        const now = Date.now();
        pendingHighlightElement = element;
        
        if (now - lastHighlightTime >= HIGHLIGHT_THROTTLE) {
          lastHighlightTime = now;
          if (highlightRafId === null) {
            highlightRafId = requestAnimationFrame(() => {
              highlightRafId = null;
              updateShadowBox(pendingHighlightElement);
              updateToolbar(pendingHighlightElement);
            });
          }
        }
      }

      document.addEventListener('mousemove', (e) => {
        if (isOverToolbar) return;
        
        const element = e.composedPath()[0] || e.target;
        mouseX = e.clientX;
        mouseY = e.clientY;
        
        if (element === shadowBox || element === toolbar || toolbar.contains(element)) return;
        if (isInRecorderPanel(element)) { 
          throttledHighlight(null); 
          return; 
        }
        if (element === document.body || element === document.documentElement) { 
          throttledHighlight(null); 
          currentEdge = null; 
          return; 
        }
        
        if (!shouldHighlightElement(element)) {
          throttledHighlight(null);
          return;
        }
        
        currentElement = element;
        throttledHighlight(element);
      }, true);

      const ctx = canvas.getContext('2d');
      function resizeCanvas() { 
        canvas.width = window.innerWidth; 
        canvas.height = window.innerHeight; 
      }
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      function drawCanvas() {
        const points = window.__recorderTrajectory;
        const currentLength = points ? points.length : 0;
        
        if (currentLength < 2) {
          if (lastTrajectoryLength > 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            lastTrajectoryLength = 0;
          }
          return;
        }
        
        lastTrajectoryLength = currentLength;
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
      }

      function animateTrajectory() {
        drawCanvas();
        animationFrameId = requestAnimationFrame(animateTrajectory);
      }
      animateTrajectory();
      
      let pollInterval = null;
      
      function startPolling() {
        if (pollInterval) return;
        
        pollInterval = setInterval(() => {
          if (typeof window.__recorderSync === 'function') {
            window.__recorderSync(JSON.stringify({ action: '__poll__' }));
          }
        }, 500);
      }
      
      function stopPolling() {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }
      
      window.__recorderStartPolling = startPolling;
      window.__recorderStopPolling = stopPolling;
      
      startPolling();
    }

    window.__recorderClosePanel = function() {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      
      if (highlightRafId) {
        cancelAnimationFrame(highlightRafId);
        highlightRafId = null;
      }
      
      clearTimeout(toolbarHideTimeout);
      
      if (typeof window.__recorderStopPolling === 'function') {
        window.__recorderStopPolling();
      }
      
      const elements = [
        document.getElementById('recorder-panel'),
        document.getElementById('recorder-markers'),
        document.getElementById('recorder-canvas'),
        document.getElementById('recorder-shadow'),
        document.getElementById('recorder-toolbar'),
        document.getElementById('recorder-styles')
      ];
      
      elements.forEach(el => {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
      
      window.__recorderInitialized = false;
      window.__recorderSteps = [];
      window.__recorderUISteps = [];
      markedElements.clear();
      annotations.clear();
      highlightCache = new WeakMap();
      recorderPanelElement = null;
      
      console.log('[Recorder] Panel closed');
    };

    createRecorderOverlay();
    
    // 监听页面变化，重新创建面板
    let lastUrl = window.location.href;
    const checkPanelInterval = setInterval(() => {
      // 检查 URL 是否变化
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
      }
      
      // 定期检查面板和样式是否存在（处理 SPA 销毁的情况）
      const panel = document.getElementById('recorder-panel');
      const style = document.getElementById('recorder-styles');
      if (document.body && (!panel || !style)) {
        createRecorderOverlay();
      }
    }, 1000);
    
    window.__recorderStopPolling = function() {
      clearInterval(checkPanelInterval);
    };
  }
})();
