// Plugin bootstrap: init, bind UI, attach events
(function () {
  var DO = (window.DO = window.DO || {});

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
    for (var k in injected) {
      DO.pluginOptions[k] = injected[k];
    }
  }

  function bindCoreUi() {
    if (DO.state.uiBound) return;
    DO.state.uiBound = true;

    // version badge
    try {
      DO.setText("pluginVersion", "v" + DO.VERSION);
    } catch (e) {}

    // tabs + debug
    if (DO.ui && DO.ui.bindTabs) DO.ui.bindTabs();
    var toggleDebug = DO.$("toggleDebug");
    if (toggleDebug) toggleDebug.addEventListener("click", function () { DO.ui.toggleDebugPanel(); });
    DO.ui.toggleDebugPanel(DO.state.debugOpen);
  }

  // Basic init
  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  window.Asc.plugin.init = function () {
    try {
      var injected = tryReadInjectedOptions();
      mergeOptions(injected);

      DO.initLocalData();
      bindCoreUi();

      // bind features
      if (DO.features && DO.features.clipboard) {
        DO.features.clipboard.bind();
        DO.features.clipboard.render();
      }

      // attach input helper + fallback token detection
      if (DO.features && DO.features.inputhelper) {
        DO.features.inputhelper.attachEvents();
      }

      DO.setStatus("ready");
      DO.sendToHost({ type: "do:pluginReady", version: DO.VERSION });
      DO.setOutput({
        plugin: "DocumentOffice",
        version: DO.VERSION,
        hasAccessToken: Boolean(DO.pluginOptions.accessToken),
        apiBaseUrl: DO.pluginOptions.apiBaseUrl || "",
      });

      DO.debugLog("plugin_ready", { version: DO.VERSION });
    } catch (e) {
      try {
        DO.debugLog("plugin_init_failed", { error: String(e) });
      } catch (e2) {}
    }
  };

  // Defensive: if init isn't called, still bind minimal UI so user sees something
  try {
    document.addEventListener("DOMContentLoaded", function () {
      try {
        DO.appendOutputLine("dom_ready (script_loaded)");
        bindCoreUi();
      } catch (e) {}
    });
  } catch (e) {}
})();

