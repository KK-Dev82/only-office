/* SpellCheck TH+EN plugin v2 (OnlyOffice)
 * - Tokenizer: Custom Trie + Forward Maximum Matching (ภาษาไทย)
 * - Dict B: only-office/dict (words.json จาก th_TH.dic, en_US.dic)
 * - Dict C: API /api/word-management/dictionary (M0106 + global)
 * - Suggester: Levenshtein (เก็บจาก v1)
 * - Fallback: Intl.Segmenter ถ้า trie โหลดไม่ได้
 * - Add words: api/word-management/spellcheck/add-words
 * - Selective replace: ผ่าน doc.Search()[index] + Asc.scope
 */
(function (window) {
  var STORAGE_KEY_IGNORED = "spellcheck-then-v2:ignoredWords";
  var VERSION = "0.1.3";

  var BACKEND_ADD_WORDS_PATH = "api/word-management/spellcheck/add-words";

  var BASE_DICT_THAI_PATH = "onlyoffice-dict/th_TH/words.json";
  var BASE_DICT_ENGLISH_PATH = "onlyoffice-dict/en_US/words.json";

  // limit ชั่วคราว = 10000 (Sprint 2 จะเปลี่ยนเป็น unlimited ฝั่ง backend)
  var DICT_LIMIT = 10000;
  var DICT_THAI_PATH = "api/word-management/dictionary?language=thai&limit=" + DICT_LIMIT + "&includeGlobal=true";
  var DICT_ENGLISH_PATH = "api/word-management/dictionary?language=english&limit=" + DICT_LIMIT + "&includeGlobal=true";

  var FUZZY_MAX_DISTANCE = 2;
  var FUZZY_MAX_SUGGESTIONS = 5;
  var FUZZY_MAX_LENGTH_DIFF = 2;

  var MIN_WORD_LENGTH = 2;
  // ข้ามตัวเลข (ไทย+อาหรับ) รวมเลขที่มี . - : , / เช่น ๐๔.๐๐, 3.14, 12:30
  var SKIP_NUMERIC = /^[\d\u0E50-\u0E59][.\-:,/\d\u0E50-\u0E59]*$/;
  var SKIP_PUNCTUATION = /^[\s\u200B-\u200D\uFEFF]*$/;

  var state = {
    lastIssues: [],                        // unique misspelled words [{word, suggestions}]
    lastOccurrences: [],                   // all occurrences [{word, suggestions, start, end, context, occId, wordOccIndex}]
    lastDocText: "",                       // cached document text
    selectedSuggestionByWord: Object.create(null),
    replacedOccurrences: Object.create(null),
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
    trieThai: null,                        // root node ของ Trie ภาษาไทย
    trieEnglish: null,                     // root node ของ Trie ภาษาอังกฤษ
    sugCache: Object.create(null),
    inited: false,
  };

  function getTrieAPI() {
    return (window.SpellcheckTrieV2) || null;
  }

  function getTokenizerAPI() {
    return (window.SpellcheckTokenizerV2) || null;
  }

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

  /* ========== TEXT RETRIEVAL (ใช้ execMethod — ไม่ใช้ callCommand) ========== */

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

  /**
   * ดึง text ทั้งเอกสารผ่าน execMethod("GetFileHTML") — ไม่ใช้ callCommand
   * ทำให้ไม่ block pipeline ของ plugin
   */
  function getDocumentText(cb) {
    execMethod("GetFileHTML", [], function (html) {
      var t = stripHtmlToText(html);
      try { cb && cb(String(t || "")); } catch (e) {}
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

  /**
   * Tokenize text \u2192 flat list of tokens with { word, start, end, inDict, lang }
   * - \u0E43\u0E0A\u0E49 pretokenize \u0E41\u0E22\u0E01 TH/EN/digit/punct
   * - chunk TH \u2192 forwardMaxMatch(trieThai)
   * - chunk EN \u2192 \u0E17\u0E31\u0E49\u0E07 chunk \u0E40\u0E1B\u0E47\u0E19 1 token (latin \u0E21\u0E35 space \u0E41\u0E22\u0E01\u0E2D\u0E22\u0E39\u0E48\u0E41\u0E25\u0E49\u0E27\u0E43\u0E19 pretokenize)
   * - chunk digit/punct \u2192 skip
   *
   * \u0E04\u0E37\u0E19 array \u0E15\u0E32\u0E21\u0E25\u0E33\u0E14\u0E31\u0E1A\u0E43\u0E19 text (\u0E21\u0E35 start/end \u0E02\u0E2D\u0E07\u0E08\u0E23\u0E34\u0E07\u0E43\u0E19\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23)
   */
  function tokenizeWithTrie(text) {
    var trieAPI = getTrieAPI();
    var tokAPI = getTokenizerAPI();
    var out = [];
    if (!trieAPI || !tokAPI) return out;

    var chunks = tokAPI.pretokenize(text);
    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i];
      if (chunk.type === "thai") {
        if (state.trieThai) {
          var thaiTokens = trieAPI.forwardMaxMatch(chunk.text, state.trieThai, chunk.start);
          for (var j = 0; j < thaiTokens.length; j++) {
            thaiTokens[j].lang = "th";
            out.push(thaiTokens[j]);
          }
        } else {
          out.push({
            word: chunk.text,
            start: chunk.start,
            end: chunk.start + chunk.text.length,
            inDict: false,
            lang: "th"
          });
        }
      } else if (chunk.type === "latin") {
        var inDictEN = false;
        if (state.trieEnglish && trieAPI.trieHas(state.trieEnglish, chunk.text.toLowerCase())) {
          inDictEN = true;
        }
        out.push({
          word: chunk.text,
          start: chunk.start,
          end: chunk.start + chunk.text.length,
          inDict: inDictEN,
          lang: "en"
        });
      }
      // digit / punct \u2192 skip
    }
    return out;
  }

  /**
   * Phase 1 (legacy compat): \u0E04\u0E37\u0E19 unique word list \u0E08\u0E32\u0E01 tokens \u0E17\u0E35\u0E48 inDict=false
   * \u0E40\u0E01\u0E47\u0E1A signature \u0E40\u0E14\u0E34\u0E21\u0E44\u0E27\u0E49\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E2B\u0E49 runSpellcheck \u0E17\u0E33\u0E07\u0E32\u0E19\u0E15\u0E48\u0E2D\u0E44\u0E14\u0E49
   */
  function extractWordsFromText(text) {
    var t = String(text || "").trim();
    if (!t) return [];
    var trieReady = state.trieThai && state.trieEnglish;
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

    // Path A: Trie FMM (preferred)
    if (trieReady) {
      var tokens = tokenizeWithTrie(t);
      var __dbgAll = [];
      var __dbgMiss = [];
      for (var i = 0; i < tokens.length; i++) {
        var tok = tokens[i];
        __dbgAll.push(tok.word);
        if (tok.inDict) continue; // \u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19 dict \u2192 \u0E44\u0E21\u0E48\u0E15\u0E49\u0E2D\u0E07 spellcheck
        __dbgMiss.push(tok.word);
        addWord(tok.word);
      }
      console.log("[SpellCheckTHEN-V2][FMM] totalTokens(" + __dbgAll.length + ")");
      console.log("[SpellCheckTHEN-V2][FMM] miss(" + __dbgMiss.length + "):", __dbgMiss);
      console.log("[SpellCheckTHEN-V2][FMM] uniqueToCheck(" + words.length + "):", words);
      return words;
    }

    // Path B: Intl.Segmenter fallback (\u0E16\u0E49\u0E32 trie \u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21)
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      try {
        var segmenterTh = new Intl.Segmenter("th", { granularity: "word" });
        var iter = segmenterTh.segment(t);
        for (var it of iter) {
          if (it && it.isWordLike && it.segment) addWord(it.segment);
        }
        console.warn("[SpellCheckTHEN-V2] Trie not ready \u2014 used Intl.Segmenter fallback");
        if (words.length > 0) return words;
      } catch (err) {
        console.warn("[SpellCheckTHEN-V2] Intl.Segmenter error, using whitespace fallback", err);
      }
    }

    // Path C: split by whitespace (last resort)
    var fallback = t.split(/[\s\u00A0\u200B-\u200D\uFEFF]+/);
    for (var j = 0; j < fallback.length; j++) addWord(fallback[j]);
    return words;
  }

  /* ========== DICTIONARY LOADING ========== */

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
          console.warn("[SpellCheckTHEN-V2] Base dict fetch failed:", path, "status=" + (r ? r.status : "no response"));
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
        console.log("[SpellCheckTHEN-V2] Base dict loaded:", path, words.length, "words");
        return { words: words, byLength: byLength };
      })
      .catch(function (err) {
        console.warn("[SpellCheckTHEN-V2] Base dict error:", path, err);
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
        console.log("[SpellCheckTHEN-V2] Thai dict:", Object.keys(thaiMerged.validWords).length, "words, EN dict:", Object.keys(englishMerged.validWords).length, "words");
        var __probe = ["ตำแหน่ง", "ที่", "และ", "ของ", "เป็น", "ครับ", "ค่ะ"];
        console.log("[SpellCheckTHEN-V2] probe TH dict:", __probe.map(function (p) {
          return p + "=" + (thaiMerged.validWords[p.toLowerCase()] ? "Y" : "N");
        }).join(", "));

        // Build Trie structures
        var trieAPI = getTrieAPI();
        var trieThai = null, trieEnglish = null;
        if (trieAPI) {
          var t0 = Date.now();
          // กลยุทธ์ trie สำหรับภาษาไทย:
          //   - Hunspell base: minLength=3 — กัน affix garbage 1-2 char (ฟา, ลา, ม, พ, ส...)
          //                    ที่ "ดูดซับ" คำผิดให้ดูถูก เช่น "ฟาม" ตัดเป็น "ฟา"+"ม"
          //   - M0106 (DB): all length — admin ตั้งใจเพิ่มคำ 2-char ที่ legitimate
          //                  (ใน, ไป, มี, ที่, จะ, ได้...) ผ่าน UI หรือ bulk seed
          //   ผลลัพธ์: trie มี Hunspell 3+ char + M0106 ทุก length
          //
          // Build จาก Hunspell ก่อน (filter ≥3 char) แล้ว trieAdd ของ M0106 ทับ (no filter)
          var hunspellThai = (baseResults[0] && baseResults[0].words) || [];
          var m0106Thai = (apiResults[0] && apiResults[0].words) || [];
          trieThai = trieAPI.buildTrie(hunspellThai, { minLength: 3 });
          for (var iTh = 0; iTh < m0106Thai.length; iTh++) {
            trieAPI.trieAdd(trieThai, m0106Thai[iTh]);
          }
          console.log("[SpellCheckTHEN-V2] Trie TH: Hunspell(≥3 char)=" + hunspellThai.length +
                      " filtered, M0106 added=" + m0106Thai.length);

          var t1 = Date.now();

          // English: minLength=1 ตามเดิม — เก็บ "I", "a" เพราะเป็นคำจริง
          var enLower = englishMerged.words.map(function (w) { return String(w || "").toLowerCase(); });
          trieEnglish = trieAPI.buildTrie(enLower, { minLength: 1 });
          var t2 = Date.now();
          console.log("[SpellCheckTHEN-V2] Trie build: TH=" + (t1 - t0) + "ms, EN=" + (t2 - t1) + "ms");
        } else {
          console.warn("[SpellCheckTHEN-V2] Trie API not loaded — will use Intl.Segmenter fallback");
        }

        return {
          validWordsThai: thaiMerged.validWords,
          validWordsEnglish: englishMerged.validWords,
          dictionaryWordsThai: thaiMerged.words,
          dictionaryByLengthThai: thaiMerged.byLength,
          dictionaryWordsEnglish: englishMerged.words,
          dictionaryByLengthEnglish: englishMerged.byLength,
          trieThai: trieThai,
          trieEnglish: trieEnglish,
          words: thaiMerged.words.concat(englishMerged.words),
          byLength: thaiMerged.byLength,
          validWords: Object.assign(Object.create(null), thaiMerged.validWords, englishMerged.validWords),
        };
      });
    });
  }

  /* ========== FUZZY MATCHING ========== */

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

    console.log("[SpellCheckTHEN-V2][Check] dictSize TH=" + Object.keys(validThai).length +
      " EN=" + Object.keys(validEnglish).length + " ignored=" + Object.keys(state.ignoredWords).length);
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w) continue;
      var k = w.toLowerCase();
      if (state.ignoredWords[w]) {
        console.log("[SpellCheckTHEN-V2][Check] SKIP(ignored):", w);
        continue;
      }

      var isThai = isThaiWord(w);
      var validSet = isThai ? validThai : validEnglish;
      if (validSet && validSet[k]) {
        console.log("[SpellCheckTHEN-V2][Check] OK(in dict " + (isThai ? "TH" : "EN") + "):", w);
        continue;
      }

      var dictWords = isThai ? (state.dictionaryWordsThai || []) : (state.dictionaryWordsEnglish || []);
      var byLenDict = isThai ? (state.dictionaryByLengthThai || null) : (state.dictionaryByLengthEnglish || null);
      var sugs = fuzzyMatchDictionary(w, dictWords, Object.create(null), byLenDict);
      console.warn("[SpellCheckTHEN-V2][Check] MISS(" + (isThai ? "TH" : "EN") + "):", w,
        "→ suggestions:", sugs);
      state.sugCache[k] = sugs;
      issues.push({ word: w, suggestions: sugs });
    }
    console.log("[SpellCheckTHEN-V2][Check] summary issues:", issues.map(function (x) {
      return { word: x.word, suggestions: x.suggestions };
    }));

    return issues;
  }

  /* ========== OCCURRENCE FINDING (phase 2: flat text, ใช้ Intl.Segmenter) ========== */

  /**
   * หาทุก occurrence ของคำผิดในข้อความ (flat text)
   * ใช้ Intl.Segmenter เพื่อ match เฉพาะ word boundary
   * เก็บ wordOccIndex = ลำดับที่ N ของคำนี้ในเอกสาร (สำหรับ doc.Search()[N])
   */
  function findOccurrencesInText(text, issues) {
    var issueMap = Object.create(null);
    for (var i = 0; i < issues.length; i++) {
      issueMap[issues[i].word.toLowerCase()] = issues[i];
    }

    var occurrences = [];
    var occId = 0;
    var wordCount = Object.create(null);
    var trieReady = state.trieThai && state.trieEnglish;

    // Path A: FMM tokenize → match with issueMap by word
    if (trieReady) {
      var tokens = tokenizeWithTrie(text);
      for (var ti = 0; ti < tokens.length; ti++) {
        var tok = tokens[ti];
        if (tok.inDict) continue;
        var w = String(tok.word || "").trim();
        if (!w || w.length < MIN_WORD_LENGTH) continue;
        if (SKIP_NUMERIC.test(w) || SKIP_PUNCTUATION.test(w)) continue;
        var k = w.toLowerCase();
        var issue = issueMap[k];
        if (!issue) continue;
        if (state.ignoredWords[w] || state.ignoredWords[issue.word]) continue;

        if (!wordCount[k]) wordCount[k] = 0;
        occurrences.push({
          word: issue.word,
          suggestions: issue.suggestions,
          start: tok.start,
          end: tok.end,
          context: text,
          occId: occId++,
          wordOccIndex: wordCount[k]++
        });
      }
      return occurrences;
    }

    var hasSegmenter = typeof Intl !== "undefined" && Intl.Segmenter;

    // Path B: Intl.Segmenter fallback
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

          if (!wordCount[k]) wordCount[k] = 0;
          occurrences.push({
            word: issue.word,
            suggestions: issue.suggestions,
            start: seg.index,
            end: seg.index + seg.segment.length,
            context: text,
            occId: occId++,
            wordOccIndex: wordCount[k]++
          });
        }
      } catch (err) {
        console.warn("[SpellCheckTHEN-V2] Segmenter error:", err);
      }
    }

    if (!occurrences.length && !hasSegmenter) {
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
          if (!wordCount[k]) wordCount[k] = 0;
          occurrences.push({
            word: issue.word,
            suggestions: issue.suggestions,
            start: idx,
            end: idx + w.length,
            context: text,
            occId: occId++,
            wordOccIndex: wordCount[k]++
          });
        }
        pos = idx + w.length;
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

    // Group by word
    var groups = Object.create(null);
    var groupOrder = [];
    for (var i = 0; i < active.length; i++) {
      var o = active[i];
      if (!groups[o.word]) {
        groups[o.word] = { word: o.word, suggestions: o.suggestions, items: [] };
        groupOrder.push(o.word);
      }
      groups[o.word].items.push(o);
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

      // Header
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

      // Suggestions
      if (sugs.length) {
        html += '<div class="tscSugList">';
        for (var j = 0; j < sugs.length; j++) {
          var s = String(sugs[j] || "").trim();
          if (!s) continue;
          var isSel = chosen === s;
          html += '<button class="tscSug' + (isSel ? ' tscSugSelected' : '') +
            '" data-act="pick" data-sug="' + escapeHtml(s) + '">' +
            escapeHtml(s) + '</button>';
        }
        html += '</div>';
      } else {
        html += '<div class="tscHint" style="margin-top:6px">ไม่พบคำแนะนำ (ลองเพิ่มคำใน Dictionary)</div>';
      }

      // Per-occurrence list
      html += '<div class="tscOccurrences">';
      for (var k = 0; k < items.length; k++) {
        var occ = items[k];
        var ctx = getContextSnippet(occ.context, occ.start, occ.end);
        html += '<div class="tscOccurrence" data-occ-id="' + occ.occId + '">';
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

  /* ========== REPLACEMENT (doc.Search → Select → InputText) ========== */

  /**
   * ใช้ callCommand + doc.Search(word) เพื่อ:
   * - นับจำนวน occurrence ทั้งหมด
   * - Select occurrence ที่ index ที่ระบุ
   * - Log methods ที่มีบน range object (เพื่อ debug)
   */
  function searchAndSelect(word, occIndex, cb) {
    if (!canCallCommand()) { if (cb) cb({ ok: false, reason: "no_callCommand" }); return; }
    window.Asc.scope = window.Asc.scope || {};
    window.Asc.scope.__tsc_word = word;
    window.Asc.scope.__tsc_idx = occIndex;
    try {
      window.Asc.plugin.callCommand(
        function () {
          try {
            var doc = Api.GetDocument();
            if (!doc || typeof doc.Search !== "function") {
              return { ok: false, reason: "no_search_api" };
            }
            var ranges = doc.Search(Asc.scope.__tsc_word, true);
            if (!ranges || !ranges.length) {
              return { ok: false, reason: "not_found", count: 0 };
            }
            var idx = Asc.scope.__tsc_idx;
            var count = ranges.length;
            if (idx < 0 || idx >= count) {
              return { ok: false, reason: "index_out", count: count, idx: idx };
            }
            var r = ranges[idx];
            // Log methods ที่มีบน range object
            var methods = [];
            for (var key in r) {
              if (typeof r[key] === "function") methods.push(key);
            }
            // ลอง Select
            if (typeof r.Select === "function") {
              r.Select();
              return { ok: true, count: count, idx: idx, methods: methods, selected: true };
            }
            return { ok: false, reason: "no_select", count: count, methods: methods };
          } catch (e) { return { ok: false, error: String(e) }; }
        },
        false, true,
        function (result) {
          console.log("[SpellCheckTHEN-V2] searchAndSelect result:", JSON.stringify(result));
          if (cb) cb(result || { ok: false });
        }
      );
    } catch (e) {
      if (cb) cb({ ok: false, error: String(e) });
    }
  }

  /**
   * Replace occurrence ที่ index ที่ระบุ:
   * 1. doc.Search(word) → select occurrence #N
   * 2. InputText → พิมพ์ทับ selection
   */
  function replaceAtIndex(word, occIndex, newText, cb) {
    console.log("[SpellCheckTHEN-V2] replaceAtIndex:", word, "idx=" + occIndex, "→", newText);
    // Step 1: Select the specific occurrence
    searchAndSelect(word, occIndex, function (selResult) {
      if (!selResult || !selResult.ok) {
        console.warn("[SpellCheckTHEN-V2] searchAndSelect failed:", selResult);
        if (cb) cb(selResult || { ok: false });
        return;
      }
      // Step 2: InputText — พิมพ์ทับ selection
      execMethod("InputText", [newText, ""], function (inputResult) {
        console.log("[SpellCheckTHEN-V2] InputText result:", inputResult);
        if (cb) cb({ ok: true, count: selResult.count });
      });
    });
  }

  /**
   * นำทางไปที่ occurrence #N — ใช้ doc.Search → Select
   */
  function selectOccurrence(word, occIndex) {
    searchAndSelect(word, occIndex, function (result) {
      if (!result || !result.ok) {
        setStatus('ไม่พบ "' + word + '" ในเอกสาร');
      }
    });
  }

  /**
   * แทนที่คำทุกตำแหน่ง — ใช้ SearchAndReplace
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
          var occs = state.lastOccurrences || [];
          for (var i = 0; i < occs.length; i++) {
            if (occs[i].word === w) state.replacedOccurrences[occs[i].occId] = true;
          }
          state.lastIssues = (state.lastIssues || []).filter(function (it) { return it.word !== w; });
          renderGroupedOccurrences();
          if (cb) cb();
        }
      );
    } catch (e) { if (cb) cb(); }
  }

  /**
   * Rescan: ดึง text เอกสารใหม่ (ผ่าน GetFileHTML) แล้ว rebuild occurrences + render
   */
  function rescanAndRender() {
    setStatus("กำลังสแกนเอกสารใหม่...");
    state.replacedOccurrences = Object.create(null);
    getDocumentText(function (text) {
      state.lastDocText = text;
      state.lastOccurrences = findOccurrencesInText(text, state.lastIssues);
      renderGroupedOccurrences();
      var active = 0;
      for (var i = 0; i < state.lastOccurrences.length; i++) {
        if (!state.ignoredWords[state.lastOccurrences[i].word]) active++;
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
    apiPostJson("/add-words", { words: [w], language: "auto" })
      .then(function (result) {
        // ใหม่: response = { addedCount, skippedCount, failedCount, added[], skipped[], failed[] }
        var added = (result && result.addedCount) || 0;
        var skipped = (result && result.skippedCount) || 0;
        var failed = (result && result.failedCount) || 0;

        if (added > 0) {
          setStatus('เพิ่มคำ "' + w + '" แล้ว');
        } else if (skipped > 0) {
          setStatus('คำ "' + w + '" มีอยู่ใน Dictionary แล้ว');
        } else if (failed > 0) {
          var firstErr = (result.failed && result.failed[0] && result.failed[0].error) || "unknown";
          setStatus('เพิ่มคำ "' + w + '" ไม่สำเร็จ: ' + firstErr);
          return;
        } else {
          setStatus('เพิ่มคำ "' + w + '" — ไม่มีผลลัพธ์');
        }

        // อัพเดต state local — ทั้ง added และ skipped ถือว่ามีในระบบแล้ว
        var k = w.toLowerCase();
        state.validWords = state.validWords || Object.create(null);
        state.validWords[k] = true;
        var trieAPI = getTrieAPI();
        if (isThaiWord(w)) {
          state.validWordsThai = state.validWordsThai || Object.create(null);
          state.validWordsThai[k] = true;
          if (trieAPI && state.trieThai) trieAPI.trieAdd(state.trieThai, w);
        } else {
          state.validWordsEnglish = state.validWordsEnglish || Object.create(null);
          state.validWordsEnglish[k] = true;
          if (trieAPI && state.trieEnglish) trieAPI.trieAdd(state.trieEnglish, k);
        }
        if (typeof onSuccess === "function") onSuccess(w);
      })
      .catch(function (e) {
        setStatus("เพิ่มคำไม่สำเร็จ: " + String(e && e.message ? e.message : e));
      });
  }

  /* ========== EVENT WIRING ========== */

  /**
   * Core spellcheck pipeline — รับ textGetter (function ที่คืน text ผ่าน callback)
   * และ label เพื่อแสดง status
   */
  function runCheckPipeline(textGetter, scopeLabel) {
    state.lastIssues = [];
    state.lastOccurrences = [];
    state.lastDocText = "";
    state.replacedOccurrences = Object.create(null);
    state.selectedSuggestionByWord = Object.create(null);
    state.sugCache = Object.create(null);
    renderGroupedOccurrences();

    var t0 = Date.now();
    setStatus("กำลังอ่าน" + scopeLabel + "...");
    textGetter(function (docText) {
      state.lastDocText = docText;
      var ct = String(docText || "").trim();
      if (!ct) {
        setStatus(scopeLabel + "ว่างเปล่า — กรุณาเลือกข้อความก่อน");
        return;
      }

      setStatus("กำลังโหลด Dictionary...");
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
          state.trieThai = dictResult.trieThai || null;
          state.trieEnglish = dictResult.trieEnglish || null;

          setStatus("กำลังตรวจคำ (" + scopeLabel + ")...");
          state.lastIssues = runSpellcheck(ct);

          if (!state.lastIssues.length) {
            renderGroupedOccurrences();
            setStatus("เสร็จแล้ว — ไม่พบคำผิดใน" + scopeLabel + " (" + (Date.now() - t0) + " ms)");
            return;
          }

          state.lastOccurrences = findOccurrencesInText(docText, state.lastIssues);
          renderGroupedOccurrences();

          var nWords = state.lastIssues.length;
          var nOccs = state.lastOccurrences.length;
          setStatus("เสร็จ (" + scopeLabel + ") — " + nWords + " คำ, " + nOccs + " ตำแหน่ง (" + (Date.now() - t0) + " ms)");
        })
        .catch(function (e) {
          renderGroupedOccurrences();
          setStatus("โหลด Dictionary ไม่สำเร็จ: " + String(e && e.message ? e.message : e));
        });
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

    /* ── ปุ่ม "ตรวจทั้งเอกสาร" ── */
    if (btnCheck) {
      btnCheck.addEventListener("click", function () {
        runCheckPipeline(getDocumentText, "เอกสาร");
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

        // ─── jump-occ: navigate ไปที่ occurrence ที่ระบุ ───
        if (act === "jump-occ" && word) {
          var occEl = target.closest ? target.closest(".tscOccurrence") : null;
          var occId = occEl ? parseInt(occEl.getAttribute("data-occ-id"), 10) : -1;
          var wordOccIdx = 0;
          var occs = state.lastOccurrences || [];
          for (var oi = 0; oi < occs.length; oi++) {
            if (occs[oi].occId === occId) { wordOccIdx = occs[oi].wordOccIndex; break; }
          }
          selectOccurrence(word, wordOccIdx);
          setStatus('ไปที่ "' + word + '" #' + (wordOccIdx + 1));
          return;
        }

        // ─── replace-one: แทนที่ occurrence ที่ระบุ ───
        if (act === "replace-one" && word) {
          var chosen = String(state.selectedSuggestionByWord[word] || "");
          if (!chosen) { setStatus("กรุณาเลือกคำแนะนำก่อน"); return; }
          var occEl = target.closest ? target.closest(".tscOccurrence") : null;
          var occId = occEl ? parseInt(occEl.getAttribute("data-occ-id"), 10) : -1;
          // หา wordOccIndex จาก occId
          var wordOccIdx = 0;
          var occs = state.lastOccurrences || [];
          for (var oi = 0; oi < occs.length; oi++) {
            if (occs[oi].occId === occId) { wordOccIdx = occs[oi].wordOccIndex; break; }
          }

          setStatus('กำลังแทนที่ "' + word + '" #' + (wordOccIdx + 1) + '...');
          replaceAtIndex(word, wordOccIdx, chosen, function (result) {
            if (result && result.ok) {
              setStatus('แทนที่ "' + word + '" #' + (wordOccIdx + 1) + ' → "' + chosen + '" สำเร็จ');
              setTimeout(function () { rescanAndRender(); }, 200);
            } else {
              var reason = (result && result.reason) || (result && result.error) || "unknown";
              setStatus('แทนที่ไม่สำเร็จ: ' + reason);
              console.warn("[SpellCheckTHEN-V2] replace failed:", result);
            }
          });
          return;
        }

        if (!word) return;
        var chosen = String(state.selectedSuggestionByWord[word] || "");

        // ─── ignore ───
        if (act === "ignore") {
          addToIgnoredWords(word);
          setStatus('ข้ามคำ "' + word + '" แล้ว');
          state.lastIssues = (state.lastIssues || []).filter(function (it) { return it.word !== word; });
          renderGroupedOccurrences();
          return;
        }

        // ─── add word ───
        if (act === "add") {
          addWord(word, function () {
            state.lastIssues = (state.lastIssues || []).filter(function (it) { return it.word !== word; });
            renderGroupedOccurrences();
          });
          return;
        }

        // ─── replace all ───
        if (act === "all") {
          if (!chosen) { setStatus("กรุณาเลือกคำแนะนำก่อน"); return; }
          replaceAllWord(word, chosen, function () {
            setTimeout(function () { rescanAndRender(); }, 150);
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
