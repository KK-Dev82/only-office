// Telemetry/logs: send messages to host + output panel
(function () {
  var DO = (window.DO = window.DO || {});

  DO.sendToHost = function (message) {
    try {
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
        window.Asc.plugin.executeMethod("SendExternalMessage", [message]);
      }
    } catch (e) {}
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

