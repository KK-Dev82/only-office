// Telemetry/logs: send messages to host + output panel
(function () {
  var DO = (window.DO = window.DO || {});

  DO.sendToHost = function (message) {
    try {
      var p = window.Asc && window.Asc.plugin;
      if (!p) return false;

      // Primary: official way in many DocumentServer builds
      if (typeof p.executeMethod === "function") {
        p.executeMethod("SendExternalMessage", [message]);
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
    try {
      // eslint-disable-next-line no-console
      console.warn("[DocumentOfficePlugin] sendToHost_unavailable", message);
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

