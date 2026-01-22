(function () {
  var PLUGIN_VERSION = "0.1.4";
  var DEBUG = true;
  var __do_uiBound = false;
  var __do_activeTab = "clipboard";
  var __do_debugOpen = false;

  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = String(text == null ? "" : text);
  }

  function setActiveTab(tab) {
    tab = String(tab || "");
    if (!tab) return;
    __do_activeTab = tab;
    try {
      if (canUseLocalStorage()) localStorage.setItem(STORAGE_PREFIX + "activeTab", tab);
    } catch (e0) {}

    // buttons
    var btns = document.querySelectorAll(".tabBtn[data-tab]");
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var t = b.getAttribute("data-tab");
      if (t === tab) b.classList.add("isActive");
      else b.classList.remove("isActive");
    }

    // panels
    var panels = document.querySelectorAll(".tabPanel[data-tab]");
    for (var j = 0; j < panels.length; j++) {
      var p = panels[j];
      var tp = p.getAttribute("data-tab");
      if (tp === tab) p.classList.add("isActive");
      else p.classList.remove("isActive");
    }

    try { debugLog("tab_change", { tab: tab }); } catch (e) {}
  }

  function toggleDebugPanel(forceOpen) {
    var panel = $("debugPanel");
    if (!panel) return;
    if (forceOpen === true) __do_debugOpen = true;
    else if (forceOpen === false) __do_debugOpen = false;
    else __do_debugOpen = !__do_debugOpen;

    if (__do_debugOpen) panel.classList.remove("isHidden");
    else panel.classList.add("isHidden");

    try {
      if (canUseLocalStorage()) localStorage.setItem(STORAGE_PREFIX + "debugOpen", __do_debugOpen ? "1" : "0");
    } catch (e) {}
    try { debugLog("debug_toggle", { open: __do_debugOpen }); } catch (e2) {}
  }

  function ensureUiBound(reason) {
    if (__do_uiBound) return;
    __do_uiBound = true;
    try {
      bindUi();
      debugLog("ui_bound", { reason: reason || "" });
    } catch (e) {
      try { appendOutputLine("ui_bound_failed " + String(e)); } catch (e2) {}
    }
  }

  function setStatus(text) {
    var el = $("status");
    if (el) el.textContent = text;
  }

  function setOutput(obj) {
    var el = $("output");
    if (!el) return;
    try {
      el.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    } catch (e) {
      el.textContent = String(obj);
    }
  }

  function appendOutputLine(line) {
    var el = $("output");
    if (!el) return;
    try {
      var ts = new Date().toISOString();
      el.textContent = (el.textContent ? el.textContent + "\n" : "") + "[" + ts + "] " + String(line);
    } catch (e) {}
  }

  // แสดงว่า script โหลดแล้ว (กันเคสที่ Asc.plugin.init ไม่ถูกเรียก)
  try {
    document.addEventListener("DOMContentLoaded", function () {
      try {
        appendOutputLine("dom_ready (script_loaded)");
        var st = $("status");
        if (st && (st.textContent || "").indexOf("loading") >= 0) {
          st.textContent = "dom_ready…";
        }
        // Fallback: bind UI even if Asc.plugin.init is not called yet
        ensureUiBound("dom_ready");
        try { setText("pluginVersion", "v" + PLUGIN_VERSION); } catch (e0) {}
        try { initLocalData(); } catch (e) {}
        try { renderAbbreviations(); } catch (e) {}
        try { renderClipboard(); } catch (e) {}
        try { renderDictionarySaved(); } catch (e) {}
        try { renderRedundantSaved(); } catch (e) {}
      } catch (e) {}
    });
  } catch (e) {}

  // Plugin options injected from editorConfig.plugins.options
  var pluginOptions = {
    apiBaseUrl: "",
    accessToken: "",
    userName: "",
    userId: null,
    defaultCheckMode: "paragraph",
    features: {}
  };

  // Simple in-plugin stores
  var store = {
    abbreviations: [],
    clipboard: [],
    macros: [],
    redundant: [],
    dictionary: []
  };

  // ============================================================
  // LocalStorage layer (v1) - local-only phase
  // ============================================================
  var STORAGE_PREFIX = "do:v1:";
  var STORAGE_KEYS = {
    abbreviations: STORAGE_PREFIX + "abbreviations",
    clipboard: STORAGE_PREFIX + "clipboard",
    macros: STORAGE_PREFIX + "macros",
    redundant: STORAGE_PREFIX + "redundant",
    dictionary: STORAGE_PREFIX + "dictionary"
  };

  function safeJsonParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return fallback;
    }
  }

  function canUseLocalStorage() {
    try {
      var k = STORAGE_PREFIX + "__probe";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function storageLoad(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return safeJsonParse(raw, fallback);
    } catch (e) {
      try {
        debugLog("storageLoad_failed", { key: key, error: String(e) });
      } catch (e2) {}
      return fallback;
    }
  }

  function storageSave(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      try {
        debugLog("storageSave_failed", { key: key, error: String(e) });
      } catch (e2) {}
      // Fallback: ONLYOFFICE plugin storage (ถ้ามี)
      try {
        if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
          window.Asc.plugin.executeMethod("SetStorageValue", [key, JSON.stringify(value)]);
          try { debugLog("storageSave_fallback_SetStorageValue", { key: key }); } catch (e3) {}
          return true;
        }
      } catch (e4) {
        try { debugLog("storageSave_fallback_failed", { key: key, error: String(e4) }); } catch (e5) {}
      }
      return false;
    }
  }

  function initLocalData() {
    try { debugLog("initLocalData_begin", { canUseLocalStorage: canUseLocalStorage() }); } catch (e) {}
    store.abbreviations = storageLoad(STORAGE_KEYS.abbreviations, []);
    store.clipboard = storageLoad(STORAGE_KEYS.clipboard, []);
    store.macros = storageLoad(STORAGE_KEYS.macros, []);
    store.redundant = storageLoad(STORAGE_KEYS.redundant, []);
    store.dictionary = storageLoad(STORAGE_KEYS.dictionary, []);
    try {
      debugLog("initLocalData_loaded", {
        abbreviations: (store.abbreviations || []).length,
        clipboard: (store.clipboard || []).length,
        macros: (store.macros || []).length,
        redundant: (store.redundant || []).length,
        dictionary: (store.dictionary || []).length
      });
    } catch (e2) {}
  }

  function persistAbbreviations() {
    var ok = storageSave(STORAGE_KEYS.abbreviations, store.abbreviations || []);
    try { debugLog("persistAbbreviations", { ok: ok, count: (store.abbreviations || []).length }); } catch (e) {}
  }

  function persistClipboard() {
    var ok = storageSave(STORAGE_KEYS.clipboard, store.clipboard || []);
    try { debugLog("persistClipboard", { ok: ok, count: (store.clipboard || []).length }); } catch (e) {}
  }

  function persistMacros() {
    var ok = storageSave(STORAGE_KEYS.macros, store.macros || []);
    try { debugLog("persistMacros", { ok: ok, count: (store.macros || []).length }); } catch (e) {}
  }

  function persistDictionary() {
    var ok = storageSave(STORAGE_KEYS.dictionary, store.dictionary || []);
    try { debugLog("persistDictionary", { ok: ok, count: (store.dictionary || []).length }); } catch (e) {}
  }

  function persistRedundant() {
    var ok = storageSave(STORAGE_KEYS.redundant, store.redundant || []);
    try { debugLog("persistRedundant", { ok: ok, count: (store.redundant || []).length }); } catch (e) {}
  }

  function newId(prefix) {
    return String(prefix || "id") + "_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  }

  function normalizeBaseUrl(url) {
    if (!url) return "";
    try {
      // if relative, keep as-is
      if (url.startsWith("/")) return url.replace(/\/+$/, "") + "/";
      return url.replace(/\/+$/, "") + "/";
    } catch (e) {
      return url;
    }
  }

  function sendToHost(message) {
    try {
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
        window.Asc.plugin.executeMethod("SendExternalMessage", [message]);
      }
    } catch (e) {
      // ignore
    }
  }

  function safeStringify(obj) {
    try {
      return typeof obj === "string" ? obj : JSON.stringify(obj);
    } catch (e) {
      return String(obj);
    }
  }

  function debugLog(event, detail) {
    if (!DEBUG) return;
    try {
      appendOutputLine(String(event) + (detail !== undefined ? " " + safeStringify(detail) : ""));
    } catch (e) {}
    try {
      sendToHost({ type: "do:debug", event: String(event), detail: detail });
    } catch (e2) {}
    try {
      sendToHost({
        type: "do:log",
        level: "info",
        message: String(event),
        detail: detail,
        ts: new Date().toISOString()
      });
    } catch (e2b) {}
    try {
      // eslint-disable-next-line no-console
      console.log("[DocumentOfficePlugin]", event, detail);
    } catch (e3) {}
  }

  function buildApiUrl(path, params) {
    var base = normalizeBaseUrl(pluginOptions.apiBaseUrl || "");
    var p = String(path || "").replace(/^\/+/, "");
    var u = base ? base + p : "/" + p;
    var q = [];
    if (params) {
      for (var k in params) {
        if (params[k] === undefined || params[k] === null || params[k] === "") continue;
        q.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(params[k])));
      }
    }
    if (q.length) u += (u.indexOf("?") >= 0 ? "&" : "?") + q.join("&");
    return u;
  }

  async function apiRequest(method, path, params, body) {
    var url = buildApiUrl(path, params);
    var headers = {
      "Content-Type": "application/json"
    };
    if (pluginOptions.accessToken) {
      headers["Authorization"] = "Bearer " + pluginOptions.accessToken;
    }
    var res = await fetch(url, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      var text = "";
      try { text = await res.text(); } catch (e) {}
      throw new Error(method + " " + url + " failed: " + res.status + " " + text);
    }
    var json = null;
    try {
      json = await res.json();
    } catch (e) {
      json = null;
    }
    return json;
  }

  function normalizePagedData(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.Data)) return data.Data;
    return Array.isArray(data.items) ? data.items : [];
  }

  // Defensive: try to extract options from plugin runtime
  function tryReadInjectedOptions() {
    try {
      // Most builds expose options in init data. We keep multiple fallbacks.
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
      pluginOptions[k] = injected[k];
    }
  }

  function bindUi() {
    // debug: log button clicks (helps confirm event binding)
    try {
      if (!window.__do_clickLoggerAttached) {
        window.__do_clickLoggerAttached = true;
        document.addEventListener("click", function (e) {
          try {
            var t = e && e.target;
            if (!t) return;
            if (t.tagName === "BUTTON" && t.id) debugLog("click", { id: t.id });
          } catch (e2) {}
        }, true);
      }
    } catch (e) {}

    // Tabs
    try {
      var tabBtns = document.querySelectorAll(".tabBtn[data-tab]");
      for (var ti = 0; ti < tabBtns.length; ti++) {
        tabBtns[ti].addEventListener("click", function (ev) {
          try {
            var t = ev && ev.currentTarget && ev.currentTarget.getAttribute ? ev.currentTarget.getAttribute("data-tab") : "";
            if (t) setActiveTab(t);
          } catch (e2) {}
        });
      }
      // load last tab
      try {
        if (canUseLocalStorage()) {
          var savedTab = localStorage.getItem(STORAGE_PREFIX + "activeTab");
          if (savedTab) __do_activeTab = savedTab;
        }
      } catch (e3) {}
      setActiveTab(__do_activeTab || "clipboard");
    } catch (e4) {}

    // Debug toggle
    var toggleDebug = $("toggleDebug");
    if (toggleDebug) toggleDebug.addEventListener("click", function () { toggleDebugPanel(); });
    try {
      if (canUseLocalStorage()) {
        var savedOpen = localStorage.getItem(STORAGE_PREFIX + "debugOpen");
        if (savedOpen === "1") __do_debugOpen = true;
      }
    } catch (e5) {}
    toggleDebugPanel(__do_debugOpen);

    var mode = $("checkMode");
    if (mode) {
      mode.value = pluginOptions.defaultCheckMode || "paragraph";
      mode.addEventListener("change", function () {
        pluginOptions.defaultCheckMode = mode.value;
      });
    }

    var btnGetSelection = $("btnGetSelection");
    if (btnGetSelection) {
      btnGetSelection.addEventListener("click", function () {
        getSelectedText(function (text) {
          setOutput({
            selectedText: text || "",
            hasToken: Boolean(pluginOptions.accessToken),
            apiBaseUrl: pluginOptions.apiBaseUrl || ""
          });
        });
      });
    }

    var btnInsertDemo = $("btnInsertDemo");
    if (btnInsertDemo) {
      btnInsertDemo.addEventListener("click", function () {
        insertText("DocumentOffice plugin demo insert");
      });
    }

    var btnGetContext = $("btnGetContext");
    if (btnGetContext) {
      btnGetContext.addEventListener("click", function () {
        var mode = ( $("checkMode") && $("checkMode").value ) || pluginOptions.defaultCheckMode || "paragraph";
        getContext(mode, function (ctx) {
          setOutput({ ok: true, type: "ui_getContext", context: ctx });
        });
      });
    }

    // STT
    bindSpeechToText();

    // Dictionary
    var dictSearch = $("dictSearch");
    if (dictSearch) dictSearch.addEventListener("click", function () { void doDictionarySearch(); });
    var dictQuery = $("dictQuery");
    if (dictQuery) dictQuery.addEventListener("keydown", function (e) {
      try {
        if (e && e.key === "Enter") {
          e.preventDefault();
          void doDictionarySearch();
        }
      } catch (e0) {}
    });
    var dictToggleAdd = $("dictToggleAdd");
    if (dictToggleAdd) dictToggleAdd.addEventListener("click", function () {
      var card = $("dictAddCard");
      if (!card) return;
      if (card.classList.contains("isHidden")) card.classList.remove("isHidden");
      else card.classList.add("isHidden");
      try { debugLog("dict_toggle_add", { open: !card.classList.contains("isHidden") }); } catch (e6) {}
    });
    var dictAdd = $("dictAdd");
    if (dictAdd) dictAdd.addEventListener("click", function () { void addDictionaryFromUi(); });

    // Abbreviation
    var abbrAdd = $("abbrAdd");
    if (abbrAdd) abbrAdd.addEventListener("click", function () { void addAbbreviationFromUi(); });
    var abbrExpand = $("abbrExpandSelection");
    if (abbrExpand) abbrExpand.addEventListener("click", function () { void expandAbbreviationFromSelection(); });

    // Clipboard
    var clipAdd = $("clipAdd");
    if (clipAdd) clipAdd.addEventListener("click", function (e) {
      try { e && e.preventDefault && e.preventDefault(); } catch (e2) {}
      void addClipboardFromUi();
    });
    var clipReload = $("clipReload");
    if (clipReload) clipReload.addEventListener("click", function () {
      store.clipboard = storageLoad(STORAGE_KEYS.clipboard, []);
      try { debugLog("clipReload", { count: (store.clipboard || []).length }); } catch (e) {}
      renderClipboard();
    });

    // Macros
    var macroReload = $("macroReload");
    if (macroReload) macroReload.addEventListener("click", function () { void loadMacros(); });

    // Redundant
    var redundantReload = $("redundantReload");
    if (redundantReload) redundantReload.addEventListener("click", function () { void loadRedundantWords(); });
    var redundantCheck = $("redundantCheck");
    if (redundantCheck) redundantCheck.addEventListener("click", function () { void checkRedundantInCurrentContext(); });
    var redundantAdd = $("redundantAdd");
    if (redundantAdd) redundantAdd.addEventListener("click", function () { void addRedundantFromUi(); });
  }

  // ============================================================
  // SpeechToText (basic, browser Web Speech API)
  // ============================================================
  var stt = { rec: null, listening: false };
  function bindSpeechToText() {
    var start = $("sttStart");
    var stop = $("sttStop");
    var insert = $("sttInsert");
    if (start) start.addEventListener("click", function () { startStt(); });
    if (stop) stop.addEventListener("click", function () { stopStt(); });
    if (insert) insert.addEventListener("click", function () {
      var t = $("sttText") ? $("sttText").value : "";
      if (t) insertText(t);
    });
  }

  function startStt() {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setOutput({ ok: false, error: "SpeechRecognition not supported in this browser" });
      return;
    }
    if (stt.listening) return;
    var rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "th-TH";
    rec.onresult = function (event) {
      var finalText = "";
      var interimText = "";
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      var el = $("sttText");
      if (el) el.value = (finalText + interimText).trim();
    };
    rec.onerror = function (e) {
      setOutput({ ok: false, error: "STT error", detail: e });
    };
    rec.onend = function () {
      stt.listening = false;
      setStatus("ready");
    };
    stt.rec = rec;
    stt.listening = true;
    setStatus("listening…");
    try { rec.start(); } catch (e) {}
  }

  function stopStt() {
    if (stt.rec) {
      try { stt.rec.stop(); } catch (e) {}
    }
    stt.listening = false;
    setStatus("ready");
  }

  // ============================================================
  // Dictionary
  // ============================================================
  async function doDictionarySearch() {
    var q = $("dictQuery") ? $("dictQuery").value.trim() : "";
    if (!q) return;
    try {
      // local-first: คำที่บันทึกไว้ใน plugin (Local)
      var local = (store.dictionary || []).filter(function (w) {
        var word = (w.word || w.Word || "").toLowerCase();
        return word.indexOf(q.toLowerCase()) >= 0;
      }).slice(0, 20).map(function (w) {
        return { word: w.word || w.Word || "", description: w.description || w.Description || "", __source: "local" };
      });

      // แสดง local ก่อนทันที (ตอบสนองไว)
      renderDictionary(local, q);

      // ถ้ามี token + baseUrl ให้ลองเรียก backend เพิ่มเติม (เตรียมต่อ phase ถัดไป)
      if (pluginOptions.apiBaseUrl && pluginOptions.accessToken) {
        var data = await apiRequest("GET", "api/word-management/dictionary", {
          q: q,
          limit: 20,
          includeGlobal: true
        });
        var items = normalizePagedData(data).map(function (it) {
          return {
            word: it.word || it.Word || "",
            description: it.description || it.Description || "",
            __source: "backend"
          };
        });

        // merge/dedupe by word
        var seen = {};
        var merged = [];
        for (var i = 0; i < items.length; i++) {
          var ww = (items[i].word || "").toLowerCase();
          if (!ww || seen[ww]) continue;
          seen[ww] = true;
          merged.push(items[i]);
        }
        for (var j = 0; j < local.length; j++) {
          var lw = (local[j].word || "").toLowerCase();
          if (!lw || seen[lw]) continue;
          seen[lw] = true;
          merged.push(local[j]);
        }

        renderDictionary(merged, q);
      }
    } catch (e) {
      setOutput({ ok: false, error: String(e) });
    }
  }

  function renderDictionary(items, query) {
    var root = $("dictResults");
    if (!root) return;
    root.innerHTML = "";
    items = items || [];
    for (var i = 0; i < items.length; i++) {
      var w = items[i];
      var word = w.word || w.Word || "";
      if (!word) continue;
      var div = document.createElement("div");
      div.className = "item";
      var row = document.createElement("div");
      row.className = "itemRow";
      var text = document.createElement("div");
      text.className = "itemText";
      var src = (w.__source || "").toString();
      var desc = w.description || w.Description || "";
      text.textContent = word + (desc ? " — " + desc : "") + (src ? " (" + src + ")" : "");
      var actions = document.createElement("div");
      actions.className = "itemActions";
      var btn = document.createElement("button");
      btn.textContent = "Insert";
      btn.addEventListener("click", (function (t) {
        return function () { insertText(t); };
      })(word));
      actions.appendChild(btn);
      row.appendChild(text);
      row.appendChild(actions);
      div.appendChild(row);
      root.appendChild(div);
    }
    if (items.length === 0) {
      var empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "ไม่พบคำ";
      root.appendChild(empty);
    }
  }

  function renderDictionarySaved() {
    var root = $("dictSavedList");
    if (!root) return;
    root.innerHTML = "";
    var items = store.dictionary || [];
    for (var i = 0; i < items.length; i++) {
      var w = items[i];
      var word = w.word || w.Word || "";
      if (!word) continue;
      var div = document.createElement("div");
      div.className = "item";
      var row = document.createElement("div");
      row.className = "itemRow";
      var text = document.createElement("div");
      text.className = "itemText";
      text.textContent = word + ((w.description || w.Description) ? " — " + (w.description || w.Description) : "");
      var actions = document.createElement("div");
      actions.className = "itemActions";
      var btnInsert = document.createElement("button");
      btnInsert.textContent = "Insert";
      btnInsert.addEventListener("click", (function (t) { return function () { insertText(t); }; })(word));
      var btnDel = document.createElement("button");
      btnDel.textContent = "Delete";
      btnDel.addEventListener("click", (function (id) {
        return function () {
          store.dictionary = (store.dictionary || []).filter(function (x) { return String(x.id) !== String(id); });
          persistDictionary();
          renderDictionarySaved();
          try { debugLog("dict_delete", { id: id }); } catch (e) {}
        };
      })(w.id));
      actions.appendChild(btnInsert);
      actions.appendChild(btnDel);
      row.appendChild(text);
      row.appendChild(actions);
      div.appendChild(row);
      root.appendChild(div);
    }
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "ยังไม่มีคำที่บันทึกไว้";
      root.appendChild(empty);
    }
  }

  async function addDictionaryFromUi() {
    var word = $("dictNewWord") ? $("dictNewWord").value.trim() : "";
    var desc = $("dictNewDesc") ? $("dictNewDesc").value.trim() : "";
    if (!word) return;
    store.dictionary = store.dictionary || [];
    // dedupe
    var lw = word.toLowerCase();
    for (var i = 0; i < store.dictionary.length; i++) {
      if (((store.dictionary[i].word || "").toLowerCase()) === lw) {
        try { debugLog("dict_add_skip_exists", { word: word }); } catch (e0) {}
        return;
      }
    }
    store.dictionary.unshift({ id: newId("dict"), word: word, description: desc, scope: "Local" });
    persistDictionary();
    try { if ($("dictNewWord")) $("dictNewWord").value = ""; } catch (e1) {}
    try { if ($("dictNewDesc")) $("dictNewDesc").value = ""; } catch (e2) {}
    renderDictionarySaved();
    try { debugLog("dict_add", { word: word }); } catch (e3) {}
  }

  // ============================================================
  // Abbreviation
  // ============================================================
  async function loadAbbreviations() {
    try {
      var params = { type: "Abbreviation", includeGlobal: true };
      if (pluginOptions.userId) params.ownerUserId = pluginOptions.userId;
      var data = await apiRequest("GET", "api/word-management/entries", params);
      var items = normalizePagedData(data);
      store.abbreviations = (items || []).map(function (it) {
        return {
          id: String(it.id || it.Id || ""),
          shortForm: it.word || it.Word || "",
          fullForm: it.fullWord || it.FullWord || it.fullForm || it.FullForm || "",
          scope: (it.scope || it.Scope || "Global").toString()
        };
      });
      renderAbbreviations();
    } catch (e) {
      // ignore
    }
  }

  function renderAbbreviations() {
    var root = $("abbrList");
    if (!root) return;
    root.innerHTML = "";
    var items = store.abbreviations || [];
    for (var i = 0; i < items.length; i++) {
      var a = items[i];
      var div = document.createElement("div");
      div.className = "item";
      var row = document.createElement("div");
      row.className = "itemRow";
      var text = document.createElement("div");
      text.className = "itemText";
      text.textContent = (a.shortForm || "") + " → " + (a.fullForm || "");
      var actions = document.createElement("div");
      actions.className = "itemActions";
      var btnInsert = document.createElement("button");
      btnInsert.textContent = "Insert";
      btnInsert.addEventListener("click", (function (t, id) {
        return function () {
          try { debugLog("abbr_insert", { id: id }); } catch (e) {}
          insertText(t);
        };
      })(a.fullForm || "", a.id));
      var btnDel = document.createElement("button");
      btnDel.textContent = "Delete";
      btnDel.addEventListener("click", (function (id) {
        return function () {
          store.abbreviations = (store.abbreviations || []).filter(function (x) { return String(x.id) !== String(id); });
          persistAbbreviations();
          renderAbbreviations();
          try { debugLog("abbr_delete", { id: id }); } catch (e) {}
        };
      })(a.id));
      actions.appendChild(btnInsert);
      actions.appendChild(btnDel);
      row.appendChild(text);
      row.appendChild(actions);
      div.appendChild(row);
      root.appendChild(div);
    }
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "ยังไม่มีคำย่อ";
      root.appendChild(empty);
    }
  }

  async function addAbbreviationFromUi() {
    var s = $("abbrShort") ? $("abbrShort").value.trim() : "";
    var f = $("abbrFull") ? $("abbrFull").value.trim() : "";
    if (!s || !f) return;
    store.abbreviations = store.abbreviations || [];
    store.abbreviations.push({
      id: newId("abbr"),
      shortForm: s,
      fullForm: f,
      scope: "Local"
    });
    persistAbbreviations();
    $("abbrShort").value = "";
    $("abbrFull").value = "";
    renderAbbreviations();
    try { debugLog("abbr_add", { shortForm: s, fullLen: f.length }); } catch (e) {}
  }

  async function expandAbbreviationFromSelection() {
    getSelectedText(function (sel) {
      var key = (sel || "").trim().toLowerCase();
      if (!key) return;
      var found = null;
      var items = store.abbreviations || [];
      for (var i = 0; i < items.length; i++) {
        if ((items[i].shortForm || "").trim().toLowerCase() === key) {
          found = items[i];
          break;
        }
      }
      if (found) {
        try { debugLog("abbr_expand", { shortForm: key }); } catch (e0) {}
        replaceSelectionText(found.fullForm || "");
      } else {
        try { debugLog("abbr_expand_not_found", { selection: sel }); } catch (e1) {}
        setOutput({ ok: false, error: "ไม่พบคำย่อสำหรับ selection", selection: sel });
      }
    });
  }

  // ============================================================
  // Clipboard
  // ============================================================
  async function loadClipboard() {
    try {
      var params = { includeGlobal: true };
      if (pluginOptions.userId) params.ownerUserId = pluginOptions.userId;
      var data = await apiRequest("GET", "api/word-management/Clipboard", params);
      var items = normalizePagedData(data);
      store.clipboard = (items || []).map(function (it) {
        return {
          id: String(it.id || it.Id || ""),
          text: it.word || it.Word || "",
          scope: it.scope || it.Scope || "Global"
        };
      });
      renderClipboard();
    } catch (e) {
      // ignore
    }
  }

  function renderClipboard() {
    var root = $("clipList");
    if (!root) return;
    root.innerHTML = "";
    var items = store.clipboard || [];
    for (var i = 0; i < items.length; i++) {
      var c = items[i];
      if (!c.text) continue;
      var div = document.createElement("div");
      div.className = "item";
      var row = document.createElement("div");
      row.className = "itemRow";
      var text = document.createElement("div");
      text.className = "itemText";
      text.textContent = c.text;
      var actions = document.createElement("div");
      actions.className = "itemActions";
      var btn = document.createElement("button");
      btn.textContent = "Insert";
      btn.addEventListener("click", (function (t, id) {
        return function () {
          try { debugLog("clip_insert", { id: id, textLen: String(t || "").length }); } catch (e) {}
          insertText(t);
        };
      })(c.text, c.id));
      var btnDel = document.createElement("button");
      btnDel.textContent = "Delete";
      btnDel.addEventListener("click", (function (id) {
        return function () {
          store.clipboard = (store.clipboard || []).filter(function (x) { return String(x.id) !== String(id); });
          persistClipboard();
          renderClipboard();
          try { debugLog("clip_delete", { id: id }); } catch (e) {}
        };
      })(c.id));
      actions.appendChild(btn);
      actions.appendChild(btnDel);
      row.appendChild(text);
      row.appendChild(actions);
      div.appendChild(row);
      root.appendChild(div);
    }
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "ยังไม่มี clipboard";
      root.appendChild(empty);
    }
  }

  async function addClipboardFromUi() {
    var t = $("clipText") ? $("clipText").value.trim() : "";
    if (!t) return;
    try { debugLog("clipAdd_click", { textLen: t.length }); } catch (e) {}
    store.clipboard = store.clipboard || [];
    store.clipboard.push({ id: newId("clip"), text: t, scope: "Local" });
    persistClipboard();
    try { if ($("clipText")) $("clipText").value = ""; } catch (e) {}
    renderClipboard();
    try { debugLog("clipAdd_done", { count: (store.clipboard || []).length }); } catch (e) {}
    try {
      setStatus("clipboard added");
      setTimeout(function () { try { setStatus("ready"); } catch (e) {} }, 800);
    } catch (e) {}
  }

  // ============================================================
  // Macros
  // ============================================================
  async function loadMacros() {
    try {
      var params = { includeGlobal: true };
      if (pluginOptions.userId) params.ownerUserId = pluginOptions.userId;
      var data = await apiRequest("GET", "api/word-management/macros", params);
      var items = normalizePagedData(data);
      store.macros = (items || []).map(function (m) {
        return {
          id: String(m.id || m.Id || ""),
          name: m.name || m.Name || "",
          trigger: m.trigger || m.Trigger || "",
          shortcut: m.shortcut || m.Shortcut || "",
          steps: m.steps || m.Steps || []
        };
      });
      persistMacros();
      renderMacros();
    } catch (e) {
      try { debugLog("loadMacros_failed", { error: String(e) }); } catch (e2) {}
      // fallback: render from local storage
      try { store.macros = storageLoad(STORAGE_KEYS.macros, store.macros || []); } catch (e3) {}
      renderMacros();
    }
  }

  function renderMacros() {
    var root = $("macroList");
    if (!root) return;
    root.innerHTML = "";
    var items = store.macros || [];
    for (var i = 0; i < items.length; i++) {
      var m = items[i];
      var div = document.createElement("div");
      div.className = "item";
      var row = document.createElement("div");
      row.className = "itemRow";
      var text = document.createElement("div");
      text.className = "itemText";
      text.textContent = m.name || m.id;
      var actions = document.createElement("div");
      actions.className = "itemActions";
      var btn = document.createElement("button");
      btn.textContent = "Run";
      btn.addEventListener("click", (function (macro) {
        return function () { runMacro(macro); };
      })(m));
      var btnDel = document.createElement("button");
      btnDel.textContent = "Delete";
      btnDel.addEventListener("click", (function (id) {
        return function () {
          store.macros = (store.macros || []).filter(function (x) { return String(x.id) !== String(id); });
          persistMacros();
          renderMacros();
          try { debugLog("macro_delete", { id: id }); } catch (e) {}
        };
      })(m.id));
      actions.appendChild(btn);
      actions.appendChild(btnDel);
      row.appendChild(text);
      row.appendChild(actions);
      div.appendChild(row);
      root.appendChild(div);
    }
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "ยังไม่มี macros";
      root.appendChild(empty);
    }
  }

  function runMacro(macro) {
    // minimal mapping: steps[] with action/value
    var steps = macro && macro.steps ? macro.steps : [];
    if (!steps.length) return;
    try { debugLog("macro_run", { id: macro.id, name: macro.name, steps: steps.length }); } catch (e0) {}
    var out = [];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      var action = (s.action || s.Action || "").toString();
      var value = s.value || s.Value;
      if (action === "insert_text") out.push(String(value || ""));
      else if (action === "insert_newline") out.push("\n");
      else if (action === "insert_tab") out.push("\t");
      else if (action === "insert_space") out.push(" ");
      else if (action === "insert_date") out.push(new Date().toLocaleDateString("th-TH"));
      else if (action === "insert_time") out.push(new Date().toLocaleTimeString("th-TH"));
      else if (action === "insert_datetime") out.push(new Date().toLocaleString("th-TH"));
    }
    insertText(out.join(""));
  }

  // ============================================================
  // Redundant word
  // ============================================================
  async function loadRedundantWords() {
    try {
      var params = { type: "Redundant", includeGlobal: true };
      if (pluginOptions.userId) params.ownerUserId = pluginOptions.userId;
      var data = await apiRequest("GET", "api/word-management/entries", params);
      var items = normalizePagedData(data);
      store.redundant = (items || []).map(function (it) {
        var desc = it.description || it.Description;
        var exceptions = [];
        try {
          var parsed = JSON.parse(desc);
          if (Array.isArray(parsed)) exceptions = parsed;
        } catch (e) {}
        return {
          id: String(it.id || it.Id || ""),
          word: it.word || it.Word || "",
          exceptions: exceptions
        };
      });
      persistRedundant();
      renderRedundantSaved();
      renderRedundant([]);
    } catch (e) {
      try { debugLog("loadRedundant_failed", { error: String(e) }); } catch (e2) {}
      // fallback: local
      try { store.redundant = storageLoad(STORAGE_KEYS.redundant, store.redundant || []); } catch (e3) {}
      renderRedundantSaved();
    }
  }

  function renderRedundantSaved() {
    var root = $("redundantList");
    if (!root) return;
    root.innerHTML = "";
    var items = store.redundant || [];
    for (var i = 0; i < items.length; i++) {
      var w = items[i];
      var word = (w.word || "").trim();
      if (!word) continue;
      var div = document.createElement("div");
      div.className = "item";
      var row = document.createElement("div");
      row.className = "itemRow";
      var text = document.createElement("div");
      text.className = "itemText";
      var exc = w.exceptions && w.exceptions.length ? " (ยกเว้น: " + w.exceptions.join(", ") + ")" : "";
      text.textContent = word + exc;
      var actions = document.createElement("div");
      actions.className = "itemActions";
      var btnDel = document.createElement("button");
      btnDel.textContent = "Delete";
      btnDel.addEventListener("click", (function (id) {
        return function () {
          store.redundant = (store.redundant || []).filter(function (x) { return String(x.id) !== String(id); });
          persistRedundant();
          renderRedundantSaved();
          try { debugLog("redundant_delete", { id: id }); } catch (e) {}
        };
      })(w.id));
      actions.appendChild(btnDel);
      row.appendChild(text);
      row.appendChild(actions);
      div.appendChild(row);
      root.appendChild(div);
    }
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "ยังไม่มีคำฟุ่มเฟือย";
      root.appendChild(empty);
    }
  }

  async function addRedundantFromUi() {
    var word = $("redundantNewWord") ? $("redundantNewWord").value.trim() : "";
    if (!word) return;
    store.redundant = store.redundant || [];
    var lw = word.toLowerCase();
    for (var i = 0; i < store.redundant.length; i++) {
      if (((store.redundant[i].word || "").toLowerCase()) === lw) {
        try { debugLog("redundant_add_skip_exists", { word: word }); } catch (e0) {}
        return;
      }
    }
    store.redundant.unshift({ id: newId("redundant"), word: word, exceptions: [], scope: "Local" });
    persistRedundant();
    try { if ($("redundantNewWord")) $("redundantNewWord").value = ""; } catch (e1) {}
    renderRedundantSaved();
    try { debugLog("redundant_add", { word: word }); } catch (e2) {}
  }

  function renderRedundant(matches) {
    var root = $("redundantResults");
    if (!root) return;
    root.innerHTML = "";
    matches = matches || [];
    if (!matches.length) {
      var empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "ยังไม่มีผลการตรวจ";
      root.appendChild(empty);
      return;
    }
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      var div = document.createElement("div");
      div.className = "item";
      div.innerHTML = "<div class='itemRow'><div class='itemText'>พบคำฟุ่มเฟือย: " + m.word + "</div></div>";
      root.appendChild(div);
    }
  }

  async function checkRedundantInCurrentContext() {
    var mode = ( $("checkMode") && $("checkMode").value ) || pluginOptions.defaultCheckMode || "paragraph";
    getContext(mode, function (ctx) {
      var text = (ctx && ctx.text) ? String(ctx.text) : "";
      if (!text) {
        setOutput({ ok: false, error: "ไม่มีข้อความใน context" });
        return;
      }
      var matches = [];
      var list = store.redundant || [];
      for (var i = 0; i < list.length; i++) {
        var w = (list[i].word || "").trim();
        if (!w) continue;
        var idx = text.toLowerCase().indexOf(w.toLowerCase());
        if (idx >= 0) {
          // exception naive check
          var isException = false;
          var exc = list[i].exceptions || [];
          for (var j = 0; j < exc.length; j++) {
            if (exc[j] && text.toLowerCase().indexOf(String(exc[j]).toLowerCase()) >= 0) {
              isException = true;
              break;
            }
          }
          if (!isException) matches.push({ word: w, index: idx });
        }
      }
      renderRedundant(matches);
      try { debugLog("redundant_check", { mode: mode, matches: matches.length }); } catch (e0) {}
      if (matches.length) {
        // also offer quick apply: remove first match
        var cleaned = text;
        for (var k = 0; k < matches.length; k++) {
          cleaned = cleaned.split(matches[k].word).join("");
        }
        cleaned = cleaned.replace(/\s+/g, " ").trim();
        // Replace context with cleaned text (paragraph/pageA)
        if (mode === "selection") {
          replaceSelectionText(cleaned);
        } else {
          replaceCurrentParagraph(cleaned);
        }
      }
    });
  }

  function insertText(text) {
    if (!window.Asc || !window.Asc.plugin) return;
    var t = String(text || "");
    // NOTE: ในบาง build `callCommand` อาจไม่มีใน panelRight → หลีกเลี่ยงการพึ่ง callCommand
    // 1) PasteText: insert at cursor หรือ replace selection
    if (window.Asc.plugin.executeMethod) {
      try {
        window.Asc.plugin.executeMethod("PasteText", [t]);
        return;
      } catch (e0) {
        try { debugLog("PasteText_failed", { error: String(e0) }); } catch (e0b) {}
      }
      // 2) InputText: ทางเลือก (insert at cursor)
      try {
        window.Asc.plugin.executeMethod("InputText", [t]);
        return;
      } catch (e1) {
        try { debugLog("InputText_failed", { error: String(e1) }); } catch (e1b) {}
      }
    }

    // 3) No supported insertion method
    try {
      setOutput({ ok: false, error: "Cannot insert: executeMethod unavailable (PasteText/InputText)" });
    } catch (e2) {}
  }

  function getSelectedText(cb) {
    if (!window.Asc || !window.Asc.plugin) return;
    window.Asc.plugin.executeMethod("GetSelectedText", [], function (text) {
      try {
        cb && cb(text || "");
      } catch (e) {}
    });
  }

  function getCurrentParagraphText(cb) {
    if (!window.Asc || !window.Asc.plugin) return;
    // Prefer executeMethod if available (works even when callCommand is missing)
    try {
      if (window.Asc.plugin.executeMethod) {
        window.Asc.plugin.executeMethod("GetCurrentParagraph", [], function (p) {
          var text = "";
          try { if (p && p.GetText) text = p.GetText() || ""; } catch (e0) {}
          try { cb && cb(text); } catch (e1) {}
        });
        return;
      }
    } catch (e2) {}

    if (!window.Asc.plugin.callCommand || typeof window.Asc.plugin.callCommand !== "function") {
      try { cb && cb(""); } catch (e3) {}
      return;
    }
    window.Asc.scope = window.Asc.scope || {};
    window.Asc.scope.__do_para = "";
    window.Asc.plugin.callCommand(function () {
      var doc = Api.GetDocument();
      var p = null;
      try {
        if (doc && doc.GetCurrentParagraph) p = doc.GetCurrentParagraph();
      } catch (e) {}
      var text = "";
      try {
        if (p && p.GetText) text = p.GetText();
      } catch (e) {}
      Asc.scope.__do_para = text || "";
    }, false, true, function () {
      try {
        cb && cb(window.Asc && window.Asc.scope ? window.Asc.scope.__do_para : "");
      } catch (e) {}
    });
  }

  function getContext(mode, cb) {
    if (mode === "selection") {
      getSelectedText(function (text) {
        try { cb && cb({ mode: mode, text: text || "" }); } catch (e) {}
      });
      return;
    }
    // paragraph + pageA fallback: return current paragraph text, plus page index for pageA
    getCurrentParagraphText(function (paraText) {
      if (mode === "pageA") {
        getCurrentPage(function (page) {
          try { cb && cb({ mode: mode, text: paraText || "", page: page }); } catch (e) {}
        });
        return;
      }
      try { cb && cb({ mode: mode, text: paraText || "" }); } catch (e) {}
    });
  }

  function replaceSelectionText(newText) {
    if (!window.Asc || !window.Asc.plugin) return;
    var t = String(newText || "");
    // PasteText จะ replace selection ถ้ามี หรือ insert ที่ cursor ถ้าไม่มี
    if (window.Asc.plugin.executeMethod) {
      try {
        window.Asc.plugin.executeMethod("PasteText", [t]);
        return;
      } catch (e0) {
        try { debugLog("PasteText_failed", { error: String(e0) }); } catch (e0b) {}
      }
      try {
        window.Asc.plugin.executeMethod("InputText", [t]);
        return;
      } catch (e1) {
        try { debugLog("InputText_failed", { error: String(e1) }); } catch (e1b) {}
      }
    }
    insertText(t);
  }

  function replaceCurrentParagraph(newText) {
    if (!window.Asc || !window.Asc.plugin) return;
    var t = String(newText || "");

    // Prefer executeMethod path to avoid callCommand dependency
    try {
      if (window.Asc.plugin.executeMethod) {
        window.Asc.plugin.executeMethod("GetCurrentParagraph", [], function (p) {
          try {
            if (p && p.RemoveAllElements) p.RemoveAllElements();
          } catch (e0) {}
          try {
            if (p && p.AddText) p.AddText(t);
            else insertText(t);
          } catch (e1) {
            insertText(t);
          }
        });
        return;
      }
    } catch (e2) {}

    if (!window.Asc.plugin.callCommand || typeof window.Asc.plugin.callCommand !== "function") {
      // fallback: just insert at cursor
      insertText(t);
      return;
    }
    window.Asc.scope = window.Asc.scope || {};
    window.Asc.scope.__do_replace_para = t;
    window.Asc.plugin.callCommand(function () {
      try {
        var doc = Api.GetDocument();
        var p = null;
        try {
          if (doc && doc.GetCurrentParagraph) p = doc.GetCurrentParagraph();
        } catch (e) {}
        try {
          if (p && p.Delete) p.Delete();
        } catch (e) {}
        var np = Api.CreateParagraph();
        np.AddText(Asc.scope.__do_replace_para);
        doc.InsertContent([np], true);
      } catch (e) {}
    }, true);
  }

  function getCurrentPage(cb) {
    if (!window.Asc || !window.Asc.plugin) return;
    window.Asc.plugin.callCommand(function () {
      var doc = Api.GetDocument();
      var page = null;
      if (doc && doc.GetCurrentPage) {
        page = doc.GetCurrentPage();
      }
      Asc.scope = Asc.scope || {};
      Asc.scope.__do_page = page;
    }, false, true, function () {
      try {
        cb && cb(window.Asc && window.Asc.scope ? window.Asc.scope.__do_page : null);
      } catch (e) {}
    });
  }

  // Basic init
  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  window.Asc.plugin.init = function () {
    var injected = tryReadInjectedOptions();
    mergeOptions(injected);
    ensureUiBound("Asc.init");
    initLocalData();
    setStatus("ready");
    sendToHost({ type: "do:pluginReady", version: PLUGIN_VERSION });
    setOutput({
      plugin: "DocumentOffice",
      injectedOptionsKeys: injected ? Object.keys(injected) : [],
      hasAccessToken: Boolean(pluginOptions.accessToken),
      apiBaseUrl: pluginOptions.apiBaseUrl || "",
      features: pluginOptions.features || {}
    });

    // Local-only: render from LocalStorage immediately
    try { renderAbbreviations(); } catch (e) {}
    try { renderClipboard(); } catch (e) {}
    try { renderMacros(); } catch (e) {}
    try { renderRedundant(); } catch (e) {}
    try { renderDictionarySaved(); } catch (e) {}
    try { renderRedundantSaved(); } catch (e) {}

    // Attach basic events (cursor movement) for later phases
    if (window.Asc.plugin.attachEditorEvent) {
      window.Asc.plugin.attachEditorEvent("onTargetPositionChanged", function (data) {
        // keep it light; only log when needed in later phases
      });

      // Key-detection surrogate (Input Helper) - will be used for dictionary/suggestion
      window.Asc.plugin.attachEditorEvent("onInputHelperInput", function (data) {
        try {
          // Initialize input helper once
          if (!window.__do_inputHelperInited && window.Asc.plugin.createInputHelper) {
            window.__do_inputHelperInited = true;
            window.Asc.plugin.createInputHelper();
            if (window.Asc.plugin.getInputHelper) {
              window.Asc.plugin.getInputHelper().createWindow();
            }
          }
        } catch (e) {}

        // data commonly includes current input string
        var text = "";
        try {
          if (typeof data === "string") text = data;
          else if (data && typeof data.text === "string") text = data.text;
          else if (data && typeof data.data === "string") text = data.data;
        } catch (e) {}

        // show helper near cursor and populate suggestions (top 5)
        if (text && text.length >= 2) {
          try { debugLog("inputHelper_input", { text: text, len: text.length }); } catch (e0) {}
          void updateInputHelperSuggestions(text);
        }
      });
      window.Asc.plugin.attachEditorEvent("onInputHelperClear", function () {
        try {
          if (window.Asc && window.Asc.plugin) {
            window.Asc.plugin.executeMethod("UnShowInputHelper", [PLUGIN_GUID || "", true]);
          }
        } catch (e) {}
      });
      window.Asc.plugin.attachEditorEvent("onInputHelperItemClick", function (data) {
        try {
          var value = "";
          if (typeof data === "string") value = data;
          else if (data && typeof data.text === "string") value = data.text;
          else if (data && typeof data.value === "string") value = data.value;
          else if (data && data.item && typeof data.item.text === "string") value = data.item.text;
          if (value) {
            // PasteText จะ replace selection ถ้ามี หรือ insert ที่ cursor ถ้าไม่มี
            insertText(value);
          } else {
            // fallback
            insertText(String(data || ""));
          }
        } catch (e) {}
      });
    }
  };

  // NOTE: config.json guid is constant; keep here too for InputHelper show/hide
  var PLUGIN_GUID = "asc.{C6A86F5A-5A0F-49F8-9E72-9E8E1E2F86A1}";

  async function updateInputHelperSuggestions(query) {
    try {
      // show helper; capture keyboard so Tab/Enter works inside helper
      try {
        window.Asc.plugin.executeMethod("ShowInputHelper", [PLUGIN_GUID, 80, 40, true]);
      } catch (e) {}

      // local-only suggestions:
      // - abbreviation shortForm/fullForm match
      // - clipboard text match
      var q = String(query || "").trim().toLowerCase();
      if (!q) return;
      var list = [];
      var seen = {};

      var abbr = store.abbreviations || [];
      for (var i = 0; i < abbr.length; i++) {
        var s = String(abbr[i].shortForm || "").trim();
        var f = String(abbr[i].fullForm || "").trim();
        if (!s && !f) continue;
        if (s.toLowerCase().indexOf(q) === 0 || f.toLowerCase().indexOf(q) === 0) {
          var val = f || s;
          var key = "abbr:" + val;
          if (!seen[key]) {
            seen[key] = true;
            list.push({ text: val, value: val });
          }
        }
        if (list.length >= 5) break;
      }

      // dictionary (local) suggestions
      if (list.length < 5) {
        var dict = store.dictionary || [];
        for (var di = 0; di < dict.length; di++) {
          var dw = String(dict[di].word || dict[di].Word || "").trim();
          if (!dw) continue;
          if (dw.toLowerCase().indexOf(q) === 0) {
            var k3 = "dict:" + dw;
            if (!seen[k3]) {
              seen[k3] = true;
              list.push({ text: dw, value: dw });
            }
          }
          if (list.length >= 5) break;
        }
      }

      if (list.length < 5) {
        var clips = store.clipboard || [];
        for (var j = 0; j < clips.length; j++) {
          var t = String(clips[j].text || "").trim();
          if (!t) continue;
          if (t.toLowerCase().indexOf(q) === 0) {
            var key2 = "clip:" + t;
            if (!seen[key2]) {
              seen[key2] = true;
              list.push({ text: t, value: t });
            }
          }
          if (list.length >= 5) break;
        }
      }

      if (window.Asc.plugin.getInputHelper) {
        var ih = window.Asc.plugin.getInputHelper();
        if (ih && ih.setItems) ih.setItems(list);
      }
      try { debugLog("inputHelper_items", { count: list.length }); } catch (e0) {}
    } catch (e) {
      // ignore
    }
  }

  // Host -> Plugin command bus (DocsAPI.DocEditor.sendExternalMessage)
  // See: onExternalPluginMessage event in ONLYOFFICE plugin API
  window.Asc.plugin.onExternalPluginMessage = function (msg) {
    try {
      if (!msg || typeof msg !== "object") return;

      // v1 envelope
      if (msg.type === "do:command" && msg.id && msg.command) {
        var id = String(msg.id);
        var cmd = String(msg.command);
        var payload = msg.payload;

        var replyOk = function (result) {
          sendToHost({ type: "do:response", id: id, ok: true, result: result });
        };
        var replyErr = function (error) {
          sendToHost({ type: "do:response", id: id, ok: false, error: String(error || "Unknown error") });
        };

        try {
          if (cmd === "setOptions" && payload && typeof payload === "object") {
            mergeOptions(payload);
            replyOk({ hasAccessToken: Boolean(pluginOptions.accessToken) });
            return;
          }
          if (cmd === "insertText") {
            insertText((payload && payload.text) || "");
            replyOk(true);
            return;
          }
          if (cmd === "replaceContext") {
            var mode2 = (payload && payload.mode) || pluginOptions.defaultCheckMode || "paragraph";
            var text2 = (payload && payload.text) || "";
            if (mode2 === "selection") replaceSelectionText(text2);
            else replaceCurrentParagraph(text2);
            replyOk(true);
            return;
          }
          if (cmd === "getStatus") {
            replyOk({
              plugin: "DocumentOffice",
              version: PLUGIN_VERSION,
              hasAccessToken: Boolean(pluginOptions.accessToken),
              apiBaseUrl: pluginOptions.apiBaseUrl || "",
              defaultCheckMode: pluginOptions.defaultCheckMode || "paragraph"
            });
            return;
          }
          if (cmd === "getCurrentPage") {
            getCurrentPage(function (page) {
              replyOk({ page: page });
            });
            return;
          }
          if (cmd === "getContext") {
            var mode = (payload && payload.mode) || pluginOptions.defaultCheckMode || "paragraph";
            getContext(mode, function (ctx) {
              replyOk({ context: ctx });
            });
            return;
          }

          replyErr("Unknown command: " + cmd);
          return;
        } catch (e) {
          replyErr(e);
          return;
        }
      }

      // legacy messages (no response)
      var type = msg.type;
      if (type === "setOptions" && msg.data) {
        mergeOptions(msg.data);
        setOutput({ ok: true, type: "setOptions", hasAccessToken: Boolean(pluginOptions.accessToken) });
        return;
      }
      if (type === "insertText") {
        insertText(msg.text || "");
        return;
      }
      if (type === "replaceContext") {
        var mode2b = msg.mode || pluginOptions.defaultCheckMode || "paragraph";
        var text2b = msg.text || "";
        if (mode2b === "selection") {
          replaceSelectionText(text2b);
        } else {
          replaceCurrentParagraph(text2b);
        }
        return;
      }
      if (type === "getStatus") {
        setOutput({
          plugin: "DocumentOffice",
          version: PLUGIN_VERSION,
          ok: true,
          hasAccessToken: Boolean(pluginOptions.accessToken),
          apiBaseUrl: pluginOptions.apiBaseUrl || "",
          defaultCheckMode: pluginOptions.defaultCheckMode || "paragraph"
        });
        return;
      }
      if (type === "getCurrentPage") {
        getCurrentPage(function (page) {
          setOutput({ ok: true, type: "getCurrentPage", page: page });
        });
        return;
      }
      if (type === "getContext") {
        var modeb = msg.mode || pluginOptions.defaultCheckMode || "paragraph";
        getContext(modeb, function (ctx) {
          setOutput({ ok: true, type: "getContext", context: ctx });
        });
        return;
      }
    } catch (e) {
      setOutput({ ok: false, error: String(e) });
      sendToHost({ type: "do:pluginError", error: String(e) });
    }
  };

  window.Asc.plugin.button = function (id) {
    // Close button in panel
    try {
      this.executeCommand("close", "");
    } catch (e) {}
  };
})();

