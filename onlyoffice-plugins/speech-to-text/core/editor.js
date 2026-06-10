// Editor bridge: executeMethod + callCommand helpers
(function () {
  var DO = (window.DO = window.DO || {});

  DO.editor = DO.editor || {};

  // Called right after inserting from a Panel. Two jobs:
  //  1) Synchronously blur the panel control that was just clicked (the "Insert" button).
  //     The Insert action is a real <button>, so after a mouse click it keeps keyboard
  //     focus — then pressing SPACE/ENTER re-activates it and inserts the word again.
  //     Blurring it kills that "insert repeats on space" bug immediately, with no
  //     dependency on any async editor callback.
  //  2) Ask the editor to take keyboard focus so the caret (already placed right after
  //     the inserted text by PasteText) is active and the user can keep typing.
  //     "FocusEditor" is the real OnlyOffice method (calls g_inputContext.HtmlArea.focus);
  //     the old "SetFocusToEditor" name does not exist and silently did nothing.
  //     Deferred so it runs after PasteText has finished (plugin message channel free).
  DO.editor.focusEditor = function () {
    try {
      var ae = document.activeElement;
      if (ae && ae !== document.body && typeof ae.blur === "function") ae.blur();
    } catch (eB) {}
    // Synchronously move keyboard focus to the editor's input surface. This MUST run
    // inside the click's user-activation, so reach the editor frame via same-origin DOM
    // and focus it directly. The async executeMethod("FocusEditor") loses the activation
    // across postMessage and does NOT move focus across the iframe boundary in this build.
    // The editor's keyboard input element has id "area_id"; it lives in the editor frame,
    // which is a parent of this plugin iframe (all served from the same origin).
    try {
      var win = window;
      for (var i = 0; i < 8; i++) {
        var edoc = null;
        try { edoc = win.document; } catch (eDoc) { edoc = null; }
        if (edoc) {
          var el = edoc.getElementById("area_id");
          if (el && typeof el.focus === "function") {
            // Switch the browser's focused FRAME to the editor frame first (window.focus),
            // THEN focus the input element inside it. Focusing only the element makes it
            // the editor document's activeElement but does not move frame-focus out of
            // this plugin iframe, so keystrokes never reach the editor.
            try { if (win.focus) win.focus(); } catch (eWf) {}
            try { el.focus({ preventScroll: true }); } catch (eFc) { try { el.focus(); } catch (eFc2) {} }
            break;
          }
        }
        if (!win.parent || win.parent === win) break;
        win = win.parent;
      }
    } catch (eDom) {}
    // Best-effort fallback for builds where #area_id is unavailable.
    try {
      if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
        window.Asc.plugin.executeMethod("FocusEditor", []);
      }
    } catch (eM) {}
  };

  function exec(name, params, cb) {
    try {
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
        // NOTE:
        // - executeMethod return value is not reliable across builds (we've seen `false` even when it works).
        // - Treat presence of executeMethod as "supported" and rely on callbacks/timeouts for verification.
        window.Asc.plugin.executeMethod(name, params || [], cb);
        return true;
      }
    } catch (e) {
      try {
        DO.debugLog("executeMethod_failed", { name: name, error: String(e) });
      } catch (e2) {}
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

  function execWithTimeout(name, params, timeoutMs, cb) {
    var done = false;
    var tId = 0;
    function finish(v) {
      if (done) return;
      done = true;
      try {
        if (tId) clearTimeout(tId);
      } catch (e0) {}
      try {
        cb && cb(v);
      } catch (e1) {}
    }
    try {
      tId = setTimeout(function () {
        finish(undefined);
      }, Math.max(0, Number(timeoutMs || 0) || 0));
    } catch (e2) {}

    try {
      exec(name, params || [], function (v) {
        finish(v);
      });
    } catch (e3) {
      finish(undefined);
    }
  }

  // Reliable way to read current paragraph text:
  // - executeMethod("GetCurrentParagraph") is not supported on some builds / returns empty
  // - callCommand + ApiParagraph.GetRange().GetText works across more versions
  function getCurrentParagraphTextViaCallCommand(cb) {
    if (!canCallCommand()) {
      try {
        cb && cb("");
      } catch (e0) {}
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
          } catch (e1) {}
        }
      );
    } catch (e2) {
      try {
        cb && cb("");
      } catch (e3) {}
    }
  }

  DO.editor.insertText = function (text) {
    var t = String(text || "");
    if (!t) return;
    DO.state = DO.state || {};
    DO.state.lastInsertAt = Date.now();

    function callCommandInsert() {
      if (!canCallCommand()) return false;
      try {
        window.Asc.scope = window.Asc.scope || {};
        window.Asc.scope.__do_insert_text = t;
        window.Asc.plugin.callCommand(
          function () {
            try {
              var s = Asc.scope.__do_insert_text || "";
              var doc = Api.GetDocument();
              if (doc && typeof doc.InsertText === "function") {
                doc.InsertText(s);
                return;
              }
              var p = Api.CreateParagraph();
              p.AddText(s);
              doc.InsertContent([p]);
            } catch (e) {}
          },
          false,
          true
        );
        DO.editor.focusEditor();
        try {
          DO.debugLog("insert_ok", { via: "callCommand", len: t.length });
        } catch (e0) {}
        return true;
      } catch (e1) {
        try {
          DO.debugLog("insert_callCommand_failed", { error: String(e1) });
        } catch (e2) {}
        return false;
      }
    }

    // IMPORTANT: Do not call multiple insert methods in a row (will duplicate text).
    // Prefer PasteText; fallback to callCommand if executeMethod is not available.
    // Focus is returned to the editor from PasteText's completion callback, so the
    // plugin message channel is free (avoids the "previous method not finished" drop)
    // and the caret lands right after the inserted text.
    if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
      try {
        exec("PasteText", [t]);
        DO.editor.focusEditor();
        try {
          DO.debugLog("insert_ok", { via: "PasteText", len: t.length });
        } catch (e4) {}
        return;
      } catch (e5) {
        try {
          DO.debugLog("insert_paste_failed", { error: String(e5) });
        } catch (e6) {}
      }
    }

    if (callCommandInsert()) return;

    // Final fallback: Try using InsertText API directly if available
    // This might work even when callCommand is not available
    try {
      if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
        // Try InsertText method as last resort
        exec("InsertText", [t]);
        DO.editor.focusEditor();
        try {
          DO.debugLog("insert_ok", { via: "InsertText", len: t.length });
        } catch (e8) {}
        return;
      }
    } catch (e9) {
      try {
        DO.debugLog("insert_insertText_failed", { error: String(e9) });
      } catch (e10) {}
    }

    try {
      DO.debugLog("insert_failed", { reason: "no_supported_method", len: t.length });
      // eslint-disable-next-line no-console
      console.warn("[DocumentOfficePlugin] insertText failed - no supported method available", {
        hasExecuteMethod: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) === "function",
        hasCallCommand: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.callCommand) === "function",
      });
    } catch (e7) {}
    DO.setOutput({ ok: false, error: "Insert failed: executeMethod/callCommand unavailable" });
  };

  DO.editor.appendToDocumentEnd = function (text, opts) {
    var t = String(text || "");
    if (!t) {
      try {
        DO.debugLog("appendToEnd_empty_text");
      } catch (e0) {}
      return;
    }
    opts = opts || {};
    var forceNewParagraph = opts.forceNewParagraph !== false; // default: true

    try {
      DO.debugLog("appendToEnd_start", { len: t.length, forceNewPara: forceNewParagraph });
    } catch (e0) {}

    // Best-effort: guaranteed "end of document" insertion
    // Following OnlyOffice plugin examples pattern using callCommand
    if (canCallCommand()) {
      try {
        DO.debugLog("appendToEnd_using_callCommand");
      } catch (e0) {}
      try {
        window.Asc.scope = window.Asc.scope || {};
        window.Asc.scope.__do_append_text = t;
        window.Asc.scope.__do_append_newpara = forceNewParagraph ? 1 : 0;
        window.Asc.plugin.callCommand(
          function () {
            try {
              var doc = Api.GetDocument();
              if (!doc) return;
              
              var body = doc.GetBody ? doc.GetBody() : null;
              if (!body) {
                // Fallback: use InsertContent if GetBody not available
                var p = Api.CreateParagraph();
                p.AddText(Asc.scope.__do_append_text || "");
                doc.InsertContent([p]);
                return;
              }

              var txt = Asc.scope.__do_append_text || "";
              var newPara = Asc.scope.__do_append_newpara ? true : false;

              // Append at end by creating a new paragraph (safe, predictable)
              // This matches the pattern from OnlyOffice plugin examples
              if (newPara) {
                var p = body.AddParagraph();
                if (p && p.AddText) {
                  p.AddText(txt);
                } else {
                  // Fallback: use InsertContent
                  doc.InsertContent([Api.CreateParagraph().AddText(txt)]);
                }
              } else {
                // Try append to last paragraph if API exists, else fallback to new paragraph
                var last = null;
                try {
                  if (body.GetLastParagraph) last = body.GetLastParagraph();
                } catch (e0) {}
                if (last && last.AddText) {
                  last.AddText(txt);
                } else {
                  var p2 = body.AddParagraph();
                  if (p2 && p2.AddText) {
                    p2.AddText(txt);
                  } else {
                    // Final fallback: use InsertContent
                    doc.InsertContent([Api.CreateParagraph().AddText(txt)]);
                  }
                }
              }
            } catch (e) {
              try {
                // eslint-disable-next-line no-console
                console.error("[DocumentOfficePlugin] appendToEnd error in callCommand", e);
              } catch (eLog) {}
            }
          },
          false, // isClose: don't close plugin
          true   // isCalc: recalculate document
        );
        try {
          DO.debugLog("appendToEnd_ok", { via: "callCommand", len: t.length, newPara: forceNewParagraph });
        } catch (e3) {}
        return;
      } catch (e1) {
        try {
          DO.debugLog("appendToEnd_callCommand_failed", { error: String(e1) });
        } catch (e2) {}
      }
    }

    // Fallback: cannot guarantee end; inserts at cursor
    // This is still better than nothing
    try {
      DO.debugLog("appendToEnd_fallback_to_insertText", { len: t.length });
      // eslint-disable-next-line no-console
      console.warn("[DocumentOfficePlugin] appendToDocumentEnd: callCommand not available, using insertText fallback");
    } catch (e4) {}
    // Use insertText which has multiple fallback mechanisms
    DO.editor.insertText(t);
  };

  DO.editor.getSelectedText = function (cb) {
    execWithTimeout("GetSelectedText", [], 300, function (text) {
      try {
        cb && cb(text || "");
      } catch (e) {}
    });
  };

  DO.editor.getCurrentParagraphText = function (cb) {
    // Prefer callCommand approach for reliability (works even when executeMethod is misleading/unsupported)
    getCurrentParagraphTextViaCallCommand(function (t) {
      if (t && String(t).length) {
        try {
          cb && cb(String(t));
        } catch (e0) {}
        return;
      }
      // Fallback: executeMethod (best-effort)
      execWithTimeout("GetCurrentParagraph", [], 400, function (p) {
        var text = "";
        try {
          if (typeof p === "string") text = p || "";
          else if (p && typeof p.text === "string") text = p.text || "";
          else if (p && p.GetText) text = p.GetText() || "";
        } catch (e) {}
        try {
          cb && cb(text);
        } catch (e2) {}
      });
    });
  };

  DO.editor.replaceSelectionText = function (text) {
    // PasteText handles selection if any
    DO.editor.insertText(text);
  };

  DO.editor.replaceCurrentParagraph = function (text) {
    var t = String(text || "");
    exec("GetCurrentParagraph", [], function (p) {
      try {
        if (p && p.RemoveAllElements) p.RemoveAllElements();
      } catch (e0) {}
      try {
        if (p && p.AddText) {
          p.AddText(t);
          return;
        }
      } catch (e1) {}
      DO.editor.insertText(t);
    });
  };

  DO.editor.getContext = function (mode, cb) {
    mode = String(mode || "paragraph");
    if (mode === "selection") {
      DO.editor.getSelectedText(function (text) {
        try {
          cb && cb({ mode: mode, text: text || "" });
        } catch (e) {}
      });
      return;
    }
    DO.editor.getCurrentParagraphText(function (paraText) {
      try {
        cb && cb({ mode: mode, text: paraText || "" });
      } catch (e2) {}
    });
  };
})();

