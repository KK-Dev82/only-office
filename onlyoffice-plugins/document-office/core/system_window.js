// System Window logic (Clipboard / Macros) - Global items from M0106
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};

  var PLUGIN_GUID = "asc.{C6A86F5A-5A0F-49F8-9E72-9E8E1E2F86A1}";

  function qs(name) {
    try {
      var u = new URL(String(window.location && window.location.href ? window.location.href : ""));
      return u.searchParams.get(name);
    } catch (e) {
      try {
        var s = String(window.location && window.location.search ? window.location.search : "");
        var m = s.match(new RegExp("(?:\\?|&)" + name + "=([^&]+)"));
        return m ? decodeURIComponent(m[1]) : null;
      } catch (e2) {
        return null;
      }
    }
  }

  function $(id) {
    try {
      return DO.$ ? DO.$(id) : document.getElementById(id);
    } catch (e) {
      return null;
    }
  }

  var state = (DO.state = DO.state || {});
  state.__sysWin = state.__sysWin || {
    mode: "clipboard", // clipboard | macros
    page: 1,
    limit: 50,
    total: 0,
    keyword: "",
    loading: false,
    macrosCache: null, // for macros: full list cached, paginated client-side
  };

  function baseUrl() {
    try {
      var b = (DO.pluginOptions && DO.pluginOptions.apiBaseUrl) ? String(DO.pluginOptions.apiBaseUrl) : "";
      b = b.replace(/\/+$/g, "");
      if (b) return b;
      try {
        if (DO.STORAGE_PREFIX) {
          var v = String(localStorage.getItem(DO.STORAGE_PREFIX + "apiBaseUrl") || "").trim();
          v = v.replace(/\/+$/g, "");
          if (v) return v;
        }
      } catch (e2) {}
      try {
        var o = String(window.location && window.location.origin ? window.location.origin : "").trim();
        return o.replace(/\/+$/g, "");
      } catch (e3) {}
      return b;
    } catch (e) {
      try {
        return String(window.location && window.location.origin ? window.location.origin : "").replace(/\/+$/g, "");
      } catch (e2) {
        return "";
      }
    }
  }

  function buildUrl(path) {
    var p = String(path || "").replace(/^\/+/g, "");
    var b = baseUrl();
    return b ? (b + "/" + p) : p;
  }

  function authHeaders() {
    var h = { "Content-Type": "application/json" };
    try {
      var t = DO.pluginOptions && DO.pluginOptions.accessToken ? String(DO.pluginOptions.accessToken) : "";
      if (!t) {
        try {
          if (DO.STORAGE_PREFIX) {
            t = String(localStorage.getItem(DO.STORAGE_PREFIX + "accessToken") || "");
          }
        } catch (e2) {}
      }
      if (t) h["Authorization"] = "Bearer " + t;
    } catch (e) {}
    return h;
  }

  function safeJsonParse(text, fallback) {
    try { return JSON.parse(text); } catch (e) { return fallback; }
  }

  function extractList(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    var a = payload.data || payload.Data || payload;
    return Array.isArray(a) ? a : [];
  }

  function extractTotal(payload, fallback) {
    try {
      var t = payload && (payload.total || payload.Total);
      if (typeof t === "number") return t;
    } catch (e) {}
    return fallback;
  }

  function fetchJson(url) {
    return fetch(url, { method: "GET", headers: authHeaders() })
      .then(function (res) {
        if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "0"));
        return res.text();
      })
      .then(function (t) { return safeJsonParse(t, {}); });
  }

  function setText(id, text) {
    try {
      if (DO.setText) DO.setText(id, text);
      else {
        var el = $(id);
        if (el) el.textContent = String(text || "");
      }
    } catch (e) {}
  }

  function setTitle() {
    var mode = state.__sysWin.mode;
    setText("sysWinTitle", mode === "macros" ? "🧩 Macros ส่วนกลาง (Global)" : "📋 Clipboard ส่วนกลาง (Global)");
  }

  function setMeta(text) {
    var el = $("sysWinMeta");
    if (el) el.textContent = String(text || "");
  }

  // ----- Clipboard: server-side pagination via api/word-management/entries -----
  function buildClipboardUrl() {
    var page = Number(state.__sysWin.page || 1);
    var limit = Number(state.__sysWin.limit || 50);
    var offset = Math.max(0, (page - 1) * limit);
    var keyword = String(state.__sysWin.keyword || "").trim();
    var u =
      "api/word-management/entries?type=Clipboard&scope=Global&includeGlobal=false" +
      "&offset=" + encodeURIComponent(String(offset)) +
      "&limit=" + encodeURIComponent(String(limit));
    if (keyword) u += "&keyword=" + encodeURIComponent(keyword);
    return buildUrl(u);
  }

  // ----- Macros: client-side filter (API has no scope/keyword params) -----
  function isGlobalMacro(m) {
    try {
      var scope = String((m && (m.scope || m.Scope)) || "").toLowerCase();
      if (scope === "global") return true;
      if (m && (m.ownerUserId === null || m.OwnerUserId === null)) return true;
    } catch (e) {}
    return false;
  }

  function buildMacrosUrl() {
    return buildUrl("api/word-management/macros?includeGlobal=true");
  }

  function fetchMacrosAll() {
    return fetchJson(buildMacrosUrl()).then(function (payload) {
      var arr = extractList(payload);
      var globals = [];
      for (var i = 0; i < arr.length; i++) {
        if (isGlobalMacro(arr[i])) globals.push(arr[i]);
      }
      return globals;
    });
  }

  function filterMacrosByKeyword(items, keyword) {
    var k = String(keyword || "").trim().toLowerCase();
    if (!k) return items;
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var m = items[i] || {};
      var hay = [
        String(m.name || m.Name || ""),
        String(m.description || m.Description || ""),
        String(m.shortcut || m.Shortcut || ""),
        String(m.trigger || m.Trigger || "")
      ].join(" ").toLowerCase();
      if (hay.indexOf(k) >= 0) out.push(m);
    }
    return out;
  }

  // Compile macro insert text from steps[] (mirror of features/macros.js compileMacroText)
  function expandTokens(text) {
    var t = String(text || "");
    if (!t) return "";
    try {
      t = t.replace(/\[(tab)\]/gi, "\t");
      t = t.replace(/\[(space)\]/gi, " ");
      t = t.replace(/\[(nl|newline|enter)\]/gi, "\n");
    } catch (e) {}
    return t;
  }

  function stepText(s) {
    if (!s) return "";
    var action = String(s.action || s.Action || "insert_text").toLowerCase();
    var value = s.value != null ? s.value : s.Value;
    if (action === "insert_text") return expandTokens(String(value || ""));
    if (action === "insert_tab" || action === "tab") return "\t";
    if (action === "insert_newline" || action === "newline" || action === "enter") return "\n";
    if (action === "insert_space" || action === "space") return " ";
    return expandTokens(String(value || ""));
  }

  function compileMacroText(m) {
    if (!m) return "";
    if (m.text != null) return expandTokens(String(m.text || ""));
    if (m.value != null) return String(m.value || "");
    var steps = m.steps || m.Steps;
    if (Array.isArray(steps) && steps.length) {
      var out = "";
      for (var i = 0; i < steps.length; i++) out += stepText(steps[i]);
      return out;
    }
    return String(m.name || m.Name || "");
  }

  function flashStatus(msg) {
    try {
      if (!DO.setStatus) return;
      DO.setStatus(msg);
      setTimeout(function () { try { DO.setStatus("ready"); } catch (e0) {} }, 800);
    } catch (e1) {}
  }

  function copyText(text) {
    var t = String(text || "");
    if (!t) return;
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(t)
          .then(function () { flashStatus("copied"); })
          .catch(function () { if (fallbackCopy(t)) flashStatus("copied"); else flashStatus("copy failed"); });
        return;
      }
    } catch (e0) {}
    flashStatus(fallbackCopy(t) ? "copied" : "copy failed");
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = String(text || "");
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand && document.execCommand("copy"); } catch (e1) { ok = false; }
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  // ShowWindow child windows cannot run editor commands on this DocumentServer
  // (neither callCommand nor PasteText reach the editor, modal or not). So the
  // window writes the request to a shared localStorage key; the panelRight frame
  // (which CAN insert) listens for it and performs the insert. See bootstrap.js.
  function relayInsert(value) {
    var t = String(value || "").trim();
    if (!t) return false;
    try {
      var key = (DO.STORAGE_PREFIX || "") + "insertRelay";
      localStorage.setItem(key, JSON.stringify({ text: t, nonce: String(Date.now()) + "_" + Math.random() }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function makeInsertButton(value) {
    var b = document.createElement("button");
    b.textContent = "Insert";
    b.addEventListener("click", function () {
      var ok = relayInsert(value);
      flashStatus(ok ? "inserted" : "insert failed");
    });
    return b;
  }

  function makeCopyButton(value) {
    var b = document.createElement("button");
    b.textContent = "Copy";
    b.addEventListener("click", function () { copyText(value); });
    return b;
  }

  function renderClipboardItem(it) {
    var div = document.createElement("div");
    div.className = "doItem";
    var row = document.createElement("div");
    row.className = "doItemRow";
    var text = document.createElement("div");
    text.className = "doItemText";
    var w = String(it.word || it.Word || "").trim();
    var d = String(it.entryDescription || it.EntryDescription || it.description || it.Description || "").trim();
    text.textContent = w + (d ? "  —  " + d : "");

    var insVal = String(it.word || it.Word || "").trim();
    var actions = document.createElement("div");
    actions.className = "doItemActions";
    actions.appendChild(makeInsertButton(insVal));
    actions.appendChild(makeCopyButton(insVal));

    row.appendChild(text);
    row.appendChild(actions);
    div.appendChild(row);
    return div;
  }

  function renderMacroItem(m) {
    var div = document.createElement("div");
    div.className = "doItem";
    var row = document.createElement("div");
    row.className = "doItemRow";
    var text = document.createElement("div");
    text.className = "doItemText";
    var name = String(m.name || m.Name || "").trim() || "-";
    var compiled = compileMacroText(m);
    var preview = compiled;
    try {
      preview = preview.replace(/\t/g, "[tab]").replace(/\n/g, "[nl]");
    } catch (e) {}
    if (preview && preview !== name) {
      text.textContent = name + "  —  " + preview;
    } else {
      text.textContent = name;
    }

    var macroVal = compileMacroText(m);
    var actions = document.createElement("div");
    actions.className = "doItemActions";
    actions.appendChild(makeInsertButton(macroVal));
    actions.appendChild(makeCopyButton(macroVal));

    row.appendChild(text);
    row.appendChild(actions);
    div.appendChild(row);
    return div;
  }

  function renderList(items) {
    var root = $("sysWinList");
    if (!root) return;
    root.innerHTML = "";
    items = items || [];

    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var node = state.__sysWin.mode === "macros" ? renderMacroItem(it) : renderClipboardItem(it);
      root.appendChild(node);
    }

    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "doMuted";
      empty.textContent = "ไม่พบข้อมูล";
      root.appendChild(empty);
    }
  }

  function refreshClipboard() {
    var url = buildClipboardUrl();
    return fetchJson(url).then(function (payload) {
      var items = extractList(payload);
      var total = extractTotal(payload, items.length);
      state.__sysWin.total = total;
      renderList(items);
      var page = Number(state.__sysWin.page || 1);
      var limit = Number(state.__sysWin.limit || 50);
      var offset = Math.max(0, (page - 1) * limit);
      var end = Math.min(offset + items.length, total);
      setMeta("แสดง " + (items.length ? (offset + 1) : 0) + "-" + end + " จาก " + total);
    });
  }

  function refreshMacros(forceFetch) {
    var loadAll = forceFetch || !state.__sysWin.macrosCache;
    var p = loadAll
      ? fetchMacrosAll().then(function (arr) {
          state.__sysWin.macrosCache = arr || [];
          return state.__sysWin.macrosCache;
        })
      : Promise.resolve(state.__sysWin.macrosCache || []);

    return p.then(function (all) {
      var filtered = filterMacrosByKeyword(all, state.__sysWin.keyword);
      var total = filtered.length;
      state.__sysWin.total = total;
      var page = Number(state.__sysWin.page || 1);
      var limit = Number(state.__sysWin.limit || 50);
      var startIdx = Math.max(0, (page - 1) * limit);
      var pageItems = filtered.slice(startIdx, startIdx + limit);
      renderList(pageItems);
      var end = Math.min(startIdx + pageItems.length, total);
      setMeta("แสดง " + (pageItems.length ? (startIdx + 1) : 0) + "-" + end + " จาก " + total);
    });
  }

  function refresh(forceFetch) {
    if (state.__sysWin.loading) return;
    state.__sysWin.loading = true;
    try { if (DO.setStatus) DO.setStatus("loading…"); } catch (e0) {}
    setMeta("loading…");

    var p = state.__sysWin.mode === "macros" ? refreshMacros(forceFetch) : refreshClipboard();
    return p
      .catch(function (e) {
        renderList([]);
        setMeta("โหลดไม่สำเร็จ: " + String(e));
      })
      .then(function () {
        state.__sysWin.loading = false;
        try { if (DO.setStatus) DO.setStatus("ready"); } catch (e0) {}
      });
  }

  function closeWindow(windowID) {
    try {
      var wid = "";
      try {
        var info = window.Asc && window.Asc.plugin && window.Asc.plugin.info;
        wid = String((info && (info.windowID || info.windowId || info.id)) || windowID || "");
      } catch (e0) {
        wid = String(windowID || "");
      }
      if (wid && window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
        window.Asc.plugin.executeMethod("CloseWindow", [wid]);
        return;
      }
    } catch (e1) {}
    try { window.close(); } catch (e2) {}
  }

  function bind() {
    var mode = String(qs("mode") || "clipboard").toLowerCase();
    state.__sysWin.mode = mode === "macros" ? "macros" : "clipboard";

    setTitle();

    var closeBtn = $("sysWinClose");
    if (closeBtn) closeBtn.addEventListener("click", function () { closeWindow(); });

    var reload = $("sysWinReload");
    if (reload) reload.addEventListener("click", function () { refresh(true); });

    var prev = $("sysWinPrev");
    if (prev)
      prev.addEventListener("click", function () {
        var p = Number(state.__sysWin.page || 1);
        if (p <= 1) return;
        state.__sysWin.page = p - 1;
        refresh(false);
      });

    var next = $("sysWinNext");
    if (next)
      next.addEventListener("click", function () {
        var p = Number(state.__sysWin.page || 1);
        var limit = Number(state.__sysWin.limit || 50);
        var total = Number(state.__sysWin.total || 0);
        if (p * limit >= total) return;
        state.__sysWin.page = p + 1;
        refresh(false);
      });

    var searchBtn = $("sysWinSearchBtn");
    if (searchBtn)
      searchBtn.addEventListener("click", function () {
        try {
          var el = $("sysWinSearch");
          state.__sysWin.keyword = el ? String(el.value || "").trim() : "";
        } catch (e0) {
          state.__sysWin.keyword = "";
        }
        state.__sysWin.page = 1;
        refresh(false);
      });

    var search = $("sysWinSearch");
    if (search)
      search.addEventListener("keydown", function (e) {
        try {
          if (e && e.key === "Enter") {
            e.preventDefault();
            if (searchBtn) searchBtn.click();
          }
          if (e && e.key === "Escape") {
            e.preventDefault();
            closeWindow();
          }
        } catch (e0) {}
      });

    refresh(true);
  }

  DO.features.systemWindow = {
    bind: bind,
    refresh: refresh,
    closeWindow: closeWindow,
    pluginGuid: PLUGIN_GUID,
  };
})();
