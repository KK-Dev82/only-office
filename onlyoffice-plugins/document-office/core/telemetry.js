// Telemetry/logs: send messages to host + output panel
(function () {
  var DO = (window.DO = window.DO || {});
  DO.state = DO.state || {};

  function _canSendNow() {
    try {
      var p = window.Asc && window.Asc.plugin;
      if (!p) return false;
      return (
        typeof p.executeMethod === "function" ||
        typeof p.sendToExternalPlugin === "function" ||
        typeof p.sendToExternalMessage === "function" ||
        typeof p.sendExternalMessage === "function" ||
        typeof p.sendToPlugin === "function"
      );
    } catch (e) {
      return false;
    }
  }

  function _flushSendQueue() {
    try {
      DO.state._sendToHostFlushTimer = 0;
      if (!DO.state._sendToHostQueue || !DO.state._sendToHostQueue.length) return;
      if (!_canSendNow()) {
        // retry later
        DO.state._sendToHostFlushTimer = setTimeout(_flushSendQueue, 250);
        return;
      }
      var q = DO.state._sendToHostQueue;
      DO.state._sendToHostQueue = [];
      for (var i = 0; i < q.length; i++) {
        try {
          DO.sendToHost(q[i]);
        } catch (e0) {}
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
      var p = window.Asc && window.Asc.plugin;
      if (!p) {
        _enqueue(message);
        return false;
      }

      // Primary: official way in many DocumentServer builds
      if (typeof p.executeMethod === "function") {
        try {
          p.executeMethod("SendExternalMessage", [message]);
          return true;
        } catch (eExec) {
          // Some builds have executeMethod but not this method. Fall through to enqueue + retry.
        }
        return true;
      }

      // Fallbacks: some builds expose direct helpers instead of executeMethod
      if (typeof p.sendToExternalPlugin === "function") {
        p.sendToExternalPlugin(message);
        return true;
      }
      if (typeof p.sendToExternalMessage === "function") {
        p.sendToExternalMessage(message);
        return true;
      }
      if (typeof p.sendExternalMessage === "function") {
        p.sendExternalMessage(message);
        return true;
      }
      if (typeof p.sendToPlugin === "function") {
        p.sendToPlugin(message);
        return true;
      }
    } catch (e) {}

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
        // eslint-disable-next-line no-console
        console.warn("[DocumentOfficePlugin] sendToHost_unavailable (throttled)", {
          fails: DO.state._sendToHostFailCount,
          sample: message && message.type ? String(message.type) : typeof message,
        });
      }
    } catch (e2) {}
    return false;
  };

  DO.debugLog = function (event, detail) {
    if (!DO.DEBUG) return;
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
      // eslint-disable-next-line no-console
      console.log("[DocumentOfficePlugin]", event, detail);
    } catch (e3) {}
  };
})();

