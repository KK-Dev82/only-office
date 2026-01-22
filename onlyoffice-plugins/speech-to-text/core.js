// Core utilities for Speech To Text plugin
(function () {
  var STT = (window.STT = window.STT || {});

  STT.VERSION = "0.2.0";
  STT.HIGHLIGHT_EVERY_WORDS = 20;
  STT.HL_COLORS = ["green", "yellow", "red"];
  STT.strikedGroups = STT.strikedGroups || new Set();
  STT.insertedGroupKeys = STT.insertedGroupKeys || new Set();
  STT.groupTextByIndex = STT.groupTextByIndex || new Map();
  STT.displayText = STT.displayText || "";

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

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function computeSegmentsAndGroups(text) {
    var t = String(text || "");
    var groups = new Map();
    var segments = [];

    var appendGroup = function (idx, segText) {
      if (!segText) return;
      groups.set(idx, (groups.get(idx) || "") + segText);
    };

    try {
      var Segmenter = (Intl && Intl.Segmenter) || null;
      if (typeof Segmenter === "function") {
        var seg = new Segmenter("th", { granularity: "word" });
        var wordIdx = 0;
        var currentGroup = 0;
        for (var it of seg.segment(t)) {
          var segText = String((it && it.segment) || "");
          if (!segText) continue;
          if (it && it.isWordLike) {
            wordIdx += 1;
            currentGroup = Math.floor((wordIdx - 1) / STT.HIGHLIGHT_EVERY_WORDS);
            appendGroup(currentGroup, segText);
            segments.push({ text: segText, isWordLike: true, groupIndex: currentGroup });
          } else {
            if (wordIdx > 0) appendGroup(currentGroup, segText);
            segments.push({ text: segText, isWordLike: false, groupIndex: -1 });
          }
        }
        return { segments: segments, groups: groups, wordCount: wordIdx };
      }
    } catch (e) {}

    // Fallback: whitespace-based
    var tokens = t.split(/(\s+)/);
    var w = 0;
    var g = 0;
    for (var i = 0; i < tokens.length; i++) {
      var s = String(tokens[i] || "");
      if (!s) continue;
      var isSpace = /^\s+$/.test(s);
      if (!isSpace) {
        w += 1;
        g = Math.floor((w - 1) / STT.HIGHLIGHT_EVERY_WORDS);
        appendGroup(g, s);
        segments.push({ text: s, isWordLike: true, groupIndex: g });
      } else {
        if (w > 0) appendGroup(g, s);
        segments.push({ text: s, isWordLike: false, groupIndex: -1 });
      }
    }
    return { segments: segments, groups: groups, wordCount: w };
  }

  STT.renderTranscript = function (text) {
    var el = STT.$("textOutput");
    var t = String(text || "");
    STT.displayText = t;

    if (!el) return;
    if (!t.trim()) {
      el.innerHTML = "";
      STT.groupTextByIndex = new Map();
      STT.setText("sttWordCount", "0 คำ");
      return;
    }

    var computed = computeSegmentsAndGroups(t);
    STT.groupTextByIndex = computed.groups;
    STT.setText("sttWordCount", computed.wordCount + " คำ (ไฮไลต์ทุก " + STT.HIGHLIGHT_EVERY_WORDS + " คำ)");

    var out = [];
    for (var j = 0; j < computed.segments.length; j++) {
      var seg = computed.segments[j];
      if (seg.isWordLike) {
        var color = STT.HL_COLORS[seg.groupIndex % STT.HL_COLORS.length];
        var isStriked = STT.strikedGroups && STT.strikedGroups.has(seg.groupIndex);
        out.push(
          '<span class="stt-word stt-hl--' +
            color +
            (isStriked ? " is-striked" : "") +
            '" data-group="' +
            seg.groupIndex +
            '" title="คลิกเพื่อขีดฆ่าทั้งกลุ่ม ' +
            STT.HIGHLIGHT_EVERY_WORDS +
            ' คำ / ส่งเข้าเอกสาร">' +
            escapeHtml(seg.text) +
            "</span>"
        );
      } else {
        out.push("<span>" + escapeHtml(seg.text) + "</span>");
      }
    }
    el.innerHTML = out.join("");
  };

  STT.getPlainText = function () {
    return String(STT.displayText || STT.currentText || "");
  };

  STT.tryInsertGroupToDocumentEnd = function (groupIndex) {
    try {
      var raw = (STT.groupTextByIndex && STT.groupTextByIndex.get(groupIndex)) || "";
      var textToInsert = String(raw || "").trim();
      if (!textToInsert) return false;
      var key = groupIndex + ":" + textToInsert.length + ":" + textToInsert.slice(0, 24);
      if (STT.insertedGroupKeys && STT.insertedGroupKeys.has(key)) return true;
      STT.insertedGroupKeys.add(key);
      return STT.appendToDocumentEnd(textToInsert + "\n");
    } catch (e) {
      return false;
    }
  };

  function bindTranscriptClicks() {
    var el = STT.$("textOutput");
    if (!el || el.__sttBound) return;
    el.__sttBound = true;
    el.addEventListener("click", function (e) {
      try {
        var target = e && e.target;
        if (!target || !target.classList || !target.classList.contains("stt-word")) return;
        var g = parseInt(target.getAttribute("data-group"), 10);
        if (!Number.isFinite(g)) return;

        var turningOn = !STT.strikedGroups.has(g);
        if (turningOn) STT.strikedGroups.add(g);
        else STT.strikedGroups.delete(g);

        // When turning ON: also insert this group to document end
        if (turningOn) {
          var ok = STT.tryInsertGroupToDocumentEnd(g);
          STT.setStatus(ok ? "ส่งกลุ่มคำเข้าเอกสารแล้ว" : "ส่งกลุ่มคำไม่สำเร็จ");
        }

        STT.renderTranscript(STT.getPlainText());
      } catch (e0) {}
    });
  }

  // Bind once DOM is ready
  try {
    document.addEventListener("DOMContentLoaded", function () {
      bindTranscriptClicks();
    });
  } catch (e) {}

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
