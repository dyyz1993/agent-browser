(function() {
  if (window.__xhrCaptureActive) return;
  window.__xhrCaptureActive = true;
  var _captured = [];
  var _filter = '__FILTER__';
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__captureUrl = url;
    this.__captureMethod = method;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', () => {
      var url = this.__captureUrl || '';
      if (!_filter || url.indexOf(_filter) !== -1) {
        var body = this.responseText;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        try { body = JSON.parse(body); } catch(e) { /* empty */ }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _captured.push({ type:'xhr', url:url, method:this.__captureMethod, status:this.status, body:body, ts:Date.now() });
      }
    });
    return origSend.apply(this, arguments);
  };
  window.__getXhrCapture = function() {
    return JSON.parse(JSON.stringify(_captured));
  };
  window.__clearXhrCapture = function() {
    _captured = [];
  };
  window.__xhrCaptureCount = function() {
    return _captured.length;
  };
})();
