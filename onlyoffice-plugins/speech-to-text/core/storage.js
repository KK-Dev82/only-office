// Local-first storage layer (LocalStorage with graceful fallback)
(function () {
  var DO = (window.DO = window.DO || {});

  DO.STORAGE_PREFIX = "do:v1:";
  DO.STORAGE_KEYS = {
    abbreviations: DO.STORAGE_PREFIX + "abbreviations",
    clipboard: DO.STORAGE_PREFIX + "clipboard",
    macros: DO.STORAGE_PREFIX + "macros",
    redundant: DO.STORAGE_PREFIX + "redundant",
    dictionary: DO.STORAGE_PREFIX + "dictionary",
    activeTab: DO.STORAGE_PREFIX + "activeTab",
    debugOpen: DO.STORAGE_PREFIX + "debugOpen",
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
    try {
      DO.debugLog("initLocalData_begin", { canUseLocalStorage: DO.canUseLocalStorage() });
    } catch (e0) {}

    DO.store.abbreviations = DO.storageLoad(DO.STORAGE_KEYS.abbreviations, []);
    DO.store.clipboard = DO.storageLoad(DO.STORAGE_KEYS.clipboard, []);
    DO.store.macros = DO.storageLoad(DO.STORAGE_KEYS.macros, []);
    DO.store.redundant = DO.storageLoad(DO.STORAGE_KEYS.redundant, []);
    DO.store.dictionary = DO.storageLoad(DO.STORAGE_KEYS.dictionary, []);

    try {
      DO.debugLog("initLocalData_loaded", {
        abbreviations: (DO.store.abbreviations || []).length,
        clipboard: (DO.store.clipboard || []).length,
        macros: (DO.store.macros || []).length,
        redundant: (DO.store.redundant || []).length,
        dictionary: (DO.store.dictionary || []).length,
      });
    } catch (e1) {}
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

