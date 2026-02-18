// Insert Text Bridge: รับ do:command insertText/appendToEnd จาก host (ไม่แสดง Panel)
(function () {
  var ITB = (window.ITB = window.ITB || {});

  function replyOk(id, result) {
    try {
      return ITB.sendToHost({ type: "do:response", id: String(id), ok: true, result: result }) === true;
    } catch (e) {}
    return false;
  }

  function replyErr(id, error) {
    try {
      return ITB.sendToHost({ type: "do:response", id: String(id), ok: false, error: String(error || "Unknown error") }) === true;
    } catch (e) {}
    return false;
  }

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  window.Asc.plugin.onExternalPluginMessage = function (msg) {
    try {
      if (typeof console !== "undefined" && console.info) {
        console.info("[InsertTextBridge] onExternalPluginMessage received", msg ? JSON.stringify(msg).slice(0, 200) : msg);
      }
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "do:command" && msg.id && msg.command) {
        var id = String(msg.id);
        var cmd = String(msg.command);
        var payload = msg.payload;

        if (cmd === "insertText") {
          try {
            ITB.editor.insertText((payload && payload.text) || "");
          } catch (e) {
            replyErr(id, String(e));
            return;
          }
          replyOk(id, true);
          return;
        }

        if (cmd === "appendToEnd") {
          try {
            ITB.editor.appendToDocumentEnd((payload && payload.text) || "", { forceNewParagraph: true });
          } catch (e) {
            replyErr(id, "Insert failed: " + String(e));
            return;
          }
          replyOk(id, true);
          return;
        }

        // pasteText: รับข้อความดิบ (หรือ html ถ้า payload มี) → processPasteContent (HTML→plain, ZWSP ไทย) แล้วแทรก
        if (cmd === "pasteText") {
          try {
            if (typeof console !== "undefined" && console.info) {
              console.info("[InsertTextBridge] Plugin รับคำสั่ง pasteText หลัง detect paste/Ctrl+V", {
                hasText: Boolean((payload && payload.text) != null),
                hasHtml: Boolean((payload && payload.html) != null),
              });
            }
            var rawText = (payload && payload.text) != null ? String(payload.text) : "";
            var rawHtml = (payload && payload.html) != null ? String(payload.html) : "";
            var thaiWordBoundary = (payload && payload.thaiWordBoundary) === "space" ? "space" : "zwsp";
            var formatted =
              ITB.editor.processPasteContent &&
              (rawText || rawHtml)
                ? ITB.editor.processPasteContent({
                    text: rawText || undefined,
                    html: rawHtml || undefined,
                    preserveParagraphs: true,
                    useThaiWordBreaks: true,
                    thaiWordBoundary: thaiWordBoundary,
                  })
                : ITB.editor.formatPasteText
                  ? ITB.editor.formatPasteText(rawText)
                  : rawText;
            ITB.editor.insertText(formatted, thaiWordBoundary === "space" ? { skipNormalize: true } : undefined);
            if (typeof console !== "undefined" && console.info) {
              console.info("[InsertTextBridge] Plugin pasteText ทำแล้ว — แทรกข้อความที่จัดรูปแบบ (" + thaiWordBoundary + ") เข้าเอกสารแล้ว", {
                formattedLen: (formatted && formatted.length) || 0,
                thaiWordBoundary: thaiWordBoundary,
              });
            }
          } catch (e) {
            replyErr(id, "Paste format failed: " + String(e));
            return;
          }
          replyOk(id, true);
          return;
        }

        replyErr(id, "Unknown command: " + cmd);
      }
    } catch (e) {
      try {
        if (msg && msg.id) replyErr(String(msg.id), String(e));
      } catch (e2) {}
    }
  };
})();
