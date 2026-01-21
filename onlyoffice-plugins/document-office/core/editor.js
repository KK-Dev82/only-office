// Editor bridge: avoid callCommand; prefer executeMethod
(function () {
  var DO = (window.DO = window.DO || {});

  DO.editor = DO.editor || {};

  function exec(name, params, cb) {
    try {
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
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

  DO.editor.insertText = function (text) {
    var t = String(text || "");
    if (!t) return;
    // PasteText: insert at cursor / replace selection
    if (exec("PasteText", [t])) return;
    // Fallback: InputText (insert)
    if (exec("InputText", [t])) return;
    DO.setOutput({ ok: false, error: "Cannot insert: PasteText/InputText not available" });
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

