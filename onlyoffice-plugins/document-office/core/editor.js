// Editor bridge: executeMethod + callCommand helpers
(function () {
  var DO = (window.DO = window.DO || {});

  DO.editor = DO.editor || {};

  function exec(name, params, cb) {
    try {
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
        var ok = window.Asc.plugin.executeMethod(name, params || [], cb);
        if (ok !== true) {
          try {
            DO.debugLog("executeMethod_not_supported", { name: name, ok: ok });
          } catch (e0) {}
        }
        return ok === true;
      }
    } catch (e) {
      try {
        DO.debugLog("executeMethod_failed", { name: name, error: String(e) });
      } catch (e2) {}
    }
    return false;
  }

  DO.editor.insertText = function (text) {
    var t = String(text || "");
    if (!t) return;
    // NOTE: Try executeMethod first. In real usage, callCommand may "succeed" but
    // fail silently depending on editor state/selection, and we would never reach PasteText.
    // PasteText: insert at cursor / replace selection
    if (exec("PasteText", [t])) {
      try {
        DO.state = DO.state || {};
        DO.state.lastInsertAt = Date.now();
        DO.debugLog("insert_ok", { via: "PasteText", len: t.length });
      } catch (e0) {}
      return;
    }
    // InputText: insert at cursor (fallback)
    if (exec("InputText", [t])) {
      try {
        DO.state = DO.state || {};
        DO.state.lastInsertAt = Date.now();
        DO.debugLog("insert_ok", { via: "InputText", len: t.length });
      } catch (e1) {}
      return;
    }

    // Last resort: callCommand (macro API)
    if (canCallCommand()) {
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
              // Insert at current cursor position (do not pass extra args for compatibility)
              doc.InsertContent([p]);
            } catch (e) {}
          },
          false,
          true
        );
        try {
          DO.state = DO.state || {};
          DO.state.lastInsertAt = Date.now();
          DO.debugLog("insert_ok", { via: "callCommand", len: t.length });
        } catch (e2) {}
        return;
      } catch (e3) {
        try {
          DO.debugLog("insert_callCommand_failed", { error: String(e3) });
        } catch (e4) {}
      }
    }

    try {
      DO.debugLog("insert_failed", { reason: "no_supported_method", len: t.length });
    } catch (e5) {}
    DO.setOutput({ ok: false, error: "Cannot insert: PasteText/InputText/callCommand unavailable" });
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
    exec("GetSelectedText", [], function (text) {
      try {
        cb && cb(text || "");
      } catch (e) {}
    });
  };

  DO.editor.getCurrentParagraphText = function (cb) {
    exec("GetCurrentParagraph", [], function (p) {
      var text = "";
      try {
        if (p && p.GetText) text = p.GetText() || "";
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

