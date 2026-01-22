// Dictionary inline-suggest using ONLYOFFICE InputHelper
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};

  var PLUGIN_GUID = "asc.{8B6B9F89-7C57-4E1F-8B78-2B3D6B31E0DE}";
  var MIN_CHARS = 3;
  var MAX_ITEMS = 3;
  var THROTTLE_MS = 250;

  DO.state = DO.state || {};
  DO.state._dictSuggest = DO.state._dictSuggest || {
    disposed: false,
    timer: 0,
    lastToken: "",
    lastFull: "",
  };

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

  function showHelper(takeKeyboard) {
    try {
      if (!canExecuteMethod()) return;
      window.Asc.plugin.executeMethod("ShowInputHelper", [PLUGIN_GUID, 80, 40, Boolean(takeKeyboard)]);
    } catch (e) {}
  }

  function hideHelper() {
    try {
      if (!canExecuteMethod()) return;
      window.Asc.plugin.executeMethod("UnShowInputHelper", [PLUGIN_GUID, true]);
    } catch (e) {}
  }

  function setItems(items) {
    try {
      if (!window.Asc || !window.Asc.plugin || !window.Asc.plugin.getInputHelper) return;
      var ih = window.Asc.plugin.getInputHelper();
      if (ih && ih.setItems) ih.setItems(items);
    } catch (e) {}
  }

  function ensureInputHelperInit() {
    try {
      if (!window.Asc || !window.Asc.plugin) return;
      if (!window.Asc.plugin.createInputHelper) return;
      if (window.__do_dict_inputHelperInited) return;
      window.__do_dict_inputHelperInited = true;
      window.Asc.plugin.createInputHelper();
      if (window.Asc.plugin.getInputHelper) {
        var ih = window.Asc.plugin.getInputHelper();
        if (ih && ih.createWindow) ih.createWindow();
      }
    } catch (e) {}
  }

  function findMatches(prefix) {
    var q = String(prefix || "").trim().toLowerCase();
    if (!q) return [];

    var dict = DO.store && DO.store.dictionary ? DO.store.dictionary : [];
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

  function renderSuggestion(token) {
    var st = DO.state._dictSuggest;
    if (!token || token.length < MIN_CHARS) {
      st.lastToken = "";
      st.lastFull = "";
      hideHelper();
      return;
    }

    var matches = findMatches(token);
    if (!matches.length) {
      st.lastToken = token;
      st.lastFull = "";
      hideHelper();
      return;
    }

    // Use first (best) match
    var full = matches[0];
    st.lastToken = token;
    st.lastFull = full;

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
    var st = DO.state._dictSuggest;
    if (st.disposed) return;
    if (st.timer) return;
    st.timer = setTimeout(function () {
      st.timer = 0;
      if (st.disposed) return;
      try {
        if (!DO.editor || !DO.editor.getCurrentParagraphText) return;
        DO.editor.getCurrentParagraphText(function (paraText) {
          if (st.disposed) return;
          var token = extractLastToken(paraText || "");
          renderSuggestion(token);
        });
      } catch (e) {}
    }, THROTTLE_MS);
  }

  function getCurrentTokenNow(cb) {
    try {
      if (!DO.editor || !DO.editor.getCurrentParagraphText) return cb("");
      DO.editor.getCurrentParagraphText(function (paraText) {
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
    var st = DO.state._dictSuggest;
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

    // Some builds emit typed fragment here. Still treat as hint, but we re-check paragraph too.
    attach("onInputHelperInput", function (_data) {
      scheduleFromParagraph();
    });

    attach("onInputHelperClear", function () {
      var st = DO.state._dictSuggest;
      st.lastFull = "";
      // hide immediately
      hideHelper();
    });

    // Accept suggestion (Tab/Enter triggers this in editor when takeKeyboard=true)
    attach("onInputHelperItemClick", function (data) {
      try {
        var st = DO.state._dictSuggest;
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
              if (DO.editor && typeof DO.editor.getSelectedText === "function") {
                DO.editor.getSelectedText(function (sel) {
                  try {
                    var selected = String(sel || "").trim();
                    if (selected) {
                      DO.editor.replaceSelectionText(fullWord);
                      return;
                    }
                    // No selection: insert suffix when prefix matches
                    if (prefix && fullWord.toLowerCase().indexOf(prefix.toLowerCase()) === 0) {
                      var suffix = fullWord.slice(prefix.length);
                      if (suffix) DO.editor.insertText(suffix);
                      return;
                    }
                    // last resort
                    DO.editor.insertText(fullWord);
                  } catch (eSel) {}
                });
                return;
              }
            } catch (eTry) {}

            // Fallback without selection APIs
            if (prefix && fullWord.toLowerCase().indexOf(prefix.toLowerCase()) === 0) {
              var suffix2 = fullWord.slice(prefix.length);
              if (suffix2) DO.editor.insertText(suffix2);
            } else {
              DO.editor.insertText(fullWord);
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

  DO.features.dictSuggest = {
    bind: bind,
    dispose: dispose,
  };
})();

