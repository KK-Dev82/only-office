/**
 * Thai Autocomplete (system InputHelper plugin)
 * - Reads dictionary words from localStorage key: "da:v1:dictionary" (same as dictionary-abbreviation plugin)
 * - Shows ONLYOFFICE InputHelper suggestions in the editor while typing
 *
 * NOTE:
 * - This plugin is isSystem/isVisual=false → no side panel, so it should not trigger panel iframe resize bugs.
 * - Works best for Thai by using "last token" extraction without relying on spaces.
 */
(function (window) {
  var GUID = "asc.{D4B3C2A1-7E6F-4A5B-9C8D-1E2F3A4B5C6D}";
  var STORAGE_KEY_NEW = "da:v1:dictionary";
  var STORAGE_KEY_OLD = "do:v1:dictionary";
  var MIN_CHARS = 3;
  var MAX_ITEMS = 6;

  var state = {
    inited: false,
    buffer: "",
    token: "",
    dict: [],
    dictLower: [],
    dictLoadedAt: 0,
    dictSig: "",
  };

  function safeJsonParse(s, fallback) {
    try {
      return JSON.parse(String(s || ""));
    } catch (e) {
      return fallback;
    }
  }

  function readDictionaryFromStorage() {
    try {
      var raw = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY_NEW);
        if (!raw) raw = localStorage.getItem(STORAGE_KEY_OLD);
      } catch (e0) {}

      var parsed = safeJsonParse(raw, []);
      if (!Array.isArray(parsed)) parsed = [];

      // Normalize to array of strings
      var out = [];
      for (var i = 0; i < parsed.length; i++) {
        var it = parsed[i];
        if (typeof it === "string") {
          var s = String(it || "").trim();
          if (s) out.push(s);
          continue;
        }
        if (it && typeof it === "object") {
          var w = String(it.word || it.Word || it.text || it.Text || "").trim();
          if (w) out.push(w);
        }
      }

      // Dedupe + sort (case-insensitive)
      var seen = {};
      var uniq = [];
      for (var j = 0; j < out.length; j++) {
        var ww = out[j];
        var k = ww.toLowerCase();
        if (seen[k]) continue;
        seen[k] = true;
        uniq.push(ww);
      }
      uniq.sort(function (a, b) {
        return a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0;
      });

      var sig = String(uniq.length) + "|" + (uniq[0] ? uniq[0] : "") + "|" + (uniq[uniq.length - 1] ? uniq[uniq.length - 1] : "");
      state.dict = uniq;
      state.dictLower = uniq.map(function (x) {
        return String(x || "").toLowerCase();
      });
      state.dictLoadedAt = Date.now();
      state.dictSig = sig;
    } catch (e) {
      state.dict = [];
      state.dictLower = [];
      state.dictLoadedAt = Date.now();
      state.dictSig = "0";
    }
  }

  function ensureDictionaryFresh() {
    try {
      // Light refresh: every ~3s check if size changed
      var now = Date.now();
      if (state.dictLoadedAt && now - state.dictLoadedAt < 3000) return;
      var raw = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY_NEW) || localStorage.getItem(STORAGE_KEY_OLD) || "";
      } catch (e0) {}
      var parsed = safeJsonParse(raw, []);
      var len = Array.isArray(parsed) ? parsed.length : 0;
      var sig = String(len);
      if (sig !== String(state.dictSig || "")) {
        readDictionaryFromStorage();
      } else {
        state.dictLoadedAt = now;
      }
    } catch (e) {}
  }

  function normalizeText(s) {
    try {
      return String(s || "").replace(/\u00A0/g, " ");
    } catch (e) {
      return "";
    }
  }

  function extractLastToken(text) {
    try {
      var s = normalizeText(text);
      // Take last token-like chunk (Thai + latin/digit + _.-)
      var m = s.match(/([A-Za-z0-9ก-๙._-]{1,})$/);
      return m ? String(m[1] || "") : "";
    } catch (e) {
      return "";
    }
  }

  function lower(s) {
    try {
      return String(s || "").toLowerCase();
    } catch (e) {
      return "";
    }
  }

  function binaryLowerBound(arr, q) {
    var lo = 0;
    var hi = arr.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid] < q) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function getMatches(prefix) {
    try {
      var q = lower(prefix).trim();
      if (!q || q.length < MIN_CHARS) return [];
      ensureDictionaryFresh();
      var arr = state.dictLower;
      var arrRaw = state.dict;
      if (!arr || !arr.length) return [];

      var start = binaryLowerBound(arr, q);
      var out = [];
      for (var i = start; i < arr.length; i++) {
        var lw = arr[i];
        if (lw.indexOf(q) !== 0) break;
        // Avoid suggesting identical word
        if (lw === q) continue;
        out.push(arrRaw[i]);
        if (out.length >= MAX_ITEMS) break;
      }

      // Convert to "completion strings" (prefix + rest)
      var ret = [];
      for (var j = 0; j < out.length; j++) {
        var full = String(out[j] || "");
        var fullLower = lower(full);
        if (fullLower.indexOf(q) !== 0) continue;
        ret.push(prefix + full.substr(q.length));
      }
      return ret;
    } catch (e) {
      return [];
    }
  }

  function getInputHelperSize() {
    try {
      var ih = window.Asc.plugin.getInputHelper();
      if (!ih) return { w: 220, h: 140 };
      var width = 240;
      var height = 160;
      try {
        var minH = ih.getItemsHeight(Math.min(6, ih.getItems().length));
        if (minH && height > minH) height = minH;
      } catch (e0) {}
      if (width > 420) width = 420;
      width += 24;
      return { w: width, h: height };
    } catch (e) {
      return { w: 220, h: 140 };
    }
  }

  function unShow() {
    try {
      var ih = window.Asc.plugin.getInputHelper();
      if (ih) ih.unShow();
    } catch (e) {}
  }

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  window.Asc.plugin.init = function () {
    if (state.inited) return;
    state.inited = true;
    state.buffer = "";
    state.token = "";
    readDictionaryFromStorage();
    try {
      window.Asc.plugin.createInputHelper();
      window.Asc.plugin.getInputHelper().createWindow();
    } catch (e0) {}
  };

  // Called when user selects an item
  window.Asc.plugin.inputHelper_onSelectItem = function (item) {
    try {
      if (!item) return;
      var text = String(item.text || "").trim();
      if (!text) return;
      var token = String(state.token || "");
      // Replace current token with selected completion
      window.Asc.plugin.executeMethod("InputText", [text, token]);
    } catch (e) {}
    unShow();
  };

  window.Asc.plugin.event_onInputHelperClear = function () {
    state.buffer = "";
    state.token = "";
    unShow();
  };

  window.Asc.plugin.event_onInputHelperInput = function (data) {
    try {
      // data = { add: boolean, text: string }
      if (data && data.add) state.buffer += String(data.text || "");
      else if (data && typeof data.text === "string") state.buffer = String(data.text || "");
      else state.buffer = String(data || "");

      // Extract last token
      var token = extractLastToken(state.buffer);
      state.token = token;
      if (!token || token.length < MIN_CHARS) {
        unShow();
        return;
      }

      var variants = getMatches(token);
      if (!variants || !variants.length) {
        unShow();
        return;
      }

      var ih = window.Asc.plugin.getInputHelper();
      if (!ih) return;

      var items = [];
      for (var i = 0; i < variants.length; i++) {
        items.push({ text: variants[i] });
      }
      ih.setItems(items);
      var sz = getInputHelperSize();
      // show(w,h,isKeyboardTake=false) → allow arrow/enter selection without stealing all keys
      ih.show(sz.w, sz.h, false);
    } catch (e) {
      unShow();
    }
  };
})(window);

