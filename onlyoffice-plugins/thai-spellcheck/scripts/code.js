/* Thai SpellChecker plugin (OnlyOffice)
 * - Calls external API (PythaiNLP-WordSuggestion):
 *   - POST {baseUrl}/spellcheck  body: { text }
 *   - POST {baseUrl}/add-words  body: { words: [word] }
 * - Replace helpers:
 *   - executeMethod("SearchNext") + executeMethod("ReplaceCurrentWord")  -> replace next occurrence
 *   - executeMethod("SearchAndReplace")                                  -> replace all occurrences
 */
(function (window) {
  var STORAGE_KEY_API = "tsc:v1:apiBaseUrl";
  var VERSION = "0.1.0";

  var state = {
    apiBaseUrl: "",
    lastIssues: [],
    selectedSuggestionByWord: Object.create(null),
    replacedWords: Object.create(null), // Track replaced words
    inited: false,
  };

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
      
      var sugs = Array.isArray(it.suggestions) ? it.suggestions : [];
      var chosen = state.selectedSuggestionByWord[word];
      if (!chosen && sugs.length) chosen = String(sugs[0] || "");
      if (chosen) state.selectedSuggestionByWord[word] = chosen;

      html += '<div class="tscIssue" data-word="' + escapeHtml(word) + '">';
      html += '  <div class="tscIssueTop">';
      html += '    <div class="tscWord" data-act="jump" title="คลิกเพื่อไปที่คำนี้ในเอกสาร">' + escapeHtml(word) + "</div>";
      html += '    <div class="tscActions">';
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
        
        // Try callCommand as fallback if executeMethod doesn't work
        if (canCallCommand()) {
          try {
            window.Asc.scope = window.Asc.scope || {};
            window.Asc.scope.__tsc_replace_word = s;
            
            window.Asc.plugin.callCommand(
              function () {
                try {
                  var doc = Api.GetDocument();
                  if (!doc) return { ok: false };
                  
                  var selection = Api.GetSelection();
                  if (!selection) {
                    console.warn('[ThaiSpellcheck] ⚠️ ReplaceCurrentWord: No selection available');
                    return { ok: false, error: "No selection" };
                  }
                  
                  var newText = String(Asc.scope.__tsc_replace_word || "");
                  if (!newText) return { ok: false, error: "No replacement text" };
                  
                  console.log('[ThaiSpellcheck] 🔄 ReplaceCurrentWord: Deleting selection and inserting', { newText: newText });
                  
                  // Delete selected text and insert new text
                  selection.Delete();
                  doc.InsertText(newText);
                  
                  return { ok: true, replaced: true };
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
              
              // Use Api.SearchAndReplace if available
              if (Api && typeof Api.SearchAndReplace === "function") {
                Api.SearchAndReplace(oldText, newText, true); // true = replace all
                return { ok: true, replaced: true };
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

  function addWord(word) {
    var w = String(word || "").trim();
    if (!w) return;
    if (!ensureApiConfigured()) return;

    setStatus('กำลังเพิ่มคำ "' + w + '" ...');
    apiPostJson("/add-words", { words: [w] })
      .then(function () {
        setStatus('เพิ่มคำ "' + w + '" แล้ว');
      })
      .catch(function (e) {
        setStatus("เพิ่มคำไม่สำเร็จ: " + String(e && e.message ? e.message : e));
      });
  }

  // Helper: Replace current selected word with suggestion
  function doReplaceCurrentWord(word, suggestion) {
    var w = String(word || "").trim();
    var s = String(suggestion || "").trim();
    if (!w || !s) return;
    
    setStatus('กำลังแทนที่ "' + w + '" → "' + s + '"...');
    execMethod("ReplaceCurrentWord", [s, "entirely"], function () {
      setStatus('แทนที่ "' + w + '" → "' + s + '" แล้ว');
      
      // Mark word as replaced (will be hidden from list on next render)
      state.replacedWords[w] = true;
      
      // Update UI: re-render issues to hide replaced word
      renderIssues(state.lastIssues);
      
      // Highlight คำใหม่ที่ replace แล้ว (optional)
      setTimeout(function () {
        highlightWordInDocument(s);
      }, 100);
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

  // Highlight word with background color (yellow/red tint for errors)
  function highlightWordInDocument(word) {
    var w = String(word || "").trim();
    if (!w) return;
    
    try {
      if (!canCallCommand()) return;
      
      window.Asc.scope = window.Asc.scope || {};
      window.Asc.scope.__tsc_highlight_word = w;
      
      window.Asc.plugin.callCommand(
        function () {
          try {
            var oDocument = Api.GetDocument();
            if (!oDocument) return;
            
            var searchWord = String(Asc.scope.__tsc_highlight_word || "");
            if (!searchWord) return;
            
            // Get current selection (should be the word we just found)
            var oSelection = Api.GetSelection();
            if (!oSelection) return;
            
            // Apply background color (light red/yellow for error indication)
            // Color: RGB(255, 235, 235) - light red tint
            var oFill = Api.CreateColorFill();
            oFill.SetColor(255, 235, 235); // Light red background
            oSelection.SetFill(oFill);
            
            // Optional: Also add underline
            // var oPr = Api.CreateParagraphPr();
            // oPr.SetUnderline(true);
            // oSelection.SetParagraphPr(oPr);
          } catch (e) {
            // Silently fail if highlighting not supported
          }
        },
        false,
        true
      );
    } catch (e) {
      // Silently fail
    }
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
        var modeEl = $("tscMode");
        var mode = modeEl ? String(modeEl.value || "selection") : "selection";
        setStatus("กำลังอ่านข้อความ...");
        getTextByMode(mode, function (text) {
          var t = String(text || "").trim();
          if (!t) {
            setStatus("ไม่มีข้อความให้ตรวจ (ลองเลือกข้อความก่อน)");
            renderIssues([]);
            return;
          }
          setStatus("กำลังตรวจคำ...");
          apiPostJson("/spellcheck", { text: t })
            .then(function (data) {
              var issues = (data && data.issues) || [];
              state.lastIssues = Array.isArray(issues) ? issues : [];
              // Preselect suggestion for each word
              for (var i = 0; i < state.lastIssues.length; i++) {
                var it = state.lastIssues[i] || {};
                var w = String(it.word || "").trim();
                if (!w) continue;
                var sugs = Array.isArray(it.suggestions) ? it.suggestions : [];
                if (!state.selectedSuggestionByWord[w] && sugs.length) {
                  state.selectedSuggestionByWord[w] = String(sugs[0] || "");
                }
              }
              // Reset replaced words when starting new check
              state.replacedWords = Object.create(null);
              renderIssues(state.lastIssues);
              setStatus("เสร็จแล้ว (" + String(state.lastIssues.length) + " รายการ)");
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
            
            // Auto-replace: เมื่อเลือก suggestion → jump ไปหาคำและ replace ทันที
            setStatus('กำลังไปหาคำ "' + word + '" เพื่อแทนที่...');
            
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
                if (found === false) {
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
                          } catch (e) {}
                        },
                        false,
                        true
                      );
                    }
                  } catch (e) {}
                  
                  // Search จากต้นเอกสาร
                  setTimeout(function () {
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
                        if (found2 === false) {
                          setStatus('ไม่พบ "' + word + '" ในเอกสาร');
                          return;
                        }
                        // พบแล้ว → แทนที่
                        doReplaceCurrentWord(word, sug);
                      }
                    );
                  }, 100);
                  return;
                }
                // พบแล้ว → แทนที่ทันที
                doReplaceCurrentWord(word, sug);
              }
            );
          }
          return;
        }

        if (act === "jump") {
          // Click on word → jump to it in document
          jumpToWord(word);
          return;
        }

        var chosen = String(state.selectedSuggestionByWord[word] || "");
        if (act === "add") {
          addWord(word);
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

  // Optional: keep UX tidy when selection changes (no auto-check)
  window.Asc.plugin.event_onSelectionChanged = function () {
    // noop (reserved for future "auto preview current word")
  };
})(window);

