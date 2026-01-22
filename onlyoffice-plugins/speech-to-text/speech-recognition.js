// Speech Recognition for Speech To Text plugin
(function () {
  var STT = (window.STT = window.STT || {});

  STT.recognition = null;
  STT.isListening = false;
  STT.currentText = "";
  // Insert strategy: like official sample -> insert only FINAL, no accumulation.
  STT._lastFinalSig = STT._lastFinalSig || "";
  STT._lastFinalAt = STT._lastFinalAt || 0;
  // Live append (no waiting for silence):
  // - Append only "new suffix" of a streaming-formatted transcript
  // - Batch/queue flushing to avoid dropping when speaking fast
  STT._prevStreamText = STT._prevStreamText || "";
  STT._queuedAppend = STT._queuedAppend || "";
  STT._inflightAppend = STT._inflightAppend || "";
  STT._flushTimer = STT._flushTimer || 0;
  STT._flushing = STT._flushing || false;
  // Auto append: default on (ไม่ต้องกดปุ่มส่งเอง)
  STT.autoAppendEnabled = STT.autoAppendEnabled !== false;
  STT._lastAutoAppendSig = STT._lastAutoAppendSig || "";
  STT._lastAutoAppendAt = STT._lastAutoAppendAt || 0;

  function getSelectedLang() {
    try {
      var langSelect = STT.$("langSelect");
      return String((langSelect && langSelect.value) || "th-TH");
    } catch (e) {
      return "th-TH";
    }
  }

  function normalizeForUi(rawText) {
    // ต้องการ "ไม่มี Space ระหว่างคำ" (โดยเฉพาะภาษาไทยที่ WebSpeech มักใส่เว้นวรรค)
    // - th*: ลบ whitespace ทั้งหมด
    // - อื่นๆ: ลด whitespace ให้เหลือช่องว่างเดียว (กันติดคำในภาษาอังกฤษ)
    var t = String(rawText || "");
    var lang = getSelectedLang().toLowerCase();
    if (lang.indexOf("th") === 0) {
      return t.replace(/\s+/g, "");
    }
    return t.replace(/\s+/g, " ");
  }

  function toThaiDigits(text) {
    var t = String(text || "");
    var thaiDigits = "๐๑๒๓๔๕๖๗๘๙";
    return t.replace(/[0-9]/g, function (d) {
      return thaiDigits.charAt(parseInt(d, 10));
    });
  }

  function ensureSpacesAroundNumbers(text) {
    // ทำให้ตัวเลข "ไม่ติด" กับตัวอักษร เช่น เงิน๑๐๐บาท -> เงิน ๑๐๐ บาท
    // รองรับเลขไทย (๐-๙) และตัวเลขอารบิก (0-9)
    var t = String(text || "");
    // NOTE:
    // - จำกัดการเว้นวรรค "รอบตัวเลข" เฉพาะกรณีตัวอักษรไทย เพื่อไม่ให้ไปทำลาย token อังกฤษ/รหัส เช่น ISO9001
    // Thai letter before number
    t = t.replace(/([\u0E00-\u0E7F])([๐-๙0-9]+)/g, "$1 $2");
    // number before Thai letter
    t = t.replace(/([๐-๙0-9]+)([\u0E00-\u0E7F])/g, "$1 $2");
    // collapse spaces
    t = t.replace(/\s{2,}/g, " ");
    return t;
  }

  function removeSpacesBetweenThaiChars(text) {
    // ลบเว้นวรรคเฉพาะระหว่างตัวอักษรไทย-ไทย เพื่อให้ไทย "ไม่ติด space"
    // แต่ยังคงเว้นวรรคในอังกฤษ/คำผสม เพื่อไม่ให้ prefix streaming สะดุด
    var s = String(text || "");
    // ทำซ้ำจนกว่าจะไม่มี match (รองรับหลายช่องว่าง)
    for (var i = 0; i < 6; i++) {
      var next = s.replace(/([\u0E00-\u0E7F])\s+([\u0E00-\u0E7F])/g, "$1$2");
      if (next === s) break;
      s = next;
    }
    return s;
  }

  function formatForStreaming(rawText) {
    var t = String(rawText || "");
    if (!t.trim()) return "";
    var lang = getSelectedLang().toLowerCase();
    // normalize spaces first
    t = t.replace(/\s+/g, " ").trim();
    // convert digits
    t = toThaiDigits(t);

    // For Thai: make output monotonic-friendly by removing all spaces, then re-inserting
    // only the necessary spaces around number sequences incrementally.
    if (lang.indexOf("th") === 0) {
      // เดิมเรา "ลบ space ทั้งหมด" ทำให้กรณีไทยผสมอังกฤษ (เช่น "วันนี้ meeting online")
      // อาจเกิด prefix mismatch บ่อย แล้วหยุดรอ final
      // แก้: ลบเฉพาะ space ระหว่างตัวอักษรไทย-ไทย เพื่อคง space ของอังกฤษไว้
      t = removeSpacesBetweenThaiChars(t);
      t = ensureSpacesAroundNumbers(t);
      return t.trim();
    }

    // Other languages: keep spaces (collapsed) and ensure number boundaries
    t = ensureSpacesAroundNumbers(t);
    return t.trim();
  }

  function enqueueAppend(text) {
    var s = String(text || "");
    if (!s) return;
    STT._queuedAppend = String(STT._queuedAppend || "") + s;
  }

  function scheduleFlush() {
    try {
      if (STT._flushTimer) return;
      STT._flushTimer = setTimeout(function () {
        STT._flushTimer = 0;
        flushQueue();
      }, 220);
    } catch (e0) {}
  }

  function flushQueue() {
    try {
      if (STT._flushing) return;
      if (!STT.autoAppendEnabled || typeof STT.appendToDocumentEnd !== "function") return;

      var queued = String(STT._queuedAppend || "");
      if (!queued) return;

      STT._flushing = true;
      STT._queuedAppend = "";
      STT._inflightAppend = queued;

      try {
        STT.appendToDocumentEnd(queued, { newParagraph: false, preserveSelection: true });
      } catch (e1) {
        // re-queue on sync error
        STT._queuedAppend = queued + String(STT._queuedAppend || "");
        STT._inflightAppend = "";
      }

      // no ack from callCommand -> assume done after short delay; if more queued, flush again
      setTimeout(function () {
        try {
          STT._inflightAppend = "";
          STT._flushing = false;
          if (String(STT._queuedAppend || "").length) flushQueue();
        } catch (e2) {
          STT._flushing = false;
        }
      }, 260);
    } catch (e0) {
      STT._flushing = false;
    }
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
      // sync toggle state (Panel v2)
      try {
        var tg = STT.$("listenToggle");
        if (tg) tg.checked = true;
      } catch (e0) {}
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

      // Live insert (interim): compute monotonic suffix, enqueue, flush in batches
      try {
        if (STT.autoAppendEnabled && typeof STT.appendToDocumentEnd === "function") {
          var interimFmt = formatForStreaming(String(interimTranscript || "").trim());
          var prev = String(STT._prevStreamText || "");
          if (interimFmt && interimFmt.indexOf(prev) === 0) {
            var suffix = interimFmt.slice(prev.length);
            if (suffix) {
              enqueueAppend(suffix);
              scheduleFlush();
            }
            STT._prevStreamText = interimFmt;
          } else if (interimFmt) {
            // สำคัญ: WebSpeech interim สามารถ "แก้คำก่อนหน้า" โดยเฉพาะตอนสลับไทย/อังกฤษ/ตัวเลข
            // ถ้าเราไม่ resync จะทำให้ prefix mismatch ต่อเนื่องและเหมือนหยุด insert จนกว่าจะได้ final
            // ทางแก้: resync stream state (ไม่ append ในรอบนี้) แล้วให้รอบถัดไป append ต่อได้ทันที
            STT._prevStreamText = interimFmt;
          } else if (!interimFmt) {
            // reset between phrases
            STT._prevStreamText = "";
          }
        }
      } catch (eLive) {}

      try {
        var finalTrim = String(finalTranscript || "").trim();
        var formatted = formatForStreaming(finalTrim);
        // Dedup: WebSpeech อาจยิง final ซ้ำ
        var sig = String(formatted || "").slice(0, 160) + "|" + String(formatted.length);
        var now = Date.now();
        var tooSoon =
          sig &&
          sig === STT._lastFinalSig &&
          now - (STT._lastFinalAt || 0) < 800; // short window

        if (formatted && !tooSoon) {
          STT._lastFinalSig = sig;
          STT._lastFinalAt = now;
          if (STT.autoAppendEnabled && typeof STT.appendToDocumentEnd === "function") {
            // Ensure any queued interim is flushed quickly before final remainder
            flushQueue();

            // Append only remaining suffix (avoid duplication with interim stream)
            var already2 = String(STT._prevStreamText || "");
            if (already2 && formatted.indexOf(already2) === 0) {
              var remain = formatted.slice(already2.length);
              if (remain) {
                enqueueAppend(remain);
                flushQueue();
              }
            } else {
              // fallback: append full final
              enqueueAppend(formatted);
              flushQueue();
            }
          }
          // Reset phrase state for next chunk
          STT._prevStreamText = "";
        }
      } catch (eDedup) {}

      // UI transcript:
      // - ไม่ต้องสะสม: แสดงเฉพาะ interim (preview)
      var uiText2 = normalizeForUi(interimTranscript || "");
      STT.currentText = uiText2;
      STT.renderTranscript(uiText2);
      STT.updateButtonStates();
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
      // sync toggle state (Panel v2)
      try {
        var tg2 = STT.$("listenToggle");
        if (tg2) tg2.checked = false;
      } catch (e0) {}
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
      // บางครั้ง browser โยน InvalidStateError แม้จะเริ่มฟังไปแล้ว (เช่น init ซ้ำ/กดซ้ำเร็ว)
      if (e && String(e.name || "").toLowerCase() === "invalidstateerror") {
        try {
          STT.isListening = true;
          STT.setStatus("กำลังฟัง...");
          STT.setRecognitionStatus("กำลังฟัง");
          var btnStart = STT.$("btnStart");
          var btnStop = STT.$("btnStop");
          if (btnStart) btnStart.disabled = true;
          if (btnStop) btnStop.disabled = false;
          var dot = STT.$("sttDot");
          if (dot) dot.classList.remove("isOff");
        } catch (e2) {}
        return true;
      }
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
      STT._prevStreamText = "";
      STT._queuedAppend = "";
      STT._inflightAppend = "";
      return true;
    } catch (e) {
      console.error("[STT] stopListening error:", e);
      return false;
    }
  };

  STT.clearText = function () {
    STT.currentText = "";
    STT._lastFinalSig = "";
    STT._lastFinalAt = 0;
    STT._prevStreamText = "";
    STT._queuedAppend = "";
    STT._inflightAppend = "";
    STT.renderTranscript("");
    var btnInsert = STT.$("btnInsert");
    var btnAppend = STT.$("btnAppend");
    if (btnInsert) btnInsert.disabled = true;
    if (btnAppend) btnAppend.disabled = true;
  };

  STT.updateButtonStates = function () {
    var hasText = String(STT.getPlainText() || "").trim().length > 0;
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

  // No manual input (transcript is rendered)

  // Export
  window.STT = STT;
})();
