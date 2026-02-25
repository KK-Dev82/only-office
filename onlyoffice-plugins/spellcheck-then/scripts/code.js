/* SpellCheck TH+EN plugin (OnlyOffice)
 * - แหล่งที่ 1: only-office/dict (words.json จาก th_TH.dic, en_US.dic)
 * - แหล่งที่ 2: Dictionary API (คำที่ผู้ใช้เพิ่มใน M0106)
 * - ใช้ Intl.Segmenter — ไม่ใช้ PyThai
 * - Add words: api/word-management/spellcheck/add-words
 */
(function (window) {
  var STORAGE_KEY_IGNORED = "spellcheck-then:v1:ignoredWords";
  var VERSION = "0.1.1";

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
    lastIssues: [],
    selectedSuggestionByWord: Object.create(null),
    replacedWords: Object.create(null),
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
    inited: false,
  };

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

  /** แหล่งที่ 1: โหลด words.json จาก only-office/dict (สร้างจาก .dic) */
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

  /** แหล่งที่ 2: Dictionary API (คำที่ผู้ใช้เพิ่มใน M0106) */
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

  /** ตรวจว่าเป็นคำไทย (มีตัวอักษรไทย U+0E00–U+0E7F) */
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

  function isWordValid(word) {
    var w = String(word || "").trim();
    if (!w) return true;
    var k = w.toLowerCase();
    return !!(state.validWords && state.validWords[k]);
  }

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

  function runSpellcheck(text) {
    var words = extractWordsFromText(text);
    var issues = [];
    var validThai = state.validWordsThai || Object.create(null);
    var validEnglish = state.validWordsEnglish || Object.create(null);

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
      issues.push({ word: w, suggestions: sugs });
    }

    return issues;
  }

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

  function renderIssues(issues) {
    var root = $("tscResults");
    if (!root) return;
    var arr = Array.isArray(issues) ? issues : [];
    if (!arr.length) {
      root.innerHTML = '<div class="tscEmpty">ไม่พบคำที่น่าจะผิดในช่วงที่เลือก</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i] || {};
      var word = String(it.word || "").trim();
      if (!word) continue;
      if (state.replacedWords[word] || state.ignoredWords[word]) continue;

      var sugs = Array.isArray(it.suggestions) ? it.suggestions : [];
      var chosen = state.selectedSuggestionByWord[word];
      if (!chosen && sugs.length) chosen = String(sugs[0] || "");
      if (chosen) state.selectedSuggestionByWord[word] = chosen;

      html += '<div class="tscIssue" data-word="' + escapeHtml(word) + '">';
      html += '  <div class="tscIssueTop">';
      html += '    <div class="tscWord" data-act="jump" title="คลิกเพื่อไปที่คำนี้ในเอกสาร">' + escapeHtml(word) + "</div>";
      html += '    <div class="tscActions">';
      html += '      <button class="tscSmallBtn" data-act="ignore">Ignore</button>';
      html += '      <button class="tscSmallBtn" data-act="add">Add word</button>';
      html += '      <button class="tscSmallBtn" data-act="next">Replace next</button>';
      html += '      <button class="tscSmallBtn" data-act="all">Replace all</button>';
      html += "    </div>";
      html += "  </div>";
      if (sugs.length) {
        html += '  <div class="tscSugList">';
        for (var j = 0; j < sugs.length; j++) {
          var s = String(sugs[j] || "").trim();
          if (!s) continue;
          var isSel = chosen === s;
          html += '<button class="tscSug" data-act="pick" data-sug="' + escapeHtml(s) + '" style="' +
            (isSel ? "border-color:rgba(25,118,210,0.65);background:rgba(25,118,210,0.18);" : "") + '">' +
            escapeHtml(s) + "</button>";
        }
        html += "  </div>";
      } else {
        html += '  <div class="tscHint">ไม่พบคำแนะนำ (ลองเพิ่มคำใน Dictionary)</div>';
      }
      html += "</div>";
    }
    root.innerHTML = html;
  }

  function replaceNext(word, suggestion) {
    var w = String(word || "").trim(), s = String(suggestion || "").trim();
    if (!w || !s) return;
    setStatus('กำลังหา "' + w + '" แล้วแทนที่...');
    execMethod("SearchNext", [{ searchString: w, matchCase: true }, true], function (found) {
      if (found === false) {
        setStatus('ไม่พบ "' + w + '" ถัดไปจากตำแหน่งเคอร์เซอร์');
        return;
      }
      if (canCallCommand()) {
        try {
          window.Asc.scope = window.Asc.scope || {};
          window.Asc.scope.__tsc_replace_word = s;
          window.Asc.scope.__tsc_replace_word_search = w;
          window.Asc.plugin.callCommand(
            function () {
              try {
                var doc = Api.GetDocument();
                if (!doc) return { ok: false };
                var searchStr = String(Asc.scope.__tsc_replace_word_search || "");
                var newText = String(Asc.scope.__tsc_replace_word || "");
                if (!searchStr || !newText) return { ok: false };
                if (doc.SearchAndReplace) {
                  var ok = doc.SearchAndReplace({ searchString: searchStr, replaceString: newText, matchCase: true });
                  return { ok: ok === true, replaced: ok === true };
                }
                return { ok: false };
              } catch (e) { return { ok: false }; }
            },
            false, true,
            function (result) {
              setStatus(result && result.ok ? 'แทนที่ "' + w + '" -> "' + s + '" แล้ว' : 'แทนที่ไม่สำเร็จ');
            }
          );
        } catch (e) {}
      }
    });
  }

  function replaceAll(word, suggestion) {
    var w = String(word || "").trim(), s = String(suggestion || "").trim();
    if (!w || !s) return;
    setStatus('กำลังแทนที่ทั้งหมด...');
    if (canCallCommand()) {
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
          function (result) { setStatus('แทนที่ทั้งหมดแล้ว'); }
        );
      } catch (e) {}
    }
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

  function doReplaceCurrentWord(word, suggestion) {
    var w = String(word || "").trim(), s = String(suggestion || "").trim();
    if (!w || !s) return;
    setStatus('กำลังแทนที่ "' + w + '" → "' + s + '"...');
    if (canCallCommand()) {
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
              if (!oldText || !newText) return { ok: false };
              if (doc.SearchAndReplace) {
                var ok = doc.SearchAndReplace({ searchString: oldText, replaceString: newText, matchCase: true });
                return { ok: ok === true };
              }
              return { ok: false };
            } catch (e) { return { ok: false }; }
          },
          false, true,
          function (result) {
            if (result && result.ok) {
              setStatus('แทนที่ "' + w + '" → "' + s + '" แล้ว');
              state.replacedWords[w] = true;
              renderIssues(state.lastIssues);
            } else {
              setStatus('แทนที่ไม่สำเร็จ');
            }
          }
        );
      } catch (e) {}
    }
  }

  function jumpToWord(word) {
    var w = String(word || "").trim();
    if (!w) return;
    setStatus('กำลังค้นหา "' + w + '" ในเอกสาร...');
    execMethod("SearchNext", [{ searchString: w, matchCase: false }, true], function (found) {
      if (found === false) setStatus('ไม่พบ "' + w + '" ในเอกสาร');
      else setStatus('พบ "' + w + '" แล้ว');
    });
  }

  function wireEvents() {
    var btnCheck = $("tscBtnCheck");
    var btnClose = $("tscBtnClose");

    if (btnClose) {
      btnClose.addEventListener("click", function () {
        try { window.Asc.plugin.executeCommand("close", ""); } catch (e) {}
      });
    }

    if (btnCheck) {
      btnCheck.addEventListener("click", function () {
        state.lastIssues = [];
        state.replacedWords = Object.create(null);
        state.selectedSuggestionByWord = Object.create(null);
        renderIssues([]);
        setStatus("กำลังโหลด Dictionary...");
        var modeEl = $("tscMode");
        var mode = modeEl ? String(modeEl.value || "selection") : "selection";
        getTextByMode(mode, function (text) {
          var t = String(text || "").trim();
          if (!t) {
            setStatus(mode === "document" ? "เอกสารว่างเปล่า หรือไม่สามารถอ่านเนื้อหาได้" : "ไม่มีข้อความให้ตรวจ (ลองเลือกข้อความก่อน)");
            return;
          }
          setStatus("กำลังตรวจคำ...");
          var t0 = Date.now();
          fetchAllDictionaries()
            .then(function (dictResult) {
              state.dictionaryWords = dictResult.words || [];
              state.dictionaryByLength = dictResult.byLength || null;
              state.validWords = dictResult.validWords || Object.create(null);
              state.validWordsThai = dictResult.validWordsThai || Object.create(null);
              state.validWordsEnglish = dictResult.validWordsEnglish || Object.create(null);
              state.dictionaryWordsThai = dictResult.dictionaryWordsThai || [];
              state.dictionaryByLengthThai = dictResult.dictionaryByLengthThai || null;
              state.dictionaryWordsEnglish = dictResult.dictionaryWordsEnglish || [];
              state.dictionaryByLengthEnglish = dictResult.dictionaryByLengthEnglish || null;
              state.lastIssues = runSpellcheck(t);
              renderIssues(state.lastIssues);
              setStatus("เสร็จแล้ว (" + String(state.lastIssues.length) + " รายการ) — " + (Date.now() - t0) + " ms");
            })
            .catch(function (e) {
              renderIssues([]);
              setStatus("โหลด Dictionary ไม่สำเร็จ: " + String(e && e.message ? e.message : e));
            });
        });
      });
    }

    var results = $("tscResults");
    if (results) {
      results.addEventListener("click", function (ev) {
        var target = ev && ev.target ? ev.target : null;
        if (!target) return;
        var act = target.getAttribute ? target.getAttribute("data-act") : "";
        if (!act) return;
        var issueEl = target.closest ? target.closest(".tscIssue") : null;
        if (!issueEl) return;
        var word = String(issueEl.getAttribute("data-word") || "");
        if (!word) return;

        if (act === "pick") {
          var sug = String(target.getAttribute("data-sug") || "");
          if (sug) {
            state.selectedSuggestionByWord[word] = sug;
            renderIssues(state.lastIssues);
            setStatus('กำลังไปหาคำ "' + word + '" เพื่อแทนที่...');
            execMethod("SearchNext", [{ searchString: word, matchCase: false }, true], function (found) {
              if (found === false) setStatus('ไม่พบ "' + word + '" ในเอกสาร');
              else setTimeout(function () { doReplaceCurrentWord(word, sug); }, 50);
            });
          }
          return;
        }
        if (act === "jump") { jumpToWord(word); return; }
        var chosen = String(state.selectedSuggestionByWord[word] || "");
        if (act === "ignore") {
          addToIgnoredWords(word);
          setStatus('ข้ามคำ "' + word + '" แล้ว');
          renderIssues(state.lastIssues);
          return;
        }
        if (act === "add") {
          addWord(word, function () {
            state.lastIssues = (state.lastIssues || []).filter(function (it) { return String(it.word || "").trim() !== word; });
            renderIssues(state.lastIssues);
          });
          return;
        }
        if (act === "next") { replaceNext(word, chosen); return; }
        if (act === "all") {
          replaceAll(word, chosen);
          state.replacedWords[word] = true;
          renderIssues(state.lastIssues);
          return;
        }
      });
    }
  }

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
    setStatus("พร้อม — ใช้ Custom Dict (TH+EN)");
  };

  window.Asc.plugin.button = function (id, windowID) {
    if (windowID !== undefined && windowID !== null && String(windowID) !== "") return;
    try { this.executeCommand("close", ""); } catch (e) {}
  };

})(window);
