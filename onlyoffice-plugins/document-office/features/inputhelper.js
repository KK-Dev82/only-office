// Input helper + keyboard detection fallback
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};

  var PLUGIN_GUID = "asc.{C6A86F5A-5A0F-49F8-9E72-9E8E1E2F86A1}";

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
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
        window.Asc.plugin.executeMethod("ShowInputHelper", [PLUGIN_GUID, 80, 40, Boolean(isKeyboardTake)]);
      }
    } catch (e) {}
  }

  function hideHelper() {
    try {
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
        window.Asc.plugin.executeMethod("UnShowInputHelper", [PLUGIN_GUID, true]);
      }
    } catch (e) {}
  }

  function setItems(items) {
    try {
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.getInputHelper) {
        var ih = window.Asc.plugin.getInputHelper();
        if (ih && ih.setItems) ih.setItems(items);
      }
    } catch (e) {}
  }

  function updateSuggestions(query) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) return;

    var list = [];
    var seen = {};

    // abbreviation
    var abbr = DO.store.abbreviations || [];
    for (var i = 0; i < abbr.length && list.length < 5; i++) {
      var s = String(abbr[i].shortForm || "").trim();
      var f = String(abbr[i].fullForm || "").trim();
      if (!s && !f) continue;
      if (s.toLowerCase().indexOf(q) === 0 || f.toLowerCase().indexOf(q) === 0) {
        var val = f || s;
        var key = "abbr:" + val;
        if (!seen[key]) {
          seen[key] = true;
          list.push({ text: val, value: val });
        }
      }
    }

    // dictionary (local)
    var dict = DO.store.dictionary || [];
    for (var di = 0; di < dict.length && list.length < 5; di++) {
      var dw = String(dict[di].word || dict[di].Word || "").trim();
      if (!dw) continue;
      if (dw.toLowerCase().indexOf(q) === 0) {
        var k2 = "dict:" + dw;
        if (!seen[k2]) {
          seen[k2] = true;
          list.push({ text: dw, value: dw });
        }
      }
    }

    // clipboard
    var clips = DO.store.clipboard || [];
    for (var ci = 0; ci < clips.length && list.length < 5; ci++) {
      var t = String(clips[ci].text || "").trim();
      if (!t) continue;
      if (t.toLowerCase().indexOf(q) === 0) {
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
      DO.debugLog("inputHelper_items", { count: 0 });
      return;
    }

    // Show helper only when we actually have items.
    // Do NOT take keyboard here; typing detection comes from document polling.
    showHelper(false);
    setItems(list);
    DO.debugLog("inputHelper_items", { count: list.length });
  }

  function attachEvents() {
    if (!window.Asc || !window.Asc.plugin) return;

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
        // Hide helper when editor asks to clear suggestions.
        hideHelper();
        DO.debugLog("inputHelper_clear");
      } catch (e) {}
    });

    attach("onInputHelperItemClick", function (data) {
      try {
        var value = "";
        if (typeof data === "string") value = data;
        else if (data && typeof data.text === "string") value = data.text;
        else if (data && typeof data.value === "string") value = data.value;
        else if (data && data.item && typeof data.item.text === "string") value = data.item.text;
        if (value) {
          DO.editor.insertText(value);
        }
      } catch (e) {}
    });

    // Fallback: onTargetPositionChanged → throttle → read paragraph → detect token
    attach("onTargetPositionChanged", function () {
      if (DO.state.targetTimer) return;
      DO.state.targetTimer = setTimeout(function () {
        DO.state.targetTimer = 0;
        DO.editor.getCurrentParagraphText(function (paraText) {
          var token = extractLastToken(paraText || "");
          if (token && token !== DO.state.lastToken) {
            DO.state.lastToken = token;
            DO.debugLog("token_detected", { token: token });
            updateSuggestions(token);
          }
        });
      }, 250);
    });

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
          try {
            DO.editor.getCurrentParagraphText(function (paraText) {
              DO.state._pollTick = (DO.state._pollTick || 0) + 1;
              var paraStr = String(paraText || "");
              if (!paraStr) DO.state._pollEmpty = (DO.state._pollEmpty || 0) + 1;

              // periodic heartbeat to prove we can read paragraph text
              if ((DO.state._pollTick || 0) % 25 === 0) {
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
                      if (!lastTL || now - lastTL > 900) {
                        DO.state._pollLastTypingLogAt = now;
                        if (d.inserted && d.inserted.length) {
                          DO.debugLog("typing_detected", {
                            insertedLen: d.inserted.length,
                            insertedPreview: String(d.inserted).slice(0, 60),
                            start: d.start,
                            removedLen: (d.removed || "").length,
                          });
                        } else if (d.removed && d.removed.length) {
                          DO.debugLog("delete_detected", { removedLen: d.removed.length, start: d.start });
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
                updateSuggestions(token);
              }
            });
          } catch (e0) {}
          // schedule next (fast right after edits, slow otherwise)
          var now2 = Date.now();
          var fastUntil = DO.state._pollFastUntil || 0;
          var delay = now2 < fastUntil ? 350 : 1100;
          scheduleNext(delay);
        }

        // start
        scheduleNext(600);
        DO.debugLog("token_poll_started", { intervalMs: "adaptive(350-1100)" });
      }
    } catch (e2) {}
  }

  DO.features.inputhelper = {
    attachEvents: attachEvents,
    updateSuggestions: updateSuggestions,
  };
})();

