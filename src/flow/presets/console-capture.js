(function() {
  if (window.__consoleCaptureActive) return;
  window.__consoleCaptureActive = true;
  var _captured = [];
  var origLog = console.log;
  var origWarn = console.warn;
  var origError = console.error;
  var origInfo = console.info;
  function captureArgs(level, args) {
    var msg = Array.prototype.slice.call(args).map(function(a) {
      if (typeof a === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        try { return JSON.stringify(a); } catch(e) { return String(a); }
      }
      return String(a);
    }).join(' ');
    _captured.push({ level: level, message: msg, ts: Date.now() });
  }
  console.log = function() { captureArgs('log', arguments); origLog.apply(console, arguments); };
  console.warn = function() { captureArgs('warn', arguments); origWarn.apply(console, arguments); };
  console.error = function() { captureArgs('error', arguments); origError.apply(console, arguments); };
  console.info = function() { captureArgs('info', arguments); origInfo.apply(console, arguments); };
  window.__getConsoleCapture = function() {
    return JSON.parse(JSON.stringify(_captured));
  };
  window.__clearConsoleCapture = function() {
    _captured = [];
  };
  window.__consoleCaptureCount = function() {
    return _captured.length;
  };
})();
