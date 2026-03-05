(function() {
  'use strict';

  // 配置常量
  const TRAJECTORY_INTERVAL = 50;
  const MAX_TRAJECTORY_POINTS = 10;
  const SCROLL_THRESHOLD = 50;
  const HIGHLIGHT_THROTTLE = 100;
  const TOOLBAR_HIDE_DELAY = 500;
  const CACHE_TTL = 100;

  // 是否隐藏 UI
  const HIDE_UI = window.xyzHide === true;

  const isInIframe = window.self !== window.top;
  const iframePrefix = isInIframe ? 'iframe >> ' : '';

  // 当前脚本的会话 ID（在脚本注入时设置）
  // 使用闭包变量保存当前会话 ID，避免被后续脚本覆盖
  // xyzInjectedSessionId 是在脚本字符串中直接嵌入的值
  const thisSessionId = window.xyzInjectedSessionId;

  // 如果没有会话 ID，跳过
  if (!thisSessionId) {
    return;
  }

  // 解析会话 ID 中的时间戳
  const thisTimestamp = parseInt(thisSessionId.replace('recorder-', '')) || 0;
  const currentTimestamp = parseInt((window.xyzSessionId || '').replace('recorder-', '')) || 0;

  // 检查是否有更新的会话 ID
  // 如果 window.xyzSessionId 存在且时间戳比当前脚本的新，说明有更新的会话
  // 这种情况下，旧的脚本应该跳过初始化
  // 注意：window.xyzSessionId 是由 addInitScript 的状态设置脚本设置的
  // 由于 addInitScript 是累积的，我们需要检查最新的会话 ID
  if (currentTimestamp > thisTimestamp) {
    // 旧脚本，跳过初始化
    return;
  }

  // 检查录制会话是否有效
  // 注意：只有当会话 ID 匹配时，才检查 xyzStopped
  // 如果会话 ID 不匹配，说明这是旧脚本，应该跳过
  // 如果 xyzStopped 为 true 且没有新的会话 ID，说明录制已停止
  if (window.xyzStopped && (!window.xyzSessionId || window.xyzSessionId === thisSessionId)) {
    return;
  }

  // 如果已经初始化且会话 ID 相同，跳过
  // 注意：如果 xyzInited 为 false，说明需要重新初始化
  if (window.xyzInited === true && window.xyzInitializedSessionId === thisSessionId) {
    return;
  }

  // 标记为已初始化，并记录当前会话 ID
  window.xyzInited = true;
  window.xyzInitializedSessionId = thisSessionId;

  // ============ 闭包内私有变量 ============
  let stepIdCounter = 0;
  function generateStepId() {
    stepIdCounter = (stepIdCounter + 1) % 1000000;
    return String(stepIdCounter).padStart(6, '0');
  }

  // 事件队列（步骤存储）
  window.xyzQueue = window.xyzQueue || [];

  // 鼠标轨迹
  let mousePath = [];
  let lastTime = 0;
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

  // 暴露初始视口（隐蔽名称）
  window.xyzVp = { ...currentViewport };

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'NOSCRIPT', 'BR', 'HR', 'SVG', 'PATH', 'TITLE', 'BASE', 'WBR', 'AREA', 'MAP', 'COL', 'COLGROUP']);

  // ============ 私有函数：统一事件 API ============
  function pushEvent(action) {
    if (!action || !action.type) {
      return { success: false, steps: window.xyzQueue || [], error: 'Invalid action' };
    }

    const steps = window.xyzQueue || [];

    switch (action.type) {
      case 'add':
        if (!action.data) {
          return { success: false, steps, error: 'Missing data for add action' };
        }
        const newStep = { ...action.data, id: action.data.id || generateStepId() };
        steps.push(newStep);
        window.xyzQueue = steps;
        return { success: true, steps };

      case 'update':
        if (!action.id) {
          return { success: false, steps, error: 'Missing id for update action' };
        }
        const updateIndex = steps.findIndex(s => s.id === action.id);
        if (updateIndex >= 0) {
          steps[updateIndex] = { ...steps[updateIndex], ...action.data };
          window.xyzQueue = steps;
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
          window.xyzQueue = steps;
          return { success: true, steps };
        }
        return { success: false, steps, error: 'Step not found' };

      case 'list':
        return { success: true, steps };

      case 'clear':
        window.xyzQueue = [];
        return { success: true, steps: [] };

      default:
        return { success: false, steps, error: 'Unknown action type' };
    }
  }

  function shouldHighlightElement(element) {
    if (!element || !element.tagName) return false;
    if (SKIP_TAGS.has(element.tagName)) return false;

    const now = Date.now();
    const cached = highlightCache.get(element);
    if (cached && (now - cached.time) < CACHE_TTL) {
      return cached.result;
    }

    if (element.closest) {
      const recorderEl = element.closest('.xyzPnl, .xyzTb, .xyzSh, .xyzMk');
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

    // 排除尺寸接近视口的大元素
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

  const MESSAGE_TYPE = 'xyzMsg';

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === MESSAGE_TYPE && event.data.step) {
      if (!isInIframe) {
        // 使用动态绑定名称
        const bindingName = window.xyzBindingName || 'xyzTrack';
        if (typeof window[bindingName] === 'function') {
          try { window[bindingName](JSON.stringify(event.data.step)); } catch (e) {}
        }
      } else {
        try {
          window.parent.postMessage({ type: MESSAGE_TYPE, step: event.data.step }, '*');
        } catch (e) {}
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    // 检查录制会话是否仍然活跃
    // 注意：xyzActive 可能是 undefined（在 iframe 中），所以只检查明确为 false 的情况
    if (window.xyzActive === false || window.xyzStopped) return;
    
    // 检查当前会话是否是最新的
    // 由于 addInitScript 是累积的，旧的监听器可能会继续工作
    // 通过比较时间戳来确保只有最新的会话记录事件
    const currentTimestamp = parseInt((window.xyzSessionId || '').replace('recorder-', '')) || 0;
    if (thisTimestamp > 0 && currentTimestamp > thisTimestamp) return;
    
    const now = Date.now();
    if (now - lastTime > TRAJECTORY_INTERVAL) {
      mousePath.push({ x: e.clientX, y: e.clientY, t: now });
      if (mousePath.length > MAX_TRAJECTORY_POINTS) {
        mousePath.shift();
      }
      lastTime = now;
    }
  }, true);

  function getTrajectory() {
    // 检查当前会话是否是最新的
    // 由于 addInitScript 是累积的，旧的监听器可能会继续工作
    // 通过比较时间戳来确保只有最新的会话记录事件
    const currentTimestamp = parseInt((window.xyzSessionId || '').replace('recorder-', '')) || 0;
    if (thisTimestamp > 0 && currentTimestamp > thisTimestamp) {
      mousePath = [];
      return [];
    }
    
    const points = mousePath.slice(-4);
    mousePath = [];
    return points;
  }

  let panelElement = null;
  function isInPanel(element) {
    if (!element) return false;

    if (!panelElement) {
      panelElement = document.querySelector('.xyzPnl');
    }
    if (panelElement && (element === panelElement || panelElement.contains(element))) {
      return true;
    }

    const toolbar = document.querySelector('.xyzTb');
    if (toolbar && (element === toolbar || toolbar.contains(element))) {
      return true;
    }

    return false;
  }

  function syncStepDirect(step) {
    if (!step.id) {
      step.id = 'step-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    }
    step.viewport = { width: window.innerWidth, height: window.innerHeight };
    step.url = window.location.href;
    step.iframe = isInIframe;

    pushEvent({ type: 'add', data: step });

    const bindingName = window.xyzBindingName || 'xyzTrack';

    if (isInIframe) {
      try {
        window.parent.postMessage({ type: MESSAGE_TYPE, step: step }, '*');
      } catch (e) {}
    } else if (typeof window[bindingName] === 'function') {
      try {
        window[bindingName](JSON.stringify(step));
      } catch (e) {
        console.error('[Sync] failed:', e);
      }
    }
  }

  function syncStep(step) {
    if (pendingResize) {
      syncStepDirect({ timestamp: Date.now(), action: 'resize', from: pendingResize.from, to: pendingResize.to });
      pendingResize = null;
    }
    if (pendingScroll) {
      syncStepDirect({ timestamp: Date.now(), action: 'scroll', x: pendingScroll.x, y: pendingScroll.y });
      pendingScroll = null;
    }
    const trajectory = getTrajectory();
    if (trajectory.length > 0) {
      syncStepDirect({ timestamp: Date.now(), action: 'trajectory', points: trajectory });
    }
    syncStepDirect(step);
  }

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

  // ============ XPath 和 Selector 工具函数 ============
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
      const classes = filterUsefulClasses(element);
      if (classes.length > 0) {
        const xpath = '//*[contains(@class, "' + classes[0] + '")]';
        if (isUniqueXPath(xpath)) result = xpath;
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

  // ============ 增强的选择器生成函数 ============

  // 语义属性优先级列表
  const SEMANTIC_ATTRS = [
    'data-testid', 'data-test', 'data-cy',
    'name', 'aria-label', 'aria-labelledby',
    'role', 'type', 'placeholder', 'title', 'alt'
  ];

  // 工具类名排除规则
  const UTILITY_CLASS_PATTERNS = [
    /^_/,           // 下划线开头
    /^css-/,        // CSS Modules
    /^[a-z]{1,2}$/, // 1-2个字符的短类名
    /^(active|disabled|hidden|visible|selected|hover|focus|current|open|closed)$/i,
    /^(text-|font-|bg-|p-|m-|w-|h-|flex|grid|border|rounded|shadow|opacity|z-)/,
    /^(sm:|md:|lg:|xl:|2xl:)/  // 响应式前缀
  ];

  // 检测高熵类名（CSS Modules/Emotion/Styled Components 自动生成的随机类名）
  // 例如: oMpq4HiN, YoNA2Hyj, qKr0RhiL, GzPW6isY, sc-dkzDqf, css-1a2b3c
  function isHighEntropyClassName(className) {
    if (!className || className.length < 4 || className.length > 15) return false;

    // CSS Modules: xxx_yyy__zzz 格式
    if (/^[a-zA-Z]+_[a-zA-Z]+_{2}[a-zA-Z0-9]+$/.test(className)) return true;

    // Emotion/Styled Components: sc-xxxxx 或纯随机字符
    if (/^sc-[a-zA-Z0-9]+$/.test(className)) return true;

    // 高熵类名特征：混合大小写+数字，无语义分隔符
    // 模式1: 纯字母混合大小写，长度6-12，如 YoNA2Hyj, oMpq4HiN
    const hasUpper = /[A-Z]/.test(className);
    const hasLower = /[a-z]/.test(className);
    const hasDigit = /[0-9]/.test(className);
    const hasSeparator = /[-_]/.test(className);

    // 如果有分隔符，可能是有意义的（如 btn-primary），不过滤
    if (hasSeparator) return false;

    // 混合大小写且包含数字，且没有分隔符 -> 高概率是生成的类名
    if (hasUpper && hasLower && hasDigit) return true;

    // 纯大写字母+数字混合，长度6-10
    if (/^[A-Z][a-z0-9]+[A-Z]/.test(className) && className.length <= 12) return true;

    // 以小写字母开头，后面有连续大写字母切换的驼峰模式（非语义）
    // 如 "xYzAbC" 这种无意义的交替模式
    if (/^[a-z]/.test(className) && /[a-z][A-Z][a-z][A-Z]/.test(className)) return true;

    return false;
  }

  // 过滤有用的类名
  function filterUsefulClasses(element) {
    if (!element.className || typeof element.className !== 'string') return [];
    return element.className.trim().split(/\s+/).filter(c => {
      if (!c) return false;
      // 过滤工具类名
      if (UTILITY_CLASS_PATTERNS.some(p => p.test(c))) return false;
      // 过滤高熵类名
      if (isHighEntropyClassName(c)) return false;
      return true;
    });
  }

  // 策略1: 多属性组合选择器
  function getMultiAttributeSelector(element) {
    const tag = element.tagName.toLowerCase();
    const attrs = [];

    for (const attr of SEMANTIC_ATTRS) {
      const value = element.getAttribute(attr);
      if (value) {
        attrs.push({ attr, value });
      }
    }

    if (attrs.length === 0) return null;

    // 尝试单属性
    for (const { attr, value } of attrs) {
      const selector = tag + '[' + attr + '="' + CSS.escape(value) + '"]';
      if (isUniqueSelector(selector)) return selector;
    }

    // 尝试双属性组合
    if (attrs.length >= 2) {
      for (let i = 0; i < attrs.length; i++) {
        for (let j = i + 1; j < attrs.length; j++) {
          const selector = tag +
            '[' + attrs[i].attr + '="' + CSS.escape(attrs[i].value) + '"]' +
            '[' + attrs[j].attr + '="' + CSS.escape(attrs[j].value) + '"]';
          if (isUniqueSelector(selector)) return selector;
        }
      }
    }

    return null;
  }

  // 策略2: 属性 + 类名组合选择器
  function getAttributeClassComboSelector(element) {
    const tag = element.tagName.toLowerCase();
    const classes = filterUsefulClasses(element);
    if (classes.length === 0) return null;

    // 按长度排序（更长的类名通常更具体）
    classes.sort((a, b) => b.length - a.length);
    const bestClass = classes[0];

    // 查找可用属性
    for (const attr of SEMANTIC_ATTRS) {
      const value = element.getAttribute(attr);
      if (value) {
        const selector = tag + '.' + CSS.escape(bestClass) + '[' + attr + '="' + CSS.escape(value) + '"]';
        if (isUniqueSelector(selector)) return selector;
      }
    }

    return null;
  }

  // 策略3: 智能类名选择
  function getBestClassSelector(element) {
    const classes = filterUsefulClasses(element);
    if (classes.length === 0) return null;

    // 按区分度排序（更长的类名通常更具体）
    classes.sort((a, b) => b.length - a.length);

    const tag = element.tagName.toLowerCase();

    // 尝试单个类名
    for (const cls of classes) {
      const selector = tag + '.' + CSS.escape(cls);
      if (isUniqueSelector(selector)) return selector;
    }

    // 尝试组合多个类名
    for (let i = 2; i <= Math.min(3, classes.length); i++) {
      const selector = tag + '.' + classes.slice(0, i).map(c => CSS.escape(c)).join('.');
      if (isUniqueSelector(selector)) return selector;
    }

    return null;
  }

  // 策略4: 文本内容选择器
  function getTextBasedSelector(element) {
    const text = element.innerText?.trim();
    if (!text || text.length > 30) return null;

    // 只对特定标签使用文本选择器
    const textTags = ['BUTTON', 'A', 'SPAN', 'LABEL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
    if (!textTags.includes(element.tagName)) return null;

    const tag = element.tagName.toLowerCase();
    const escapedText = text.replace(/"/g, '\\"').slice(0, 20);

    // Playwright 风格的文本选择器
    const selector = tag + ':has-text("' + escapedText + '")';
    // 注意：这种选择器在 querySelectorAll 中不直接支持，仅作为备选记录
    return null; // 暂时返回 null，因为标准 CSS 不支持 :has-text
  }

  // 策略5: 兄弟元素定位
  function getSiblingBasedSelector(element) {
    const sibling = element.previousElementSibling;
    if (!sibling) return null;

    // 查找前面有特征的兄弟元素
    let prevSibling = sibling;
    let attempts = 0;
    while (prevSibling && attempts < 3) {
      const siblingSelector = getFeatureSelector(prevSibling);
      if (siblingSelector && isUniqueSelector(siblingSelector)) {
        const elementSelector = getBaseSelector(element);
        const combined = siblingSelector + ' + ' + elementSelector;
        if (isUniqueSelector(combined)) return combined;
      }
      prevSibling = prevSibling.previousElementSibling;
      attempts++;
    }

    return null;
  }

  // 获取元素的特征选择器（用于父元素或兄弟元素）
  function getFeatureSelector(element) {
    if (!element || element === document.body) return null;

    // ID 优先
    if (element.id) {
      return '#' + CSS.escape(element.id);
    }

    // 有特征的属性
    for (const attr of ['data-testid', 'data-test', 'name', 'role', 'aria-label']) {
      const value = element.getAttribute(attr);
      if (value) {
        return element.tagName.toLowerCase() + '[' + attr + '="' + CSS.escape(value) + '"]';
      }
    }

    // 唯一的类名选择器
    const classes = filterUsefulClasses(element);
    if (classes.length > 0) {
      classes.sort((a, b) => b.length - a.length);
      const selector = element.tagName.toLowerCase() + '.' + CSS.escape(classes[0]);
      if (isUniqueSelector(selector)) return selector;
    }

    return null;
  }

  function getBaseSelector(element) {
    let selector = element.tagName.toLowerCase();
    const classes = filterUsefulClasses(element);
    if (classes.length > 0) {
      // 按长度排序，取最具体的类名
      classes.sort((a, b) => b.length - a.length);
      selector += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
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

  // 策略6: 智能父子组合选择器
  function buildComposedSelector(element, maxDepth = 3) {
    const parts = [];
    let current = element;
    let depth = 0;

    // 先尝试元素自身的选择器
    const selfSelector = getBestClassSelector(element);
    if (selfSelector && isUniqueSelector(selfSelector)) {
      return selfSelector;
    }

    // 向上查找有特征的祖先
    while (current && current !== document.body && depth < maxDepth) {
      const featureSelector = getFeatureSelector(current);
      if (featureSelector) {
        parts.unshift(featureSelector);
        const combined = parts.join(' > ');
        // 添加当前元素的类名选择器
        const elementSelector = depth === 0 ? getBaseSelector(element) : getBaseSelector(current);
        const fullSelector = combined + (depth > 0 ? '' : ' > ' + elementSelector);
        if (isUniqueSelector(fullSelector)) {
          return fullSelector;
        }
      } else {
        // 如果没有特征选择器，使用基本选择器
        const baseSelector = getBaseSelector(current);
        const selector = makeUniqueWithNth(current, baseSelector);
        parts.unshift(selector);

        const fullSelector = parts.join(' > ');
        if (isUniqueSelector(fullSelector)) {
          return fullSelector;
        }
      }

      current = current.parentElement;
      depth++;
    }

    if (parts.length > 0) {
      return parts.join(' > ');
    }

    return null;
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

  // 优化后的主选择器生成函数
  function getSelectorInternal(element) {
    if (selectorCache.has(element)) {
      return selectorCache.get(element);
    }

    let result = null;
    const root = element.getRootNode();

    // 策略1: ID 选择器（最高优先级）
    if (element.id) {
      const selector = '#' + CSS.escape(element.id);
      try {
        if (root.querySelectorAll(selector).length === 1) result = selector;
      } catch (e) {}
    }

    // 策略2: 多属性组合选择器
    if (!result) {
      result = getMultiAttributeSelector(element);
    }

    // 策略3: 属性 + 类名组合
    if (!result) {
      result = getAttributeClassComboSelector(element);
    }

    // 策略4: 智能类名选择
    if (!result) {
      result = getBestClassSelector(element);
    }

    // 策略5: 兄弟元素定位
    if (!result) {
      result = getSiblingBasedSelector(element);
    }

    // 策略6: 智能父子组合
    if (!result) {
      result = buildComposedSelector(element);
    }

    // 策略7: 基本类名 + nth-child
    if (!result) {
      const baseSelector = getBaseSelector(element);
      const uniqueSelector = makeUniqueWithNth(element, baseSelector);
      try {
        if (root.querySelectorAll(uniqueSelector).length === 1) result = uniqueSelector;
      } catch (e) {}
    }

    // 策略8: 路径选择器（兜底）
    if (!result) {
      const pathSelector = buildUniquePath(element);
      if (pathSelector) result = pathSelector;
    }

    // 最终兜底
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

  // ============ 录制核心逻辑 ============
  function recordStep(action, data) {
    // 检查是否暂停录制或已停止
    // 注意：xyzActive 可能是 undefined（在 iframe 中），所以只检查明确为 false 的情况
    if (window.xyzActive === false || window.xyzPaused || window.xyzStopped) return;

    // 检查当前会话是否是最新的
    // 由于 addInitScript 是累积的，旧的监听器可能会继续工作
    // 通过比较时间戳来确保只有最新的会话记录事件
    const currentTimestamp = parseInt((window.xyzSessionId || '').replace('recorder-', '')) || 0;
    if (thisTimestamp > 0 && currentTimestamp > thisTimestamp) return;

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

    if (action === 'keyboard') {
      delete step.selector;
      delete step.xpath;
      delete step.elementInfo;
      // 复制键盘事件相关属性
      step.key = data.key;
      step.code = data.code;
      step.ctrlKey = data.ctrlKey;
      step.metaKey = data.metaKey;
      step.altKey = data.altKey;
      step.shiftKey = data.shiftKey;
    }

    syncStep(step);
  }

  document.addEventListener('click', (e) => {
    const path = e.composedPath();
    const element = path[0] || e.target;

    if (isInPanel(element)) {
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

    // 非隐藏模式下添加标记
    if (!HIDE_UI && !isInIframe && typeof addMarker === 'function') {
      addMarker(element, 'default');
    }
  }, true);

  document.addEventListener('input', (e) => {
    const element = e.target;
    if (!element || !element.tagName) return;
    if (isInPanel(element)) return;

    // Skip checkbox, radio, and select - they are handled by click and change events
    if (element.tagName === 'SELECT') return;
    const inputType = (element.type || '').toLowerCase();
    if (inputType === 'checkbox' || inputType === 'radio') return;

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
  }, true);  // capture phase

  // Also listen in bubbling phase to catch programmatically dispatched events
  document.addEventListener('input', (e) => {
    const element = e.target;
    if (!element || !element.tagName) return;
    if (isInPanel(element)) return;

    // Skip checkbox, radio, and select - they are handled by click and change events
    if (element.tagName === 'SELECT') return;
    const inputType = (element.type || '').toLowerCase();
    if (inputType === 'checkbox' || inputType === 'radio') return;

    const selector = getSelector(element);
    const value = element.value;

    // Only process if not already processed in capture phase
    if (lastFillSelector === selector && lastFillValue === value) {
      return;
    }

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
  }, false);  // bubbling phase

  // 标记事件监听器已注册
  window.xyzHasInputListener = true;

  document.addEventListener('change', (e) => {
    const element = e.target;
    if (!element || element.tagName !== 'SELECT') return;
    if (isInPanel(element)) return;

    recordStep('select', {
      selector: getSelector(element),
      xpath: getXPath(element),
      value: element.value,
      elementInfo: getElementInfo(element)
    });
  }, true);

  document.addEventListener('keydown', (e) => {
    const element = document.activeElement;
    console.log('[Recorder] keydown event:', e.key, 'target:', e.target, 'activeElement:', element?.tagName);
    if (isInPanel(element)) return;

    const specialKeys = ['Enter', 'Tab', 'Escape', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

    if (specialKeys.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) {
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !specialKeys.includes(e.key)) {
        return;
      }

      console.log('[Recorder] Recording keyboard step:', e.key);
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
      syncStepDirect({
        id: 'step-' + Date.now(),
        timestamp: Date.now(),
        action: 'fill',
        selector: lastFillSelector,
        value: lastFillValue
      });
    }
    syncStepDirect({
      id: 'step-' + Date.now(),
      timestamp: Date.now(),
      action: 'navigate',
      value: window.location.href
    });
  });

  window.xyzFlushPending = function() {
    if (lastFillSelector && lastFillValue) {
      recordStep('fill', { selector: lastFillSelector, value: lastFillValue });
      lastFillSelector = null;
      lastFillValue = '';
    }
    if (fillTimeout) {
      clearTimeout(fillTimeout);
      fillTimeout = null;
    }
  };

  // ============ UI 部分（仅在非隐藏模式下创建）============
  if (!isInIframe && !HIDE_UI) {
    let _animationFrameId = null;
    let _highlightRafId = null;
    let _toolbarHideTimeout = null;
    let _pollInterval = null;
    let _checkPanelInterval = null;

    // 关闭面板函数（暴露给外部调用）
    window.xyzClose = function() {
      if (_animationFrameId) {
        cancelAnimationFrame(_animationFrameId);
        _animationFrameId = null;
      }

      if (_highlightRafId) {
        cancelAnimationFrame(_highlightRafId);
        _highlightRafId = null;
      }

      clearTimeout(_toolbarHideTimeout);

      if (_pollInterval) {
        clearInterval(_pollInterval);
        _pollInterval = null;
      }

      if (_checkPanelInterval) {
        clearInterval(_checkPanelInterval);
        _checkPanelInterval = null;
      }

      const elements = [
        document.getElementById('xyzPnl'),
        document.getElementById('xyzMk'),
        document.getElementById('xyzCv'),
        document.getElementById('xyzSh'),
        document.getElementById('xyzTb'),
        document.getElementById('xyzSt')
      ];

      elements.forEach(el => {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });

      window.xyzInited = false;
      window.xyzQueue = [];
      console.log('[Panel] closed');
    };

    // 检查录制会话是否已停止
    if (window.xyzStopped) {
      console.log('[Panel] Session was stopped, skipping panel creation');
      return;
    }

    // 检查录制会话是否激活
    if (!window.xyzActive) {
      console.log('[Panel] Session not active, skipping panel creation');
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

    function addMarker(element, type) {
      if (!element || markedElements.has(element)) return;
      const markersContainer = document.getElementById('xyzMk');
      if (!markersContainer) return;

      const marker = document.createElement('div');
      marker.className = 'xyzMrk' + (type !== 'default' ? ' ' + type : '');
      markersContainer.appendChild(marker);
      markedElements.set(element, { marker, type });

      const rect = element.getBoundingClientRect();
      marker.style.left = rect.left + 'px';
      marker.style.top = rect.top + 'px';
      marker.style.width = rect.width + 'px';
      marker.style.height = rect.height + 'px';
      marker.style.display = 'block';
    }

    function createRecorderOverlay() {
      if (!document.body) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', createRecorderOverlay);
        } else {
          setTimeout(createRecorderOverlay, 10);
        }
        return;
      }

      const existingPanel = document.getElementById('xyzPnl');

      // 检查并创建样式
      let style = document.getElementById('xyzSt');
      if (!style) {
        style = document.createElement('style');
        style.id = 'xyzSt';
        style.textContent = `
        .xyzPnl { position: fixed; right: 20px; top: 20px; width: 320px; background: white; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 2147483647; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .xyzPnl-hdr { padding: 12px 15px; background: #333; color: white; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none; }
        .xyzPnl-hdr h3 { font-size: 14px; font-weight: 500; margin: 0; }
        .xyzPnl-hdr button { padding: 4px 10px; font-size: 12px; border: none; border-radius: 4px; cursor: pointer; background: #555; color: white; }
        .xyzPnl-hdr button:hover { background: #666; }
        .xyzPnl-bdy { flex: 1; overflow-y: auto; padding: 10px; max-height: 400px; }
        .xyzStp { padding: 8px 10px; border-radius: 4px; margin-bottom: 6px; background: #f5f5f5; font-size: 12px; border-left: 3px solid #4CAF50; position: relative; }
        .xyzStp.click { border-left-color: #4CAF50; }
        .xyzStp.fill { border-left-color: #2196F3; }
        .xyzStp.select { border-left-color: #FF9800; }
        .xyzStp.link_click { border-left-color: #9C27B0; }
        .xyzStp.navigate { border-left-color: #607D8B; }
        .xyzStp.annotate { border-left-color: #E91E63; }
        .xyzStp .action { font-weight: 500; color: #333; }
        .xyzStp .selector { color: #666; word-break: break-all; margin-top: 4px; font-size: 11px; }
        .xyzStp .value { color: #888; margin-top: 2px; font-size: 11px; }
        .xyzStp .annotation { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-top: 4px; background: #E8F5E9; color: #388E3C; }
        .xyzStp.selected { background: #e3f2fd; border-left-color: #2196F3; }
        .xyzStp:hover { background: #f0f0f0; }
        .xyzStp.selected:hover { background: #e3f2fd; }
        .xyzDelBtn { position: absolute; right: 8px; bottom: 8px; padding: 2px 6px; font-size: 12px; border: none; border-radius: 3px; background: #ffebee; cursor: pointer; opacity: 0.8; }
        .xyzDelBtn:hover { background: #ffcdd2; opacity: 1; }
        .xyzEmpty { color: #999; text-align: center; padding: 20px; font-size: 13px; }
        .xyzStatus { padding: 8px 15px; background: #f0f0f0; font-size: 11px; color: #666; border-top: 1px solid #eee; }
        .xyzPnl-tools { padding: 8px 10px; background: #fafafa; border-top: 1px solid #eee; }
        .xyzTools-label { font-size: 11px; color: #666; margin-bottom: 6px; font-weight: 500; }
        .xyzTools-list { display: flex; flex-wrap: wrap; gap: 4px; }
        .xyzTools-list .tool-btn { padding: 4px 8px; font-size: 10px; border: 1px solid #ddd; border-radius: 3px; background: white; cursor: pointer; transition: all 0.2s; }
        .xyzTools-list .tool-btn:hover { background: #f0f0f0; border-color: #bbb; }
        .xyzTools-list .tool-btn:active { transform: scale(0.95); }
        #xyzCollapse { padding: 4px 8px; font-size: 14px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer; background: #555; color: white; margin-right: 5px; }
        #xyzCollapse:hover { background: #666; }
        .xyzSh { position: absolute; pointer-events: none; border: 2px solid #4CAF50; background: rgba(76, 175, 80, 0.1); border-radius: 4px; z-index: 2147483646; transition: all 0.2s ease-out; will-change: transform, width, height; }
        .xyzSh.login { border-color: #2196F3; background: rgba(33, 150, 243, 0.1); }
        .xyzSh.data { border-color: #FF9800; background: rgba(255, 152, 0, 0.1); }
        .xyzSh.pagination { border-color: #9C27B0; background: rgba(156, 39, 176, 0.1); }
        .xyzTb { position: absolute; z-index: 2147483647; background: white; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); padding: 4px; display: flex; gap: 2px; pointer-events: auto; }
        .xyzTb.horizontal { flex-direction: row; }
        .xyzTb.vertical { flex-direction: column; }
        .xyzTb button { padding: 5px 8px; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; white-space: nowrap; pointer-events: auto; }
        .xyzTb button:hover { transform: scale(1.02); }
        .xyzTb .btn-login { background: #E3F2FD; color: #1976D2; }
        .xyzTb .btn-data { background: #FFF3E0; color: #F57C00; }
        .xyzTb .btn-page { background: #F3E5F5; color: #7B1FA2; }
        .xyzTb .btn-note { background: #E8F5E9; color: #388E3C; }
        .xyzTb .btn-wait { background: #FFF8E1; color: #F9A825; }
        .xyzTb .btn-container { background: #E0F7FA; color: #00838F; }
        .xyzTb .btn-item { background: #FFF3E0; color: #F57C00; }
        .xyzTb .btn-check { background: #E8F5E9; color: #2E7D32; }
        .xyzMk { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483645; }
        .xyzMrk { position: absolute; pointer-events: none; border: 2px solid rgba(76, 175, 80, 0.6); border-radius: 4px; transition: all 0.2s ease-out; }
        .xyzMrk.login { border-color: rgba(33, 150, 243, 0.8); }
        .xyzMrk.data { border-color: rgba(255, 152, 0, 0.8); }
        .xyzMrk.pagination { border-color: rgba(156, 39, 176, 0.8); }
        .xyzMrk.custom { border-color: rgba(76, 175, 80, 0.8); }
        #xyzCv { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483644; }
      `;
        (document.head || document.documentElement).appendChild(style);
      }

      if (existingPanel) {
        return;
      }

      const panel = document.createElement('div');
      panel.className = 'xyzPnl';
      panel.id = 'xyzPnl';
      panel.setAttribute('aria-hidden', 'true');
      panel.innerHTML = `
        <div class="xyzPnl-hdr">
          <h3>📝 Recorder</h3>
          <div>
            <button id="xyzCollapse">−</button>
            <button id="xyzClear">Clear</button>
          </div>
        </div>
        <div class="xyzPnl-bdy" id="xyzSteps">
          <div class="xyzEmpty">No steps recorded yet</div>
        </div>
        <div class="xyzPnl-tools" id="xyzTools">
          <div class="xyzTools-label">+ Tool:</div>
          <div class="xyzTools-list">
            <button class="tool-btn" data-tool="wait_element">⏳ Wait</button>
            <button class="tool-btn" data-tool="data_container">📦 Container</button>
            <button class="tool-btn" data-tool="data_item">📊 Item</button>
            <button class="tool-btn" data-tool="pagination">📄 Page</button>
            <button class="tool-btn" data-tool="login_check">🔐 Login</button>
            <button class="tool-btn" data-tool="checkpoint">✅ Check</button>
            <button class="tool-btn" data-tool="custom">📝 Note</button>
          </div>
        </div>
        <div class="xyzStatus" id="xyzStatus">Steps: 0</div>
      `;
      document.body.appendChild(panel);
      panelElement = panel;

      // Panel collapse functionality
      let isCollapsed = false;
      let autoScroll = true;
      const collapseBtn = document.getElementById('xyzCollapse');
      const panelBody = document.getElementById('xyzSteps');
      const panelTools = document.getElementById('xyzTools');
      const panelStatus = document.getElementById('xyzStatus');

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

      // Prevent scroll penetration
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
            const steps = window.xyzQueue || [];
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

      const header = panel.querySelector('.xyzPnl-hdr');
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
            localStorage.setItem('xyzPnl-pos', JSON.stringify({
              left: panel.style.left,
              top: panel.style.top
            }));
          } catch(e) {}
        }
      });

      // Restore saved position
      try {
        const savedPos = localStorage.getItem('xyzPnl-pos');
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
      markersContainer.className = 'xyzMk';
      markersContainer.id = 'xyzMk';
      markersContainer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(markersContainer);

      const canvas = document.createElement('canvas');
      canvas.id = 'xyzCv';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);

      const shadowBox = document.createElement('div');
      shadowBox.className = 'xyzSh';
      shadowBox.id = 'xyzSh';
      shadowBox.style.display = 'none';
      shadowBox.setAttribute('aria-hidden', 'true');
      document.body.appendChild(shadowBox);

      const toolbar = document.createElement('div');
      toolbar.className = 'xyzTb';
      toolbar.id = 'xyzTb';
      toolbar.setAttribute('aria-hidden', 'true');
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

      function updateUI() {
        const container = document.getElementById('xyzSteps');
        const status = document.getElementById('xyzStatus');
        if (!container || !status) return;

        const steps = window.xyzQueue || [];
        status.textContent = 'Steps: ' + steps.length;

        if (steps.length === 0) {
          container.innerHTML = '<div class="xyzEmpty">No steps recorded yet</div>';
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

          return '<div class="xyzStp ' + action + (isSelected ? ' selected' : '') + '" data-step-id="' + stepId + '">' +
            '<div class="action">' + action.toUpperCase() + '</div>' +
            (selector ? '<div class="selector">' + selector + '</div>' : '') +
            (value && !['trajectory', 'scroll', 'resize', 'link_click'].includes(action) ? '<div class="value">"' + value.slice(0, 30) + (value.length > 30 ? '...' : '') + '"</div>' : '') +
            extra +
            (hasAnnotation ? '<span class="annotation">🏷️ ' + step.annotation.label + '</span>' : '') +
            (isSelected ? '<button class="xyzDelBtn" data-step-id="' + stepId + '" title="Delete step">🗑️</button>' : '') +
          '</div>';
        }).join('');

        // Click to select step
        container.querySelectorAll('.xyzStp').forEach(stepEl => {
          stepEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('xyzDelBtn')) return;

            const stepId = stepEl.dataset.stepId;
            currentStepId = stepId;
            updateUI();
          });
        });

        // Delete button click
        container.querySelectorAll('.xyzDelBtn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const stepId = btn.dataset.stepId;
            deleteStep(stepId);
          });
        });

        if (typeof autoScroll !== 'undefined' && autoScroll) {
          container.scrollTop = container.scrollHeight;
        }
      }

      function addToolAnnotation(stepId, toolType) {
        if (!stepId) {
          stepId = currentStepId;
          if (!stepId) {
            const steps = window.xyzQueue || [];
            if (steps.length > 0) {
              stepId = steps[steps.length - 1].id;
            } else {
              return;
            }
          }
        }

        const steps = window.xyzQueue || [];
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

        const result = pushEvent({ type: 'update', id: stepId, data: { annotation } });

        if (result.success) {
          if (typeof window[window.xyzBindingName || 'xyzTrack'] === 'function') {
            try {
              window[window.xyzBindingName || 'xyzTrack'](JSON.stringify({ action: 'xyzUpdate', id: stepId, data: { annotation } }));
            } catch (e) {}
          }

          updateUI();
        }
      }

      function deleteStep(stepId) {
        if (!stepId) return;

        const result = pushEvent({ type: 'delete', id: stepId });

        if (result.success) {
          if (typeof window[window.xyzBindingName || 'xyzTrack'] === 'function') {
            try {
              window[window.xyzBindingName || 'xyzTrack'](JSON.stringify({ action: 'xyzDelete', id: stepId }));
            } catch (e) {}
          }

          currentStepIndex = -1;
          currentStepId = null;

          updateUI();
        }
      }

      window.addEventListener('xyzEvt', function(e) {
        window.xyzQueue = e.detail;
        updateUI();
      });

      if (typeof window[window.xyzBindingName || 'xyzTrack'] === 'function') {
        window[window.xyzBindingName || 'xyzTrack']('');
      }

      document.getElementById('xyzClear').addEventListener('click', function() {
        window.xyzQueue = [];
        document.getElementById('xyzMk').innerHTML = '';
        markedElements.clear();
        annotations.clear();
        updateUI();
        if (typeof window[window.xyzBindingName || 'xyzTrack'] === 'function') {
          try { window[window.xyzBindingName || 'xyzTrack'](JSON.stringify({ action: 'xyzClear' })); } catch (e) {}
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
        shadowBox.className = 'xyzSh' + (annotation ? ' ' + annotation.type : '');
      }

      function calculateToolbarPosition(rect) {
        const GAP = 10;
        const TOOLBAR_W = 280;
        const TOOLBAR_H = 32;
        const scrollX = window.scrollX, scrollY = window.scrollY;

        let left = mouseX + GAP;
        let top = mouseY + GAP;

        if (left + TOOLBAR_W > window.innerWidth - 10) {
          left = mouseX - TOOLBAR_W - GAP;
        }
        if (top + TOOLBAR_H > window.innerHeight - 10) {
          top = mouseY - TOOLBAR_H - GAP;
        }

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
        toolbar.className = 'xyzTb ' + pos.orientation;
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
        addMarker(element, type);

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
        if (isInPanel(element)) {
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
        const points = mousePath;
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
          if (typeof window[window.xyzBindingName || 'xyzTrack'] === 'function') {
            window[window.xyzBindingName || 'xyzTrack'](JSON.stringify({ action: 'xyzPoll' }));
          }
        }, 500);
      }

      startPolling();
    }

    // 延迟创建面板
    setTimeout(() => {
      if (window.xyzStopped) {
        console.log('[Panel] Session was stopped during init, skipping panel creation');
        return;
      }
      if (!window.xyzActive) {
        console.log('[Panel] Session not active during init, skipping panel creation');
        return;
      }
      createRecorderOverlay();
    }, 0);

    // 监听页面变化
    let lastUrl = window.location.href;
    _checkPanelInterval = setInterval(() => {
      if (window.xyzStopped) {
        console.log('[Panel] Session was stopped, removing panel');
        if (typeof window.xyzClose === 'function') {
          window.xyzClose();
        }
        clearInterval(_checkPanelInterval);
        _checkPanelInterval = null;
        return;
      }

      if (!window.xyzActive) {
        clearInterval(_checkPanelInterval);
        _checkPanelInterval = null;
        return;
      }

      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
      }

      const panel = document.getElementById('xyzPnl');
      const style = document.getElementById('xyzSt');
      if (document.body && (!panel || !style)) {
        createRecorderOverlay();
      }
    }, 1000);
  }
})();
