/* Thai SpellChecker plugin (OnlyOffice)
 * - Calls external API (PythaiNLP-WordSuggestion):
 *   - POST {baseUrl}/spellcheck  body: { text }
 *   - POST {baseUrl}/add-words  body: { words: [word] }
 * - Replace helpers:
 *   - executeMethod("SearchNext") แล้ว callCommand: doc.SearchAndReplace() -> แทนที่ครั้งเดียว (pick / Replace next)
 *   - callCommand: loop doc.SearchAndReplace() หรือ executeMethod("SearchAndReplace") -> แทนที่ทั้งหมด
 *   ใช้ ApiDocument.SearchAndReplace ตาม https://api.onlyoffice.com/docs/office-api/usage-api/text-document-api/ApiDocument/Methods/SearchAndReplace/
 */
(function (window) {
  var STORAGE_KEY_API = "tsc:v1:apiBaseUrl";
  var STORAGE_KEY_IGNORED = "tsc:v1:ignoredWords";
  var VERSION = "0.1.0";

  var state = {
    apiBaseUrl: "",
    lastIssues: [],
    selectedSuggestionByWord: Object.create(null),
    replacedWords: Object.create(null),
    ignoredWords: Object.create(null),
    dictionaryWords: [],
    dictionaryByLength: null, // { length: [words] } สำหรับ Fuzzy Match ให้เร็วขึ้น
    inited: false,
  };

  // Dictionary API: อ้างอิง dictionary-abbreviation (remote_sync) — เฉพาะ Dictionary ไม่รวมคำย่อ
  var DICTIONARY_API_PATH = "api/word-management/dictionary?language=thai&limit=2000&includeGlobal=true";
  var FUZZY_MAX_DISTANCE = 2;
  var FUZZY_MAX_SUGGESTIONS = 5;
  var FUZZY_MAX_LENGTH_DIFF = 2;

  function $(id) {
    try {
      return document.getElementById(id);
    } catch (e) {
      return null;
    }
  }

  function setStatus(text) {
    var el = $("tscStatus");
    if (!el) return;
    el.textContent = String(text || "");
  }

  function normalizeBaseUrl(url) {
    var s = String(url || "").trim();
    if (!s) return "";
    return s.replace(/\/+$/, "");
  }

  function getDefaultApiUrl() {
    // Auto-detect environment:
    // - localhost/127.0.0.1 → development → http://localhost:8000
    // - production/staging domain → use window.location.origin (nginx proxy)
    try {
      var host = window.location.hostname || "";
      var protocol = window.location.protocol || "http:";
      if (host === "localhost" || host === "127.0.0.1" || host === "") {
        return "http://localhost:8000";
      }
      // Production/staging: ใช้ origin เดียวกับหน้าเว็บ (nginx จะ proxy ไปที่ 10.200.22.60:8000)
      return protocol + "//" + host + (window.location.port ? ":" + window.location.port : "");
    } catch (e) {
      return "http://localhost:8000";
    }
  }

  function loadSettings() {
    try {
      var raw = "";
      try {
        raw = localStorage.getItem(STORAGE_KEY_API) || "";
      } catch (e0) {}
      var saved = normalizeBaseUrl(raw);
      // ถ้ายังไม่เคยตั้งค่า → ใช้ default ตาม environment
      if (!saved) {
        saved = getDefaultApiUrl();
        // บันทึก default เพื่อให้ user เห็นค่าเริ่มต้น
        try {
          localStorage.setItem(STORAGE_KEY_API, saved);
        } catch (e1) {}
      }
      state.apiBaseUrl = saved;
    } catch (e) {
      state.apiBaseUrl = getDefaultApiUrl();
    }
    loadIgnoredWords();
  }

  function loadIgnoredWords() {
    try {
      var storage = typeof sessionStorage !== "undefined" ? sessionStorage : (typeof localStorage !== "undefined" ? localStorage : null);
      var raw = storage ? storage.getItem(STORAGE_KEY_IGNORED) || "[]" : "[]";
      var arr = [];
      try {
        arr = JSON.parse(raw);
      } catch (e0) {}
      state.ignoredWords = Object.create(null);
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) {
          var w = String(arr[i] || "").trim();
          if (w) state.ignoredWords[w] = true;
        }
      }
    } catch (e) {
      state.ignoredWords = Object.create(null);
    }
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
    if (!w) return;
    state.ignoredWords[w] = true;
    saveIgnoredWords();
  }

  function saveSettings(url) {
    try {
      var u = normalizeBaseUrl(url);
      state.apiBaseUrl = u;
      try {
        localStorage.setItem(STORAGE_KEY_API, u);
      } catch (e0) {}
      return u;
    } catch (e) {
      return "";
    }
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
        console.log('[ThaiSpellcheck] 📤 executeMethod', { name: name, params: params, hasCallback: typeof cb === 'function' });
        window.Asc.plugin.executeMethod(name, params || [], function (result) {
          console.log('[ThaiSpellcheck] 📥 executeMethod result', { name: name, result: result, resultType: typeof result });
          try {
            if (cb) cb(result);
          } catch (eCb) {
            console.error('[ThaiSpellcheck] ❌ executeMethod callback error', { name: name, error: eCb });
          }
        });
        return true;
      } else {
        console.warn('[ThaiSpellcheck] ⚠️ executeMethod not available', {
          hasAsc: !!window.Asc,
          hasPlugin: !!(window.Asc && window.Asc.plugin),
          hasExecuteMethod: !!(window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function"),
        });
      }
    } catch (e) {
      console.error('[ThaiSpellcheck] ❌ executeMethod error', { name: name, error: e });
    }
    try {
      cb && cb(undefined);
    } catch (e2) {
      console.error('[ThaiSpellcheck] ❌ executeMethod fallback callback error', { name: name, error: e2 });
    }
    return false;
  }

  function canCallCommand() {
    try {
      return Boolean(window.Asc && window.Asc.plugin && typeof window.Asc.plugin.callCommand === "function");
    } catch (e) {
      return false;
    }
  }

  function getCurrentParagraphText(cb) {
    if (!canCallCommand()) {
      execMethod("GetCurrentParagraph", [], function (p) {
        var t = "";
        try {
          if (typeof p === "string") t = p || "";
          else if (p && typeof p.text === "string") t = p.text || "";
        } catch (e0) {}
        try {
          cb && cb(String(t || ""));
        } catch (e1) {}
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
            return String(
              r.GetText({
                Numbering: false,
                Math: false,
                ParaSeparator: "\n",
                TableRowSeparator: "\n",
                NewLineSeparator: "\n",
              }) || ""
            );
          } catch (e) {
            return "";
          }
        },
        false,
        true,
        function (text) {
          try {
            cb && cb(String(text || ""));
          } catch (e2) {}
        }
      );
    } catch (e3) {
      try {
        cb && cb("");
      } catch (e4) {}
    }
  }

  function getTextByMode(mode, cb) {
    var m = String(mode || "selection");
    if (m === "selection") {
      execMethod("GetSelectedText", [], function (t) {
        cb && cb(String(t || ""));
      });
      return;
    }
    if (m === "sentence") {
      execMethod("GetCurrentSentence", [], function (t) {
        cb && cb(String(t || ""));
      });
      return;
    }
    // paragraph (default)
    getCurrentParagraphText(function (t) {
      cb && cb(String(t || ""));
    });
  }

  function getDictionaryUrl() {
    try {
      var origin = window.location.origin || "";
      var path = DICTIONARY_API_PATH.replace(/^\/+/, "");
      return origin ? origin + "/" + path : "";
    } catch (e) {
      return "";
    }
  }

  function fetchDictionaryWords() {
    var url = getDictionaryUrl();
    if (!url) return Promise.resolve([]);
    return fetch(url, { method: "GET", headers: { "Content-Type": "application/json" } })
      .then(function (r) {
        if (!r || !r.ok) return [];
        return r.json();
      })
      .then(function (payload) {
        var list = (payload && payload.data) || (payload && payload.Data) || payload;
        if (!Array.isArray(list)) return [];
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
      .catch(function () {
        return { words: [], byLength: {} };
      });
  }

  function levenshtein(a, b) {
    a = String(a || "");
    b = String(b || "");
    var an = a.length;
    var bn = b.length;
    if (an === 0) return bn;
    if (bn === 0) return an;
    var row0 = [];
    var row1 = [];
    var i, j;
    for (j = 0; j <= an; j++) row0[j] = j;
    for (i = 1; i <= bn; i++) {
      row1[0] = i;
      for (j = 1; j <= an; j++) {
        var cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
        row1[j] = Math.min(
          row1[j - 1] + 1,
          row0[j] + 1,
          row0[j - 1] + cost
        );
      }
      var tmp = row0;
      row0 = row1;
      row1 = tmp;
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
        if (Array.isArray(bucket)) {
          for (var b = 0; b < bucket.length; b++) listToCheck.push(bucket[b]);
        }
      }
    } else if (Array.isArray(dictWords) && dictWords.length) {
      for (var i = 0; i < dictWords.length; i++) {
        var d = String(dictWords[i] || "").trim();
        if (!d) continue;
        if (Math.abs(d.length - wLen) <= FUZZY_MAX_LENGTH_DIFF) listToCheck.push(d);
      }
    }
    for (var i = 0; i < listToCheck.length; i++) {
      var d = String(listToCheck[i] || "").trim();
      if (!d || d === w) continue;
      if (existing[d]) continue;
      var dist = levenshtein(w, d);
      if (dist > FUZZY_MAX_DISTANCE) continue;
      candidates.push({ word: d, distance: dist });
    }
    candidates.sort(function (x, y) {
      return x.distance - y.distance || x.word.length - y.word.length;
    });
    var out = [];
    for (var j = 0; j < candidates.length && out.length < FUZZY_MAX_SUGGESTIONS; j++) {
      out.push(candidates[j].word);
    }
    return out;
  }

  function apiPostJson(path, body) {
    var base = normalizeBaseUrl(state.apiBaseUrl);
    if (!base) return Promise.reject(new Error("missing_api_base_url"));
    
    // ถ้า baseUrl เป็น origin เดียวกับหน้าเว็บ → ใช้ nginx proxy path
    // (production/staging: /api/words-suggestion/spellcheck)
    // ถ้าเป็น localhost:8000 → เรียกตรง (development)
    var useProxy = false;
    try {
      var currentOrigin = window.location.origin || "";
      var baseOrigin = "";
      try {
        var baseUrlObj = new URL(base);
        baseOrigin = baseUrlObj.origin || "";
      } catch (e0) {}
      // ถ้า baseUrl เป็น origin เดียวกับหน้าเว็บ → ใช้ proxy
      if (baseOrigin && baseOrigin === currentOrigin) {
        useProxy = true;
      }
    } catch (e) {}
    
    var url;
    if (useProxy) {
      // Production/staging: ใช้ nginx proxy path
      url = "/api/words-suggestion" + path;
    } else {
      // Development: เรียกตรงไปที่ localhost:8000
      url = base + path;
    }
    
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        throw new Error("http_" + r.status + ":" + String(t || ""));
      });
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
      
      // Skip words that have been replaced
      if (state.replacedWords[word]) continue;
      // Skip words that user chose to ignore (localStorage)
      if (state.ignoredWords[word]) continue;

      var sugs = Array.isArray(it.suggestions) ? it.suggestions : [];
      var chosen = state.selectedSuggestionByWord[word];
      if (!chosen && sugs.length) chosen = String(sugs[0] || "");
      if (chosen) state.selectedSuggestionByWord[word] = chosen;

      html += '<div class="tscIssue" data-word="' + escapeHtml(word) + '">';
      html += '  <div class="tscIssueTop">';
      html += '    <div class="tscWord" data-act="jump" title="คลิกเพื่อไปที่คำนี้ในเอกสาร">' + escapeHtml(word) + "</div>";
      html += '    <div class="tscActions">';
      html += '      <button class="tscSmallBtn" data-act="ignore" title="ข้ามคำนี้ (จำใน session จนปิด browser)">Ignore</button>';
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
          html +=
            '<button class="tscSug" data-act="pick" data-sug="' +
            escapeHtml(s) +
            '" style="' +
            (isSel ? "border-color:rgba(25,118,210,0.65);background:rgba(25,118,210,0.18);" : "") +
            '">' +
            escapeHtml(s) +
            "</button>";
        }
        html += "  </div>";
      } else {
        html += '  <div class="tscHint">ไม่พบคำแนะนำ (ลองเพิ่มคำศัพท์ระบบ หรือเพิ่มในฐานข้อมูลคำศัพท์)</div>';
      }

      html += "</div>";
    }

    root.innerHTML = html;
  }

  function ensureApiConfigured() {
    var base = normalizeBaseUrl(state.apiBaseUrl);
    if (base) return true;
    setStatus("กรุณาตั้งค่า Spellcheck API URL ก่อน");
    return false;
  }

  function replaceNext(word, suggestion) {
    var w = String(word || "").trim();
    var s = String(suggestion || "").trim();
    
    console.log('[ThaiSpellcheck] 🔍 replaceNext called', { word: w, suggestion: s });
    
    if (!w || !s) {
      console.warn('[ThaiSpellcheck] ⚠️ replaceNext: missing word or suggestion', { word: w, suggestion: s });
      return;
    }
    if (!ensureApiConfigured()) {
      console.warn('[ThaiSpellcheck] ⚠️ replaceNext: API not configured');
      return; // keep UX consistent (API config is part of this plugin)
    }

    setStatus('กำลังหา "' + w + '" แล้วแทนที่...');
    console.log('[ThaiSpellcheck] 📤 Calling SearchNext', { searchString: w, matchCase: true });
    
    execMethod(
      "SearchNext",
      [
        {
          searchString: w,
          matchCase: true,
        },
        true,
      ],
      function (found) {
        console.log('[ThaiSpellcheck] 📥 SearchNext result', { found: found, foundType: typeof found, foundValue: found });
        
        // Some builds return unreliable values; still attempt replace if we can.
        if (found === false) {
          console.warn('[ThaiSpellcheck] ⚠️ SearchNext: word not found', { word: w });
          setStatus('ไม่พบ "' + w + '" ถัดไปจากตำแหน่งเคอร์เซอร์');
          return;
        }
        
        console.log('[ThaiSpellcheck] 📤 Calling ReplaceCurrentWord', { replacement: s, mode: 'entirely' });
        
        // ใช้ callCommand + doc.SearchAndReplace (ไม่พึ่ง GetSelection / ReplaceCurrentWord)
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
                  if (!searchStr || !newText) return { ok: false, error: "Missing search or replacement" };
                  
                  // ใช้ ApiDocument.SearchAndReplace (ไม่ใช้ Api.GetSelection ซึ่งไม่มีใน plugin context)
                  if (doc.SearchAndReplace) {
                    var ok = doc.SearchAndReplace({
                      searchString: searchStr,
                      replaceString: newText,
                      matchCase: true,
                    });
                    return { ok: ok === true, replaced: ok === true };
                  }
                  return { ok: false, error: "SearchAndReplace not available" };
                } catch (e) {
                  console.error('[ThaiSpellcheck] ❌ ReplaceCurrentWord callCommand error', { error: e });
                  return { ok: false, error: String(e) };
                }
              },
              false,
              true,
              function (result) {
                console.log('[ThaiSpellcheck] 📥 ReplaceCurrentWord callCommand result', {
                  result: result,
                  ok: result && result.ok,
                  replaced: result && result.replaced,
                });
                if (result && result.ok) {
                  setStatus('แทนที่ "' + w + '" -> "' + s + '" (ครั้งถัดไป) แล้ว');
                } else {
                  setStatus('แทนที่ "' + w + '" -> "' + s + '" ไม่สำเร็จ');
                }
              }
            );
            return;
          } catch (eCall) {
            console.error('[ThaiSpellcheck] ❌ ReplaceCurrentWord callCommand failed', { error: eCall });
          }
        }
        
        execMethod("ReplaceCurrentWord", [s, "entirely"], function (result) {
          console.log('[ThaiSpellcheck] 📥 ReplaceCurrentWord executeMethod result', { result: result, resultType: typeof result });
          setStatus('แทนที่ "' + w + '" -> "' + s + '" (ครั้งถัดไป) แล้ว');
        });
      }
    );
  }

  function replaceAll(word, suggestion) {
    var w = String(word || "").trim();
    var s = String(suggestion || "").trim();
    
    console.log('[ThaiSpellcheck] 🔍 replaceAll called', { word: w, suggestion: s });
    
    if (!w || !s) {
      console.warn('[ThaiSpellcheck] ⚠️ replaceAll: missing word or suggestion', { word: w, suggestion: s });
      return;
    }
    
    setStatus('กำลังแทนที่ทั้งหมด: "' + w + '" -> "' + s + '" ...');
    
    // Try using callCommand as fallback if executeMethod doesn't work
    if (canCallCommand()) {
      try {
        console.log('[ThaiSpellcheck] 📤 Calling SearchAndReplace via callCommand', {
          searchString: w,
          replaceString: s,
          matchCase: true,
        });
        
        window.Asc.scope = window.Asc.scope || {};
        window.Asc.scope.__tsc_replace_old = w;
        window.Asc.scope.__tsc_replace_new = s;
        
        window.Asc.plugin.callCommand(
          function () {
            try {
              var doc = Api.GetDocument();
              if (!doc) return { ok: false, error: "No document" };
              
              var oldText = String(Asc.scope.__tsc_replace_old || "");
              var newText = String(Asc.scope.__tsc_replace_new || "");
              
              if (!oldText) return { ok: false, error: "oldWord is required" };
              
              // ใช้ ApiDocument.SearchAndReplace (หนึ่งครั้งแทนที่หนึ่งแห่ง; loop สำหรับ replace all)
              if (doc && typeof doc.SearchAndReplace === "function") {
                var count = 0;
                var opts = { searchString: oldText, replaceString: newText, matchCase: true };
                while (doc.SearchAndReplace(opts) === true) {
                  count++;
                }
                return { ok: count > 0, replaced: count > 0, count: count };
              }
              
              // Fallback: Manual search and replace using paragraphs
              var body = doc.GetBody ? doc.GetBody() : null;
              if (!body) return { ok: false, error: "Cannot get document body" };
              
              var replaced = false;
              var paraCount = body.GetElementsCount ? body.GetElementsCount() : 0;
              
              for (var i = 0; i < paraCount; i++) {
                try {
                  var para = body.GetElement ? body.GetElement(i) : null;
                  if (!para || !para.GetRange) continue;
                  
                  var range = para.GetRange();
                  if (!range || !range.GetText) continue;
                  
                  var paraText = range.GetText({
                    Numbering: false,
                    Math: false,
                    ParaSeparator: "\n",
                    TableRowSeparator: "\n",
                    NewLineSeparator: "\n",
                  }) || "";
                  
                  if (paraText.includes(oldText)) {
                    var newParaText = paraText.split(oldText).join(newText);
                    
                    if (newParaText !== paraText) {
                      para.RemoveAllElements();
                      para.AddText(newParaText);
                      replaced = true;
                    }
                  }
                } catch (ePara) {
                  // Continue with next paragraph
                }
              }
              
              return { ok: replaced, replaced: replaced };
            } catch (e) {
              return { ok: false, error: String(e) };
            }
          },
          false,
          true,
          function (result) {
            console.log('[ThaiSpellcheck] 📥 SearchAndReplace callCommand result', {
              result: result,
              resultType: typeof result,
              ok: result && result.ok,
            });
            setStatus('แทนที่ทั้งหมด: "' + w + '" -> "' + s + '" แล้ว');
          }
        );
        return;
      } catch (eCall) {
        console.error('[ThaiSpellcheck] ❌ replaceAll callCommand failed', { error: eCall });
      }
    }
    
    // Fallback: Use executeMethod
    console.log('[ThaiSpellcheck] 📤 Calling SearchAndReplace via executeMethod', {
      searchString: w,
      replaceString: s,
      matchCase: true,
    });
    
    // SearchAndReplace might not support callback in some builds
    // Try with callback first, but don't rely on it
    var called = execMethod("SearchAndReplace", [
      {
        searchString: w,
        replaceString: s,
        matchCase: true,
      },
    ], function (result) {
      console.log('[ThaiSpellcheck] 📥 SearchAndReplace executeMethod result', { result: result, resultType: typeof result });
      setStatus('แทนที่ทั้งหมด: "' + w + '" -> "' + s + '" แล้ว');
    });
    
    // If executeMethod is not available or doesn't support callback, set status immediately
    if (!called) {
      console.warn('[ThaiSpellcheck] ⚠️ SearchAndReplace: executeMethod not available');
      setStatus('ไม่สามารถแทนที่ได้ (API ไม่พร้อม)');
    } else {
      // Even if called, some builds might not call the callback
      // Set a timeout to update status if callback doesn't fire
      setTimeout(function () {
        console.log('[ThaiSpellcheck] ⏱️ SearchAndReplace timeout check (callback may not have fired)');
        // Don't change status here - let user verify in document
      }, 1000);
    }
  }

  function addWord(word, onSuccess) {
    var w = String(word || "").trim();
    if (!w) return;
    if (!ensureApiConfigured()) return;

    setStatus('กำลังเพิ่มคำ "' + w + '" ...');
    apiPostJson("/add-words", { words: [w] })
      .then(function () {
        setStatus('เพิ่มคำ "' + w + '" แล้ว');
        if (typeof onSuccess === "function") onSuccess(w);
      })
      .catch(function (e) {
        setStatus("เพิ่มคำไม่สำเร็จ: " + String(e && e.message ? e.message : e));
      });
  }

  // Helper: Replace current selected word with suggestion
  function doReplaceCurrentWord(word, suggestion) {
    var w = String(word || "").trim();
    var s = String(suggestion || "").trim();
    
    console.log('[ThaiSpellcheck] 🔍 doReplaceCurrentWord called', {
      word: w,
      suggestion: s,
      hasWord: !!w,
      hasSuggestion: !!s,
    });
    
    if (!w || !s) {
      console.warn('[ThaiSpellcheck] ⚠️ doReplaceCurrentWord: missing word or suggestion', {
        word: w,
        suggestion: s,
      });
      return;
    }
    
    setStatus('กำลังแทนที่ "' + w + '" → "' + s + '"...');
    
    // Use callCommand as primary method (more reliable for text replacement)
    if (canCallCommand()) {
      try {
        console.log('[ThaiSpellcheck] 📤 Calling ReplaceCurrentWord via callCommand (primary)', {
          word: w,
          suggestion: s,
        });
        
        window.Asc.scope = window.Asc.scope || {};
        window.Asc.scope.__tsc_replace_old = w;
        window.Asc.scope.__tsc_replace_new = s;
        
        // First, get current selection text to verify
        execMethod("GetSelectedText", [], function (selectedTextBefore) {
          var textBefore = String(selectedTextBefore || "").trim();
          console.log('[ThaiSpellcheck] 📝 Selected text before replace', {
            textBefore: textBefore,
            expectedWord: w,
            matches: textBefore === w || textBefore.includes(w),
          });
          
          window.Asc.plugin.callCommand(
            function () {
              try {
                var doc = Api.GetDocument();
                if (!doc) {
                  console.warn('[ThaiSpellcheck] ⚠️ ReplaceCurrentWord: No document available');
                  return { ok: false, error: "No document" };
                }
                
                var oldText = String(Asc.scope.__tsc_replace_old || "");
                var newText = String(Asc.scope.__tsc_replace_new || "");
                
                if (!oldText || !newText) {
                  console.warn('[ThaiSpellcheck] ⚠️ ReplaceCurrentWord: Missing word or replacement');
                  return { ok: false, error: "Missing search or replacement" };
                }
                
                // ใช้ ApiDocument.SearchAndReplace (https://api.onlyoffice.com/.../SearchAndReplace/)
                // ไม่ใช้ Api.GetSelection เพราะไม่มีใน plugin context
                if (typeof doc.SearchAndReplace !== "function") {
                  return { ok: false, error: "SearchAndReplace not available" };
                }
                
                var ok = doc.SearchAndReplace({
                  searchString: oldText,
                  replaceString: newText,
                  matchCase: true,
                });
                
                console.log('[ThaiSpellcheck] 🔄 ReplaceCurrentWord: doc.SearchAndReplace result', {
                  ok: ok,
                  searchString: oldText,
                  replaceString: newText,
                });
                return { ok: ok === true, replaced: ok === true, method: "SearchAndReplace" };
              } catch (e) {
                console.error('[ThaiSpellcheck] ❌ ReplaceCurrentWord callCommand error', {
                  error: e,
                  errorMessage: e ? String(e.message || e) : '',
                });
                return { ok: false, error: String(e) };
              }
            },
            false,
            true,
            function (result) {
              console.log('[ThaiSpellcheck] 📥 ReplaceCurrentWord callCommand result', {
                result: result,
                ok: result && result.ok,
                replaced: result && result.replaced,
                error: result && result.error,
                method: result && result.method,
              });
              
              // Verify replacement by reading selected text back
              setTimeout(function () {
                execMethod("GetSelectedText", [], function (selectedTextAfter) {
                  var textAfter = String(selectedTextAfter || "").trim();
                  console.log('[ThaiSpellcheck] 📝 Selected text after replace', {
                    textAfter: textAfter,
                    expectedNew: s,
                    matches: textAfter === s || textAfter.includes(s),
                  });
                  
                  var actuallyReplaced = result && result.ok && (textAfter === s || textAfter.includes(s));
                  
                  if (actuallyReplaced) {
                    setStatus('แทนที่ "' + w + '" → "' + s + '" แล้ว');
                    
                    // Mark word as replaced
                    state.replacedWords[w] = true;
                    console.log('[ThaiSpellcheck] ✅ Word marked as replaced (verified)', {
                      word: w,
                      replacedWords: Object.keys(state.replacedWords),
                    });
                    
                    // ยกเลิก highlight ที่ตำแหน่งที่แทนที่ (คำที่ถูกแล้ว)
                    setTimeout(function () { clearHighlightWord(s); }, 100);
                    
                    // Update UI
                    renderIssues(state.lastIssues);
                  } else {
                    // Try executeMethod as fallback
                    console.log('[ThaiSpellcheck] ⚠️ callCommand did not replace correctly, trying executeMethod fallback');
                    tryExecuteMethodReplace(w, s);
                  }
                });
              }, 200);
            }
          );
        });
        return;
      } catch (eCall) {
        console.error('[ThaiSpellcheck] ❌ ReplaceCurrentWord callCommand failed', {
          error: eCall,
          errorMessage: eCall ? String(eCall.message || eCall) : '',
        });
        // Fall through to executeMethod
      }
    }
    
    // Fallback: Use executeMethod
    tryExecuteMethodReplace(w, s);
  }
  
  function tryExecuteMethodReplace(word, suggestion) {
    var w = String(word || "").trim();
    var s = String(suggestion || "").trim();
    
    console.log('[ThaiSpellcheck] 📤 Calling SearchAndReplace via executeMethod (fallback)', {
      word: w,
      suggestion: s,
    });
    
    // ใช้ executeMethod("SearchAndReplace") แทน ReplaceCurrentWord (ซึ่งไม่ทำงานใน plugin)
    execMethod("SearchAndReplace", [
      {
        searchString: w,
        replaceString: s,
        matchCase: true,
      },
    ], function (result) {
      console.log('[ThaiSpellcheck] 📥 SearchAndReplace executeMethod result', {
        result: result,
        resultType: typeof result,
        word: w,
        suggestion: s,
      });
      
      // Verify replacement by reading selected text back
      setTimeout(function () {
        execMethod("GetSelectedText", [], function (selectedTextAfter) {
          var textAfter = String(selectedTextAfter || "").trim();
          console.log('[ThaiSpellcheck] 📝 Selected text after executeMethod replace', {
            textAfter: textAfter,
            expectedNew: s,
            matches: textAfter === s || textAfter.includes(s),
          });
          
          var actuallyReplaced = textAfter === s || textAfter.includes(s);
          
          if (actuallyReplaced) {
            setStatus('แทนที่ "' + w + '" → "' + s + '" แล้ว');
            
            // Mark word as replaced
            state.replacedWords[w] = true;
            console.log('[ThaiSpellcheck] ✅ Word marked as replaced (executeMethod verified)', {
              word: w,
              replacedWords: Object.keys(state.replacedWords),
            });
            
            // ยกเลิก highlight ที่ตำแหน่งที่แทนที่
            setTimeout(function () { clearHighlightWord(s); }, 100);
            
            // Update UI
            renderIssues(state.lastIssues);
          } else {
            setStatus('แทนที่ "' + w + '" → "' + s + '" ไม่สำเร็จ (ลองใช้ปุ่ม Replace next แทน)');
            console.error('[ThaiSpellcheck] ❌ Replace failed (both methods)', {
              word: w,
              suggestion: s,
              executeMethodResult: result,
              textAfter: textAfter,
            });
          }
        });
      }, 200);
    });
  }

  // Jump to word in document (select and scroll to it)
  function jumpToWord(word) {
    var w = String(word || "").trim();
    if (!w) return;
    
    setStatus('กำลังค้นหา "' + w + '" ในเอกสาร...');
    
    // Try to find word from current position first
    execMethod(
      "SearchNext",
      [
        {
          searchString: w,
          matchCase: false, // Case-insensitive for better matching
        },
        true, // search from current position
      ],
      function (found) {
        if (found === false) {
          // Not found from current position, try from beginning
          setStatus('ไม่พบจากตำแหน่งปัจจุบัน กำลังค้นหาจากต้นเอกสาร...');
          
          // Reset to beginning and search again
          try {
            if (canCallCommand()) {
              window.Asc.plugin.callCommand(
                function () {
                  try {
                    var oDocument = Api.GetDocument();
                    if (!oDocument) return;
                    var oParagraph = oDocument.GetElement(0);
                    if (oParagraph && oParagraph.GetRange) {
                      var oRange = oParagraph.GetRange();
                      if (oRange && oRange.SetStart) {
                        oRange.SetStart(0, 0);
                        oRange.SetEnd(0, 0);
                        Api.SetSelection(oRange);
                      }
                    }
                  } catch (e) {}
                },
                false,
                true
              );
            }
          } catch (e) {}
          
          // Search from beginning
          setTimeout(function () {
            execMethod(
              "SearchNext",
              [
                {
                  searchString: w,
                  matchCase: false,
                },
                true,
              ],
              function (found2) {
                if (found2 === false) {
                  setStatus('ไม่พบ "' + w + '" ในเอกสาร');
                  return;
                }
                setStatus('พบ "' + w + '" แล้ว (เลือกไว้ในเอกสาร)');
                highlightWordInDocument(w);
              }
            );
          }, 100);
          return;
        }
        // Word found and selected
        setStatus('พบ "' + w + '" แล้ว (เลือกไว้ในเอกสาร)');
        
        // Highlight the word with background color
        highlightWordInDocument(w);
      }
    );
  }

  // Jump to word in document — เลือก/ไปที่คำ (ไม่ใส่ highlight แดงแล้ว)
  function highlightWordInDocument(word) {
    var w = String(word || "").trim();
    if (!w) return;
    // SearchNext ทำให้เลือกคำอยู่แล้ว — ไม่ใส่ highlight แดงในเอกสาร
  }

  // ลบ highlight จากคำที่กำหนด (SetHighlight("none") ตาม API ONLYOFFICE)
  function clearHighlightWord(word) {
    var w = String(word || "").trim();
    if (!w) return;
    
    try {
      if (!canCallCommand()) return;
      
      execMethod(
        "SearchNext",
        [
          { searchString: w, matchCase: false },
          true,
        ],
        function (found) {
          if (found === false) return;
          
          window.Asc.plugin.callCommand(
            function () {
              try {
                var oDocument = Api.GetDocument();
                if (!oDocument) return;
                
                var oRange = oDocument.GetRangeBySelect ? oDocument.GetRangeBySelect() : null;
                if (!oRange) return;
                
                var textPr = Api.CreateTextPr();
                if (textPr && textPr.SetHighlight) {
                  textPr.SetHighlight("none");
                  oRange.SetTextPr(textPr);
                } else if (oRange.SetFill) {
                  oRange.SetFill(null);
                }
              } catch (e) {}
            },
            false,
            true
          );
        }
      );
    } catch (e) {}
  }

  function wireEvents() {
    var btnSave = $("tscBtnSave");
    var btnCheck = $("tscBtnCheck");
    var apiInput = $("tscApiUrl");
    var btnClose = $("tscBtnClose");

    if (btnClose) {
      btnClose.addEventListener("click", function () {
        try {
          window.Asc.plugin.executeCommand("close", "");
        } catch (e) {}
      });
    }

    if (btnSave && apiInput) {
      btnSave.addEventListener("click", function () {
        var u = saveSettings(apiInput.value);
        setStatus(u ? "บันทึกแล้ว" : "บันทึกไม่สำเร็จ");
      });
    }

    if (btnCheck) {
      btnCheck.addEventListener("click", function () {
        if (!ensureApiConfigured()) return;
        // เคลียร์คำผิดเก่าและผลการตรวจก่อน (กดตรวจทาน = เริ่มรอบใหม่)
        state.lastIssues = [];
        state.replacedWords = Object.create(null);
        state.selectedSuggestionByWord = Object.create(null);
        renderIssues([]);
        setStatus("กำลังอ่านข้อความ...");
        var modeEl = $("tscMode");
        var mode = modeEl ? String(modeEl.value || "selection") : "selection";
        getTextByMode(mode, function (text) {
          var t = String(text || "").trim();
          if (!t) {
            setStatus("ไม่มีข้อความให้ตรวจ (ลองเลือกข้อความก่อน)");
            return;
          }
          setStatus("กำลังตรวจคำ...");
          var t0 = Date.now();
          Promise.all([
            apiPostJson("/spellcheck", { text: t }),
            fetchDictionaryWords(),
          ])
            .then(function (results) {
              var data = results[0];
              var dictResult = results[1] || {};
              var dictWords = dictResult.words || [];
              var byLength = dictResult.byLength || null;
              if (!Array.isArray(dictWords) && typeof dictResult === "object" && !dictResult.words) {
                dictWords = [];
                byLength = null;
              }
              state.dictionaryWords = dictWords;
              state.dictionaryByLength = byLength;
              var issues = (data && data.issues) || [];
              state.lastIssues = Array.isArray(issues) ? issues : [];
              for (var i = 0; i < state.lastIssues.length; i++) {
                var it = state.lastIssues[i] || {};
                var w = String(it.word || "").trim();
                if (!w) continue;
                var sugs = Array.isArray(it.suggestions) ? it.suggestions : [];
                var existingSet = Object.create(null);
                for (var k = 0; k < sugs.length; k++) {
                  var s = String(sugs[k] || "").trim();
                  if (s) existingSet[s] = true;
                }
                var fuzzy = fuzzyMatchDictionary(w, dictWords, existingSet, byLength);
                for (var f = 0; f < fuzzy.length; f++) {
                  sugs.push(fuzzy[f]);
                }
                it.suggestions = sugs;
                if (!state.selectedSuggestionByWord[w] && sugs.length) {
                  state.selectedSuggestionByWord[w] = String(sugs[0] || "");
                }
              }
              renderIssues(state.lastIssues);
              setStatus("เสร็จแล้ว (" + String(state.lastIssues.length) + " รายการ)");
              try {
                console.log("[ThaiSpellcheck] ตรวจคำใช้เวลา " + (Date.now() - t0) + " ms");
              } catch (e) {}
            })
            .catch(function (e) {
              renderIssues([]);
              setStatus("เรียก API ไม่สำเร็จ: " + String(e && e.message ? e.message : e));
            });
        });
      });
    }

    // Event delegation for results
    var results = $("tscResults");
    if (results) {
      results.addEventListener("click", function (ev) {
        var target = ev && ev.target ? ev.target : null;
        if (!target) {
          console.log('[ThaiSpellcheck] 🔘 Click event: no target');
          return;
        }

        var act = target.getAttribute ? target.getAttribute("data-act") : "";
        if (!act) {
          console.log('[ThaiSpellcheck] 🔘 Click event: no data-act attribute', {
            target: target ? {
              tagName: target.tagName,
              className: target.className,
              textContent: target.textContent ? target.textContent.substring(0, 50) : '',
            } : null,
          });
          return;
        }

        var issueEl = target.closest ? target.closest(".tscIssue") : null;
        if (!issueEl) {
          console.log('[ThaiSpellcheck] 🔘 Click event: no .tscIssue parent found', {
            action: act,
            target: target ? {
              tagName: target.tagName,
              className: target.className,
            } : null,
          });
          return;
        }

        var word = String(issueEl.getAttribute("data-word") || "");
        if (!word) {
          console.log('[ThaiSpellcheck] 🔘 Click event: no data-word attribute on issue element', {
            action: act,
            issueEl: issueEl ? {
              className: issueEl.className,
              innerHTML: issueEl.innerHTML ? issueEl.innerHTML.substring(0, 100) : '',
            } : null,
          });
          return;
        }
        
        console.log('[ThaiSpellcheck] 🔘 Click event detected', {
          action: act,
          word: word,
          target: target ? {
            tagName: target.tagName,
            className: target.className,
            textContent: target.textContent ? target.textContent.substring(0, 50) : '',
          } : null,
        });

        if (act === "pick") {
          var sug = String(target.getAttribute("data-sug") || "");
          console.log('[ThaiSpellcheck] 🔘 Suggestion clicked (pick)', {
            word: word,
            suggestion: sug,
            hasSuggestion: !!sug,
            targetElement: target ? {
              tagName: target.tagName,
              className: target.className,
              textContent: target.textContent ? target.textContent.substring(0, 50) : '',
            } : null,
          });
          
          if (sug) {
            state.selectedSuggestionByWord[word] = sug;
            console.log('[ThaiSpellcheck] ✅ Suggestion selected and saved', {
              word: word,
              suggestion: sug,
              allSelectedSuggestions: Object.keys(state.selectedSuggestionByWord).length,
            });
            
            renderIssues(state.lastIssues);
            
            // Auto-replace: เมื่อเลือก suggestion → jump ไปหาคำและ replace ทันที
            setStatus('กำลังไปหาคำ "' + word + '" เพื่อแทนที่...');
            console.log('[ThaiSpellcheck] 🔍 Starting search for word to replace', {
              word: word,
              suggestion: sug,
            });
            
            // ขั้นตอนที่ 1: Jump ไปหาคำในเอกสาร
            execMethod(
              "SearchNext",
              [
                {
                  searchString: word,
                  matchCase: false,
                },
                true,
              ],
              function (found) {
                console.log('[ThaiSpellcheck] 📥 SearchNext result (for pick suggestion)', {
                  word: word,
                  found: found,
                  foundType: typeof found,
                });
                
                if (found === false) {
                  console.log('[ThaiSpellcheck] ⚠️ Word not found from current position, trying from beginning', { word: word });
                  
                  // ไม่เจอจากตำแหน่งปัจจุบัน → ลองหาจากต้นเอกสาร
                  try {
                    if (canCallCommand()) {
                      window.Asc.plugin.callCommand(
                        function () {
                          try {
                            var oDocument = Api.GetDocument();
                            if (!oDocument) return;
                            var oParagraph = oDocument.GetElement(0);
                            if (oParagraph && oParagraph.GetRange) {
                              var oRange = oParagraph.GetRange();
                              if (oRange && oRange.SetStart) {
                                oRange.SetStart(0, 0);
                                oRange.SetEnd(0, 0);
                                Api.SetSelection(oRange);
                              }
                            }
                          } catch (e) {
                            console.error('[ThaiSpellcheck] ❌ Error resetting to beginning', { error: e });
                          }
                        },
                        false,
                        true
                      );
                    }
                  } catch (e) {
                    console.error('[ThaiSpellcheck] ❌ Error in callCommand for reset', { error: e });
                  }
                  
                  // Search จากต้นเอกสาร
                  setTimeout(function () {
                    console.log('[ThaiSpellcheck] 🔍 Searching from beginning after timeout', { word: word });
                    execMethod(
                      "SearchNext",
                      [
                        {
                          searchString: word,
                          matchCase: false,
                        },
                        true,
                      ],
                      function (found2) {
                        console.log('[ThaiSpellcheck] 📥 SearchNext result (from beginning)', {
                          word: word,
                          found: found2,
                          foundType: typeof found2,
                        });
                        
                        if (found2 === false) {
                          setStatus('ไม่พบ "' + word + '" ในเอกสาร');
                          console.warn('[ThaiSpellcheck] ⚠️ Word not found in document', { word: word });
                          return;
                        }
                        // พบแล้ว → แทนที่ (เพิ่ม delay เพื่อให้ selection พร้อม)
                        console.log('[ThaiSpellcheck] ✅ Word found, calling doReplaceCurrentWord after delay', {
                          word: word,
                          suggestion: sug,
                        });
                        setTimeout(function () {
                          doReplaceCurrentWord(word, sug);
                        }, 50);
                      }
                    );
                  }, 100);
                  return;
                }
                // พบแล้ว → แทนที่ (เพิ่ม delay เพื่อให้ selection พร้อม)
                console.log('[ThaiSpellcheck] ✅ Word found from current position, calling doReplaceCurrentWord after delay', {
                  word: word,
                  suggestion: sug,
                });
                setTimeout(function () {
                  doReplaceCurrentWord(word, sug);
                }, 50);
              }
            );
          } else {
            console.warn('[ThaiSpellcheck] ⚠️ Suggestion clicked but no suggestion value', {
              word: word,
              target: target ? {
                tagName: target.tagName,
                className: target.className,
                attributes: target.getAttribute ? {
                  'data-act': target.getAttribute('data-act'),
                  'data-sug': target.getAttribute('data-sug'),
                } : null,
              } : null,
            });
          }
          return;
        }

        if (act === "jump") {
          // Click on word → jump to it in document
          jumpToWord(word);
          return;
        }

        var chosen = String(state.selectedSuggestionByWord[word] || "");
        if (act === "ignore") {
          addToIgnoredWords(word);
          setStatus('ข้ามคำ "' + word + '" แล้ว (จำจนปิดแท็บ/เบราว์เซอร์)');
          renderIssues(state.lastIssues);
          return;
        }
        if (act === "add") {
          addWord(word, function (ignoredWord) {
            clearHighlightWord(ignoredWord);
            state.lastIssues = (state.lastIssues || []).filter(function (it) {
              return String(it.word || "").trim() !== ignoredWord;
            });
            renderIssues(state.lastIssues);
          });
          return;
        }
        if (act === "next") {
          console.log('[ThaiSpellcheck] 🔘 Replace next button clicked', { word: word, chosen: chosen });
          replaceNext(word, chosen);
          // Note: Don't mark as replaced here because "next" only replaces one occurrence
          // User might want to replace more occurrences
          return;
        }
        if (act === "all") {
          console.log('[ThaiSpellcheck] 🔘 Replace all button clicked', { word: word, chosen: chosen });
          // Replace-all is destructive; user can undo (Ctrl+Z)
          replaceAll(word, chosen);
          // Mark as replaced after replace-all
          state.replacedWords[word] = true;
          renderIssues(state.lastIssues);
          return;
        }
      });
    }
  }

  // OnlyOffice plugin lifecycle
  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  window.Asc.plugin.init = function () {
    if (state.inited) return;
    state.inited = true;

    loadSettings();
    try {
      var v = $("tscVersion");
      if (v) v.textContent = "v" + VERSION;
    } catch (e0) {}

    try {
      var apiInput = $("tscApiUrl");
      if (apiInput) apiInput.value = state.apiBaseUrl || "";
    } catch (e1) {}

    wireEvents();
    setStatus("พร้อม");
  };

  window.Asc.plugin.button = function (id, windowID) {
    // If called for modal window close, ignore (we don't open sub-windows)
    if (windowID !== undefined && windowID !== null && String(windowID) !== "") return;
    try {
      this.executeCommand("close", "");
    } catch (e) {}
  };

})(window);

