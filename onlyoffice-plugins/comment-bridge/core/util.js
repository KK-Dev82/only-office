(function () {
  var CB = (window.CB = window.CB || {});

  CB.$ = function (id) {
    try {
      return document.getElementById(id);
    } catch (e) {
      return null;
    }
  };

  CB.setStatus = function (text) {
    try {
      var el = CB.$("status");
      if (el) el.textContent = String(text == null ? "" : text);
    } catch (e) {}
  };

  CB.setOutput = function (obj) {
    try {
      var el = CB.$("output");
      if (!el) return;
      el.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    } catch (e) {}
  };

  CB.appendOutputLine = function (line) {
    try {
      var el = CB.$("output");
      if (!el) return;
      var ts = new Date().toISOString();
      el.textContent = (el.textContent ? el.textContent + "\n" : "") + "[" + ts + "] " + String(line);
    } catch (e) {}
  };
})();

