(function() {
  if (window.__recorderInitialized) return;
  window.__recorderInitialized = true;

  const TRAJECTORY_INTERVAL = 50;
  const MAX_TRAJECTORY_POINTS = 10;
  const SCROLL_THRESHOLD = 50;

  // 检测是否在 iframe 中
  const isInIframe = window.self !== window.top;
  const iframePrefix = isInIframe ? 'iframe >> ' : '';

  window.__recorderTrajectory = [];
  window.__recorderLastTime = 0;
  window.__recorderLastScroll = { x: 0, y: 0 };
  let lastScrollX = window.scrollX;
  let lastScrollY = window.scrollY;
  let scrollTimeout = null;
  let pendingScroll = null;
  let lastFillSelector = null;
  let lastFillValue = '';
  let fillTimeout = null;
  
  // 视口尺寸记录
  let currentViewport = { width: window.innerWidth, height: window.innerHeight };
  let pendingResize = null;
  let resizeTimeout = null;

  // 初始化记录视口尺寸
  window.__recorderInitialViewport = { ...currentViewport };
  
  // 标记 iframe 环境
  if (isInIframe) {
    console.log('[Recorder] Running in iframe context');
  }

  // 鼠标轨迹追踪
  document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - window.__recorderLastTime > TRAJECTORY_INTERVAL) {
      window.__recorderTrajectory.push({
        x: e.clientX,
        y: e.clientY,
        t: now
      });
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

  // 检查是否在录制面板内或工具栏内
  function isInRecorderPanel(element) {
    if (!element) return false;
    if (element.closest) {
      return element.closest('.recorded-panel, .recorder-toolbar') !== null;
    }
    return false;
  }

  // 直接同步步骤（不附加轨迹和滚动）
  window.__syncStepDirect = function(step) {
    step.viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    step.url = window.location.href;

    if (typeof window.__recorderSync === 'function') {
      try {
        window.__recorderSync(JSON.stringify(step));
      } catch (e) {
        console.error('[Recorder] Failed to sync step:', e);
      }
    }
  };

  // 同步步骤（先插入 resize、滚动和轨迹步骤）
  window.__syncStep = function(step) {
    // 先记录待处理的 resize
    if (pendingResize) {
      window.__syncStepDirect({
        id: 'step-' + Date.now(),
        timestamp: Date.now(),
        action: 'resize',
        from: pendingResize.from,
        to: pendingResize.to
      });
      pendingResize = null;
    }
    
    // 再记录待处理的滚动
    if (pendingScroll) {
      window.__syncStepDirect({
        id: 'step-' + Date.now(),
        timestamp: Date.now(),
        action: 'scroll',
        x: pendingScroll.x,
        y: pendingScroll.y
      });
      pendingScroll = null;
    }
    
    // 再记录轨迹步骤
    const trajectory = window.__getTrajectory();
    if (trajectory.length > 0) {
      window.__syncStepDirect({
        id: 'step-' + Date.now(),
        timestamp: Date.now(),
        action: 'trajectory',
        points: trajectory
      });
    }
    
    // 最后记录操作步骤
    step.viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    step.url = window.location.href;

    if (typeof window.__recorderSync === 'function') {
      try {
        window.__recorderSync(JSON.stringify(step));
      } catch (e) {
        console.error('[Recorder] Failed to sync step:', e);
      }
    }
  };

  // resize 事件（只记录，不立即同步）
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      
      if (newWidth !== currentViewport.width || newHeight !== currentViewport.height) {
        pendingResize = {
          from: { ...currentViewport },
          to: { width: newWidth, height: newHeight }
        };
        currentViewport = { width: newWidth, height: newHeight };
      }
    }, 100);
  }, true);

  // 滚动事件（只记录，不立即同步）
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

  // 获取 XPath（优先使用特征属性）
  function getXPath(element) {
    // 1. 优先使用 ID
    if (element.id) return `//*[@id="${element.id}"]`;
    
    // 2. 使用 name 属性
    const name = element.getAttribute('name');
    if (name) return `//*[@name="${name}"]`;
    
    // 3. 使用语义化属性
    const semanticAttrs = ['data-testid', 'data-test', 'data-cy', 'aria-label', 'role', 'title', 'placeholder'];
    for (const attr of semanticAttrs) {
      const value = element.getAttribute(attr);
      if (value) return `//*[@${attr}="${value}"]`;
    }
    
    // 4. 使用有意义的 class
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/)
        .filter(c => c && !c.startsWith('_') && !c.startsWith('css-') && !/^[a-z]{1,2}$/.test(c));
      if (classes.length > 0) {
        const cls = classes[0];
        return `//*[contains(@class, "${cls}")]`;
      }
    }
    
    // 5. 使用文本内容（对于按钮、链接等）
    const text = element.innerText?.trim();
    if (text && text.length < 30 && ['BUTTON', 'A', 'SPAN', 'LABEL'].includes(element.tagName)) {
      return `//${element.tagName.toLowerCase()}[contains(text(), "${text.slice(0, 20)}")]`;
    }
    
    // 6. 最后使用路径索引
    const parts = [];
    let current = element;
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousSibling;
      
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }
      
      const tagName = current.tagName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
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
      iframe: isInIframe
    };

    window.__syncStep(step);
  }

  // 点击事件
  document.addEventListener('click', (e) => {
    const path = e.composedPath();
    const element = path[0] || e.target;
    
    // 忽略录制面板内的点击
    if (isInRecorderPanel(element)) return;
    
    if (element === document.body || element === document.documentElement) return;

    // 检测链接点击
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
        elementInfo: {
          ...getElementInfo(link),
          target: target,
          isExternal: isExternal
        }
      });
      return;
    }

    recordStep('click', {
      selector: getSelector(element),
      xpath: getXPath(element),
      elementInfo: getElementInfo(element)
    });
  }, true);

  // 输入事件（合并同一输入框的多次输入）
  document.addEventListener('input', (e) => {
    const element = e.target;
    if (!element || !element.tagName) return;
    
    // 忽略录制面板内的输入
    if (isInRecorderPanel(element)) return;

    const selector = getSelector(element);
    const value = element.value;

    clearTimeout(fillTimeout);
    
    if (lastFillSelector === selector) {
      lastFillValue = value;
    } else {
      if (lastFillSelector && lastFillValue) {
        recordStep('fill', {
          selector: lastFillSelector,
          value: lastFillValue
        });
      }
      lastFillSelector = selector;
      lastFillValue = value;
    }

    fillTimeout = setTimeout(() => {
      if (lastFillSelector && lastFillValue) {
        recordStep('fill', {
          selector: lastFillSelector,
          value: lastFillValue
        });
        lastFillSelector = null;
        lastFillValue = '';
      }
    }, 500);
  }, true);

  // 选择事件
  document.addEventListener('change', (e) => {
    const element = e.target;
    if (!element || element.tagName !== 'SELECT') return;
    
    // 忽略录制面板内的选择
    if (isInRecorderPanel(element)) return;

    recordStep('select', {
      selector: getSelector(element),
      xpath: getXPath(element),
      value: element.value,
      elementInfo: getElementInfo(element)
    });
  }, true);

  // 页面跳转
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

  console.log('[Recorder] Inject script initialized');
})();
