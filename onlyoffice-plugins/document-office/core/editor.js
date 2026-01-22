// Editor bridge: executeMethod + callCommand helpers
(function () {
  var DO = (window.DO = window.DO || {});

  DO.editor = DO.editor || {};

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

    // Best-effort focus (helps in some builds)
    try {
      exec("SetFocusToEditor", []);
    } catch (e3) {}

    // IMPORTANT: Do not call multiple insert methods in a row (will duplicate text).
    // Prefer PasteText; fallback to callCommand if executeMethod is not available.
    if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
      try {
        exec("PasteText", [t]);
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

    try {
      DO.debugLog("insert_failed", { reason: "no_supported_method", len: t.length });
    } catch (e7) {}
    DO.setOutput({ ok: false, error: "Insert failed: executeMethod/callCommand unavailable" });
  };

  function canCallCommand() {
    try {
      return Boolean(window.Asc && window.Asc.plugin && typeof window.Asc.plugin.callCommand === "function");
    } catch (e) {
      return false;
    }
  }

  DO.editor.appendToDocumentEnd = function (text, opts) {
    var t = String(text || "");
    if (!t) return;
    opts = opts || {};
    var forceNewParagraph = opts.forceNewParagraph !== false; // default: true

    // Best-effort: guaranteed "end of document" insertion
    if (canCallCommand()) {
      try {
        window.Asc.scope = window.Asc.scope || {};
        window.Asc.scope.__do_append_text = t;
        window.Asc.scope.__do_append_newpara = forceNewParagraph ? 1 : 0;
        window.Asc.plugin.callCommand(
          function () {
            try {
              var doc = Api.GetDocument();
              var body = doc && doc.GetBody ? doc.GetBody() : null;
              if (!body) return;

              var txt = Asc.scope.__do_append_text || "";
              var newPara = Asc.scope.__do_append_newpara ? true : false;

              // Append at end by creating a new paragraph (safe, predictable)
              if (newPara) {
                var p = body.AddParagraph();
                p.AddText(txt);
              } else {
                // Try append to last paragraph if API exists, else fallback to new paragraph
                var last = null;
                try {
                  if (body.GetLastParagraph) last = body.GetLastParagraph();
                } catch (e0) {}
                if (last && last.AddText) last.AddText(txt);
                else {
                  var p2 = body.AddParagraph();
                  p2.AddText(txt);
                }
              }
            } catch (e) {}
          },
          false,
          true
        );
        return;
      } catch (e1) {
        try {
          DO.debugLog("appendToEnd_callCommand_failed", { error: String(e1) });
        } catch (e2) {}
      }
    }

    // Fallback: cannot guarantee end; inserts at cursor
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

