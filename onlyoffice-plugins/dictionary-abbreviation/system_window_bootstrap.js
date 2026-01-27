// Bootstrap for System Window (opened via ShowWindow)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.state = DO.state || {};
  DO.state._sysWin = DO.state._sysWin || { inited: false };

  function tryReadInjectedOptions() {
    try {
      var info = window.Asc && window.Asc.plugin && window.Asc.plugin.info;
      if (info && info.options) return info.options;
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.options) return window.Asc.plugin.options;
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.initData) return window.Asc.plugin.initData;
    } catch (e) {}
    return null;
  }

  function mergeOptions(injected) {
    if (!injected || typeof injected !== "object") return;
    DO.pluginOptions = DO.pluginOptions || {};
    for (var k in injected) DO.pluginOptions[k] = injected[k];
  }

  function safeInit() {
    if (DO.state._sysWin.inited) return;
    DO.state._sysWin.inited = true;
    try {
      try {
        DO.setText("pluginVersion", "v" + DO.VERSION);
      } catch (e0) {}

      mergeOptions(tryReadInjectedOptions());

      // Bind UI even if Asc.plugin.init is never called
      try {
        if (DO.features && DO.features.systemWindow && typeof DO.features.systemWindow.bind === "function") {
          DO.features.systemWindow.bind();
        }
      } catch (eBind) {}

      try { if (DO.setStatus) DO.setStatus("ready"); } catch (e1) {}
      try { if (DO.debugLog) DO.debugLog("sys_window_ready", { version: DO.VERSION }); } catch (e2) {}
    } catch (e) {
      try { if (DO.debugLog) DO.debugLog("sys_window_init_failed", { error: String(e) }); } catch (e2) {}
    }
  }

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  window.Asc.plugin.init = function () {
    safeInit();
  };

  // Ensure system window controls only close THIS window
  window.Asc.plugin.button = function (_id, windowID) {
    try {
      if (DO.features && DO.features.systemWindow && typeof DO.features.systemWindow.closeWindow === "function") {
        DO.features.systemWindow.closeWindow(windowID);
        return;
      }
    } catch (e0) {}
    try {
      if (windowID && window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
        window.Asc.plugin.executeMethod("CloseWindow", [String(windowID)]);
      }
    } catch (e1) {}
  };

  window.Asc.plugin.onClose = function () {
    try {
      if (DO.features && DO.features.systemWindow && typeof DO.features.systemWindow.closeWindow === "function") {
        DO.features.systemWindow.closeWindow();
      }
    } catch (e0) {}
  };

  // Defensive fallback init
  try {
    document.addEventListener("DOMContentLoaded", function () {
      try {
        safeInit();
        setTimeout(function () {
          try {
            if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.init === "function") {
              window.Asc.plugin.init();
            }
          } catch (e2) {}
        }, 60);
      } catch (e1) {}
    });
  } catch (e) {}
})();

