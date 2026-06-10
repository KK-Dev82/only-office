/**
 * Thai Autocomplete (system InputHelper plugin)
 * - Reads dictionary words from localStorage key: "da:v1:dictionary"
 * - Shows ONLYOFFICE InputHelper suggestions in the editor while typing
 * - Supports suffix matching for Thai (e.g. "เรียนนาย" → matches "นายกมล")
 * - Shows both Thai and English words as separate selectable items
 */
(function (window) {
  var STORAGE_KEY_NEW = "da:v1:dictionary";
  var STORAGE_KEY_OLD = "do:v1:dictionary";
  var MIN_CHARS = 3;
  var MAX_ITEMS = 8;
  var LOG = "[thai-autocomplete]";

  var state = {
    inited: false,
    buffer: "",
    token: "",
    dictWords: [],
    dictDescs: [],
    dictLower: [],
    dictLoadedAt: 0,
    dictSig: "",
    skipUntil: 0,
    lastMatches: [],  // [{display, word}, ...]
  };

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(String(s || "")); } catch (e) { return fallback; }
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

      var words = [], descs = [];
      for (var i = 0; i < parsed.length; i++) {
        var it = parsed[i];
        if (typeof it === "string") {
          var s = String(it || "").trim();
          if (s) { words.push(s); descs.push(""); }
          continue;
        }
        if (it && typeof it === "object") {
          var w = String(it.word || it.Word || it.text || it.Text || "").trim();
          var eng = String(it.englishWord || it.EnglishWord || "").trim();
          var d = eng || String(it.description || it.Description || it.desc || "").trim();
          if (w) { words.push(w); descs.push(d); }
        }
      }

      // Dedupe + sort
      var seen = {};
      var uniqW = [], uniqD = [];
      for (var j = 0; j < words.length; j++) {
        var k = words[j].toLowerCase();
        if (seen[k]) continue;
        seen[k] = true;
        uniqW.push(words[j]);
        uniqD.push(descs[j]);
      }

      var indices = [];
      for (var n = 0; n < uniqW.length; n++) indices.push(n);
      indices.sort(function (a, b) {
        var al = uniqW[a].toLowerCase(), bl = uniqW[b].toLowerCase();
        return al < bl ? -1 : al > bl ? 1 : 0;
      });

      var sortedW = [], sortedD = [], sortedL = [];
      for (var m = 0; m < indices.length; m++) {
        sortedW.push(uniqW[indices[m]]);
        sortedD.push(uniqD[indices[m]]);
        sortedL.push(uniqW[indices[m]].toLowerCase());
      }

      state.dictWords = sortedW;
      state.dictDescs = sortedD;
      state.dictLower = sortedL;
      state.dictLoadedAt = Date.now();
      // Signature includes count + number of entries with descriptions
      // so we reload when descriptions are added by remote_sync
      var descCount = 0;
      for (var dc = 0; dc < sortedD.length; dc++) { if (sortedD[dc]) descCount++; }
      state.dictSig = sortedW.length + ":" + descCount;
      console.log(LOG, "dict loaded:", sortedW.length, "words,", descCount, "with desc");
      // Log raw items to debug which fields contain the English word
      try {
        for (var ri = 0; ri < Math.min(5, parsed.length); ri++) {
          var raw = parsed[ri];
          if (raw && typeof raw === "object") {
            console.log(LOG, "  raw[" + ri + "]:", JSON.stringify(raw).substring(0, 200));
          }
        }
      } catch (eDbg) {}
    } catch (e) {
      console.warn(LOG, "dict load error:", e);
      state.dictWords = [];
      state.dictDescs = [];
      state.dictLower = [];
      state.dictLoadedAt = Date.now();
      state.dictSig = "0";
    }
  }

  function ensureDictionaryFresh() {
    try {
      var now = Date.now();
      if (state.dictLoadedAt && now - state.dictLoadedAt < 3000) return;
      var raw = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY_NEW) || localStorage.getItem(STORAGE_KEY_OLD) || "";
      } catch (e0) {}
      var parsed = safeJsonParse(raw, []);
      if (!Array.isArray(parsed)) parsed = [];
      // Build same signature format as readDictionaryFromStorage
      var len = parsed.length;
      var dc = 0;
      for (var i = 0; i < parsed.length; i++) {
        var it = parsed[i];
        if (it && typeof it === "object") {
          var d = String(it.englishWord || it.EnglishWord || it.description || it.Description || "").trim();
          if (d) dc++;
        }
      }
      var sig = len + ":" + dc;
      if (sig !== state.dictSig) {
        console.log(LOG, "dict changed, reloading. old:", state.dictSig, "new:", sig);
        readDictionaryFromStorage();
      } else {
        state.dictLoadedAt = now;
      }
    } catch (e) {}
  }

  function normalizeText(s) {
    try { return String(s || "").replace(/\u00A0/g, " "); }
    catch (e) { return ""; }
  }

  function extractLastToken(text) {
    try {
      var s = normalizeText(text);
      var m = s.match(/([A-Za-z0-9ก-๙._-]{1,})$/);
      return m ? String(m[1] || "") : "";
    } catch (e) { return ""; }
  }

  function lower(s) {
    try { return String(s || "").toLowerCase(); }
    catch (e) { return ""; }
  }

  function binaryLowerBound(arr, q) {
    var lo = 0, hi = arr.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid] < q) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function getPrefixMatches(prefix) {
    var q = lower(prefix).trim();
    if (!q || q.length < MIN_CHARS) return [];
    ensureDictionaryFresh();
    var arr = state.dictLower;
    if (!arr || !arr.length) return [];

    var start = binaryLowerBound(arr, q);
    var out = [];
    for (var i = start; i < arr.length; i++) {
      if (arr[i].indexOf(q) !== 0) break;
      if (arr[i] === q) continue;
      out.push({ word: state.dictWords[i], desc: state.dictDescs[i] || "" });
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  }

  // Also search by English description (e.g. typing "info" matches "infographic")
  function getDescMatches(prefix) {
    var q = lower(prefix).trim();
    if (!q || q.length < MIN_CHARS) return [];
    ensureDictionaryFresh();
    var out = [];
    for (var i = 0; i < state.dictDescs.length; i++) {
      var d = state.dictDescs[i];
      if (!d) continue;
      if (lower(d).indexOf(q) === 0 && lower(d) !== q) {
        out.push({ word: state.dictWords[i], desc: d });
        if (out.length >= MAX_ITEMS) break;
      }
    }
    return out;
  }

  function getMatchesWithSuffix(fullToken) {
    if (!fullToken || fullToken.length < MIN_CHARS) return { matches: [], prefix: fullToken || "" };

    // Try full token on Thai words first
    var matches = getPrefixMatches(fullToken);
    if (matches.length) return { matches: matches, prefix: fullToken };

    // Try English description match (e.g. "info" → "infographic")
    var descMatches = getDescMatches(fullToken);
    if (descMatches.length) return { matches: descMatches, prefix: fullToken };

    // Try shorter suffixes for Thai
    for (var i = 1; i <= fullToken.length - MIN_CHARS; i++) {
      var suffix = fullToken.substring(i);
      matches = getPrefixMatches(suffix);
      if (matches.length) return { matches: matches, prefix: suffix };
    }

    return { matches: [], prefix: fullToken };
  }

  function getInputHelperSize() {
    try {
      var ih = window.Asc.plugin.getInputHelper();
      if (!ih) return { w: 300, h: 180 };
      var width = 300;
      var height = 200;
      try {
        var count = ih.getItems().length;
        var minH = ih.getItemsHeight(Math.min(MAX_ITEMS, count));
        if (minH && minH > 0) height = Math.max(minH + 4, 60);
      } catch (e0) {}
      return { w: width, h: height };
    } catch (e) {
      return { w: 300, h: 180 };
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
    console.log(LOG, "init done, dict size:", state.dictWords.length);
    try {
      window.Asc.plugin.createInputHelper();
      window.Asc.plugin.getInputHelper().createWindow();
    } catch (e0) {
      console.warn(LOG, "createInputHelper failed:", e0);
    }
  };

  window.Asc.plugin.inputHelper_onSelectItem = function (item) {
    try {
      if (!item) return;

      var displayText = String(item.text || "").trim();
      var insertWord = displayText;

      for (var i = 0; i < state.lastMatches.length; i++) {
        var m = state.lastMatches[i];
        if (m.display === displayText) {
          insertWord = m.word;
          break;
        }
      }

      if (!insertWord) return;
      var token = String(state.token || "");

      // Replace regular spaces with NBSP so OnlyOffice doesn't
      // line-break in the middle of names like "นายกมล รอดคล้าย"
      insertWord = insertWord.replace(/ /g, "\u00A0");

      console.log(LOG, "select:", insertWord, "replacing token:", token);

      state.skipUntil = Date.now() + 300;
      state.buffer = "";
      state.token = "";
      state.lastMatches = [];

      window.Asc.plugin.executeMethod("InputText", [insertWord, token]);

      // Return keyboard focus to the editor after picking from the balloon, so the caret
      // stays active and the user can keep typing — same approach the panel plugins use.
      // The editor's keyboard input element (#area_id) lives in the editor frame, which is
      // a parent of this plugin iframe (same origin). Done synchronously inside the click.
      try {
        var aw = window;
        for (var fi = 0; fi < 8; fi++) {
          var adoc = null;
          try { adoc = aw.document; } catch (eD) { break; }
          var ael = null;
          try { ael = adoc.getElementById("area_id"); } catch (eG) {}
          if (ael && typeof ael.focus === "function") {
            try { if (aw.focus) aw.focus(); } catch (eW) {}
            try { ael.focus({ preventScroll: true }); } catch (eF1) { try { ael.focus(); } catch (eF2) {} }
            break;
          }
          if (!aw.parent || aw.parent === aw) break;
          aw = aw.parent;
        }
      } catch (eFocus) {}
      try { window.Asc.plugin.executeMethod("FocusEditor", []); } catch (eMfocus) {}
    } catch (e) {
      console.warn(LOG, "onSelectItem error:", e);
    }
    unShow();
  };

  window.Asc.plugin.event_onInputHelperClear = function () {
    state.buffer = "";
    state.token = "";
    state.lastMatches = [];
    unShow();
  };

  window.Asc.plugin.event_onInputHelperInput = function (data) {
    try {
      if (Date.now() < state.skipUntil) return;

      if (data && data.add) state.buffer += String(data.text || "");
      else if (data && typeof data.text === "string") state.buffer = String(data.text || "");
      else state.buffer = String(data || "");

      var fullToken = extractLastToken(state.buffer);

      if (!fullToken || fullToken.length < MIN_CHARS) {
        state.token = "";
        unShow();
        return;
      }

      var result = getMatchesWithSuffix(fullToken);
      var matches = result.matches;
      var matchedPrefix = result.prefix;

      if (!matches || !matches.length) {
        state.token = "";
        unShow();
        return;
      }

      state.token = matchedPrefix;

      var ih = window.Asc.plugin.getInputHelper();
      if (!ih) return;

      // Build items: for each match, show Thai word AND English word as separate items
      var items = [];
      state.lastMatches = [];
      var seen = {};

      for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        var completion = matchedPrefix + m.word.substr(matchedPrefix.length);

        // Add Thai word
        if (!seen[completion]) {
          seen[completion] = true;
          items.push({ text: completion });
          state.lastMatches.push({ display: completion, word: completion });
        }

        // Add English word as separate selectable item
        if (m.desc && !seen[m.desc]) {
          seen[m.desc] = true;
          items.push({ text: m.desc });
          state.lastMatches.push({ display: m.desc, word: m.desc });
        }

        if (items.length >= MAX_ITEMS) break;
      }

      ih.setItems(items);
      var sz = getInputHelperSize();
      // isKeyboardTake=false: let user continue typing while balloon is visible
      ih.show(sz.w, sz.h, false);
    } catch (e) {
      console.warn(LOG, "onInputHelperInput error:", e);
      unShow();
    }
  };
})(window);
