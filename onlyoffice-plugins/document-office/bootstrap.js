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

  function hasUiDom() {
    try {
      // If this variation is background/unvisible, it won't have UI markup.
      return Boolean(
        document &&
          document.querySelector &&
          (document.querySelector(".doSimpleRoot") ||
            document.querySelector(".doRoot") ||
            document.getElementById("macroList") ||
            document.getElementById("clipList"))
      );
    } catch (e) {
      return false;
    }
  }

  function bindCoreUi() {
    if (DO.state.uiBound) return;
    DO.state.uiBound = true;

    // version badge
    try {
      DO.setText("pluginVersion", "v" + DO.VERSION);
    } catch (e) {}
    // NOTE: keep UI minimal (comment-bridge style) — no tabs/debug UI required.

    // DISABLED: UI/layout + cursor change watchers to prevent UI resizing
    // These watchers cause UI layout changes when inserting text
    // try {
    //   if (DO.startUiWatch) DO.startUiWatch();
    //   if (DO.bindCursorWatch) DO.bindCursorWatch();
    // } catch (e) {}
  }

  function layoutDebugPing() {
    try {
      // Add a tiny always-on-top marker for diagnosing "blank UI" cases
      // (Only shown when DO.DEBUG === true)
      if (!DO.DEBUG) return;
      if (!hasUiDom()) return;
      if (DO.state.__layoutPingAttached) return;
      DO.state.__layoutPingAttached = true;

      var el = document.createElement("div");
      el.id = "__do_layout_ping";
      el.style.position = "fixed";
      el.style.left = "6px";
      el.style.top = "6px";
      el.style.zIndex = "2147483647";
      el.style.padding = "2px 6px";
      el.style.fontSize = "11px";
      el.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
      el.style.background = "rgba(0,0,0,0.65)";
      el.style.color = "#fff";
      el.style.borderRadius = "6px";
      el.style.pointerEvents = "none";
      el.textContent = "DO UI…";
      document.body.appendChild(el);

      function tick() {
        try {
          var root = DO.$ && DO.$("status") ? DO.$("status") : null;
          var w = window.innerWidth || 0;
          var h = window.innerHeight || 0;
          var rh = 0;
          try {
            var r = document.querySelector(".doRoot");
            if (r) rh = r.getBoundingClientRect().height || 0;
          } catch (e0) {}
          el.textContent = "DO " + w + "x" + h + " rootH=" + Math.round(rh);
        } catch (e1) {}
      }
      tick();
      setInterval(tick, 1200);
    } catch (e) {}
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
      // Always start detection hooks (no UI required)
      try {
        if (DO.features && DO.features.inputhelper && typeof DO.features.inputhelper.attachEvents === "function") {
          DO.features.inputhelper.attachEvents();
        }
      } catch (e0) {}

      // UI features
      if (hasUiDom()) {
        layoutDebugPing();
        bindCoreUi();

        // bind features - Clipboard enabled
        if (DO.features && DO.features.clipboard) {
          DO.features.clipboard.bind();
          DO.features.clipboard.render();
        }

        // DISABLED: SpeechToText feature - now using separate plugin
        // if (DO.features && DO.features.speechtotext) {
        //   DO.features.speechtotext.bind();
        // }

        // Macros
        // NOTE: UI/layout watchers are already disabled above. Enabling macros here is safe.
        if (DO.features && DO.features.macros) {
          DO.features.macros.bind();
          DO.features.macros.render();
          // best-effort: refresh from API/local storage
          try {
            DO.features.macros.reload();
          } catch (e0) {}
        }

        // if (DO.features && DO.features.abbreviation) {
        //   DO.features.abbreviation.bind();
        //   DO.features.abbreviation.render();
        // }

        // if (DO.features && DO.features.redundant) {
        //   DO.features.redundant.bind();
        //   DO.features.redundant.renderSaved();
        // }

      }

      // Status/output are UI-only, but safe to call even if missing
      DO.setStatus("ready");
      DO.sendToHost({ type: "do:pluginReady", version: DO.VERSION });
      DO.setOutput({
        plugin: "DocumentOffice (Clipboard)",
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
  // NOTE: ONLYOFFICE calls `plugin.button(id, windowID)` for modal windows created via ShowWindow too.
  // If we always executeCommand("close") here, it will close the whole panelRight plugin.
  window.Asc.plugin.button = function (id, windowID) {
    // Window close path (close only the window)
    if (windowID !== undefined && windowID !== null && String(windowID) !== "") {
      try {
        if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
          window.Asc.plugin.executeMethod("CloseWindow", [windowID]);
          return;
        }
      } catch (e0) {}
      return;
    }

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
        if (hasUiDom()) bindCoreUi();
      } catch (e) {}

      // If SDK missed calling init (common when plugin scripts are deferred),
      // run init ourselves shortly after DOM is ready.
      try {
        setTimeout(function () {
          try {
            if (!DO.state.inited && window.Asc && window.Asc.plugin && typeof window.Asc.plugin.init === "function") {
              window.Asc.plugin.init();
            }
          } catch (e2) {}
        }, 80);
      } catch (e3) {}
    });
  } catch (e) {}
})();

