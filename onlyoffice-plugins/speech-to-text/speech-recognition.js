// Speech Recognition for Speech To Text plugin
(function () {
  var STT = (window.STT = window.STT || {});

  STT.recognition = null;
  STT.isListening = false;
  STT.currentText = "";

  function updateWordCount(text) {
    try {
      var t = String(text || "").trim();
      var words = t ? t.split(/\s+/).filter(Boolean) : [];
      var el = STT.$("sttWordCount");
      if (el) el.textContent = words.length + " คำ";
    } catch {}
  }

  function initRecognition() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      STT.setStatus("Browser ไม่รองรับ Speech Recognition");
      STT.setRecognitionStatus("ไม่รองรับ");
      return false;
    }

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    STT.recognition = new SpeechRecognition();

    var langSelect = STT.$("langSelect");
    var lang = langSelect ? langSelect.value : "th-TH";
    STT.recognition.lang = lang;
    STT.recognition.continuous = true;
    STT.recognition.interimResults = true;

    STT.recognition.onstart = function () {
      STT.isListening = true;
      STT.setStatus("กำลังฟัง...");
      STT.setRecognitionStatus("กำลังฟัง");
      var btnStart = STT.$("btnStart");
      var btnStop = STT.$("btnStop");
      if (btnStart) btnStart.disabled = true;
      if (btnStop) btnStop.disabled = false;

      var dot = STT.$("sttDot");
      if (dot) dot.classList.remove("isOff");
    };

    STT.recognition.onresult = function (event) {
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
        STT.currentText += finalTranscript;
        var textOutput = STT.$("textOutput");
        if (textOutput) {
          textOutput.value = STT.currentText + interimTranscript;
        }
        STT.updateButtonStates();
        updateWordCount(STT.currentText + interimTranscript);
      } else if (interimTranscript) {
        var textOutput = STT.$("textOutput");
        if (textOutput) {
          textOutput.value = STT.currentText + interimTranscript;
        }
        STT.updateButtonStates();
        updateWordCount(STT.currentText + interimTranscript);
      }
    };

    STT.recognition.onerror = function (event) {
      console.error("[STT] Recognition error:", event.error);
      if (event.error === "no-speech") {
        STT.setStatus("ไม่พบเสียง");
      } else if (event.error === "aborted") {
        STT.setStatus("หยุดการฟัง");
      } else {
        STT.setStatus("เกิดข้อผิดพลาด: " + event.error);
      }
      STT.setRecognitionStatus("เกิดข้อผิดพลาด");
    };

    STT.recognition.onend = function () {
      STT.isListening = false;
      STT.setStatus("หยุดการฟัง");
      STT.setRecognitionStatus("หยุดแล้ว");
      var btnStart = STT.$("btnStart");
      var btnStop = STT.$("btnStop");
      if (btnStart) btnStart.disabled = false;
      if (btnStop) btnStop.disabled = true;

      var dot = STT.$("sttDot");
      if (dot) dot.classList.add("isOff");
    };

    return true;
  }

  STT.startListening = function () {
    if (!STT.recognition) {
      if (!initRecognition()) {
        return false;
      }
    }

    if (STT.isListening) {
      return false;
    }

    try {
      STT.recognition.start();
      return true;
    } catch (e) {
      console.error("[STT] startListening error:", e);
      STT.setStatus("ไม่สามารถเริ่มฟังได้");
      return false;
    }
  };

  STT.stopListening = function () {
    if (!STT.recognition || !STT.isListening) {
      return false;
    }

    try {
      STT.recognition.stop();
      return true;
    } catch (e) {
      console.error("[STT] stopListening error:", e);
      return false;
    }
  };

  STT.clearText = function () {
    STT.currentText = "";
    var textOutput = STT.$("textOutput");
    if (textOutput) {
      textOutput.value = "";
    }
    var btnInsert = STT.$("btnInsert");
    var btnAppend = STT.$("btnAppend");
    if (btnInsert) btnInsert.disabled = true;
    if (btnAppend) btnAppend.disabled = true;
    updateWordCount("");
  };

  STT.updateButtonStates = function () {
    var textOutput = STT.$("textOutput");
    var hasText = textOutput && textOutput.value.trim().length > 0;
    var btnInsert = STT.$("btnInsert");
    var btnAppend = STT.$("btnAppend");
    if (btnInsert) btnInsert.disabled = !hasText;
    if (btnAppend) btnAppend.disabled = !hasText;
  };

  // Update language when changed
  var langSelect = STT.$("langSelect");
  if (langSelect) {
    langSelect.addEventListener("change", function () {
      if (STT.recognition) {
        STT.recognition.lang = langSelect.value;
      }
    });
  }

  // Watch textarea changes
  var textOutput = STT.$("textOutput");
  if (textOutput) {
    textOutput.addEventListener("input", function () {
      STT.currentText = textOutput.value;
      STT.updateButtonStates();
    });
  }

  // Export
  window.STT = STT;
})();
