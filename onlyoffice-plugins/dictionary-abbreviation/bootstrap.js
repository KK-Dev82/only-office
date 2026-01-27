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

    // tabs
    if (DA.ui && DA.ui.bindTabs) DA.ui.bindTabs();
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
      // NOTE: initLocalData is also called in window.Asc.plugin.init, so skip here to avoid double init
      // try {
      //   if (typeof DA.initLocalData === "function") DA.initLocalData();
      // } catch (e0) {}

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

  function hasUiDom() {
    try {
      return Boolean(document && document.querySelector && document.querySelector(".doRoot"));
    } catch (e) { return false; }
  }

  function layoutDebugPing() {
    try {
      if (!DA.DEBUG) return;
      if (!hasUiDom()) return;
      if (DA.state.__layoutPingAttached) return;
      DA.state.__layoutPingAttached = true;
      var el = document.createElement("div");
      el.id = "__da_layout_ping";
      el.style.cssText = "position:fixed;left:6px;top:6px;z-index:2147483647;padding:2px 6px;font-size:11px;font-family:system-ui,sans-serif;background:rgba(0,0,0,0.65);color:#fff;border-radius:6px;pointer-events:none;";
      el.textContent = "DA …";
      document.body.appendChild(el);
      function tick() {
        try {
          var r = document.querySelector(".doRoot");
          var w = window.innerWidth || 0;
          var h = window.innerHeight || 0;
          var rh = r && r.getBoundingClientRect ? (r.getBoundingClientRect().height || 0) : 0;
          el.textContent = "DA " + w + "×" + h + " rootH=" + Math.round(rh);
        } catch (e) {}
      }
      tick();
      setInterval(tick, 1200);
    } catch (e) {}
  }

  function logUiSnapshot(tag) {
    try {
      if (!DA || typeof DA.debugLog !== "function") return;
      var root = document.querySelector(".doRoot");
      var r = root && root.getBoundingClientRect ? root.getBoundingClientRect() : null;
      var b = document.body && document.body.getBoundingClientRect ? document.body.getBoundingClientRect() : null;
      var csBody = window.getComputedStyle ? window.getComputedStyle(document.body) : null;
      var csRoot = window.getComputedStyle && root ? window.getComputedStyle(root) : null;
      DA.debugLog("ui_snapshot", {
        tag: String(tag || ""),
        win: { w: Math.round(window.innerWidth || 0), h: Math.round(window.innerHeight || 0) },
        body: b ? { w: Math.round(b.width || 0), h: Math.round(b.height || 0) } : null,
        root: r ? { w: Math.round(r.width || 0), h: Math.round(r.height || 0) } : null,
        bodyStyle: csBody ? { display: csBody.display, visibility: csBody.visibility, opacity: csBody.opacity, overflow: csBody.overflow } : null,
        rootStyle: csRoot ? { display: csRoot.display, visibility: csRoot.visibility, opacity: csRoot.opacity, position: csRoot.position } : null,
      });
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
      // Persist options for child windows (ShowWindow can't reliably pass options in all builds)
      try {
        if (DA && DA.STORAGE_PREFIX) {
          if (DA.pluginOptions && DA.pluginOptions.apiBaseUrl) {
            localStorage.setItem(DA.STORAGE_PREFIX + "apiBaseUrl", String(DA.pluginOptions.apiBaseUrl || ""));
          }
          if (DA.pluginOptions && DA.pluginOptions.accessToken) {
            localStorage.setItem(DA.STORAGE_PREFIX + "accessToken", String(DA.pluginOptions.accessToken || ""));
          }
        }
      } catch (eOptStore) {}

      // ผูก UI ก่อน → แสดงก่อนโหลด LocalStorage ถ้า storage ล้มเหลว UI ไม่เพี้ยน
      bindCoreUi();
      applyDictOnlyUiTweaks();
      if (hasUiDom()) layoutDebugPing();
      if (DA.DEBUG) {
        logUiSnapshot("init_0");
        setTimeout(function () { logUiSnapshot("init_200"); }, 200);
        setTimeout(function () { logUiSnapshot("init_1000"); }, 1000);
      }

      try {
        if (typeof DA.initLocalData === "function") DA.initLocalData();
      } catch (eStorage) {
        try { DA.debugLog("initLocalData_error", { error: String(eStorage) }); } catch (e2) {}
      }
      try {
        if (DA.ui && DA.ui.setActiveTab) DA.ui.setActiveTab(DA.state.activeTab || "dictionary");
      } catch (eTab) {}

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

      // Open System modals
      try {
        var btnDictSys = DA.$("dictOpenSystem");
        if (btnDictSys && !DA.state.__dictSysBtnBound) {
          DA.state.__dictSysBtnBound = true;
          btnDictSys.addEventListener("click", function () {
            try {
              // Open real ONLYOFFICE window (same approach as "เพิ่ม Macros")
              if (!(window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function")) return;
              var href = "";
              try { href = String(window.location && window.location.href ? window.location.href : ""); } catch (eHref) {}
              var base = href;
              try {
                base = base.split("#")[0].split("?")[0];
                base = base.slice(0, base.lastIndexOf("/") + 1);
              } catch (eBase) {}
              var winUrl = (base ? base : "") + "system_window.html?mode=dictionary&v=" + encodeURIComponent(String(DA.VERSION || "0.1.71"));
              var frameId = "iframe_asc.{8B6B9F89-7C57-4E1F-8B78-2B3D6B31E0DE}_sysDict";
              var variation = {
                url: winUrl,
                description: "System Dictionary",
                isVisual: true,
                isModal: true,
                EditorsSupport: ["word"],
                size: [900, 680],
                buttons: [{ text: "Close", primary: false }]
              };
              window.Asc.plugin.executeMethod("ShowWindow", [frameId, variation], function (windowID) {
                try { localStorage.setItem(DA.STORAGE_PREFIX + "systemWindowId:dictionary", String(windowID || "")); } catch (e0) {}
                try { DA.debugLog("sys_open_window", { mode: "dictionary", url: winUrl, windowID: windowID }); } catch (e1) {}
              });
            } catch (e0) {}
          });
        }
        var btnAbbrSys = DA.$("abbrOpenSystem");
        if (btnAbbrSys && !DA.state.__abbrSysBtnBound) {
          DA.state.__abbrSysBtnBound = true;
          btnAbbrSys.addEventListener("click", function () {
            try {
              if (!(window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function")) return;
              var href = "";
              try { href = String(window.location && window.location.href ? window.location.href : ""); } catch (eHref) {}
              var base = href;
              try {
                base = base.split("#")[0].split("?")[0];
                base = base.slice(0, base.lastIndexOf("/") + 1);
              } catch (eBase) {}
              var winUrl = (base ? base : "") + "system_window.html?mode=abbreviation&v=" + encodeURIComponent(String(DA.VERSION || "0.1.71"));
              var frameId = "iframe_asc.{8B6B9F89-7C57-4E1F-8B78-2B3D6B31E0DE}_sysAbbr";
              var variation = {
                url: winUrl,
                description: "System Abbreviation",
                isVisual: true,
                isModal: true,
                EditorsSupport: ["word"],
                size: [900, 680],
                buttons: [{ text: "Close", primary: false }]
              };
              window.Asc.plugin.executeMethod("ShowWindow", [frameId, variation], function (windowID) {
                try { localStorage.setItem(DA.STORAGE_PREFIX + "systemWindowId:abbreviation", String(windowID || "")); } catch (e0) {}
                try { DA.debugLog("sys_open_window", { mode: "abbreviation", url: winUrl, windowID: windowID }); } catch (e1) {}
              });
            } catch (e0) {}
          });
        }
      } catch (eSys) {}

      // Manual Sync button (DB -> LocalStorage)
      try {
        var syncBtn = DA.$("btnSync");
        if (syncBtn && !DA.state.__syncBtnBound) {
          DA.state.__syncBtnBound = true;
          syncBtn.addEventListener("click", function () {
            try {
              if (DA.state.__syncInFlight) return;
              DA.state.__syncInFlight = true;
              try { syncBtn.disabled = true; } catch (e0) {}
              try { if (typeof DA.setStatus === "function") DA.setStatus("syncing…"); } catch (e1) {}

              if (DA.remoteSync && typeof DA.remoteSync.syncAll === "function") {
                DA.remoteSync
                  .syncAll()
                  .then(function (counts) {
                    try { if (DA.features && DA.features.dictionary) DA.features.dictionary.renderSaved(); } catch (e0) {}
                    try { if (DA.features && DA.features.abbreviation && !isDictOnlyMode()) DA.features.abbreviation.render(); } catch (e1) {}
                    try {
                      var d = Array.isArray(counts) ? Number(counts[0] || 0) : 0;
                      var a = Array.isArray(counts) ? Number(counts[1] || 0) : 0;
                      if (typeof DA.setStatus === "function") DA.setStatus("synced (dict " + d + ", abbr " + a + ")");
                    } catch (e2) {}
                  })
                  .catch(function () {
                    try { if (typeof DA.setStatus === "function") DA.setStatus("sync failed"); } catch (e0) {}
                  })
                  .finally(function () {
                    try { DA.state.__syncInFlight = false; } catch (e0) {}
                    try { syncBtn.disabled = false; } catch (e1) {}
                  });
              } else {
                try { if (typeof DA.setStatus === "function") DA.setStatus("sync not available"); } catch (e0) {}
                try { DA.state.__syncInFlight = false; } catch (e1) {}
                try { syncBtn.disabled = false; } catch (e2) {}
              }
            } catch (eOuter) {
              try { DA.state.__syncInFlight = false; } catch (e0) {}
              try { syncBtn.disabled = false; } catch (e1) {}
            }
          });
        }
      } catch (eSyncBtn) {}

      // Remote sync from Backend (DB -> LocalStorage) so:
      // - thai-autocomplete can use dictionary words
      // - abbreviation list/auto-expand can use DB abbreviations
      try {
        if (DA.remoteSync && typeof DA.remoteSync.syncAll === "function") {
          DA.remoteSync.syncAll().then(function () {
            try { if (DA.features && DA.features.dictionary) DA.features.dictionary.renderSaved(); } catch (e0) {}
            try { if (DA.features && DA.features.abbreviation && !isDictOnlyMode()) DA.features.abbreviation.render(); } catch (e1) {}
          });
        }
      } catch (eSync) {}

      // Enable dictionary auto-suggest (InputHelper: Tab/Enter/Esc)
      try {
        if (DA.features && DA.features.dictSuggest && typeof DA.features.dictSuggest.bind === "function") {
          DA.features.dictSuggest.bind();
        }
      } catch (e0) {}

      if (typeof DA.setStatus === "function") DA.setStatus("ready");
      if (typeof DA.sendToHost === "function") DA.sendToHost({ type: "do:pluginReady", version: DA.VERSION, plugin: "dictionary-abbreviation" });
      if (typeof DA.setOutput === "function") DA.setOutput({
        plugin: "Dictionary & Abbreviation",
        version: DA.VERSION,
        hasAccessToken: Boolean(DA.pluginOptions.accessToken),
        apiBaseUrl: DA.pluginOptions.apiBaseUrl || "",
      });
      DA.debugLog("plugin_ready", { version: DA.VERSION });
    } catch (e) {
      try {
        DA.debugLog("plugin_init_failed", { error: String(e) });
      } catch (e2) {}
    }
  };

  // Handle "Close" button in config.json (id usually 0)
  // NOTE: ONLYOFFICE calls `plugin.button(id, windowID)` for modal windows created via ShowWindow too.
  // If we always executeCommand("close") here, it will close the whole panelRight plugin.
  window.Asc.plugin.button = function (_id, windowID) {
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
      this.executeCommand("close", "");
    } catch (e1) {}
  };

  // Defensive: init fallback
  try {
    document.addEventListener("DOMContentLoaded", function () {
      try {
        softInitForUiAndLocalData();
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

