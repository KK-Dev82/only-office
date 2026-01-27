// Remote Sync (Backend -> LocalStorage)
// - Pull Dictionary & Abbreviation from api/word-management
// - Merge into DO.store and persist to localStorage so:
//   - thai-autocomplete can read da:v1:dictionary
//   - abbreviation auto-expand can use da:v1:abbreviations
(function () {
  var DO = (window.DO = window.DO || {});
  DO.remoteSync = DO.remoteSync || {};

  function baseUrl() {
    try {
      var b = (DO.pluginOptions && DO.pluginOptions.apiBaseUrl) ? String(DO.pluginOptions.apiBaseUrl) : "";
      b = b.replace(/\/+$/g, "");
      return b;
    } catch (e) {
      return "";
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

  function normalizeWordEntry(item) {
    item = item || {};
    return {
      id: String(item.id || item.Id || ""),
      word: String(item.word || item.Word || "").trim(),
      fullWord: String(item.fullWord || item.FullWord || "").trim(),
      description: String(item.description || item.Description || "").trim(),
      scope: String(item.scope || item.Scope || "").trim(), // Global | Personal
    };
  }

  function extractList(payload) {
    if (!payload) return [];
    // Common shapes:
    // - { data: [...], total: ... }
    // - { Data: [...], Total: ... }
    // - [...items]
    var a = payload.data || payload.Data || payload;
    return Array.isArray(a) ? a : [];
  }

  function ensureStore() {
    DO.store = DO.store || {};
    DO.store.dictionary = Array.isArray(DO.store.dictionary) ? DO.store.dictionary : [];
    DO.store.abbreviations = Array.isArray(DO.store.abbreviations) ? DO.store.abbreviations : [];
  }

  function mergeDictionary(dbItems) {
    ensureStore();
    var local = DO.store.dictionary || [];
    // Keep local first, then DB. Dedup by word lower.
    var seen = {};
    var out = [];

    function pushWord(obj) {
      var w = String(obj.word || obj.Word || "").trim();
      if (!w) return;
      var k = w.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(obj);
    }

    for (var i = 0; i < local.length; i++) pushWord(local[i]);
    for (var j = 0; j < dbItems.length; j++) pushWord(dbItems[j]);

    DO.store.dictionary = out;
    try { if (DO.persist && DO.persist.dictionary) DO.persist.dictionary(); } catch (e0) {}
  }

  function mergeAbbreviations(dbItems) {
    ensureStore();
    var local = DO.store.abbreviations || [];
    // Dedup by shortForm|fullForm
    var seen = {};
    var out = [];

    function keyOf(a) {
      var s = String(a.shortForm || "").trim().toLowerCase();
      var f = String(a.fullForm || "").trim().toLowerCase();
      return s + "|" + f;
    }

    function pushAbbr(obj) {
      var s = String(obj.shortForm || "").trim();
      var f = String(obj.fullForm || "").trim();
      if (!s || !f) return;
      var k = keyOf(obj);
      if (seen[k]) return;
      seen[k] = true;
      out.push(obj);
    }

    for (var i = 0; i < local.length; i++) pushAbbr(local[i]);
    for (var j = 0; j < dbItems.length; j++) pushAbbr(dbItems[j]);

    DO.store.abbreviations = out;
    try { if (DO.persist && DO.persist.abbreviations) DO.persist.abbreviations(); } catch (e0) {}
  }

  DO.remoteSync.syncDictionary = function () {
    // Use same endpoints as M0106 (dictionary is managed via /dictionary and /entries/Dictionary)
    // Prefer dictionary list endpoint for read.
    var url = buildUrl("api/word-management/dictionary?language=thai&limit=2000&includeGlobal=true");
    return fetchJson(url)
      .then(function (payload) {
        var list = extractList(payload);
        var mapped = [];
        for (var i = 0; i < list.length; i++) {
          var it = list[i] || {};
          var w = String(it.word || it.Word || "").trim();
          if (!w) continue;
          mapped.push({
            id: "db:" + String(it.id || it.Id || w),
            word: w,
            description: String(it.entryDescription || it.EntryDescription || it.description || it.Description || "").trim(),
            scope: "DB",
          });
        }
        mergeDictionary(mapped);
        try { if (DO.debugLog) DO.debugLog("remote_sync_dictionary_ok", { count: mapped.length }); } catch (e0) {}
        return mapped.length;
      })
      .catch(function (err) {
        try { if (DO.debugLog) DO.debugLog("remote_sync_dictionary_fail", { error: String(err) }); } catch (e0) {}
        return 0;
      });
  };

  DO.remoteSync.syncAbbreviations = function () {
    var url = buildUrl("api/word-management/entries?type=Abbreviation&includeGlobal=true&language=thai&limit=5000");
    return fetchJson(url)
      .then(function (payload) {
        var list = extractList(payload);
        var mapped = [];
        for (var i = 0; i < list.length; i++) {
          var e = normalizeWordEntry(list[i]);
          if (!e.word) continue;
          var full = e.fullWord || e.word;
          mapped.push({
            id: "db:" + (e.id || e.word),
            shortForm: e.word,
            fullForm: full,
            description: e.description,
            // เก็บ scope จริงจาก backend เพื่ออ้างอิงได้ (Global/Personal)
            // และกันปุ่มลบใน UI ด้วย (รายการ DB จะไม่ให้ลบ)
            scope: e.scope || "Global",
            source: "DB",
          });
        }
        mergeAbbreviations(mapped);
        try { if (DO.debugLog) DO.debugLog("remote_sync_abbr_ok", { count: mapped.length }); } catch (e0) {}
        return mapped.length;
      })
      .catch(function (err) {
        try { if (DO.debugLog) DO.debugLog("remote_sync_abbr_fail", { error: String(err) }); } catch (e0) {}
        return 0;
      });
  };

  DO.remoteSync.syncAll = function () {
    return Promise.all([DO.remoteSync.syncDictionary(), DO.remoteSync.syncAbbreviations()])
      .then(function (counts) {
        try { if (DO.debugLog) DO.debugLog("remote_sync_all_ok", { dictionary: counts[0], abbreviations: counts[1] }); } catch (e0) {}
        return counts;
      })
      .catch(function () {
        return [0, 0];
      });
  };
})();

