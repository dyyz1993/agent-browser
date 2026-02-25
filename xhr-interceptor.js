window.__interceptedResponses = [];

const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url) {
  this._url = url;
  this._method = method;
  return originalOpen.apply(this, arguments);
};

XMLHttpRequest.prototype.send = function() {
  const xhr = this;
  this.addEventListener("load", function() {
    if (xhr._url && xhr._url.includes("aweme/post")) {
      try {
        const data = JSON.parse(xhr.responseText);
        window.__interceptedResponses.push({
          url: xhr._url,
          method: xhr._method,
          status: xhr.status,
          data: data
        });
      } catch(e) {
        console.error("Failed to parse response:", e);
      }
    }
  });
  return originalSend.apply(this, arguments);
};

"XHR interceptor installed successfully";
