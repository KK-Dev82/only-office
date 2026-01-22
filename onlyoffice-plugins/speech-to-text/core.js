// Core utilities for Speech To Text plugin
(function () {
  var STT = (window.STT = window.STT || {});

  STT.VERSION = "0.1.0";

  // Helper functions
  STT.$ = function (id) {
    return document.getElementById(id);
  };

  STT.setText = function (id, text) {
    var el = STT.$(id);
    if (el) el.textContent = String(text || "");
  };

  STT.setStatus = function (text) {
    STT.setText("status", text || "Ready");
  };

  STT.setRecognitionStatus = function (text) {
    STT.setText("recognitionStatus", text || "ไม่มีการฟัง");
  };

  // Editor functions - using callCommand (works within plugin)
  STT.insertText = function (text) {
    var t = String(text || "").trim();
    if (!t) return false;

    try {
      if (!window.Asc || !window.Asc.plugin || typeof window.Asc.plugin.callCommand !== "function") {
        console.warn("[STT] callCommand not available");
        return false;
      }

      window.Asc.scope = window.Asc.scope || {};
      window.Asc.scope.__stt_text = t;

      window.Asc.plugin.callCommand(
        function () {
          try {
            var doc = Api.GetDocument();
            if (!doc) return;
            var text = Asc.scope.__stt_text || "";
            if (doc.InsertText && typeof doc.InsertText === "function") {
              doc.InsertText(text);
            } else {
              var p = Api.CreateParagraph();
              p.AddText(text);
              doc.InsertContent([p]);
            }
          } catch (e) {
            console.error("[STT] insertText error:", e);
          }
        },
        false, // isClose
        true   // isCalc
      );
      return true;
    } catch (e) {
      console.error("[STT] insertText failed:", e);
      return false;
    }
  };

  STT.appendToDocumentEnd = function (text) {
    var t = String(text || "").trim();
    if (!t) return false;

    try {
      if (!window.Asc || !window.Asc.plugin || typeof window.Asc.plugin.callCommand !== "function") {
        console.warn("[STT] callCommand not available");
        return false;
      }

      window.Asc.scope = window.Asc.scope || {};
      window.Asc.scope.__stt_append_text = t;

      window.Asc.plugin.callCommand(
        function () {
          try {
            var doc = Api.GetDocument();
            if (!doc) return;
            var body = doc.GetBody ? doc.GetBody() : null;
            if (!body) {
              // Fallback: use InsertContent
              var p = Api.CreateParagraph();
              p.AddText(Asc.scope.__stt_append_text || "");
              doc.InsertContent([p]);
              return;
            }

            var txt = Asc.scope.__stt_append_text || "";
            var p = body.AddParagraph();
            if (p && p.AddText) {
              p.AddText(txt);
            } else {
              // Fallback
              doc.InsertContent([Api.CreateParagraph().AddText(txt)]);
            }
          } catch (e) {
            console.error("[STT] appendToDocumentEnd error:", e);
          }
        },
        false, // isClose
        true   // isCalc
      );
      return true;
    } catch (e) {
      console.error("[STT] appendToDocumentEnd failed:", e);
      return false;
    }
  };

  // Export
  window.STT = STT;
})();
