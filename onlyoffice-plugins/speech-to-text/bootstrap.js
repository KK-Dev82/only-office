// Bootstrap for Speech To Text plugin
(function () {
  var STT = (window.STT = window.STT || {});

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  function bindUI() {
    var btnStart = STT.$("btnStart");
    var btnStop = STT.$("btnStop");
    var btnClear = STT.$("btnClear");
    var btnInsert = STT.$("btnInsert");
    var btnAppend = STT.$("btnAppend");

    if (btnStart) {
      btnStart.addEventListener("click", function () {
        STT.startListening();
      });
    }

    if (btnStop) {
      btnStop.addEventListener("click", function () {
        STT.stopListening();
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", function () {
        STT.clearText();
      });
    }

    if (btnInsert) {
      btnInsert.addEventListener("click", function () {
        var textOutput = STT.$("textOutput");
        var text = textOutput ? textOutput.value.trim() : "";
        if (text) {
          if (STT.insertText(text)) {
            STT.setStatus("Insert สำเร็จ");
            STT.clearText();
          } else {
            STT.setStatus("Insert ล้มเหลว");
          }
        }
      });
    }

    if (btnAppend) {
      btnAppend.addEventListener("click", function () {
        var textOutput = STT.$("textOutput");
        var text = textOutput ? textOutput.value.trim() : "";
        if (text) {
          if (STT.appendToDocumentEnd(text)) {
            STT.setStatus("Append สำเร็จ");
            STT.clearText();
          } else {
            STT.setStatus("Append ล้มเหลว");
          }
        }
      });
    }
  }

  window.Asc.plugin.init = function () {
    try {
      STT.setStatus("Ready");
      STT.setRecognitionStatus("พร้อม");
      bindUI();

      // Check if callCommand is available
      var hasCallCommand = window.Asc && window.Asc.plugin && typeof window.Asc.plugin.callCommand === "function";
      if (!hasCallCommand) {
        STT.setStatus("⚠️ callCommand ไม่พร้อมใช้งาน (อาจเป็น Community License)");
        console.warn("[STT] callCommand not available - text insertion may not work");
      }

      console.log("[STT] Plugin initialized", { version: STT.VERSION, hasCallCommand: hasCallCommand });
    } catch (e) {
      console.error("[STT] Init error:", e);
      STT.setStatus("เกิดข้อผิดพลาดในการเริ่มต้น");
    }
  };

  // Defensive: if init isn't called, still bind UI
  try {
    document.addEventListener("DOMContentLoaded", function () {
      try {
        bindUI();
      } catch (e) {}

      setTimeout(function () {
        try {
          if (!window.Asc || !window.Asc.plugin || typeof window.Asc.plugin.init === "function") {
            window.Asc.plugin.init();
          }
        } catch (e2) {}
      }, 50);
    });
  } catch (e) {}
})();
