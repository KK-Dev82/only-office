// Input helper + keyboard detection fallback
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};

  var PLUGIN_GUID = "asc.{C6A86F5A-5A0F-49F8-9E72-9E8E1E2F86A1}";
  var MIN_QUERY_LEN = 2;
  var MAX_ITEMS = 5;
  var CLEAR_THROTTLE_MS = 500;
  var ITEMS_LOG_THROTTLE_MS = 1200;
  var TYPING_LOG_THROTTLE_MS = 900;
  var HEARTBEAT_EVERY_TICKS = 80; // reduce spam
  // Detect-only mode:
  // - keep token/typing detection logs
  // - do NOT show InputHelper UI (prevents UI flicker / layout issues)
  // Enable UI explicitly by setting pluginOptions.features.inputHelperUi = true
  function isInputHelperUiEnabled() {
    try {
      return Boolean(DO.pluginOptions && DO.pluginOptions.features && DO.pluginOptions.features.inputHelperUi === true);
    } catch (e) {
      return false;
    }
  }

  function nowMs() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function safeLower(s) {
    try {
      return String(s || "").toLowerCase();
    } catch (e) {
      return "";
    }
  }

  function shouldLogThrottle(key, ms) {
    try {
      DO.state = DO.state || {};
      DO.state._ihLogAt = DO.state._ihLogAt || {};
      var last = Number(DO.state._ihLogAt[key] || 0);
      var n = nowMs();
      if (last && n - last < ms) return false;
      DO.state._ihLogAt[key] = n;
      return true;
    } catch (e) {
      return true;
    }
  }

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

  function extractLastToken(text) {
    try {
      var s = String(text || "");
      s = s.replace(/\u00A0/g, " ").trim();
      var m = s.match(/([A-Za-z0-9ก-๙._-]{2,})$/);
      return m ? m[1] : "";
    } catch (e) {
      return "";
    }
  }

  function showHelper(isKeyboardTake) {
    try {
      if (DO.state && DO.state.disposed) return;
      if (!isInputHelperUiEnabled()) return;
      DO.state = DO.state || {};
      // Avoid repeated show calls (causes UI flicker in some builds)
      if (DO.state._ihVisible && DO.state._ihKeyboardTake === Boolean(isKeyboardTake)) return;
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
        window.Asc.plugin.executeMethod("ShowInputHelper", [PLUGIN_GUID, 80, 40, Boolean(isKeyboardTake)]);
        DO.state._ihVisible = true;
        DO.state._ihKeyboardTake = Boolean(isKeyboardTake);
      }
    } catch (e) {}
  }

  function hideHelper() {
    try {
      if (DO.state && DO.state.disposed) return;
      if (!isInputHelperUiEnabled()) return;
      DO.state = DO.state || {};
      // Avoid repeated hide calls (UI flicker + log spam)
      if (!DO.state._ihVisible) return;
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
        window.Asc.plugin.executeMethod("UnShowInputHelper", [PLUGIN_GUID, true]);
        DO.state._ihVisible = false;
      }
    } catch (e) {}
  }

  function setItems(items) {
    try {
      if (!isInputHelperUiEnabled()) return;
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.getInputHelper) {
        var ih = window.Asc.plugin.getInputHelper();
        if (ih && ih.setItems) ih.setItems(items);
      }
    } catch (e) {}
  }

  function updateSuggestions(query) {
    if (DO.state && DO.state.disposed) return;
    DO.state = DO.state || {};
    // Detect-only mode: do not compute/show suggestions
    if (!isInputHelperUiEnabled()) return;
    var q = safeLower(String(query || "").trim());
    if (!q || q.length < MIN_QUERY_LEN) {
      // Hide helper when query is too short
      hideHelper();
      return;
    }

    var list = [];
    var seen = {};

    // abbreviation
    var abbr = (DO.store && DO.store.abbreviations) || [];
    for (var i = 0; i < abbr.length && list.length < MAX_ITEMS; i++) {
      var s = String(abbr[i].shortForm || "").trim();
      var f = String(abbr[i].fullForm || "").trim();
      if (!s && !f) continue;
      if (safeLower(s).indexOf(q) === 0 || safeLower(f).indexOf(q) === 0) {
        var val = f || s;
        var key = "abbr:" + val;
        if (!seen[key]) {
          seen[key] = true;
          list.push({ text: val, value: val });
        }
      }
    }

    // dictionary (local)
    var dict = (DO.store && DO.store.dictionary) || [];
    for (var di = 0; di < dict.length && list.length < MAX_ITEMS; di++) {
      var dw = String(dict[di].word || dict[di].Word || "").trim();
      if (!dw) continue;
      if (safeLower(dw).indexOf(q) === 0) {
        var k2 = "dict:" + dw;
        if (!seen[k2]) {
          seen[k2] = true;
          list.push({ text: dw, value: dw });
        }
      }
    }

    // clipboard
    var clips = (DO.store && DO.store.clipboard) || [];
    for (var ci = 0; ci < clips.length && list.length < MAX_ITEMS; ci++) {
      var t = String(clips[ci].text || "").trim();
      if (!t) continue;
      if (safeLower(t).indexOf(q) === 0) {
        var k3 = "clip:" + t;
        if (!seen[k3]) {
          seen[k3] = true;
          list.push({ text: t, value: t });
        }
      }
    }

    if (!list.length) {
      // Avoid showing an empty helper window (looks like "UI เพี้ยน")
      hideHelper();
      if (shouldLogThrottle("items0", ITEMS_LOG_THROTTLE_MS)) DO.debugLog("inputHelper_items", { count: 0 });
      return;
    }

    // Deduplicate: if items didn't change, don't re-show/re-set every time (prevents flicker)
    var itemsKey = "";
    try {
      itemsKey = q + "|" + list.map(function (x) { return String(x && x.value || x && x.text || ""); }).join("|");
    } catch (e0) {
      itemsKey = q;
    }
    if (DO.state._ihLastItemsKey === itemsKey) {
      // Ensure visible but don't spam calls
      showHelper(true);
      return;
    }
    DO.state._ihLastItemsKey = itemsKey;

    // Show helper only when we actually have items.
    // Take keyboard here so users can confirm with Tab/Enter (if supported by this build).
    showHelper(true);
    setItems(list);
    if (shouldLogThrottle("itemsN", ITEMS_LOG_THROTTLE_MS)) DO.debugLog("inputHelper_items", { count: list.length });
  }

  function attachEvents() {
    if (!window.Asc || !window.Asc.plugin) return;
    DO.state = DO.state || {};
    DO.state.disposed = false;

    function dispose() {
      try {
        DO.state.disposed = true;
      } catch (e0) {}
      try {
        hideHelper();
      } catch (e1) {}
      try {
        if (DO.state.targetTimer) clearTimeout(DO.state.targetTimer);
      } catch (e2) {}
      try {
        if (DO.state.inputPollTimer) clearTimeout(DO.state.inputPollTimer);
      } catch (e3) {}
      DO.state.targetTimer = 0;
      DO.state.inputPollTimer = 0;
      DO.debugLog("inputHelper_disposed");
    }

    function attach(id, fn) {
      try {
        if (window.Asc.plugin.attachEditorEvent) {
          window.Asc.plugin.attachEditorEvent(id, fn);
          return "attachEditorEvent";
        }
        if (window.Asc.plugin.attachEvent) {
          window.Asc.plugin.attachEvent(id, fn);
          return "attachEvent";
        }
        // Some builds deliver events by calling Asc.plugin[EventName] directly
        // when the event is listed in config.json.
        window.Asc.plugin[id] = fn;
        return "direct";
      } catch (e) {}
      return "";
    }

    // ensure input helper exists (บาง build ต้อง create ก่อนถึงจะยิง event)
    try {
      if (!window.__do_inputHelperInited && window.Asc.plugin.createInputHelper) {
        window.__do_inputHelperInited = true;
        window.Asc.plugin.createInputHelper();
        if (window.Asc.plugin.getInputHelper) {
          window.Asc.plugin.getInputHelper().createWindow();
        }
        DO.debugLog("inputHelper_inited");
      }
    } catch (e0) {}

    var attachMode = attach("onInputHelperInput", function (data) {
      // Detect-only mode: ignore UI helper input events
      if (!isInputHelperUiEnabled()) return;
      var text = "";
      try {
        if (typeof data === "string") text = data;
        else if (data && typeof data.text === "string") text = data.text;
        else if (data && typeof data.data === "string") text = data.data;
      } catch (e) {}
      if (text && text.length >= 2) {
        DO.debugLog("inputHelper_input", { text: text, len: text.length });
        updateSuggestions(text);
      }
    });

    attach("onInputHelperClear", function () {
      try {
        if (DO.state && DO.state.disposed) return;
        // Detect-only mode: ignore clear events to avoid flicker
        if (!isInputHelperUiEnabled()) return;
        var n = nowMs();
        // Many builds fire this event repeatedly; throttle to avoid UI flicker/log spam
        if (DO.state._ihLastClearAt && n - DO.state._ihLastClearAt < CLEAR_THROTTLE_MS) return;
        DO.state._ihLastClearAt = n;
        // Hide helper when editor asks to clear suggestions.
        hideHelper();
        if (shouldLogThrottle("clear", ITEMS_LOG_THROTTLE_MS)) DO.debugLog("inputHelper_clear");
      } catch (e) {}
    });

    attach("onInputHelperItemClick", function (data) {
      try {
        if (DO.state && DO.state.disposed) return;
        // Detect-only mode: ignore item clicks (no UI suggestions anyway)
        if (!isInputHelperUiEnabled()) return;
        var value = "";
        if (typeof data === "string") value = data;
        else if (data && typeof data.text === "string") value = data.text;
        else if (data && typeof data.value === "string") value = data.value;
        else if (data && data.item && typeof data.item.text === "string") value = data.item.text;
        if (!value) return;

        // IMPORTANT:
        // Do NOT auto-insert into document by default.
        // Auto-insert causes unexpected document changes and can trigger UI layout shifts.
        // Enable explicitly via plugin options: features.dictionaryInsertToEditor = true
        var allowInsert =
          Boolean(DO.pluginOptions && DO.pluginOptions.features && DO.pluginOptions.features.dictionaryInsertToEditor);
        if (allowInsert) {
          DO.editor.insertText(value);
          try {
            DO.debugLog("inputHelper_insert", { value: value });
          } catch (e1) {}
          return;
        }

        // Default: copy to Clipboard input (no document mutation)
        try {
          var clip = DO.$("clipText");
          if (clip) clip.value = value;
        } catch (e2) {}
        try {
          DO.debugLog("inputHelper_copy_only", { value: value });
        } catch (e3) {}
      } catch (e) {}
    });

    // Fallback: onTargetPositionChanged → throttle → read paragraph → detect token
    attach("onTargetPositionChanged", function () {
      if (DO.state && DO.state.disposed) return;
      if (DO.state.targetTimer) return;
      DO.state.targetTimer = setTimeout(function () {
        if (DO.state && DO.state.disposed) return;
        DO.state.targetTimer = 0;
        DO.editor.getCurrentParagraphText(function (paraText) {
          if (DO.state && DO.state.disposed) return;
          var token = extractLastToken(paraText || "");
          if (token && token !== DO.state.lastToken) {
            DO.state.lastToken = token;
            DO.debugLog("token_detected", { token: token });
          }
        });
      }, 250);
    });

    // When content/selection changes, schedule a check (reduces reliance on polling)
    function scheduleRecheck() {
      if (DO.state && DO.state.disposed) return;
      if (DO.state._ihRecheckTimer) return;
      DO.state._ihRecheckTimer = setTimeout(function () {
        DO.state._ihRecheckTimer = 0;
        try {
          DO.editor.getCurrentParagraphText(function (paraText) {
            if (DO.state && DO.state.disposed) return;
            var paraStr = String(paraText || "");
            var token = extractLastToken(paraStr);
            if (token && token !== DO.state.lastToken) {
              DO.state.lastToken = token;
              DO.debugLog("token_detected", { token: token, via: "event" });
            }
            // Update lastParaText for diff-based typing detection to reduce false "bulk" diffs
            DO.state.lastParaText = paraStr;
            DO.state._ihHasContentEvents = true;
          });
        } catch (e0) {}
      }, 120);
    }

    attach("onDocumentContentChanged", scheduleRecheck);
    attach("onSelectionChanged", scheduleRecheck);
    attach("onChangeSelection", scheduleRecheck);

    try {
      DO.debugLog("events_attached", { mode: attachMode || "none" });
    } catch (eDbg) {}

    // Extra fallback: poll current paragraph (covers cases where events don't fire on typing)
    try {
      if (!DO.state.inputPollTimer) {
        DO.state._pollTick = 0;
        DO.state._pollEmpty = 0;
        DO.state._pollFastUntil = 0;
        DO.state._pollLastTypingLogAt = 0;

        function scheduleNext(delayMs) {
          try {
            if (DO.state.inputPollTimer) clearTimeout(DO.state.inputPollTimer);
          } catch (e0) {}
          DO.state.inputPollTimer = setTimeout(pollOnce, Math.max(120, Number(delayMs || 0) || 0));
        }

        function pollOnce() {
          if (DO.state && DO.state.disposed) return;
          try {
            DO.editor.getCurrentParagraphText(function (paraText) {
              if (DO.state && DO.state.disposed) return;
              DO.state._pollTick = (DO.state._pollTick || 0) + 1;
              var paraStr = String(paraText || "");
              if (!paraStr) DO.state._pollEmpty = (DO.state._pollEmpty || 0) + 1;

              // periodic heartbeat to prove we can read paragraph text
              if ((DO.state._pollTick || 0) % HEARTBEAT_EVERY_TICKS === 0) {
                try {
                  DO.debugLog("para_poll_heartbeat", {
                    tick: DO.state._pollTick,
                    paraLen: paraStr.length,
                    emptyCount: DO.state._pollEmpty || 0,
                  });
                } catch (eHb) {}
              }

              // Detect typing / changes (best-effort by diffing current paragraph text)
              try {
                var now = Date.now();
                // Skip immediate window after programmatic insert to reduce noisy logs
                var lastInsertAt = DO.state.lastInsertAt || 0;
                if (lastInsertAt && now - lastInsertAt < 250) {
                  DO.state.lastParaText = paraStr;
                } else {
                  var prev = DO.state.lastParaText;
                  var next = paraStr;
                  if (prev === undefined) {
                    DO.state.lastParaText = next;
                  } else if (prev !== next) {
                    var d = diffText(prev, next);
                    DO.state.lastParaText = next;
                    if (d) {
                      // Adaptive poll: speed up shortly after change, but throttle logs.
                      DO.state._pollFastUntil = now + 2500;
                      var lastTL = DO.state._pollLastTypingLogAt || 0;
                      // If content-change events exist, rely less on poll for typing logs
                      if (!DO.state._ihHasContentEvents && (!lastTL || now - lastTL > TYPING_LOG_THROTTLE_MS)) {
                        // Dedupe by signature to avoid repeated same diff logs
                        var sig =
                          String(d.start) +
                          "|" +
                          String((d.inserted || "").length) +
                          "|" +
                          String((d.removed || "").length) +
                          "|" +
                          String(d.inserted || "").slice(0, 8) +
                          "|" +
                          String(d.removed || "").slice(0, 8);
                        if (DO.state._pollLastDiffSig !== sig) {
                          DO.state._pollLastDiffSig = sig;
                          DO.state._pollLastTypingLogAt = now;

                          // Ignore huge diffs (paste/replace) to reduce noise
                          var insLen = (d.inserted || "").length;
                          var remLen = (d.removed || "").length;
                          if (insLen <= 3 && remLen <= 3) {
                            if (insLen) {
                              DO.debugLog("typing_detected", {
                                insertedLen: insLen,
                                insertedPreview: String(d.inserted).slice(0, 60),
                                start: d.start,
                                removedLen: remLen,
                              });
                            } else if (remLen) {
                              DO.debugLog("delete_detected", { removedLen: remLen, start: d.start });
                            }
                          }
                        }
                      }
                    }
                  }
                }
              } catch (eTyping) {}

              var token = extractLastToken(paraText || "");
              if (token && token !== DO.state.lastToken) {
                DO.state.lastToken = token;
                DO.debugLog("token_detected", { token: token, via: "poll" });
              }
            });
          } catch (e0) {}
          // schedule next (fast right after edits, slow otherwise)
          if (DO.state && DO.state.disposed) return;
          var now2 = Date.now();
          var fastUntil = DO.state._pollFastUntil || 0;
          // If we have content-change events, keep polling very slow as a safety net
          var delay = DO.state._ihHasContentEvents ? 2500 : now2 < fastUntil ? 350 : 1100;
          scheduleNext(delay);
        }

        // start
        scheduleNext(600);
        DO.debugLog("token_poll_started", { intervalMs: "adaptive(350-1100)" });
      }
    } catch (e2) {}

    // expose disposer so bootstrap can call it on close
    DO.features.inputhelper.dispose = dispose;
  }

  DO.features.inputhelper = {
    attachEvents: attachEvents,
    updateSuggestions: updateSuggestions,
  };
})();

