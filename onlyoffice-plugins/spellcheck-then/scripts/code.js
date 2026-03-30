/* SpellCheck TH+EN plugin (OnlyOffice)
 * - แหล่งที่ 1: only-office/dict (words.json จาก th_TH.dic, en_US.dic)
 * - แหล่งที่ 2: Dictionary API (คำที่ผู้ใช้เพิ่มใน M0106)
 * - ใช้ Intl.Segmenter — ไม่ใช้ PyThai
 * - Add words: api/word-management/spellcheck/add-words
 * - Selective replace: replace ทีละ occurrence โดยใช้ paragraph position
 */
(function (window) {
  var STORAGE_KEY_IGNORED = "spellcheck-then:v1:ignoredWords";
  var VERSION = "0.2.0";

  var BACKEND_ADD_WORDS_PATH = "api/word-management/spellcheck/add-words";

  // แหล่งที่ 1: Built-in dict (words.json สร้างจาก .dic)
  var BASE_DICT_THAI_PATH = "onlyoffice-dict/th_TH/words.json";
  var BASE_DICT_ENGLISH_PATH = "onlyoffice-dict/en_US/words.json";

  // แหล่งที่ 2: Dictionary API (คำที่ผู้ใช้เพิ่ม)
  var DICT_THAI_PATH = "api/word-management/dictionary?language=thai&limit=3000&includeGlobal=true";
  var DICT_ENGLISH_PATH = "api/word-management/dictionary?language=english&limit=3000&includeGlobal=true";

  var FUZZY_MAX_DISTANCE = 2;
  var FUZZY_MAX_SUGGESTIONS = 5;
  var FUZZY_MAX_LENGTH_DIFF = 2;

  // ข้ามคำที่สั้นมากหรือเป็นตัวเลข
  var MIN_WORD_LENGTH = 1;
  // ข้ามตัวเลขทั้งไทย (๐-๙) และอาหรับ (0-9)
  var SKIP_NUMERIC = /^[\d\u0E50-\u0E59]+$/;
  var SKIP_PUNCTUATION = /^[\s\u200B-\u200D\uFEFF]*$/;

  var state = {
    lastIssues: [],                        // unique misspelled words [{word, suggestions}]
    lastOccurrences: [],                   // all occurrences [{word, suggestions, paraIdx, start, end, context, occId}]
    lastParagraphs: [],                    // cached paragraph data [{idx, text}]
    selectedSuggestionByWord: Object.create(null),
    replacedOccurrences: Object.create(null),  // occId → true
    ignoredWords: Object.create(null),
    dictionaryWords: [],
    dictionaryByLength: null,
    validWords: Object.create(null),
    validWordsThai: Object.create(null),
    validWordsEnglish: Object.create(null),
    dictionaryWordsThai: [],
    dictionaryByLengthThai: null,
    dictionaryWordsEnglish: [],
    dictionaryByLengthEnglish: null,
    sugCache: Object.create(null),         // cache suggestions by word
    inited: false,
  };

  /* ========== UTILITIES ========== */

  function $(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
  }

  function setStatus(text) {
    var el = $("tscStatus");
    if (el) el.textContent = String(text || "");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function execMethod(name, params, cb) {
    try {
      if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
        window.Asc.plugin.executeMethod(name, params || [], function (result) {
          try { if (cb) cb(result); } catch (eCb) {}
        });
        return true;
      }
    } catch (e) {}
    try { if (cb) cb(undefined); } catch (e2) {}
    return false;
  }

  function canCallCommand() {
    try {
      return Boolean(window.Asc && window.Asc.plugin && typeof window.Asc.plugin.callCommand === "function");
    } catch (e) { return false; }
  }

  /* ========== TEXT RETRIEVAL (keep existing) ========== */

  function getCurrentParagraphText(cb) {
    if (!canCallCommand()) {
      execMethod("GetCurrentParagraph", [], function (p) {
        var t = "";
        try {
          if (typeof p === "string") t = p || "";
          else if (p && typeof p.text === "string") t = p.text || "";
        } catch (e0) {}
        try { cb && cb(String(t || "")); } catch (e1) {}
      });
      return;
    }
    try {
      window.Asc.plugin.callCommand(
        function () {
          try {
            var doc = Api.GetDocument();
            if (!doc || !doc.GetCurrentParagraph) return "";
            var p = doc.GetCurrentParagraph();
            if (!p) return "";
            var r = p.GetRange ? p.GetRange() : null;
            if (!r || !r.GetText) return "";
            return String(r.GetText({
              Numbering: false, Math: false,
              ParaSeparator: "\n", TableRowSeparator: "\n", NewLineSeparator: "\n",
            }) || "");
          } catch (e) { return ""; }
        },
        false, true,
        function (text) { try { cb && cb(String(text || "")); } catch (e2) {} }
      );
    } catch (e3) {
      try { cb && cb(""); } catch (e4) {}
    }
  }

  function stripHtmlToText(html) {
    if (!html || typeof html !== "string") return "";
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getDocumentBodyText(cb) {
    execMethod("GetFileHTML", [], function (html) {
      var t = stripHtmlToText(html);
      if (t) {
        try { cb && cb(t); } catch (e) {}
        return;
      }
      if (!canCallCommand()) {
        try { cb && cb(""); } catch (e) {}
        return;
      }
      try {
        window.Asc.plugin.callCommand(
          function () {
            try {
              var doc = Api.GetDocument();
              if (!doc) return "";
              var body = doc.GetBody ? doc.GetBody() : null;
              if (!body || !body.GetElementsCount) return "";
              var parts = [];
              var n = body.GetElementsCount();
              for (var i = 0; i < n; i++) {
                try {
                  var el = body.GetElement ? body.GetElement(i) : null;
                  if (!el || !el.GetRange) continue;
                  var r = el.GetRange();
                  if (!r || !r.GetText) continue;
                  var txt = r.GetText({
                    Numbering: false, Math: false,
                    ParaSeparator: "\n", TableRowSeparator: "\n", NewLineSeparator: "\n",
                  }) || "";
                  if (txt) parts.push(txt);
                } catch (e) {}
              }
              return parts.join("\n");
            } catch (e) { return ""; }
          },
          false, true,
          function (text) { try { cb && cb(String(text || "")); } catch (e2) {} }
        );
      } catch (e3) {
        try { cb && cb(""); } catch (e4) {}
      }
    });
  }

  function getTextByMode(mode, cb) {
    var m = String(mode || "selection");
    if (m === "document") {
      getDocumentBodyText(function (t) { cb && cb(String(t || "")); });
      return;
    }
    if (m === "selection") {
      execMethod("GetSelectedText", [], function (t) {
        t = String(t || "").trim();
        if (!t) {
          setStatus("ไม่มีข้อความที่เลือก — กำลังตรวจทั้งเอกสาร...");
          getDocumentBodyText(function (d) { cb && cb(String(d || "")); });
        } else {
          cb && cb(t);
        }
      });
      return;
    }
    if (m === "sentence") {
      execMethod("GetCurrentSentence", [], function (t) {
        t = String(t || "").trim();
        if (!t) {
          setStatus("ไม่พบประโยค — กำลังตรวจทั้งเอกสาร...");
          getDocumentBodyText(function (d) { cb && cb(String(d || "")); });
        } else {
          cb && cb(t);
        }
      });
      return;
    }
    getCurrentParagraphText(function (t) {
      t = String(t || "").trim();
      if (!t && m === "paragraph") {
        setStatus("ไม่พบย่อหน้า — กำลังตรวจทั้งเอกสาร...");
        getDocumentBodyText(function (d) { cb && cb(String(d || "")); });
      } else {
        cb && cb(t || "");
      }
    });
  }

  /* ========== IGNORED WORDS ========== */

  function loadIgnoredWords() {
    try {
      var storage = typeof sessionStorage !== "undefined" ? sessionStorage : (typeof localStorage !== "undefined" ? localStorage : null);
      var raw = storage ? storage.getItem(STORAGE_KEY_IGNORED) || "[]" : "[]";
      var arr = [];
      try { arr = JSON.parse(raw); } catch (e0) {}
      state.ignoredWords = Object.create(null);
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) {
          var w = String(arr[i] || "").trim();
          if (w) state.ignoredWords[w] = true;
        }
      }
    } catch (e) { state.ignoredWords = Object.create(null); }
  }

  function saveIgnoredWords() {
    try {
      var storage = typeof sessionStorage !== "undefined" ? sessionStorage : (typeof localStorage !== "undefined" ? localStorage : null);
      if (!storage) return;
      var arr = Object.keys(state.ignoredWords || {}).filter(Boolean);
      storage.setItem(STORAGE_KEY_IGNORED, JSON.stringify(arr));
    } catch (e) {}
  }

  function addToIgnoredWords(word) {
    var w = String(word || "").trim();
    if (w) { state.ignoredWords[w] = true; saveIgnoredWords(); }
  }

  /* ========== WORD EXTRACTION (unique, for spellcheck phase) ========== */

  function extractWordsFromText(text) {
    var t = String(text || "").trim();
    if (!t) return [];

    var words = [];
    var seen = Object.create(null);

    function addWord(w) {
      var ww = String(w || "").trim();
      if (!ww || ww.length < MIN_WORD_LENGTH) return;
      if (SKIP_NUMERIC.test(ww) || SKIP_PUNCTUATION.test(ww)) return;
      var k = ww.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      words.push(ww);
    }

    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      try {
        var segmenterTh = new Intl.Segmenter("th", { granularity: "word" });
        var iter = segmenterTh.segment(t);
        for (var it of iter) {
          if (it && it.isWordLike && it.segment) addWord(it.segment);
        }
        if (words.length > 0) return words;
      } catch (err) {
        console.warn("[SpellCheckTHEN] Intl.Segmenter error, using fallback", err);
      }
    }

    var fallback = t.split(/[\s\u00A0\u200B-\u200D\uFEFF]+/);
    for (var j = 0; j < fallback.length; j++) addWord(fallback[j]);
    return words;
  }

  /* ========== DICTIONARY LOADING (unchanged) ========== */

  function getFetchOrigin() {
    try {
      var s = document.currentScript || document.querySelector('script[src*="spellcheck-then"]');
      if (s && s.src) {
        var u = new URL(s.src, window.location.href);
        var o = u.origin || "";
        if (o) return o;
      }
    } catch (e) {}
    try {
      if (window.parent && window.parent !== window && window.parent.location && window.parent.location.origin) {
        return window.parent.location.origin;
      }
    } catch (e2) {}
    var o = (window.location && window.location.origin) || "";
    return o || "";
  }

  function fetchBaseDictWordsJson(path) {
    var origin = getFetchOrigin();
    var url = origin ? origin + "/" + path.replace(/^\//, "") : "";
    if (!url) return Promise.resolve({ words: [], byLength: {} });
    return fetch(url, { method: "GET", credentials: "include" })
      .then(function (r) {
        if (!r || !r.ok) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[SpellCheckTHEN] Base dict fetch failed:", path, "status=" + (r ? r.status : "no response"));
          }
          return { words: [], byLength: {} };
        }
        return r.text().then(function (txt) {
          var t = String(txt || "").trim();
          if (!t || t.charAt(0) === "<") return null;
          try { return JSON.parse(t); } catch (e) { return null; }
        });
      })
      .then(function (arr) {
        if (arr == null || !Array.isArray(arr)) return { words: [], byLength: {} };
        var words = [];
        var byLength = Object.create(null);
        var seen = Object.create(null);
        for (var i = 0; i < arr.length; i++) {
          var w = String(arr[i] || "").trim();
          if (!w) continue;
          var k = w.toLowerCase();
          if (seen[k]) continue;
          seen[k] = true;
          words.push(w);
          var len = w.length;
          if (!byLength[len]) byLength[len] = [];
          byLength[len].push(w);
        }
        if (typeof console !== "undefined" && console.log) {
          console.log("[SpellCheckTHEN] Base dict loaded:", path, words.length, "words");
        }
        return { words: words, byLength: byLength };
      })
      .catch(function (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[SpellCheckTHEN] Base dict error:", path, err);
        }
        return { words: [], byLength: {} };
      });
  }

  function fetchDictionary(langPath) {
    var origin = window.location.origin || "";
    var path = langPath.replace(/^\//, "");
    var url = origin ? origin + "/" + path : "";
    if (!url) return Promise.resolve({ words: [], byLength: {} });
    return fetch(url, { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" })
      .then(function (r) {
        if (!r || !r.ok) return { words: [], byLength: {} };
        return r.json();
      })
      .then(function (payload) {
        var list = (payload && payload.data) || (payload && payload.Data) || payload;
        if (!Array.isArray(list)) return { words: [], byLength: {} };
        var words = [];
        var byLength = Object.create(null);
        var seen = Object.create(null);
        for (var i = 0; i < list.length; i++) {
          var w = String((list[i] && (list[i].word || list[i].Word)) || "").trim();
          if (!w) continue;
          var k = w.toLowerCase();
          if (seen[k]) continue;
          seen[k] = true;
          words.push(w);
          var len = w.length;
          if (!byLength[len]) byLength[len] = [];
          byLength[len].push(w);
        }
        return { words: words, byLength: byLength };
      })
      .catch(function () { return { words: [], byLength: {} }; });
  }

  function mergeDictResults(results) {
    var allWords = [];
    var allByLength = Object.create(null);
    var validSet = Object.create(null);
    for (var r = 0; r < results.length; r++) {
      var res = results[r] || {};
      var wl = res.words || [];
      var bl = res.byLength || {};
      for (var i = 0; i < wl.length; i++) {
        var w = String(wl[i] || "").trim();
        if (!w) continue;
        var k = w.toLowerCase();
        validSet[k] = true;
        if (allWords.indexOf(w) < 0) allWords.push(w);
      }
      for (var len in bl) {
        if (!allByLength[len]) allByLength[len] = [];
        for (var b = 0; b < bl[len].length; b++) {
          var d = bl[len][b];
          if (d && allByLength[len].indexOf(d) < 0) allByLength[len].push(d);
        }
      }
    }
    return { words: allWords, byLength: allByLength, validWords: validSet };
  }

  function isThaiWord(word) {
    var w = String(word || "");
    for (var i = 0; i < w.length; i++) {
      var c = w.charCodeAt(i);
      if (c >= 0x0e00 && c <= 0x0e7f) return true;
    }
    return false;
  }

  function fetchAllDictionaries() {
    return Promise.all([
      fetchBaseDictWordsJson(BASE_DICT_THAI_PATH),
      fetchBaseDictWordsJson(BASE_DICT_ENGLISH_PATH),
    ]).then(function (baseResults) {
      return Promise.all([
        fetchDictionary(DICT_THAI_PATH),
        fetchDictionary(DICT_ENGLISH_PATH),
      ]).then(function (apiResults) {
        var thaiMerged = mergeDictResults([baseResults[0], apiResults[0]]);
        var englishMerged = mergeDictResults([baseResults[1], apiResults[1]]);
        if (typeof console !== "undefined" && console.log) {
          console.log("[SpellCheckTHEN] Thai dict:", Object.keys(thaiMerged.validWords).length, "words, EN dict:", Object.keys(englishMerged.validWords).length, "words");
        }
        return {
          validWordsThai: thaiMerged.validWords,
          validWordsEnglish: englishMerged.validWords,
          dictionaryWordsThai: thaiMerged.words,
          dictionaryByLengthThai: thaiMerged.byLength,
          dictionaryWordsEnglish: englishMerged.words,
          dictionaryByLengthEnglish: englishMerged.byLength,
          words: thaiMerged.words.concat(englishMerged.words),
          byLength: thaiMerged.byLength,
          validWords: Object.assign(Object.create(null), thaiMerged.validWords, englishMerged.validWords),
        };
      });
    });
  }

  /* ========== FUZZY MATCHING (unchanged) ========== */

  function levenshtein(a, b) {
    a = String(a || "");
    b = String(b || "");
    var an = a.length, bn = b.length;
    if (an === 0) return bn;
    if (bn === 0) return an;
    var row0 = [], row1 = [];
    var i, j;
    for (j = 0; j <= an; j++) row0[j] = j;
    for (i = 1; i <= bn; i++) {
      row1[0] = i;
      for (j = 1; j <= an; j++) {
        var cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
        row1[j] = Math.min(row1[j - 1] + 1, row0[j] + 1, row0[j - 1] + cost);
      }
      var tmp = row0; row0 = row1; row1 = tmp;
    }
    return row0[an];
  }

  function fuzzyMatchDictionary(word, dictWords, existingSet, byLength) {
    var w = String(word || "").trim();
    if (!w) return [];
    var existing = existingSet || Object.create(null);
    var candidates = [];
    var wLen = w.length;
    var listToCheck = [];
    if (byLength && typeof byLength === "object") {
      for (var len = wLen - FUZZY_MAX_LENGTH_DIFF; len <= wLen + FUZZY_MAX_LENGTH_DIFF; len++) {
        if (len < 1) continue;
        var bucket = byLength[len];
        if (Array.isArray(bucket)) for (var b = 0; b < bucket.length; b++) listToCheck.push(bucket[b]);
      }
    } else if (Array.isArray(dictWords) && dictWords.length) {
      for (var i = 0; i < dictWords.length; i++) {
        var d = String(dictWords[i] || "").trim();
        if (d && Math.abs(d.length - wLen) <= FUZZY_MAX_LENGTH_DIFF) listToCheck.push(d);
      }
    }
    for (var i = 0; i < listToCheck.length; i++) {
      var d = String(listToCheck[i] || "").trim();
      if (!d || d === w || existing[d]) continue;
      var dist = levenshtein(w, d);
      if (dist > FUZZY_MAX_DISTANCE) continue;
      candidates.push({ word: d, distance: dist });
    }
    candidates.sort(function (x, y) { return x.distance - y.distance || x.word.length - y.word.length; });
    var out = [];
    for (var j = 0; j < candidates.length && out.length < FUZZY_MAX_SUGGESTIONS; j++) out.push(candidates[j].word);
    return out;
  }

  /* ========== SPELL CHECK (phase 1: find unique misspelled words) ========== */

  function runSpellcheck(text) {
    var words = extractWordsFromText(text);
    var issues = [];
    var validThai = state.validWordsThai || Object.create(null);
    var validEnglish = state.validWordsEnglish || Object.create(null);

    state.sugCache = Object.create(null);

    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w) continue;
      var k = w.toLowerCase();
      if (state.ignoredWords[w]) continue;

      var isThai = isThaiWord(w);
      var validSet = isThai ? validThai : validEnglish;
      if (validSet && validSet[k]) continue;

      var dictWords = isThai ? (state.dictionaryWordsThai || []) : (state.dictionaryWordsEnglish || []);
      var byLength = isThai ? (state.dictionaryByLengthThai || null) : (state.dictionaryByLengthEnglish || null);
      var sugs = fuzzyMatchDictionary(w, dictWords, Object.create(null), byLength);
      state.sugCache[k] = sugs;
      issues.push({ word: w, suggestions: sugs });
    }

    return issues;
  }

  /* ========== OCCURRENCE TRACKING (phase 2: find all positions in document) ========== */

  /**
   * ดึง text ของทุก paragraph ในเอกสาร พร้อม element index
   * ผลลัพธ์: [{idx: Number, text: String}, ...]
   */
  function getAllParagraphs(cb) {
    if (!canCallCommand()) {
      try { cb && cb([]); } catch (e) {}
      return;
    }
    try {
      window.Asc.plugin.callCommand(
        function () {
          try {
            var doc = Api.GetDocument();
            if (!doc) return [];
            var body = doc.GetBody ? doc.GetBody() : null;
            if (!body || !body.GetElementsCount) return [];
            var n = body.GetElementsCount();
            var paras = [];
            for (var i = 0; i < n; i++) {
              try {
                var el = body.GetElement(i);
                if (!el || !el.GetRange) continue;
                var r = el.GetRange();
                if (!r || !r.GetText) continue;
                var text = r.GetText({
                  Numbering: false, Math: false,
                  ParaSeparator: "\n", TableRowSeparator: "\n", NewLineSeparator: "\n",
                }) || "";
                paras.push({ idx: i, text: text });
              } catch (eInner) {}
            }
            return paras;
          } catch (e) { return []; }
        },
        false, true,
        function (result) {
          try { cb && cb(Array.isArray(result) ? result : []); } catch (e) {}
        }
      );
    } catch (e) {
      try { cb && cb([]); } catch (e2) {}
    }
  }

  /**
   * จาก paragraphs + issues (unique misspelled words) → หาทุก occurrence พร้อมตำแหน่ง
   * ใช้ Intl.Segmenter เพื่อ match เฉพาะ word boundary (ไม่ match partial)
   * ผลลัพธ์: [{word, suggestions, paraIdx, start, end, context, occId}, ...]
   */
  function findOccurrencesForIssues(paragraphs, issues) {
    // Build lookup: lowercased word → issue
    var issueMap = Object.create(null);
    for (var i = 0; i < issues.length; i++) {
      var it = issues[i];
      issueMap[it.word.toLowerCase()] = it;
    }

    var occurrences = [];
    var occId = 0;
    var hasSegmenter = typeof Intl !== "undefined" && Intl.Segmenter;

    for (var p = 0; p < paragraphs.length; p++) {
      var para = paragraphs[p];
      var text = String(para.text || "");
      if (!text.trim()) continue;

      if (hasSegmenter) {
        try {
          var segmenter = new Intl.Segmenter("th", { granularity: "word" });
          var segments = segmenter.segment(text);
          for (var seg of segments) {
            if (!seg.isWordLike) continue;
            var w = String(seg.segment || "").trim();
            if (!w || w.length < MIN_WORD_LENGTH) continue;
            if (SKIP_NUMERIC.test(w) || SKIP_PUNCTUATION.test(w)) continue;
            var k = w.toLowerCase();
            var issue = issueMap[k];
            if (!issue) continue;
            if (state.ignoredWords[w] || state.ignoredWords[issue.word]) continue;

            occurrences.push({
              word: issue.word,
              suggestions: issue.suggestions,
              paraIdx: para.idx,
              start: seg.index,
              end: seg.index + seg.segment.length,
              context: text,
              occId: occId++
            });
          }
        } catch (err) {
          console.warn("[SpellCheckTHEN] Segmenter error in paragraph", para.idx, err);
        }
      } else {
        // Fallback: space-based splitting
        var parts = text.split(/[\s\u00A0\u200B-\u200D\uFEFF]+/);
        var pos = 0;
        for (var j = 0; j < parts.length; j++) {
          var w = String(parts[j] || "").trim();
          if (!w) continue;
          var idx = text.indexOf(w, pos);
          if (idx < 0) idx = pos;
          var k = w.toLowerCase();
          var issue = issueMap[k];
          if (issue && !state.ignoredWords[w] && !state.ignoredWords[issue.word]) {
            occurrences.push({
              word: issue.word,
              suggestions: issue.suggestions,
              paraIdx: para.idx,
              start: idx,
              end: idx + w.length,
              context: text,
              occId: occId++
            });
          }
          pos = idx + w.length;
        }
      }
    }

    return occurrences;
  }

  /**
   * สร้าง context snippet โดยตัดข้อความรอบคำ + highlight ด้วย <mark>
   */
  function getContextSnippet(text, start, end) {
    var maxCtx = 20;
    var before = text.substring(Math.max(0, start - maxCtx), start);
    var word = text.substring(start, end);
    var after = text.substring(end, Math.min(text.length, end + maxCtx));
    var prefix = start > maxCtx ? "…" : "";
    var suffix = (end + maxCtx) < text.length ? "…" : "";
    return prefix + escapeHtml(before) +
      '<mark class="tscHighlight">' + escapeHtml(word) + '</mark>' +
      escapeHtml(after) + suffix;
  }

  /* ========== RENDERING ========== */

  function renderGroupedOccurrences() {
    var root = $("tscResults");
    if (!root) return;

    var occs = state.lastOccurrences || [];

    // Filter out replaced and ignored
    var active = [];
    for (var i = 0; i < occs.length; i++) {
      var o = occs[i];
      if (state.replacedOccurrences[o.occId]) continue;
      if (state.ignoredWords[o.word]) continue;
      active.push(o);
    }

    if (!active.length) {
      root.innerHTML = '<div class="tscEmpty">ไม่พบคำที่น่าจะผิดในช่วงที่เลือก</div>';
      return;
    }

    // Group by word (preserve order of first appearance)
    var groups = Object.create(null);
    var groupOrder = [];
    for (var i = 0; i < active.length; i++) {
      var o = active[i];
      var wk = o.word;
      if (!groups[wk]) {
        groups[wk] = { word: wk, suggestions: o.suggestions, items: [] };
        groupOrder.push(wk);
      }
      groups[wk].items.push(o);
    }

    var html = "";
    for (var g = 0; g < groupOrder.length; g++) {
      var grp = groups[groupOrder[g]];
      var word = grp.word;
      var sugs = grp.suggestions || [];
      var items = grp.items;
      var chosen = state.selectedSuggestionByWord[word];
      if (!chosen && sugs.length) { chosen = String(sugs[0] || ""); state.selectedSuggestionByWord[word] = chosen; }

      html += '<div class="tscIssue" data-word="' + escapeHtml(word) + '">';

      // ─── Header ───
      html += '<div class="tscIssueTop">';
      html += '<div class="tscWord">' + escapeHtml(word) +
        ' <span class="tscCount">(' + items.length + ' ตำแหน่ง)</span></div>';
      html += '<div class="tscActions">';
      html += '<button class="tscSmallBtn" data-act="ignore" title="ข้ามคำนี้ทุกตำแหน่ง">Ignore All</button>';
      html += '<button class="tscSmallBtn" data-act="add" title="เพิ่มคำนี้ลง Dictionary">Add word</button>';
      if (items.length > 1) {
        html += '<button class="tscSmallBtn tscBtnDanger" data-act="all" title="แทนที่ทุกตำแหน่ง">Replace All</button>';
      }
      html += '</div></div>';

      // ─── Suggestions ───
      if (sugs.length) {
        html += '<div class="tscSugList">';
        for (var j = 0; j < sugs.length; j++) {
          var s = String(sugs[j] || "").trim();
          if (!s) continue;
          var isSel = chosen === s;
          html += '<button class="tscSug" data-act="pick" data-sug="' + escapeHtml(s) + '"' +
            (isSel ? ' style="border-color:rgba(25,118,210,0.65);background:rgba(25,118,210,0.18);"' : '') +
            '>' + escapeHtml(s) + '</button>';
        }
        html += '</div>';
      } else {
        html += '<div class="tscHint" style="margin-top:6px">ไม่พบคำแนะนำ (ลองเพิ่มคำใน Dictionary)</div>';
      }

      // ─── Per-occurrence list ───
      html += '<div class="tscOccurrences">';
      for (var k = 0; k < items.length; k++) {
        var occ = items[k];
        var ctx = getContextSnippet(occ.context, occ.start, occ.end);
        html += '<div class="tscOccurrence" data-occ-id="' + occ.occId +
          '" data-para="' + occ.paraIdx +
          '" data-start="' + occ.start +
          '" data-end="' + occ.end + '">';
        html += '<span class="tscOccNum">#' + (k + 1) + '</span>';
        html += '<span class="tscOccContext" data-act="jump-occ" title="คลิกเพื่อไปที่ตำแหน่งนี้ในเอกสาร">' + ctx + '</span>';
        html += '<button class="tscSmallBtn tscReplaceOne" data-act="replace-one" title="แทนที่เฉพาะตำแหน่งนี้">Replace</button>';
        html += '</div>';
      }
      html += '</div>';

      html += '</div>';
    }
    root.innerHTML = html;
  }

  /* ========== REPLACEMENT ========== */

  /**
   * แทนที่ occurrence เฉพาะตำแหน่ง โดยใช้ paragraph index + character offset
   * ใช้ ApiParagraph.GetRange(start, end) → ApiRange.SetText(newText)
   */
  function replaceOccurrence(paraIdx, start, end, newText, cb) {
    if (!canCallCommand()) { if (cb) cb({ ok: false }); return; }
    window.Asc.scope = window.Asc.scope || {};
    window.Asc.scope.__tsc_para = paraIdx;
    window.Asc.scope.__tsc_start = start;
    window.Asc.scope.__tsc_end = end - 1; // GetRange ใช้ end inclusive
    window.Asc.scope.__tsc_text = newText;
    try {
      window.Asc.plugin.callCommand(
        function () {
          try {
            var doc = Api.GetDocument();
            if (!doc) return { ok: false };
            var body = doc.GetBody ? doc.GetBody() : null;
            if (!body) return { ok: false };
            var el = body.GetElement(Asc.scope.__tsc_para);
            if (!el || !el.GetRange) return { ok: false };
            var range = el.GetRange(Asc.scope.__tsc_start, Asc.scope.__tsc_end);
            if (!range) return { ok: false };
            range.SetText(Asc.scope.__tsc_text);
            return { ok: true };
          } catch (e) { return { ok: false, error: String(e) }; }
        },
        false, true,
        function (result) { if (cb) cb(result || { ok: false }); }
      );
    } catch (e) { if (cb) cb({ ok: false }); }
  }

  /**
   * นำทางไปที่ occurrence เฉพาะตำแหน่ง โดยใช้ Select()
   */
  function selectOccurrence(paraIdx, start, end) {
    if (!canCallCommand()) return;
    window.Asc.scope = window.Asc.scope || {};
    window.Asc.scope.__tsc_para = paraIdx;
    window.Asc.scope.__tsc_start = start;
    window.Asc.scope.__tsc_end = end - 1;
    try {
      window.Asc.plugin.callCommand(
        function () {
          try {
            var doc = Api.GetDocument();
            if (!doc) return;
            var body = doc.GetBody ? doc.GetBody() : null;
            if (!body) return;
            var el = body.GetElement(Asc.scope.__tsc_para);
            if (!el || !el.GetRange) return;
            var range = el.GetRange(Asc.scope.__tsc_start, Asc.scope.__tsc_end);
            if (range && range.Select) range.Select();
          } catch (e) {}
        },
        false, true,
        function () {}
      );
    } catch (e) {}
  }

  /**
   * แทนที่คำทุกตำแหน่ง — ใช้ SearchAndReplace ของ OnlyOffice
   * หลัง replace เสร็จจะ rescan เอกสาร
   */
  function replaceAllWord(word, suggestion, cb) {
    var w = String(word || "").trim(), s = String(suggestion || "").trim();
    if (!w || !s) return;
    setStatus('กำลังแทนที่ "' + w + '" ทั้งหมด...');
    if (!canCallCommand()) { if (cb) cb(); return; }
    try {
      window.Asc.scope = window.Asc.scope || {};
      window.Asc.scope.__tsc_replace_old = w;
      window.Asc.scope.__tsc_replace_new = s;
      window.Asc.plugin.callCommand(
        function () {
          try {
            var doc = Api.GetDocument();
            if (!doc) return { ok: false };
            var oldText = String(Asc.scope.__tsc_replace_old || "");
            var newText = String(Asc.scope.__tsc_replace_new || "");
            if (!oldText) return { ok: false };
            if (doc.SearchAndReplace) {
              var count = 0;
              var opts = { searchString: oldText, replaceString: newText, matchCase: true };
              while (doc.SearchAndReplace(opts) === true) count++;
              return { ok: count > 0, count: count };
            }
            return { ok: false };
          } catch (e) { return { ok: false }; }
        },
        false, true,
        function (result) {
          var cnt = (result && result.count) || 0;
          setStatus('แทนที่ "' + w + '" → "' + s + '" ทั้งหมด ' + cnt + ' ตำแหน่ง');
          // Mark all occurrences of this word as replaced
          var occs = state.lastOccurrences || [];
          for (var i = 0; i < occs.length; i++) {
            if (occs[i].word === w) state.replacedOccurrences[occs[i].occId] = true;
          }
          // Remove from issues
          state.lastIssues = (state.lastIssues || []).filter(function (it) { return it.word !== w; });
          renderGroupedOccurrences();
          if (cb) cb();
        }
      );
    } catch (e) { if (cb) cb(); }
  }

  /**
   * Rescan เอกสาร (ดึง paragraph texts ใหม่) แล้ว rebuild occurrences + render
   * เรียกหลังจาก replace เดี่ยวเพื่อให้ positions ถูกต้อง
   */
  function rescanAndRender() {
    setStatus("กำลังสแกนเอกสารใหม่...");
    state.replacedOccurrences = Object.create(null);
    getAllParagraphs(function (paragraphs) {
      state.lastParagraphs = paragraphs;
      state.lastOccurrences = findOccurrencesForIssues(paragraphs, state.lastIssues);
      renderGroupedOccurrences();
      // Count remaining active
      var active = 0;
      for (var i = 0; i < state.lastOccurrences.length; i++) {
        var o = state.lastOccurrences[i];
        if (!state.replacedOccurrences[o.occId] && !state.ignoredWords[o.word]) active++;
      }
      setStatus("เสร็จแล้ว (" + active + " รายการ)");
    });
  }

  /* ========== ADD WORD TO DICTIONARY ========== */

  function apiPostJson(path, body) {
    var origin = window.location.origin || "";
    if (!origin) return Promise.reject(new Error("missing_origin"));
    var url = origin + "/" + (path === "/add-words" ? BACKEND_ADD_WORDS_PATH : path.replace(/^\//, ""));
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      credentials: "include",
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error("http_" + r.status + ":" + String(t || "")); });
      return r.json();
    });
  }

  function addWord(word, onSuccess) {
    var w = String(word || "").trim();
    if (!w) return;
    setStatus('กำลังเพิ่มคำ "' + w + '" ...');
    apiPostJson("/add-words", { words: [w] })
      .then(function () {
        setStatus('เพิ่มคำ "' + w + '" แล้ว');
        var k = w.toLowerCase();
        state.validWords = state.validWords || Object.create(null);
        state.validWords[k] = true;
        if (isThaiWord(w)) {
          state.validWordsThai = state.validWordsThai || Object.create(null);
          state.validWordsThai[k] = true;
        } else {
          state.validWordsEnglish = state.validWordsEnglish || Object.create(null);
          state.validWordsEnglish[k] = true;
        }
        if (typeof onSuccess === "function") onSuccess(w);
      })
      .catch(function (e) {
        setStatus("เพิ่มคำไม่สำเร็จ: " + String(e && e.message ? e.message : e));
      });
  }

  /* ========== EVENT WIRING ========== */

  function wireEvents() {
    var btnCheck = $("tscBtnCheck");
    var btnClose = $("tscBtnClose");

    if (btnClose) {
      btnClose.addEventListener("click", function () {
        try { window.Asc.plugin.executeCommand("close", ""); } catch (e) {}
      });
    }

    /* ── ปุ่ม "ตรวจคำ" ── */
    if (btnCheck) {
      btnCheck.addEventListener("click", function () {
        // Reset state
        state.lastIssues = [];
        state.lastOccurrences = [];
        state.lastParagraphs = [];
        state.replacedOccurrences = Object.create(null);
        state.selectedSuggestionByWord = Object.create(null);
        state.sugCache = Object.create(null);
        renderGroupedOccurrences();
        setStatus("กำลังโหลด Dictionary...");

        var modeEl = $("tscMode");
        var mode = modeEl ? String(modeEl.value || "selection") : "selection";

        getTextByMode(mode, function (text) {
          var t = String(text || "").trim();
          if (!t) {
            setStatus(mode === "document"
              ? "เอกสารว่างเปล่า หรือไม่สามารถอ่านเนื้อหาได้"
              : "ไม่มีข้อความให้ตรวจ (ลองเลือกข้อความก่อน)");
            return;
          }

          setStatus("กำลังตรวจคำ...");
          var t0 = Date.now();

          fetchAllDictionaries()
            .then(function (dictResult) {
              // Store dictionaries
              state.dictionaryWords = dictResult.words || [];
              state.dictionaryByLength = dictResult.byLength || null;
              state.validWords = dictResult.validWords || Object.create(null);
              state.validWordsThai = dictResult.validWordsThai || Object.create(null);
              state.validWordsEnglish = dictResult.validWordsEnglish || Object.create(null);
              state.dictionaryWordsThai = dictResult.dictionaryWordsThai || [];
              state.dictionaryByLengthThai = dictResult.dictionaryByLengthThai || null;
              state.dictionaryWordsEnglish = dictResult.dictionaryWordsEnglish || [];
              state.dictionaryByLengthEnglish = dictResult.dictionaryByLengthEnglish || null;

              // Phase 1: find unique misspelled words
              state.lastIssues = runSpellcheck(t);

              if (!state.lastIssues.length) {
                renderGroupedOccurrences();
                setStatus("เสร็จแล้ว — ไม่พบคำผิด (" + (Date.now() - t0) + " ms)");
                return;
              }

              // Phase 2: scan all paragraphs → find every occurrence with position
              setStatus("กำลังสแกนตำแหน่งในเอกสาร...");
              getAllParagraphs(function (paragraphs) {
                state.lastParagraphs = paragraphs;
                state.lastOccurrences = findOccurrencesForIssues(paragraphs, state.lastIssues);
                renderGroupedOccurrences();

                var nWords = state.lastIssues.length;
                var nOccs = state.lastOccurrences.length;
                setStatus("เสร็จแล้ว — " + nWords + " คำ, " + nOccs + " ตำแหน่ง (" + (Date.now() - t0) + " ms)");
              });
            })
            .catch(function (e) {
              renderGroupedOccurrences();
              setStatus("โหลด Dictionary ไม่สำเร็จ: " + String(e && e.message ? e.message : e));
            });
        });
      });
    }

    /* ── Event delegation สำหรับ results panel ── */
    var results = $("tscResults");
    if (results) {
      results.addEventListener("click", function (ev) {
        var target = ev && ev.target ? ev.target : null;
        if (!target) return;
        var act = target.getAttribute ? target.getAttribute("data-act") : "";
        if (!act) return;

        // หา parent .tscIssue เพื่อดึง word
        var issueEl = target.closest ? target.closest(".tscIssue") : null;
        var word = issueEl ? String(issueEl.getAttribute("data-word") || "") : "";

        // ─── pick: เลือก suggestion ───
        if (act === "pick" && word) {
          var sug = String(target.getAttribute("data-sug") || "");
          if (sug) {
            state.selectedSuggestionByWord[word] = sug;
            renderGroupedOccurrences();
          }
          return;
        }

        // ─── jump-occ: คลิก context snippet เพื่อ navigate ไปที่ตำแหน่ง ───
        if (act === "jump-occ") {
          var occEl = target.closest ? target.closest(".tscOccurrence") : null;
          if (occEl) {
            var paraIdx = parseInt(occEl.getAttribute("data-para"), 10);
            var startOff = parseInt(occEl.getAttribute("data-start"), 10);
            var endOff = parseInt(occEl.getAttribute("data-end"), 10);
            if (!isNaN(paraIdx) && !isNaN(startOff) && !isNaN(endOff)) {
              selectOccurrence(paraIdx, startOff, endOff);
              setStatus('ไปที่ตำแหน่ง #' + (occEl.getAttribute("data-occ-id") || ""));
            }
          }
          return;
        }

        // ─── replace-one: แทนที่ occurrence เดียว ───
        if (act === "replace-one" && word) {
          var chosen = String(state.selectedSuggestionByWord[word] || "");
          if (!chosen) { setStatus("กรุณาเลือกคำแนะนำก่อน"); return; }
          var occEl = target.closest ? target.closest(".tscOccurrence") : null;
          if (!occEl) return;

          var paraIdx = parseInt(occEl.getAttribute("data-para"), 10);
          var startOff = parseInt(occEl.getAttribute("data-start"), 10);
          var endOff = parseInt(occEl.getAttribute("data-end"), 10);
          if (isNaN(paraIdx) || isNaN(startOff) || isNaN(endOff)) return;

          setStatus('กำลังแทนที่ "' + word + '" → "' + chosen + '"...');
          replaceOccurrence(paraIdx, startOff, endOff, chosen, function (result) {
            if (result && result.ok) {
              setStatus('แทนที่ "' + word + '" → "' + chosen + '" สำเร็จ');
              // Rescan เพื่อ update ตำแหน่งทั้งหมด (เพราะ offset อาจเลื่อน)
              // ลบ issue ถ้าไม่เหลือ occurrence
              setTimeout(function () { rescanAndRender(); }, 100);
            } else {
              setStatus('แทนที่ไม่สำเร็จ — ลอง "ตรวจคำ" ใหม่');
            }
          });
          return;
        }

        if (!word) return;
        var chosen = String(state.selectedSuggestionByWord[word] || "");

        // ─── ignore: ข้ามคำนี้ทุกตำแหน่ง ───
        if (act === "ignore") {
          addToIgnoredWords(word);
          setStatus('ข้ามคำ "' + word + '" แล้ว');
          // Remove from issues
          state.lastIssues = (state.lastIssues || []).filter(function (it) { return it.word !== word; });
          renderGroupedOccurrences();
          return;
        }

        // ─── add: เพิ่มคำลง Dictionary ───
        if (act === "add") {
          addWord(word, function () {
            state.lastIssues = (state.lastIssues || []).filter(function (it) { return it.word !== word; });
            renderGroupedOccurrences();
          });
          return;
        }

        // ─── all: แทนที่ทุกตำแหน่ง ───
        if (act === "all") {
          if (!chosen) { setStatus("กรุณาเลือกคำแนะนำก่อน"); return; }
          replaceAllWord(word, chosen, function () {
            setTimeout(function () { rescanAndRender(); }, 100);
          });
          return;
        }
      });
    }
  }

  /* ========== PLUGIN INIT ========== */

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};
  window.Asc.plugin.init = function () {
    if (state.inited) return;
    state.inited = true;
    loadIgnoredWords();
    try {
      var v = $("tscVersion");
      if (v) v.textContent = "v" + VERSION;
    } catch (e0) {}
    wireEvents();
    setStatus("พร้อม — ใช้ Custom Dict (TH+EN) — Selective Replace");
  };

  window.Asc.plugin.button = function (id, windowID) {
    if (windowID !== undefined && windowID !== null && String(windowID) !== "") return;
    try { this.executeCommand("close", ""); } catch (e) {}
  };

})(window);
