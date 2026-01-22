// Speech To Text feature (uses Web Speech API + callCommand within plugin)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};

  var recognition = null;
  var isListening = false;
  var currentText = "";

  function initRecognition() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      DO.setStatus("Browser ไม่รองรับ Speech Recognition");
      DO.setText("sttStatus", "ไม่รองรับ");
      return false;
    }

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();

    var langSelect = DO.$("sttLangSelect");
    var lang = langSelect ? langSelect.value : "th-TH";
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = function () {
      isListening = true;
      DO.setStatus("กำลังฟัง...");
      DO.setText("sttStatus", "กำลังฟัง");
      var btnStart = DO.$("sttBtnStart");
      var btnStop = DO.$("sttBtnStop");
      if (btnStart) btnStart.disabled = true;
      if (btnStop) btnStop.disabled = false;
      DO.debugLog("stt_started");
    };

    recognition.onresult = function (event) {
      var interimTranscript = "";
      var finalTranscript = "";

      for (var i = event.resultIndex; i < event.results.length; i++) {
        var transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        currentText += finalTranscript;
        var textOutput = DO.$("sttTextOutput");
        if (textOutput) {
          textOutput.value = currentText + interimTranscript;
        }
        updateButtonStates();
        DO.debugLog("stt_final", { text: finalTranscript.trim() });
      } else if (interimTranscript) {
        var textOutput = DO.$("sttTextOutput");
        if (textOutput) {
          textOutput.value = currentText + interimTranscript;
        }
        updateButtonStates();
      }
    };

    recognition.onerror = function (event) {
      console.error("[DocumentOfficePlugin] STT error:", event.error);
      if (event.error === "no-speech") {
        DO.setStatus("ไม่พบเสียง");
      } else if (event.error === "aborted") {
        DO.setStatus("หยุดการฟัง");
      } else {
        DO.setStatus("เกิดข้อผิดพลาด: " + event.error);
      }
      DO.setText("sttStatus", "เกิดข้อผิดพลาด");
      DO.debugLog("stt_error", { error: event.error });
    };

    recognition.onend = function () {
      isListening = false;
      DO.setStatus("หยุดการฟัง");
      DO.setText("sttStatus", "หยุดแล้ว");
      var btnStart = DO.$("sttBtnStart");
      var btnStop = DO.$("sttBtnStop");
      if (btnStart) btnStart.disabled = false;
      if (btnStop) btnStop.disabled = true;
      DO.debugLog("stt_stopped");
    };

    return true;
  }

  function startListening() {
    if (!recognition) {
      if (!initRecognition()) {
        return false;
      }
    }

    if (isListening) {
      return false;
    }

    try {
      recognition.start();
      return true;
    } catch (e) {
      console.error("[DocumentOfficePlugin] startListening error:", e);
      DO.setStatus("ไม่สามารถเริ่มฟังได้");
      return false;
    }
  }

  function stopListening() {
    if (!recognition || !isListening) {
      return false;
    }

    try {
      recognition.stop();
      return true;
    } catch (e) {
      console.error("[DocumentOfficePlugin] stopListening error:", e);
      return false;
    }
  }

  function clearText() {
    currentText = "";
    var textOutput = DO.$("sttTextOutput");
    if (textOutput) {
      textOutput.value = "";
    }
    updateButtonStates();
    DO.debugLog("stt_cleared");
  }

  function updateButtonStates() {
    var textOutput = DO.$("sttTextOutput");
    var hasText = textOutput && textOutput.value.trim().length > 0;
    var btnInsert = DO.$("sttBtnInsert");
    var btnAppend = DO.$("sttBtnAppend");
    if (btnInsert) btnInsert.disabled = !hasText;
    if (btnAppend) btnAppend.disabled = !hasText;
  }

  function insertText() {
    var textOutput = DO.$("sttTextOutput");
    var text = textOutput ? textOutput.value.trim() : "";
    if (!text) return;

    try {
      if (!window.Asc || !window.Asc.plugin || typeof window.Asc.plugin.callCommand !== "function") {
        DO.setStatus("⚠️ callCommand ไม่พร้อมใช้งาน");
        DO.debugLog("stt_insert_failed", { reason: "no_callCommand" });
        return;
      }

      window.Asc.scope = window.Asc.scope || {};
      window.Asc.scope.__stt_text = text;

      window.Asc.plugin.callCommand(
        function () {
          try {
            var doc = Api.GetDocument();
            if (!doc) return;
            var txt = Asc.scope.__stt_text || "";
            if (doc.InsertText && typeof doc.InsertText === "function") {
              doc.InsertText(txt);
            } else {
              var p = Api.CreateParagraph();
              p.AddText(txt);
              doc.InsertContent([p]);
            }
          } catch (e) {
            console.error("[DocumentOfficePlugin] insertText error:", e);
          }
        },
        false,
        true
      );

      DO.setStatus("Insert สำเร็จ");
      clearText();
      DO.debugLog("stt_insert_ok", { len: text.length });
    } catch (e) {
      console.error("[DocumentOfficePlugin] insertText failed:", e);
      DO.setStatus("Insert ล้มเหลว");
      DO.debugLog("stt_insert_failed", { error: String(e) });
    }
  }

  function appendToDocumentEnd() {
    var textOutput = DO.$("sttTextOutput");
    var text = textOutput ? textOutput.value.trim() : "";
    if (!text) return;

    try {
      if (!window.Asc || !window.Asc.plugin || typeof window.Asc.plugin.callCommand !== "function") {
        DO.setStatus("⚠️ callCommand ไม่พร้อมใช้งาน");
        DO.debugLog("stt_append_failed", { reason: "no_callCommand" });
        return;
      }

      window.Asc.scope = window.Asc.scope || {};
      window.Asc.scope.__stt_append_text = text;

      window.Asc.plugin.callCommand(
        function () {
          try {
            var doc = Api.GetDocument();
            if (!doc) return;
            var body = doc.GetBody ? doc.GetBody() : null;
            if (!body) {
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
              doc.InsertContent([Api.CreateParagraph().AddText(txt)]);
            }
          } catch (e) {
            console.error("[DocumentOfficePlugin] appendToDocumentEnd error:", e);
          }
        },
        false,
        true
      );

      DO.setStatus("Append สำเร็จ");
      clearText();
      DO.debugLog("stt_append_ok", { len: text.length });
    } catch (e) {
      console.error("[DocumentOfficePlugin] appendToDocumentEnd failed:", e);
      DO.setStatus("Append ล้มเหลว");
      DO.debugLog("stt_append_failed", { error: String(e) });
    }
  }

  function bind() {
    var btnStart = DO.$("sttBtnStart");
    var btnStop = DO.$("sttBtnStop");
    var btnClear = DO.$("sttBtnClear");
    var btnInsert = DO.$("sttBtnInsert");
    var btnAppend = DO.$("sttBtnAppend");
    var langSelect = DO.$("sttLangSelect");
    var textOutput = DO.$("sttTextOutput");

    if (btnStart) {
      btnStart.addEventListener("click", function () {
        startListening();
      });
    }

    if (btnStop) {
      btnStop.addEventListener("click", function () {
        stopListening();
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", function () {
        clearText();
      });
    }

    if (btnInsert) {
      btnInsert.addEventListener("click", function () {
        insertText();
      });
    }

    if (btnAppend) {
      btnAppend.addEventListener("click", function () {
        appendToDocumentEnd();
      });
    }

    if (langSelect) {
      langSelect.addEventListener("change", function () {
        if (recognition) {
          recognition.lang = langSelect.value;
        }
      });
    }

    if (textOutput) {
      textOutput.addEventListener("input", function () {
        currentText = textOutput.value;
        updateButtonStates();
      });
    }

    // Initial button states
    updateButtonStates();
  }

  DO.features.speechtotext = {
    bind: bind,
    start: startListening,
    stop: stopListening,
    clear: clearText,
  };
})();
