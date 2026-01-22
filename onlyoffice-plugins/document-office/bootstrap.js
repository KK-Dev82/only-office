// Plugin bootstrap: init, bind UI, attach events
(function () {
  var DO = (window.DO = window.DO || {});
  DO.state = DO.state || {};

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

    // DISABLED: UI/layout + cursor change watchers to prevent UI resizing
    // These watchers cause UI layout changes when inserting text
    // try {
    //   if (DO.startUiWatch) DO.startUiWatch();
    //   if (DO.bindCursorWatch) DO.bindCursorWatch();
    // } catch (e) {}
  }

  // Basic init
  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  window.Asc.plugin.init = function () {
    if (DO.state.inited) return;
    DO.state.inited = true;
    try {
      // log editor API availability (helps diagnose missing methods/events)
      try {
        DO.debugLog("editor_api", {
          executeMethod: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) === "function",
          callCommand: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.callCommand) === "function",
          attachEditorEvent: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.attachEditorEvent) === "function",
          attachEvent: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.attachEvent) === "function",
        });
      } catch (e0) {}

      var injected = tryReadInjectedOptions();
      mergeOptions(injected);

      DO.initLocalData();
      bindCoreUi();

      // bind features - Clipboard and Dictionary enabled
      if (DO.features && DO.features.clipboard) {
        DO.features.clipboard.bind();
        DO.features.clipboard.render();
      }

      if (DO.features && DO.features.dictionary) {
        DO.features.dictionary.bind();
        DO.features.dictionary.renderSaved();
      }

      // DISABLED: SpeechToText feature - now using separate plugin
      // if (DO.features && DO.features.speechtotext) {
      //   DO.features.speechtotext.bind();
      // }

      // DISABLED: Other features to reduce UI layout changes
      // if (DO.features && DO.features.macros) {
      //   DO.features.macros.bind();
      //   DO.features.macros.render();
      // }

      // if (DO.features && DO.features.abbreviation) {
      //   DO.features.abbreviation.bind();
      //   DO.features.abbreviation.render();
      // }

      // if (DO.features && DO.features.redundant) {
      //   DO.features.redundant.bind();
      //   DO.features.redundant.renderSaved();
      // }

      if (DO.ui && DO.ui.bindDebug) {
        DO.ui.bindDebug();
      }

      // Enable input helper for typing detection (needed for Dictionary)
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

  function safeDisposeBeforeClose() {
    try {
      DO.state = DO.state || {};
      DO.state.disposed = true;
    } catch (e0) {}
    try {
      if (DO.features && DO.features.inputhelper && typeof DO.features.inputhelper.dispose === "function") {
        DO.features.inputhelper.dispose();
      }
    } catch (e1) {}
    // best-effort: hide helper even if feature not initialized
    try {
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
        window.Asc.plugin.executeMethod("UnShowInputHelper", ["asc.{C6A86F5A-5A0F-49F8-9E72-9E8E1E2F86A1}", true]);
      }
    } catch (e2) {}
  }

  // Handle "Close" button in config.json (id usually 0)
  window.Asc.plugin.button = function (id) {
    try {
      safeDisposeBeforeClose();
    } catch (e0) {}
    try {
      // close plugin window/panel
      this.executeCommand("close", "");
    } catch (e1) {}
  };

  // Some builds call onClose when user closes panel via X
  window.Asc.plugin.onClose = function () {
    try {
      safeDisposeBeforeClose();
    } catch (e0) {}
  };

  // Defensive: if init isn't called, still bind minimal UI so user sees something
  try {
    document.addEventListener("DOMContentLoaded", function () {
      try {
        DO.appendOutputLine("dom_ready (script_loaded)");
        bindCoreUi();
      } catch (e) {}

      // If SDK missed calling init (common when plugin scripts are deferred),
      // run init ourselves shortly after DOM is ready.
      try {
        setTimeout(function () {
          try {
            if (!DO.state.inited && window.Asc && window.Asc.plugin && typeof window.Asc.plugin.init === "function") {
              DO.appendOutputLine("init_fallback_call");
              window.Asc.plugin.init();
            }
          } catch (e2) {}
        }, 50);
      } catch (e3) {}
    });
  } catch (e) {}
})();

