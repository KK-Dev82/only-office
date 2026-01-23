// Dictionary inline-suggest using ONLYOFFICE InputHelper
(function () {
  // NOTE: core/* initializes window.DO; alias DA -> DO for this plugin runtime
  var DA = (window.DA = window.DO = window.DO || window.DA || {});
  DA.features = DA.features || {};

  var PLUGIN_GUID = "asc.{8B6B9F89-7C57-4E1F-8B78-2B3D6B31E0DE}";
  var MIN_CHARS = 3;
  var MAX_ITEMS = 3;
  var THROTTLE_MS = 250;

  DA.state = DA.state || {};
  DA.state._dictSuggest = DA.state._dictSuggest || {
    disposed: false,
    timer: 0,
    lastToken: "",
    lastFull: "",
    lastParaText: undefined,
    lastTypingLogAt: 0,
  };

  function diffText(prev, next) {
    try {
      var a = String(prev || "");
      var b = String(next || "");
      if (a === b) return null;

      var start = 0;
      var aLen = a.length;
      var bLen = b.length;
      while (start < aLen && start < bLen && a.charAt(start) === b.charAt(start)) start++;

      var endA = aLen - 1;
      var endB = bLen - 1;
      while (endA >= start && endB >= start && a.charAt(endA) === b.charAt(endB)) {
        endA--;
        endB--;
      }

      var removed = a.slice(start, endA + 1);
      var inserted = b.slice(start, endB + 1);
      return { start: start, removed: removed, inserted: inserted, prevLen: aLen, nextLen: bLen };
    } catch (e) {
      return null;
    }
  }

  function detectKeyLabel(diff) {
    try {
      var ins = String(diff && diff.inserted ? diff.inserted : "");
      var rem = String(diff && diff.removed ? diff.removed : "");

      // Common special keys can be inferred from text changes
      if (ins === "\n") return "Enter";
      if (ins === "\t") return "Tab";
      if (!ins && rem) return rem.length === 1 ? "Backspace/Delete" : "Backspace/Delete(x" + rem.length + ")";
      if (ins && !rem) return ins.length === 1 ? "Key(" + JSON.stringify(ins) + ")" : "Insert(" + ins.length + ")";
      if (ins && rem) return "Replace(" + rem.length + "->" + ins.length + ")";
      return "Edit";
    } catch (e) {
      return "Edit";
    }
  }

  function reportTyping(diff, nextText) {
    try {
      var st = DA.state._dictSuggest;
      var now = Date.now();
      // throttle logs to avoid spam
      if (st.lastTypingLogAt && now - st.lastTypingLogAt < 250) return;
      st.lastTypingLogAt = now;

      var label = detectKeyLabel(diff);
      var ins = String(diff && diff.inserted ? diff.inserted : "");
      var rem = String(diff && diff.removed ? diff.removed : "");

      // show a compact preview in status + debug output
      var preview = "";
      if (ins) preview = " ins=" + JSON.stringify(ins.slice(0, 16)) + (ins.length > 16 ? "…" : "");
      if (rem) preview += " rem=" + JSON.stringify(rem.slice(0, 16)) + (rem.length > 16 ? "…" : "");

      if (DA.appendOutputLine) {
        DA.appendOutputLine("typing_detected: " + label + preview);
      }
      if (DA.setStatus) {
        DA.setStatus("ready | " + label);
      }
    } catch (e) {}
  }

  function extractLastToken(text) {
    try {
      var s = String(text || "");
      s = s.replace(/\u00A0/g, " ").trim();
      // Thai + latin/digit + underscore/dash/dot
      var m = s.match(/([A-Za-z0-9ก-๙._-]{1,})$/);
      return m ? String(m[1] || "") : "";
    } catch (e) {
      return "";
    }
  }

  function canExecuteMethod() {
    try {
      return Boolean(window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function");
    } catch {
      return false;
    }
  }

  // IMPORTANT:
  // In some ONLYOFFICE builds, calling ShowInputHelper forces the plugin iframe to shrink
  // (observed: win/root becomes ~10x10), which makes the panel UI look "broken".
  // Therefore InputHelper is **opt-in** only. Default is panel-only suggestions.
  // Enable explicitly with `?ih=1` (optional: `&ihui=1` to show a visible helper window).
  function isInputHelperEnabled() {
    try {
      var q = String((window.location && window.location.search) || "");
      return /(?:\?|&)ih=1(?:&|$)/.test(q);
    } catch (e) {
      return false;
    }
  }

  function isInputHelperVisualEnabled() {
    try {
      var q = String((window.location && window.location.search) || "");
      return /(?:\?|&)ihui=1(?:&|$)/.test(q);
    } catch (e) {
      return false;
    }
  }

  function showHelper(takeKeyboard) {
    try {
      if (!isInputHelperEnabled()) return;
      if (!canExecuteMethod()) return;
      // Signature: [guid, w_mm, h_mm, isKeyboardTake]
      // Keep tiny by default to avoid visual popup; still captures Enter/Tab/Esc.
      var w = isInputHelperVisualEnabled() ? 80 : 1;
      var h = isInputHelperVisualEnabled() ? 40 : 1;
      window.Asc.plugin.executeMethod("ShowInputHelper", [PLUGIN_GUID, w, h, Boolean(takeKeyboard)]);
    } catch (e) {}
  }

  function hideHelper() {
    try {
      if (!isInputHelperEnabled()) return;
      if (!canExecuteMethod()) return;
      window.Asc.plugin.executeMethod("UnShowInputHelper", [PLUGIN_GUID, true]);
    } catch (e) {}
  }

  function setItems(items) {
    try {
      if (!isInputHelperEnabled()) return;
      if (!window.Asc || !window.Asc.plugin || !window.Asc.plugin.getInputHelper) return;
      var ih = window.Asc.plugin.getInputHelper();
      if (ih && ih.setItems) ih.setItems(items);
    } catch (e) {}
  }

  function ensureInputHelperInit() {
    try {
      if (!isInputHelperEnabled()) return;
      if (!window.Asc || !window.Asc.plugin) return;
      if (!window.Asc.plugin.createInputHelper) return;
      if (window.__do_dict_inputHelperInited) return;
      window.__do_dict_inputHelperInited = true;
      window.Asc.plugin.createInputHelper();
      // DO NOT call `ih.createWindow()` here.
      // It is not required for suggestions and has caused iframe resize issues in some builds.
    } catch (e) {}
  }

  function findMatches(prefix) {
    var q = String(prefix || "").trim().toLowerCase();
    if (!q) return [];

    var dict = DA.store && DA.store.dictionary ? DA.store.dictionary : [];
    var out = [];
    for (var i = 0; i < dict.length; i++) {
      var w = dict[i];
      var word = String(w.word || w.Word || "").trim();
      if (!word) continue;
      if (word.toLowerCase().indexOf(q) === 0) {
        out.push(word);
        if (out.length >= MAX_ITEMS) break;
      }
    }
    // Prefer shortest match first (more "autocomplete-like")
    try {
      out.sort(function (a, b) {
        return a.length - b.length;
      });
    } catch (e0) {}
    return out;
  }

  function findAbbrMatches(token) {
    var q = String(token || "").trim().toLowerCase();
    if (!q) return [];
    var items = (DA.store && DA.store.abbreviations) ? DA.store.abbreviations : [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var a = items[i] || {};
      var s = String(a.shortForm || "").trim();
      if (!s) continue;
      if (String(s).toLowerCase().indexOf(q) === 0) {
        out.push({ id: a.id, shortForm: a.shortForm || "", fullForm: a.fullForm || "" });
        if (out.length >= MAX_ITEMS) break;
      }
    }
    return out;
  }

  function updatePanels(token, dictMatches) {
    // Dictionary panel suggestions (always update)
    try {
      if (DA.features && DA.features.dictionary && typeof DA.features.dictionary.renderInlineSuggestions === "function") {
        if (!token || token.length < 1) DA.features.dictionary.renderInlineSuggestions("", [], 0);
        else DA.features.dictionary.renderInlineSuggestions(token, dictMatches || [], 0);
      }
    } catch (e0) {}

    // Abbreviation panel suggestions (independent from dictionary)
    try {
      if (DA.features && DA.features.abbreviation && typeof DA.features.abbreviation.renderInlineSuggestions === "function") {
        if (!token || token.length < 1) {
          DA.features.abbreviation.renderInlineSuggestions("", [], 0);
        } else {
          var abbrs = findAbbrMatches(token);
          DA.features.abbreviation.renderInlineSuggestions(token, abbrs, 0);
        }
      }
    } catch (e1) {}
  }

  function renderSuggestion(token) {
    var st = DA.state._dictSuggest;
    if (!token || token.length < MIN_CHARS) {
      st.lastToken = "";
      st.lastFull = "";
      hideHelper();
      // still update abbreviation panel for short tokens (e.g. 1-2 chars)
      try { updatePanels(token, []); } catch (e0) {}
      return;
    }

    var matches = findMatches(token);
    if (!matches.length) {
      st.lastToken = token;
      st.lastFull = "";
      hideHelper();
      try { updatePanels(token, []); } catch (e1) {}
      return;
    }

    // Use first (best) match
    var full = matches[0];
    st.lastToken = token;
    st.lastFull = full;

    // Panel-only mode (default): do NOT call ShowInputHelper (prevents iframe resize glitches).
    if (!isInputHelperEnabled()) {
      try {
        // dedupe repeated logs/renders
        var key = token + "→" + full;
        var listKey = token + "|" + matches.join(",");
        var changed = false;
        if (st._lastKey !== key) {
          st._lastKey = key;
          changed = true;
          if (DA.debugLog) DA.debugLog("dict_match", { token: token, full: full });
        }
      } catch (e0) {}
      // Update both panels (dictionary + abbreviation). Dedupe via listKey for dict.
      try {
        if (st._lastListKey !== listKey) {
          st._lastListKey = listKey;
          updatePanels(token, matches);
        } else {
          // still keep abbreviation updated if token changes without dict list change
          updatePanels(token, matches);
        }
      } catch (e1) {}
      return;
    }

    var items = [];
    // Friendly question-like prompt, but value is the actual full word
    items.push({
      text: 'คุณหมายถึง "' + full + '" ใช่ไหม',
      value: full,
    });
    // Extra choices (optional)
    for (var i = 1; i < Math.min(matches.length, MAX_ITEMS); i++) {
      items.push({ text: matches[i], value: matches[i] });
    }

    // takeKeyboard=true enables Tab/Enter/Esc behavior handled by editor
    showHelper(true);
    setItems(items);
  }

  function scheduleFromParagraph() {
    var st = DA.state._dictSuggest;
    if (st.disposed) return;
    if (st.timer) return;
    st.timer = setTimeout(function () {
      st.timer = 0;
      if (st.disposed) return;
      try {
        if (!DA.editor || !DA.editor.getCurrentParagraphText) return;
        DA.editor.getCurrentParagraphText(function (paraText) {
          if (st.disposed) return;
          var nextText = String(paraText || "");

          // Detect typing/key action (best-effort via paragraph diff)
          try {
            if (st.lastParaText !== undefined && st.lastParaText !== nextText) {
              var d = diffText(st.lastParaText, nextText);
              if (d) reportTyping(d, nextText);
            }
            st.lastParaText = nextText;
          } catch (e0) {}

          var token = extractLastToken(nextText);
          renderSuggestion(token);
        });
      } catch (e) {}
    }, THROTTLE_MS);
  }

  function getCurrentTokenNow(cb) {
    try {
      if (!DA.editor || !DA.editor.getCurrentParagraphText) return cb("");
      DA.editor.getCurrentParagraphText(function (paraText) {
        var token = extractLastToken(paraText || "");
        cb(String(token || ""));
      });
    } catch (e) {
      cb("");
    }
  }

  function attach(eventName, fn) {
    try {
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.attachEditorEvent) {
        window.Asc.plugin.attachEditorEvent(eventName, fn);
        return;
      }
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.attachEvent) {
        window.Asc.plugin.attachEvent(eventName, fn);
        return;
      }
      // fallback: direct callback
      if (window.Asc && window.Asc.plugin) {
        window.Asc.plugin[eventName] = fn;
      }
    } catch (e) {}
  }

  function dispose() {
    var st = DA.state._dictSuggest;
    st.disposed = true;
    try {
      if (st.timer) clearTimeout(st.timer);
    } catch (e0) {}
    st.timer = 0;
    try {
      hideHelper();
    } catch (e1) {}
  }

  function bind() {
    ensureInputHelperInit();

    // When caret/target changes, recompute token (throttled)
    attach("onTargetPositionChanged", function () {
      scheduleFromParagraph();
    });

    // Fires when document content changes (typing/paste/etc.)
    attach("onDocumentContentChanged", function () {
      scheduleFromParagraph();
    });

    // Some builds use these names for selection/caret changes
    attach("onSelectionChanged", function () {
      scheduleFromParagraph();
    });

    attach("onChangeSelection", function () {
      scheduleFromParagraph();
    });

    // InputHelper events (used for keyboard accept, even when helper is tiny/invisible)
    if (isInputHelperEnabled()) {
      // Some builds emit typed fragment here. Still treat as hint, but we re-check paragraph too.
      attach("onInputHelperInput", function (data) {
        // If event provides text, log it (best-effort)
        try {
          var s = "";
          if (typeof data === "string") s = data;
          else if (data && typeof data.text === "string") s = data.text;
          else if (data && typeof data.data === "string") s = data.data;
          s = String(s || "");
          if (s) {
            if (DA.appendOutputLine) DA.appendOutputLine("onInputHelperInput: " + JSON.stringify(s.slice(0, 40)));
          }
        } catch (e0) {}
        scheduleFromParagraph();
      });

      attach("onInputHelperClear", function () {
        var st = DA.state._dictSuggest;
        st.lastFull = "";
        // hide immediately
        hideHelper();
      });

      // Accept suggestion (Tab/Enter triggers this in editor when takeKeyboard=true)
      attach("onInputHelperItemClick", function (data) {
        try {
          var st = DA.state._dictSuggest;
          if (st.disposed) return;

          var value = "";
          if (typeof data === "string") value = data;
          else if (data && typeof data.value === "string") value = data.value;
          else if (data && typeof data.text === "string") value = data.text;
          else if (data && data.item && typeof data.item.value === "string") value = data.item.value;
          else if (data && data.item && typeof data.item.text === "string") value = data.item.text;

          var fullWord = String(value || "").trim();
          if (!fullWord) {
            hideHelper();
            return;
          }

          // Compute token at time of accept to avoid stale prefix
          getCurrentTokenNow(function (tokenNow) {
            try {
              var prefix = String(tokenNow || "").trim();
              if (!prefix || fullWord.toLowerCase().indexOf(prefix.toLowerCase()) !== 0) {
                // fallback: use lastToken
                prefix = String(st.lastToken || "").trim();
              }

              // If user has selection, prefer replace selection with full word (no duplication)
              try {
                if (DA.editor && typeof DA.editor.getSelectedText === "function") {
                  DA.editor.getSelectedText(function (sel) {
                    try {
                      var selected = String(sel || "").trim();
                      if (selected) {
                        DA.editor.replaceSelectionText(fullWord);
                        return;
                      }
                      // No selection: insert suffix when prefix matches
                      if (prefix && fullWord.toLowerCase().indexOf(prefix.toLowerCase()) === 0) {
                        var suffix = fullWord.slice(prefix.length);
                        if (suffix) DA.editor.insertText(suffix);
                        return;
                      }
                      // last resort
                      DA.editor.insertText(fullWord);
                    } catch (eSel) {}
                  });
                  return;
                }
              } catch (eTry) {}

              // Fallback without selection APIs
              if (prefix && fullWord.toLowerCase().indexOf(prefix.toLowerCase()) === 0) {
                var suffix2 = fullWord.slice(prefix.length);
                if (suffix2) DA.editor.insertText(suffix2);
              } else {
                DA.editor.insertText(fullWord);
              }
            } catch (e0) {}
          });

          hideHelper();
        } catch (e) {
          try {
            hideHelper();
          } catch {}
        }
      });
    }
  }

  DA.features.dictSuggest = {
    bind: bind,
    dispose: dispose,
  };
})();

