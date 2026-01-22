// Core DOM/util helpers
(function () {
  var DO = (window.DO = window.DO || {});

  DO.$ = function (id) {
    return document.getElementById(id);
  };

  DO.safeStringify = function (obj) {
    try {
      return typeof obj === "string" ? obj : JSON.stringify(obj);
    } catch (e) {
      try {
        return String(obj);
      } catch (e2) {
        return "[unstringifiable]";
      }
    }
  };

  DO.setText = function (id, text) {
    var el = DO.$(id);
    if (el) el.textContent = String(text == null ? "" : text);
  };

  DO.setStatus = function (text) {
    var el = DO.$("status");
    if (el) el.textContent = String(text == null ? "" : text);
  };

  DO.setOutput = function (obj) {
    var el = DO.$("output");
    if (!el) return;
    try {
      el.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    } catch (e) {
      el.textContent = String(obj);
    }
  };

  DO.appendOutputLine = function (line) {
    var el = DO.$("output");
    if (!el) return;
    try {
      var ts = new Date().toISOString();
      el.textContent = (el.textContent ? el.textContent + "\n" : "") + "[" + ts + "] " + String(line);
    } catch (e) {}
  };
})();

