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
    var self = this;
    this.addEventListener('load', function() {
      var url = self.__captureUrl || '';
      if (!_filter || url.indexOf(_filter) !== -1) {
        var body = self.responseText;
        try { body = JSON.parse(body); } catch(e) {}
        _captured.push({ type:'xhr', url:url, method:self.__captureMethod, status:self.status, body:body, ts:Date.now() });
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
