// Plugin bootstrap: init, bind UI, attach events
(function () {
  // NOTE:
  // - core/* currently initializes `window.DO`
  // - keep using `DA` in this plugin code, but alias it to DO to avoid mismatched namespaces
  var DA = (window.DA = window.DO = window.DO || window.DA || {});
  DA.state = DA.state || {};

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
      DA.pluginOptions[k] = injected[k];
    }
  }

  function bindCoreUi() {
    // IMPORTANT:
    // In ONLYOFFICE, plugin init may be called before <body> is fully parsed.
    // If we mark uiBound too early, the later DOMContentLoaded re-bind will be skipped,
    // leaving all panels hidden (CSS hides .doTabPanel by default).
    try {
      var hasRoot = Boolean(document && document.querySelector && document.querySelector(".doRoot"));
      var hasTabs = Boolean(document && document.querySelector && document.querySelector(".doTabBtn[data-tab]"));
      if (!hasRoot || !hasTabs) {
        // Retry shortly until DOM is ready (but don't spam timers)
        if (!DA.state._uiRetryTimer) {
          DA.state._uiRetryTimer = setTimeout(function () {
            DA.state._uiRetryTimer = 0;
            try {
              bindCoreUi();
            } catch {}
          }, 80);
        }
        return;
      }
    } catch (e0) {}

    if (DA.state.uiBound) return;
    DA.state.uiBound = true;

    // version badge
    try {
      DA.setText("pluginVersion", "v" + DA.VERSION);
    } catch (e) {}

    // tabs + debug
    if (DA.ui && DA.ui.bindTabs) DA.ui.bindTabs();
    var toggleDebug = DA.$("toggleDebug");
    if (toggleDebug) toggleDebug.addEventListener("click", function () { DA.ui.toggleDebugPanel(); });
    DA.ui.toggleDebugPanel(DA.state.debugOpen);

    // keep watchers disabled (same reason as clipboard: avoid UI layout shifts)
    // try {
    //   if (DA.startUiWatch) DA.startUiWatch();
    //   if (DA.bindCursorWatch) DA.bindCursorWatch();
    // } catch (e) {}
  }

  function isDictOnlyMode() {
    try {
      // NOTE: ONLYOFFICE may rewrite url/query (e.g. add `_dc`), so check full href too.
      var href = String((window.location && window.location.href) || "");
      var q = String((window.location && window.location.search) || "");
      return /(?:\?|&)mode=dict(?:&|$)/.test(q) || /(?:\?|&)mode=dict(?:&|$)/.test(href);
    } catch (e) {
      return false;
    }
  }

  function applyDictOnlyUiTweaks() {
    try {
      var dictOnly = isDictOnlyMode();
      if (!dictOnly) return;
      // hide abbreviation tab (UI still exists but is not reachable)
      var btn = document.getElementById("tabBtn-abbreviation");
      if (btn) btn.style.display = "none";
      var panel = document.getElementById("tab-abbreviation");
      if (panel) panel.style.display = "none";
      // force active tab dictionary
      try {
        DA.state.activeTab = "dictionary";
        if (DA.ui && DA.ui.setActiveTab) DA.ui.setActiveTab("dictionary");
      } catch (e0) {}
    } catch (e) {}
  }

  function softInitForUiAndLocalData() {
    try {
      // Always bind UI (safe even without bridge)
      bindCoreUi();
      applyDictOnlyUiTweaks();

      // Load local data immediately so UI lists are not empty
      try {
        if (typeof DA.initLocalData === "function") DA.initLocalData();
      } catch (e0) {}

      // Bind + render dictionary UI from local data (safe; insert actions require bridge but render does not)
      try {
        if (DA.features && DA.features.dictionary) {
          try { DA.features.dictionary.bind(); } catch (e1) {}
          try { DA.features.dictionary.renderSaved(); } catch (e2) {}
        }
      } catch (e3) {}

      // Abbreviation UI only when not dict-only
      if (!isDictOnlyMode()) {
        try {
          if (DA.features && DA.features.abbreviation) {
            try { DA.features.abbreviation.bind(); } catch (e4) {}
            try { DA.features.abbreviation.render(); } catch (e5) {}
          }
        } catch (e6) {}
      }
    } catch (e) {}
  }

  function layoutDiag() {
    try {
      var root = document.querySelector(".doRoot");
      var r = root && root.getBoundingClientRect ? root.getBoundingClientRect() : null;
      var w = Math.round(window.innerWidth || 0);
      var h = Math.round(window.innerHeight || 0);
      var rw = r ? Math.round(r.width || 0) : 0;
      var rh = r ? Math.round(r.height || 0) : 0;
      var msg = "DA " + (DA.VERSION || "?") + " mode=" + (isDictOnlyMode() ? "dict" : "full") + " win=" + w + "x" + h + " root=" + rw + "x" + rh;
      try {
        var m = document.getElementById("daFlowMarker") || document.getElementById("daBootMarker");
        if (m) m.textContent = msg;
      } catch (e0) {}
      try {
        if (DA && typeof DA.debugLog === "function") {
          DA.debugLog("ui_diag", { sig: msg, winW: w, winH: h, rootW: rw, rootH: rh });
        }
      } catch (e1) {}
    } catch (e) {}
  }

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  function isHostReadyForInit() {
    try {
      var p = window.Asc && window.Asc.plugin;
      if (!p) return false;
      if (p.info) return true;
      if (typeof p.executeMethod === "function") return true;
      if (typeof p.callCommand === "function") return true;
    } catch (e) {}
    return false;
  }

  window.Asc.plugin.init = function () {
    // IMPORTANT: avoid "locking" into an un-bridged state.
    if (!isHostReadyForInit()) return;
    if (DA.state.inited) return;
    DA.state.inited = true;
    try {
      // log editor API availability (helps diagnose missing methods/events)
      try {
        DA.debugLog("editor_api", {
          executeMethod: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) === "function",
          callCommand: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.callCommand) === "function",
          attachEditorEvent: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.attachEditorEvent) === "function",
          attachEvent: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.attachEvent) === "function",
          hasInfo: Boolean(window.Asc && window.Asc.plugin && window.Asc.plugin.info),
        });
      } catch (e0) {}

      var injected = tryReadInjectedOptions();
      mergeOptions(injected);

      DA.initLocalData();
      bindCoreUi();
      applyDictOnlyUiTweaks();
      layoutDiag();

      if (DA.features && DA.features.dictionary) {
        try { DA.features.dictionary.bind(); } catch (e0) {}
        try { DA.features.dictionary.renderSaved(); } catch (e1) {}
      }

      // Dict-only: skip abbreviation logic entirely to isolate typing detection
      if (!isDictOnlyMode()) {
        if (DA.features && DA.features.abbreviation) {
          try { DA.features.abbreviation.bind(); } catch (e2) {}
          try { DA.features.abbreviation.render(); } catch (e3) {}
        }
      }

      if (DA.ui && DA.ui.bindDebug) {
        DA.ui.bindDebug();
      }

      // Enable dictionary auto-suggest (InputHelper: Tab/Enter/Esc)
      try {
        if (DA.features && DA.features.dictSuggest && typeof DA.features.dictSuggest.bind === "function") {
          DA.features.dictSuggest.bind();
        }
      } catch (e0) {}

      DA.setStatus("ready");
      DA.sendToHost({ type: "do:pluginReady", version: DA.VERSION, plugin: "dictionary-abbreviation" });
      DA.setOutput({
        plugin: "Dictionary & Abbreviation",
        version: DA.VERSION,
        hasAccessToken: Boolean(DA.pluginOptions.accessToken),
        apiBaseUrl: DA.pluginOptions.apiBaseUrl || "",
      });
      DA.debugLog("plugin_ready", { version: DA.VERSION });
      try { layoutDiag(); } catch (e0) {}
    } catch (e) {
      try {
        DA.debugLog("plugin_init_failed", { error: String(e) });
      } catch (e2) {}
      // Make sure UI markers show *something* even when init fails
      try {
        var m = document.getElementById("daFlowMarker") || document.getElementById("daBootMarker");
        if (m) m.textContent = "DA init failed: " + String(e).slice(0, 160);
      } catch (e3) {}
    }
  };

  window.Asc.plugin.button = function (_id) {
    try {
      this.executeCommand("close", "");
    } catch (e1) {}
  };

  // Defensive: init fallback
  try {
    document.addEventListener("DOMContentLoaded", function () {
      try {
        // IMPORTANT: do not wait for bridge to render local data/UI
        softInitForUiAndLocalData();
        layoutDiag();
        try {
          window.addEventListener("resize", function () {
            layoutDiag();
          });
        } catch (e0) {}
      } catch (e) {}
      try {
        var attempts = 0;
        (function tryInitLater() {
          try {
            if (DA.state.inited) return;
            if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.init === "function" && isHostReadyForInit()) {
              window.Asc.plugin.init();
              return;
            }
          } catch (e2) {}
          attempts++;
          if (attempts < 200) setTimeout(tryInitLater, 100); // up to ~20s
        })();
      } catch (e3) {}
    });
  } catch (e) {}
})();

