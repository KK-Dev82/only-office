// System Window logic (Dictionary / Abbreviation)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};

  var PLUGIN_GUID = "asc.{8B6B9F89-7C57-4E1F-8B78-2B3D6B31E0DE}";

  function qs(name) {
    try {
      var u = new URL(String(window.location && window.location.href ? window.location.href : ""));
      return u.searchParams.get(name);
    } catch (e) {
      // fallback minimal
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
    mode: "dictionary", // dictionary | abbreviation
    page: 1,
    limit: 50,
    total: 0,
    keyword: "",
    loading: false,
  };

  function baseUrl() {
    try {
      var b = (DO.pluginOptions && DO.pluginOptions.apiBaseUrl) ? String(DO.pluginOptions.apiBaseUrl) : "";
      b = b.replace(/\/+$/g, "");
      if (b) return b;
      // Fallback: read from localStorage (saved by main panel)
      try {
        if (DO.STORAGE_PREFIX) {
          var v = String(localStorage.getItem(DO.STORAGE_PREFIX + "apiBaseUrl") || "").trim();
          v = v.replace(/\/+$/g, "");
          if (v) return v;
        }
      } catch (e2) {}
      // Last resort: use origin
      try {
        var o = String(window.location && window.location.origin ? window.location.origin : "").trim();
        o = o.replace(/\/+$/g, "");
        return o;
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
    var p = String(path || "");
    p = p.replace(/^\/+/g, "");
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
    try {
      return JSON.parse(text);
    } catch (e) {
      return fallback;
    }
  }

  function extractList(payload) {
    if (!payload) return [];
    var a = payload.data || payload.Data || payload;
    return Array.isArray(a) ? a : [];
  }

  function extractTotal(payload, fallback) {
    try {
      var t = payload.total || payload.Total;
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
      .then(function (t) {
        return safeJsonParse(t, {});
      });
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
    setText("sysWinTitle", mode === "abbreviation" ? "📝 คำย่อระบบ (Global)" : "📚 คำศัพท์ระบบ (Global)");
  }

  function setMeta(text) {
    var el = $("sysWinMeta");
    if (el) el.textContent = String(text || "");
  }

  function buildFetchUrl() {
    var page = Number(state.__sysWin.page || 1);
    var limit = Number(state.__sysWin.limit || 50);
    var offset = Math.max(0, (page - 1) * limit);
    var keyword = String(state.__sysWin.keyword || "").trim();

    if (state.__sysWin.mode === "abbreviation") {
      // Same as M0106: entries list (Global only)
      var u =
        "api/word-management/entries?type=Abbreviation&scope=Global&includeGlobal=false" +
        "&offset=" +
        encodeURIComponent(String(offset)) +
        "&limit=" +
        encodeURIComponent(String(limit));
      if (keyword) u += "&keyword=" + encodeURIComponent(keyword);
      return buildUrl(u);
    }

    var u2 =
      "api/word-management/dictionary?scope=Global&includeGlobal=true" +
      "&offset=" +
      encodeURIComponent(String(offset)) +
      "&limit=" +
      encodeURIComponent(String(limit));
    if (keyword) u2 += "&keyword=" + encodeURIComponent(keyword);
    return buildUrl(u2);
  }

  function renderList(items) {
    var root = $("sysWinList");
    if (!root) return;
    root.innerHTML = "";
    items = items || [];

    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var div = document.createElement("div");
      div.className = "doItem";
      var row = document.createElement("div");
      row.className = "doItemRow";
      var text = document.createElement("div");
      text.className = "doItemText";

      if (state.__sysWin.mode === "abbreviation") {
        var s = String(it.word || it.Word || "").trim();
        var f = String(it.fullWord || it.FullWord || "").trim() || s;
        text.textContent = s + " → " + f;
      } else {
        var w = String(it.word || it.Word || "").trim();
        var d = String(it.entryDescription || it.EntryDescription || it.description || it.Description || "").trim();
        text.textContent = w + (d ? " — " + d : "");
      }

      var actions = document.createElement("div");
      actions.className = "doItemActions";

      var btnInsert = document.createElement("button");
      btnInsert.textContent = "Insert";
      btnInsert.addEventListener(
        "click",
        (function (data) {
          return function () {
            try {
              if (!DO.editor || !DO.editor.insertText) return;
              if (state.__sysWin.mode === "abbreviation") {
                var ff = String(data.fullWord || data.FullWord || data.word || data.Word || "").trim();
                if (ff) DO.editor.insertText(ff);
              } else {
                var ww = String(data.word || data.Word || "").trim();
                if (ww) DO.editor.insertText(ww);
              }
            } catch (e0) {}
          };
        })(it)
      );
      actions.appendChild(btnInsert);

      row.appendChild(text);
      row.appendChild(actions);
      div.appendChild(row);
      root.appendChild(div);
    }

    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "doMuted";
      empty.textContent = "ไม่พบข้อมูล";
      root.appendChild(empty);
    }
  }

  function refresh() {
    if (state.__sysWin.loading) return;
    state.__sysWin.loading = true;
    try { if (DO.setStatus) DO.setStatus("loading…"); } catch (e0) {}
    setMeta("loading…");

    var url = buildFetchUrl();
    return fetchJson(url)
      .then(function (payload) {
        var items = extractList(payload);
        var total = extractTotal(payload, items.length);
        state.__sysWin.total = total;

        renderList(items);
        var page = Number(state.__sysWin.page || 1);
        var limit = Number(state.__sysWin.limit || 50);
        var offset = Math.max(0, (page - 1) * limit);
        var end = Math.min(offset + items.length, total);
        setMeta("แสดง " + (items.length ? (offset + 1) : 0) + "-" + end + " จาก " + total);
      })
      .catch(function (e) {
        renderList([]);
        setMeta("โหลดไม่สำเร็จ: " + String(e));
      })
      .finally(function () {
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
    // mode from query (?mode=dictionary|abbreviation)
    var mode = String(qs("mode") || "dictionary").toLowerCase();
    state.__sysWin.mode = mode === "abbreviation" ? "abbreviation" : "dictionary";

    setTitle();

    var closeBtn = $("sysWinClose");
    if (closeBtn) closeBtn.addEventListener("click", function () { closeWindow(); });

    var reload = $("sysWinReload");
    if (reload) reload.addEventListener("click", function () { refresh(); });

    var prev = $("sysWinPrev");
    if (prev)
      prev.addEventListener("click", function () {
        var p = Number(state.__sysWin.page || 1);
        if (p <= 1) return;
        state.__sysWin.page = p - 1;
        refresh();
      });

    var next = $("sysWinNext");
    if (next)
      next.addEventListener("click", function () {
        var p = Number(state.__sysWin.page || 1);
        state.__sysWin.page = p + 1;
        refresh();
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
        refresh();
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

    // initial load
    refresh();
  }

  DO.features.systemWindow = {
    bind: bind,
    refresh: refresh,
    closeWindow: closeWindow,
    pluginGuid: PLUGIN_GUID,
  };
})();

