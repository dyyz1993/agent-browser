(function() {
  if (window.__flowCaptureActive) return;
  window.__flowCaptureActive = true;
  var _captured = [];
  var _filter = '__FILTER__';
  var origFetch = window.fetch;
  window.fetch = function() {
    var args = Array.prototype.slice.call(arguments);
    var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    return origFetch.apply(this, args).then(function(resp) {
      var ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (!_filter || url.indexOf(_filter) !== -1) {
        if (ct.indexOf('json') !== -1) {
          resp.clone().text().then(function(body) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            try { _captured.push({ type:'fetch', url:url, status:resp.status, body:JSON.parse(body), ts:Date.now() }); } catch(e) { _captured.push({ type:'fetch', url:url, status:resp.status, body:body, ts:Date.now() }); }
          });
        } else if (ct.indexOf('text/event-stream') !== -1) {
          var reader = resp.clone().body.getReader();
          var decoder = new TextDecoder();
          (function pump() {
            reader.read().then(function(result) {
              if (result.done) return;
              var text = decoder.decode(result.value, {stream:true});
              _captured.push({ type:'sse', url:url, data:text, ts:Date.now() });
              pump();
            });
          })();
        }
      }
      return resp;
    });
  };
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
        _captured.push({ type:'xhr', url:url, method:this.__captureMethod, status:this.status, body:body, ts:Date.now() });
      }
    });
    return origSend.apply(this, arguments);
  };
  var OrigES = window.EventSource;
  if (OrigES) {
    window.EventSource = function(url, config) {
      var es = new OrigES(url, config);
      if (!_filter || url.indexOf(_filter) !== -1) {
        es.addEventListener('message', function(e) {
          _captured.push({ type:'sse-event', url:url, data:e.data, ts:Date.now() });
        });
      }
      return es;
    };
    window.EventSource.prototype = OrigES.prototype;
    window.EventSource.prototype.constructor = window.EventSource;
    if (OrigES.CONNECTING !== undefined) window.EventSource.CONNECTING = OrigES.CONNECTING;
    if (OrigES.OPEN !== undefined) window.EventSource.OPEN = OrigES.OPEN;
    if (OrigES.CLOSED !== undefined) window.EventSource.CLOSED = OrigES.CLOSED;
  }
  window.__getFlowCapture = function() {
    return JSON.parse(JSON.stringify(_captured));
  };
  window.__clearFlowCapture = function() {
    _captured = [];
  };
  window.__flowCaptureCount = function() {
    return _captured.length;
  };
})();
