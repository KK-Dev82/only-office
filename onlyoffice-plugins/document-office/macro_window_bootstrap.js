// Bootstrap for Macro Window (opened via ShowWindow)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.state = DO.state || {};
  DO.state._macroWin = DO.state._macroWin || { inited: false };
  var PLUGIN_GUID = "asc.{C6A86F5A-5A0F-49F8-9E72-9E8E1E2F86A1}";
  var STORAGE_KEY = "do:v1:macroWindowId";

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

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  function safeInit() {
    if (DO.state._macroWin.inited) return;
    DO.state._macroWin.inited = true;
    try {
      try {
        DO.setText("pluginVersion", "v" + DO.VERSION);
      } catch (e0) {}

      mergeOptions(tryReadInjectedOptions());
      DO.initLocalData();

      // Bind UI even if Asc.plugin.init is never called
      try {
        if (DO.features && DO.features.macrosWindow) {
          DO.features.macrosWindow.bind();
        }
      } catch (eBind) {}

      DO.setStatus("ready");
      DO.debugLog("macro_window_ready", { version: DO.VERSION });
    } catch (e) {
      try {
        DO.debugLog("macro_window_init_failed", { error: String(e) });
      } catch (e2) {}
    }
  }

  window.Asc.plugin.init = function () {
    safeInit();
  };

  // Ensure system window controls (X / built-in buttons) only close THIS window
  window.Asc.plugin.button = function (id, windowID) {
    try {
      if (DO.features && DO.features.macrosWindow && typeof DO.features.macrosWindow.closeWindow === "function") {
        DO.features.macrosWindow.closeWindow();
        return;
      }
    } catch (e0) {}
    try {
      // Avoid closing whole plugin; prefer CloseWindow for this windowID
      if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
        var wid = String(windowID || "");
        if (!wid) {
          try { wid = String(localStorage.getItem(STORAGE_KEY) || ""); } catch (e2) {}
        }
        if (wid) window.Asc.plugin.executeMethod("CloseWindow", [wid]);
        return;
      }
    } catch (e1) {}
  };

  window.Asc.plugin.onClose = function () {
    try {
      if (DO.features && DO.features.macrosWindow && typeof DO.features.macrosWindow.closeWindow === "function") {
        DO.features.macrosWindow.closeWindow();
      }
    } catch (e0) {}
  };

  // Defensive fallback init
  try {
    document.addEventListener("DOMContentLoaded", function () {
      try {
        // Run immediately (bindings should be ready before user clicks)
        safeInit();
        // Also call Asc.plugin.init (some builds expect it for window buttons)
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

