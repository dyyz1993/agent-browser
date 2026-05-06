(function() {
  if (window.__sseCaptureActive) return;
  window.__sseCaptureActive = true;
  var _captured = [];
  var _filter = '__FILTER__';
  var OrigES = window.EventSource;
  if (OrigES) {
    window.EventSource = function(url, config) {
      var es = new OrigES(url, config);
      if (!_filter || url.indexOf(_filter) !== -1) {
        es.addEventListener('message', function(e) {
          var parsed = e.data;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          try { parsed = JSON.parse(e.data); } catch(ex) {}
          _captured.push({ type:'sse-event', url:url, data:parsed, ts:Date.now(), lastEventId: e.lastEventId });
        });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        es.addEventListener('error', function(e) {
          _captured.push({ type:'sse-error', url:url, readyState: es.readyState, ts:Date.now() });
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
  var origFetch = window.fetch;
  window.fetch = function() {
    var args = Array.prototype.slice.call(arguments);
    var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    return origFetch.apply(this, args).then(function(resp) {
      var ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (ct.indexOf('text/event-stream') !== -1) {
        if (!_filter || url.indexOf(_filter) !== -1) {
          var reader = resp.clone().body.getReader();
          var decoder = new TextDecoder();
          (function pump() {
            reader.read().then(function(result) {
              if (result.done) return;
              var text = decoder.decode(result.value, {stream:true});
              var lines = text.split('\n');
              lines.forEach(function(line) {
                if (line.indexOf('data:') === 0) {
                  var data = line.substring(5).trim();
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  try { data = JSON.parse(data); } catch(e) { /* empty */ }
                  _captured.push({ type:'sse-stream', url:url, data:data, ts:Date.now() });
                }
              });
              pump();
            });
          })();
        }
      }
      return resp;
    });
  };
  window.__getSseCapture = function() {
    return JSON.parse(JSON.stringify(_captured));
  };
  window.__clearSseCapture = function() {
    _captured = [];
  };
  window.__sseCaptureCount = function() {
    return _captured.length;
  };
})();
