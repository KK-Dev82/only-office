// Local-first storage layer (LocalStorage with graceful fallback)
(function () {
  var DO = (window.DO = window.DO || {});

  // IMPORTANT:
  // - Do NOT share storage keys with other plugins (e.g. document-office) or tabs will conflict.
  // - Keep a migration path from old prefix to avoid "blank UI" due to invalid saved activeTab.
  var OLD_PREFIX = "do:v1:";
  DO.STORAGE_PREFIX = "da:v1:";
  DO.STORAGE_KEYS = {
    abbreviations: DO.STORAGE_PREFIX + "abbreviations",
    clipboard: DO.STORAGE_PREFIX + "clipboard",
    macros: DO.STORAGE_PREFIX + "macros",
    redundant: DO.STORAGE_PREFIX + "redundant",
    dictionary: DO.STORAGE_PREFIX + "dictionary",
    activeTab: DO.STORAGE_PREFIX + "activeTab",
    debugOpen: DO.STORAGE_PREFIX + "debugOpen",
    // โหมดการทำงานของคำย่อ (auto/confirm)
    abbreviationMode: DO.STORAGE_PREFIX + "abbreviationMode",
    // เปิด InputHelper สำหรับ Dictionary (รับคีย์จาก editor เพื่อเลือกคำ)
    dictInputHelperEnabled: DO.STORAGE_PREFIX + "dictInputHelperEnabled",
  };

  var OLD_KEYS = {
    abbreviations: OLD_PREFIX + "abbreviations",
    dictionary: OLD_PREFIX + "dictionary",
    activeTab: OLD_PREFIX + "activeTab",
    debugOpen: OLD_PREFIX + "debugOpen",
  };

  function safeJsonParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return fallback;
    }
  }

  DO.canUseLocalStorage = function () {
    try {
      var k = DO.STORAGE_PREFIX + "__probe";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  };

  DO.storageLoad = function (key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return safeJsonParse(raw, fallback);
    } catch (e) {
      try {
        DO.debugLog("storageLoad_failed", { key: key, error: String(e) });
      } catch (e2) {}
      return fallback;
    }
  };

  DO.storageSave = function (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      try {
        DO.debugLog("storageSave_failed", { key: key, error: String(e) });
      } catch (e2) {}
      // Fallback: ONLYOFFICE plugin storage (ถ้ามี)
      try {
        if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
          window.Asc.plugin.executeMethod("SetStorageValue", [key, JSON.stringify(value)]);
          return true;
        }
      } catch (e3) {}
      return false;
    }
  };

  DO.initLocalData = function () {
    if (DO.state && DO.state._localDataInitialized) return;
    if (!DO.state) DO.state = {};
    DO.state._localDataInitialized = true;

    var useStorage = false;
    try {
      useStorage = DO.canUseLocalStorage();
      DO.debugLog("initLocalData_begin", { canUseLocalStorage: useStorage });
    } catch (e0) {}

    // ถ้า LocalStorage ใช้ไม่ได้ (iframe/cross-origin/private) ไม่แตะ localStorage เลย ใช้ค่า default ในหน่วยความจำ
    // ลดโอกาส throw → UI เพี้ยน / init หัก
    if (!useStorage) {
      DO.store.abbreviations = Array.isArray(DO.store.abbreviations) ? DO.store.abbreviations : [];
      DO.store.dictionary = Array.isArray(DO.store.dictionary) ? DO.store.dictionary : [];
      DO.store.clipboard = [];
      DO.store.macros = [];
      DO.store.redundant = [];
      try {
        DO.debugLog("initLocalData_skip_storage", { reason: "localStorage_unavailable" });
      } catch (e) {}
      return;
    }

    try {
      var abbr = DO.storageLoad(DO.STORAGE_KEYS.abbreviations, null);
      if (abbr == null) abbr = DO.storageLoad(OLD_KEYS.abbreviations, []);
      DO.store.abbreviations = Array.isArray(abbr) ? abbr : [];

      var dict = DO.storageLoad(DO.STORAGE_KEYS.dictionary, null);
      if (dict == null) dict = DO.storageLoad(OLD_KEYS.dictionary, []);
      DO.store.dictionary = Array.isArray(dict) ? dict : [];

      DO.store.clipboard = [];
      DO.store.macros = [];
      DO.store.redundant = [];

      var savedTab = DO.storageLoad(DO.STORAGE_KEYS.activeTab, null);
      if (savedTab == null) savedTab = DO.storageLoad(OLD_KEYS.activeTab, null);
      savedTab = String(savedTab || "");
      if (savedTab === "dictionary" || savedTab === "abbreviation") {
        DO.state.activeTab = savedTab;
        DO.storageSave(DO.STORAGE_KEYS.activeTab, savedTab);
      }
      var savedOpen = DO.storageLoad(DO.STORAGE_KEYS.debugOpen, null);
      if (savedOpen == null) savedOpen = DO.storageLoad(OLD_KEYS.debugOpen, null);
      if (savedOpen === "1" || savedOpen === 1 || savedOpen === true) {
        DO.state.debugOpen = true;
        DO.storageSave(DO.STORAGE_KEYS.debugOpen, "1");
      }
      var savedMode = DO.storageLoad(DO.STORAGE_KEYS.abbreviationMode, null);
      var mode = String(savedMode || "").toLowerCase();
      if (mode === "auto" || mode === "confirm") {
        DO.state.abbreviationMode = mode;
        DO.storageSave(DO.STORAGE_KEYS.abbreviationMode, mode);
      }

      // Dictionary InputHelper enable (bool)
      try {
        var savedIh = DO.storageLoad(DO.STORAGE_KEYS.dictInputHelperEnabled, null);
        var ihOn = savedIh === true || savedIh === 1 || savedIh === "1";
        if (ihOn) {
          DO.state.dictInputHelperEnabled = true;
          DO.storageSave(DO.STORAGE_KEYS.dictInputHelperEnabled, true);
        }
      } catch (eIh0) {}

      DO.storageSave(DO.STORAGE_KEYS.abbreviations, DO.store.abbreviations || []);
      DO.storageSave(DO.STORAGE_KEYS.dictionary, DO.store.dictionary || []);

      DO.debugLog("initLocalData_loaded", {
        abbreviations: (DO.store.abbreviations || []).length,
        dictionary: (DO.store.dictionary || []).length,
      });
    } catch (e) {
      try {
        DO.debugLog("initLocalData_failed", { error: String(e) });
      } catch (e2) {}
      DO.store.abbreviations = Array.isArray(DO.store.abbreviations) ? DO.store.abbreviations : [];
      DO.store.dictionary = Array.isArray(DO.store.dictionary) ? DO.store.dictionary : [];
    }
  };

  DO.persist = {
    abbreviations: function () {
      var ok = DO.storageSave(DO.STORAGE_KEYS.abbreviations, DO.store.abbreviations || []);
      try {
        DO.debugLog("persistAbbreviations", { ok: ok, count: (DO.store.abbreviations || []).length });
      } catch (e) {}
    },
    clipboard: function () {
      var ok = DO.storageSave(DO.STORAGE_KEYS.clipboard, DO.store.clipboard || []);
      try {
        DO.debugLog("persistClipboard", { ok: ok, count: (DO.store.clipboard || []).length });
      } catch (e) {}
    },
    macros: function () {
      var ok = DO.storageSave(DO.STORAGE_KEYS.macros, DO.store.macros || []);
      try {
        DO.debugLog("persistMacros", { ok: ok, count: (DO.store.macros || []).length });
      } catch (e) {}
    },
    redundant: function () {
      var ok = DO.storageSave(DO.STORAGE_KEYS.redundant, DO.store.redundant || []);
      try {
        DO.debugLog("persistRedundant", { ok: ok, count: (DO.store.redundant || []).length });
      } catch (e) {}
    },
    dictionary: function () {
      var ok = DO.storageSave(DO.STORAGE_KEYS.dictionary, DO.store.dictionary || []);
      try {
        DO.debugLog("persistDictionary", { ok: ok, count: (DO.store.dictionary || []).length });
      } catch (e) {}
    },
  };

  DO.newId = function (prefix) {
    return String(prefix || "id") + "_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  };
})();

