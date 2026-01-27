// Telemetry/logs: send messages to host + output panel
(function () {
  var DO = (window.DO = window.DO || {});
  DO.state = DO.state || {};
  // Logs are OFF by default. Enable only when explicitly requested.
  // - localStorage: (DO.STORAGE_PREFIX || "do:v1:") + "enableLogs" === "1"
  // - or pluginOptions.enableLogs === true
  var ENABLE_LOGS = false;
  try {
    if (DO && DO.pluginOptions && DO.pluginOptions.enableLogs === true) ENABLE_LOGS = true;
  } catch (e0) {}
  try {
    if (!ENABLE_LOGS) {
      var k = String((DO && DO.STORAGE_PREFIX) || "do:v1:") + "enableLogs";
      ENABLE_LOGS = String(localStorage.getItem(k) || "") === "1";
    }
  } catch (e1) {}
  try {
    DO.DEBUG = !!ENABLE_LOGS;
    DO.isLogsEnabled = function () {
      return !!ENABLE_LOGS;
    };
  } catch (e2) {}

  function _sendDirect(message) {
    try {
      var p = window.Asc && window.Asc.plugin;
      if (!p) return false;

      // Primary: official way in many DocumentServer builds
      if (typeof p.executeMethod === "function") {
        try {
          // Try with object parameter (some builds expect object instead of array)
          var result = p.executeMethod("SendExternalMessage", [message]);
          // Some builds return undefined/null on success, false on failure
          // If no exception thrown, consider it success
          return true;
        } catch (eExec) {
          // Some builds have executeMethod but not this method. Try fallbacks.
          try {
            // Try with object parameter directly
            p.executeMethod("SendExternalMessage", message);
            return true;
          } catch (eExec2) {
            // Continue to fallbacks
          }
        }
      }

      // Fallbacks: some builds expose direct helpers instead of executeMethod
      if (typeof p.sendToExternalPlugin === "function") {
        try {
          p.sendToExternalPlugin(message);
          return true;
        } catch (e1) {}
      }
      if (typeof p.sendToExternalMessage === "function") {
        try {
          p.sendToExternalMessage(message);
          return true;
        } catch (e2) {}
      }
      if (typeof p.sendExternalMessage === "function") {
        try {
          p.sendExternalMessage(message);
          return true;
        } catch (e3) {}
      }
      if (typeof p.sendToPlugin === "function") {
        try {
          p.sendToPlugin(message);
          return true;
        } catch (e4) {}
      }
      // Additional fallback: try window.parent.postMessage if in iframe
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            {
              type: "do:pluginMessage",
              data: message,
            },
            "*"
          );
          return true;
        }
      } catch (e5) {}
    } catch (e) {}
    return false;
  }

  function _flushSendQueue() {
    try {
      DO.state._sendToHostFlushTimer = 0;
      if (!DO.state._sendToHostQueue || !DO.state._sendToHostQueue.length) return;
      var q = DO.state._sendToHostQueue;
      DO.state._sendToHostQueue = [];
      var failed = [];
      for (var i = 0; i < q.length; i++) {
        try {
          if (!_sendDirect(q[i])) failed.push(q[i]);
        } catch (e0) {}
      }
      if (failed.length) {
        DO.state._sendToHostQueue = failed;
        DO.state._sendToHostFlushTimer = setTimeout(_flushSendQueue, 250);
      }
    } catch (e1) {}
  }

  function _enqueue(message) {
    try {
      DO.state._sendToHostQueue = DO.state._sendToHostQueue || [];
      DO.state._sendToHostQueue.push(message);
      // cap queue to avoid memory blow-up if bridge never becomes available
      if (DO.state._sendToHostQueue.length > 200) {
        DO.state._sendToHostQueue = DO.state._sendToHostQueue.slice(-200);
      }
      if (!DO.state._sendToHostFlushTimer) {
        DO.state._sendToHostFlushTimer = setTimeout(_flushSendQueue, 250);
      }
    } catch (e2) {}
  }

  DO.sendToHost = function (message) {
    try {
      if (_sendDirect(message)) {
        // Reset fail count on success
        DO.state._sendToHostFailCount = 0;
        return true;
      }
    } catch (e) {
      try {
        if (ENABLE_LOGS) {
          // eslint-disable-next-line no-console
          console.error("[DocumentOfficePlugin] sendToHost_exception", e);
        }
      } catch (eLog) {}
    }

    // queue and retry: bridge may appear after init/ready
    _enqueue(message);

    // Throttle noisy warnings (prevents UI freeze when host bridge unavailable)
    try {
      var now = Date.now();
      var lastWarn = DO.state._sendToHostLastWarnAt || 0;
      DO.state._sendToHostFailCount = (DO.state._sendToHostFailCount || 0) + 1;
      DO.state._sendToHostLastFailAt = now;
      if (!lastWarn || now - lastWarn > 5000) {
        DO.state._sendToHostLastWarnAt = now;
        // Debug: log what methods are available
        try {
          var p = window.Asc && window.Asc.plugin;
          var availableMethods = [];
          if (p) {
            if (typeof p.executeMethod === "function") availableMethods.push("executeMethod");
            if (typeof p.sendToExternalPlugin === "function") availableMethods.push("sendToExternalPlugin");
            if (typeof p.sendToExternalMessage === "function") availableMethods.push("sendToExternalMessage");
            if (typeof p.sendExternalMessage === "function") availableMethods.push("sendExternalMessage");
            if (typeof p.sendToPlugin === "function") availableMethods.push("sendToPlugin");
          }
          if (ENABLE_LOGS) {
            // eslint-disable-next-line no-console
            console.warn("[DocumentOfficePlugin] sendToHost_unavailable (throttled)", {
              fails: DO.state._sendToHostFailCount,
              sample: message && message.type ? String(message.type) : typeof message,
              availableMethods: availableMethods,
              hasParent: window.parent !== window,
            });
          }
        } catch (eDebug) {
          if (ENABLE_LOGS) {
            // eslint-disable-next-line no-console
            console.warn("[DocumentOfficePlugin] sendToHost_unavailable (throttled)", {
              fails: DO.state._sendToHostFailCount,
              sample: message && message.type ? String(message.type) : typeof message,
            });
          }
        }
      }
    } catch (e2) {}
    return false;
  };

  DO.debugLog = function (event, detail) {
    if (!ENABLE_LOGS) return;
    try {
      DO.appendOutputLine(String(event) + (detail !== undefined ? " " + DO.safeStringify(detail) : ""));
    } catch (e0) {}

    try {
      DO.sendToHost({ type: "do:debug", event: String(event), detail: detail });
    } catch (e1) {}

    try {
      DO.sendToHost({
        type: "do:log",
        level: "info",
        message: String(event),
        detail: detail,
        ts: new Date().toISOString(),
      });
    } catch (e2) {}

    try {
      if (ENABLE_LOGS) {
        // eslint-disable-next-line no-console
        console.log("[DocumentOfficePlugin]", event, detail);
      }
    } catch (e3) {}
  };
})();

