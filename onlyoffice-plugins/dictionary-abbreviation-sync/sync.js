// Dictionary & Abbreviation Background Sync Plugin
// ---------------------------------------------------
// Runs automatically when OnlyOffice editor opens (type: "background" + autostart).
// Purpose: pull dictionary + abbreviation list from Backend → write to localStorage
//   keys da:v1:dictionary, da:v1:abbreviations
// → so the main plugin (dictionary-abbreviation panel) and thai-autocomplete
//   have data available even if user never opens the panel UI.
//
// IMPORTANT: uses the SAME localStorage keys as plugin/dictionary-abbreviation/core/storage.js.
// Do not change STORAGE_PREFIX without updating that file too.
(function () {
  var STORAGE_PREFIX = "da:v1:";
  var KEY_DICTIONARY = STORAGE_PREFIX + "dictionary";
  var KEY_ABBREVIATIONS = STORAGE_PREFIX + "abbreviations";
  var KEY_API_BASE_URL = STORAGE_PREFIX + "apiBaseUrl";
  var KEY_ACCESS_TOKEN = STORAGE_PREFIX + "accessToken";

  // เก็บเฉพาะคำ "Local" (user เพิ่มเอง) — ทิ้งคำ Global/DB เก่าก่อน merge ของใหม่จาก Backend
  // กัน stale: คำที่ถูกลบใน DB จะไม่ค้างใน localStorage ข้ามรอบ
  // (marker เดียวกับ dictionary-abbreviation/core/storage.js: source==="DB" / id "db:" / scope DB|Global|Personal)
  function isLocalEntry(a) {
    if (!a || typeof a !== "object") return false;
    if (String(a.source || "") === "DB") return false;
    if (String(a.id || "").indexOf("db:") === 0) return false;
    var scp = String(a.scope || "");
    if (scp === "DB" || scp === "Global" || scp === "Personal") return false;
    return true;
  }

  var state = {
    inited: false,
    lastSyncAt: 0,
  };

  function readInjectedOptions() {
    try {
      var p = window.Asc && window.Asc.plugin;
      if (p && p.info && p.info.options) return p.info.options;
      if (p && p.options) return p.options;
      if (p && p.initData) return p.initData;
    } catch (e) {}
    return null;
  }

  function persistOptionToStorage(key, value) {
    try {
      if (value == null) return;
      localStorage.setItem(key, String(value));
    } catch (e) {}
  }

  function loadStoredOption(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (e) { return ""; }
  }

  function resolveApiBaseUrl(options) {
    var b = "";
    if (options && options.apiBaseUrl) b = String(options.apiBaseUrl);
    if (!b) b = loadStoredOption(KEY_API_BASE_URL);
    return b.replace(/\/+$/g, "");
  }

  function resolveAccessToken(options) {
    var t = "";
    if (options && options.accessToken) t = String(options.accessToken);
    if (!t) t = loadStoredOption(KEY_ACCESS_TOKEN);
    return t;
  }

  function resolveOwnerUserId(options) {
    // NOTE: backend WordEntryFilterRequest.OwnerUserId เป็น `int?`
    // แต่ frontend userId เป็น GUID string (เช่น "4f6f73a2-7916-466a-...")
    // ถ้าส่ง GUID ไป backend → model binder fail → 400 Bad Request → sync fail silent
    // ดังนั้น: ส่ง ownerUserId ก็ต่อเมื่อเป็น "เลขล้วน" เท่านั้น
    try {
      if (options && options.userId !== undefined && options.userId !== null && options.userId !== "") {
        var raw = String(options.userId).trim();
        if (/^\d+$/.test(raw)) {
          return raw;
        }
        // ถ้าเป็น GUID/UUID หรือ non-numeric — skip (ไม่ส่ง = backend ดึง Global เท่านั้น)
      }
    } catch (e) {}
    return "";
  }

  function buildUrl(base, path) {
    var p = String(path || "").replace(/^\/+/g, "");
    return base ? (base + "/" + p) : p;
  }

  function authHeaders(token) {
    var h = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = "Bearer " + token;
    return h;
  }

  function fetchJson(url, token) {
    return fetch(url, { method: "GET", headers: authHeaders(token) })
      .then(function (res) {
        if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "0"));
        return res.text();
      })
      .then(function (t) {
        try { return JSON.parse(t); } catch (e) { return {}; }
      });
  }

  function extractList(payload) {
    if (!payload) return [];
    var a = payload.data || payload.Data || payload;
    return Array.isArray(a) ? a : [];
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      try { console.warn("[da-sync] localStorage write failed for " + key, e); } catch (e2) {}
      return false;
    }
  }

  function readStorage(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function mergeDictionary(existing, dbItems) {
    var seen = {};
    var out = [];
    function push(obj) {
      var w = String(obj.word || obj.Word || "").trim();
      if (!w) return;
      var k = w.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(obj);
    }
    // DB first (เพราะมี richer fields เช่น englishWord)
    for (var i = 0; i < dbItems.length; i++) push(dbItems[i]);
    // แล้ว local-only (ที่ user เพิ่มเองใน plugin panel)
    for (var j = 0; j < existing.length; j++) push(existing[j]);
    return out;
  }

  function mergeAbbreviations(existing, dbItems) {
    var seen = {};
    var out = [];
    function keyOf(a) {
      var s = String(a.shortForm || "").trim().toLowerCase();
      var f = String(a.fullForm || "").trim().toLowerCase();
      return s + "|" + f;
    }
    function push(obj) {
      var s = String(obj.shortForm || "").trim();
      var f = String(obj.fullForm || "").trim();
      if (!s || !f) return;
      var k = keyOf(obj);
      if (seen[k]) return;
      seen[k] = true;
      out.push(obj);
    }
    // Local first (user-added อาจมี id pattern ต่างจาก DB)
    for (var i = 0; i < existing.length; i++) push(existing[i]);
    for (var j = 0; j < dbItems.length; j++) push(dbItems[j]);
    return out;
  }

  function syncDictionary(baseUrl, token, ownerUserId) {
    // limit=-1 = ดึงทั้งหมด (backend skip Take)
    // includeGlobal=true + ownerUserId (ถ้ามี) = ดึง Global + Personal ของ user ปัจจุบัน
    // ไม่มี ownerUserId = ดึงเฉพาะ Global (backend behavior, ดู WordManagementService.cs:78-86)
    var qs = "api/word-management/dictionary?limit=-1&includeGlobal=true";
    if (ownerUserId) qs += "&ownerUserId=" + encodeURIComponent(ownerUserId);
    var url = buildUrl(baseUrl, qs);
    return fetchJson(url, token)
      .then(function (payload) {
        var list = extractList(payload);
        var mapped = [];
        for (var i = 0; i < list.length; i++) {
          var it = list[i] || {};
          var w = String(it.word || it.Word || "").trim();
          if (!w) continue;
          var englishWord = String(it.englishWord || it.EnglishWord || "").trim();
          var desc = String(it.entryDescription || it.EntryDescription || it.description || it.Description || "").trim();
          mapped.push({
            id: "db:" + String(it.id || it.Id || w),
            word: w,
            description: englishWord || desc,
            scope: "DB",
          });
        }
        var existingLocal = readStorage(KEY_DICTIONARY).filter(isLocalEntry);
        var merged = mergeDictionary(existingLocal, mapped);
        writeStorage(KEY_DICTIONARY, merged);
        try { console.info("[da-sync] dictionary synced:", mapped.length, "items"); } catch (e0) {}
        return mapped.length;
      })
      .catch(function (err) {
        try { console.warn("[da-sync] dictionary sync failed:", String(err)); } catch (e0) {}
        return 0;
      });
  }

  function syncAbbreviations(baseUrl, token, ownerUserId) {
    var qs = "api/word-management/entries?type=Abbreviation&limit=-1&includeGlobal=true";
    if (ownerUserId) qs += "&ownerUserId=" + encodeURIComponent(ownerUserId);
    var url = buildUrl(baseUrl, qs);
    return fetchJson(url, token)
      .then(function (payload) {
        var list = extractList(payload);
        var mapped = [];
        for (var i = 0; i < list.length; i++) {
          var e = list[i] || {};
          var sf = String(e.word || e.Word || "").trim();
          var ff = String(e.fullWord || e.FullWord || sf).trim();
          if (!sf) continue;
          mapped.push({
            id: "db:" + String(e.id || e.Id || sf),
            shortForm: sf,
            fullForm: ff,
            description: String(e.description || e.Description || "").trim(),
            scope: String(e.scope || e.Scope || "Global"),
            source: "DB",
          });
        }
        var existingLocal = readStorage(KEY_ABBREVIATIONS).filter(isLocalEntry);
        var merged = mergeAbbreviations(existingLocal, mapped);
        writeStorage(KEY_ABBREVIATIONS, merged);
        try { console.info("[da-sync] abbreviations synced:", mapped.length, "items"); } catch (e0) {}
        return mapped.length;
      })
      .catch(function (err) {
        try { console.warn("[da-sync] abbreviations sync failed:", String(err)); } catch (e0) {}
        return 0;
      });
  }

  function runSync() {
    var options = readInjectedOptions();
    var baseUrl = resolveApiBaseUrl(options);
    var token = resolveAccessToken(options);
    var ownerUserId = resolveOwnerUserId(options);

    // Persist options ลง localStorage เผื่อ panel plugin หลักเรียกใช้ภายหลังโดยไม่มี options
    if (options && options.apiBaseUrl) persistOptionToStorage(KEY_API_BASE_URL, options.apiBaseUrl);
    if (options && options.accessToken) persistOptionToStorage(KEY_ACCESS_TOKEN, options.accessToken);

    if (!baseUrl) {
      try { console.warn("[da-sync] skip: apiBaseUrl not available"); } catch (e0) {}
      return;
    }
    // accessToken ไม่ใช่ required (endpoint AllowAnonymous) — แต่ถ้ามี จะส่งด้วย

    state.lastSyncAt = Date.now();
    try { console.info("[da-sync] starting", { ownerUserId: ownerUserId || "(none — global only)" }); } catch (e0) {}
    Promise.all([
      syncDictionary(baseUrl, token, ownerUserId),
      syncAbbreviations(baseUrl, token, ownerUserId),
    ]).then(function (counts) {
      try {
        console.info("[da-sync] complete", { dict: counts[0], abbr: counts[1] });
      } catch (e1) {}
    });
  }

  function isHostReady() {
    try {
      var p = window.Asc && window.Asc.plugin;
      if (!p) return false;
      return Boolean(p.info) || typeof p.executeMethod === "function" || typeof p.callCommand === "function";
    } catch (e) { return false; }
  }

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  // override init (จาก inline script ใน index.html) ด้วยตัวจริง
  window.Asc.plugin.init = function () {
    if (!isHostReady()) return;
    if (state.inited) return;
    state.inited = true;
    try { runSync(); } catch (e) {
      try { console.error("[da-sync] init error:", e); } catch (e2) {}
    }
  };

  // Fallback: ถ้า DOMContentLoaded ถึงก่อน host ready, retry ทุก 100ms (สูงสุด ~20s)
  document.addEventListener("DOMContentLoaded", function () {
    var attempts = 0;
    (function tryLater() {
      if (state.inited) return;
      if (isHostReady()) {
        try { window.Asc.plugin.init(); } catch (e) {}
        return;
      }
      attempts++;
      if (attempts < 200) setTimeout(tryLater, 100);
    })();
  });
})();
