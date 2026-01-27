// Core utilities for Speech To Text plugin
(function () {
  var STT = (window.STT = window.STT || {});

  STT.VERSION = "0.3.5";
  // Logs are OFF by default. (Enable by setting STT.LOGS_ENABLED = true in runtime)
  STT.LOGS_ENABLED = STT.LOGS_ENABLED === true;
  STT.log = function () {
    if (!STT.LOGS_ENABLED) return;
    try {
      // eslint-disable-next-line no-console
      console.log.apply(console, arguments);
    } catch (e0) {}
  };
  STT.warn = function () {
    if (!STT.LOGS_ENABLED) return;
    try {
      // eslint-disable-next-line no-console
      console.warn.apply(console, arguments);
    } catch (e0) {}
  };
  STT.error = function () {
    if (!STT.LOGS_ENABLED) return;
    try {
      // eslint-disable-next-line no-console
      console.error.apply(console, arguments);
    } catch (e0) {}
  };
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
      // group insert: แยกเป็นบรรทัด/ย่อหน้าใหม่เพื่ออ่านง่าย
      return STT.appendToDocumentEnd(textToInsert + "\n", { newParagraph: true, preserveSelection: true });
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
        STT.warn("[STT] callCommand not available");
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
            STT.error("[STT] insertText error:", e);
          }
        },
        false, // isClose
        true   // isCalc
      );
      return true;
    } catch (e) {
      STT.error("[STT] insertText failed:", e);
      return false;
    }
  };

  STT.appendToDocumentEnd = function (text, opts) {
    // IMPORTANT:
    // - อย่า trim ทั้งข้อความ เพราะ STT finalTranscript จะมี space ต่อท้ายเพื่อให้คำติดกัน
    // - แต่ใช้ trim เฉพาะสำหรับตรวจว่า "ว่างจริงไหม"
    var raw = String(text || "");
    if (!raw.trim()) return false;
    opts = opts || {};
    // default: เหมือนพฤติกรรมเดิม (เพิ่มย่อหน้าใหม่ท้ายเอกสาร)
    var newParagraph = opts.newParagraph !== false;
    // default: พยายาม restore selection/cursor ของผู้ใช้ (best effort)
    var preserveSelection = opts.preserveSelection !== false;

    try {
      if (!window.Asc || !window.Asc.plugin || typeof window.Asc.plugin.callCommand !== "function") {
        STT.warn("[STT] callCommand not available");
        return false;
      }

      window.Asc.scope = window.Asc.scope || {};
      window.Asc.scope.__stt_append_text = raw;
      window.Asc.scope.__stt_append_newpara = newParagraph ? 1 : 0;
      window.Asc.scope.__stt_append_preserve = preserveSelection ? 1 : 0;

      window.Asc.plugin.callCommand(
        function () {
          try {
            var doc = Api.GetDocument();
            if (!doc) return;
            var body = doc.GetBody ? doc.GetBody() : null;
            var sel = null;
            var wantPreserve = Asc.scope.__stt_append_preserve ? true : false;
            var wantNewPara = Asc.scope.__stt_append_newpara ? true : false;

            // Best-effort selection save (API may not exist in some builds)
            if (wantPreserve) {
              try {
                if (Api && typeof Api.GetSelectionState === "function") {
                  sel = Api.GetSelectionState();
                }
              } catch (eSel0) {}
            }

            var txt = String(Asc.scope.__stt_append_text || "");

            // === IMPORTANT ===
            // บาง build ของ ONLYOFFICE:
            // - body.AddParagraph()/doc.InsertContent อาจ insert "ตรง cursor"
            // ดังนั้นเราจะพยายามหา "paragraph สุดท้ายของเอกสาร" แล้ว append ลงไปที่ object นั้นแทน
            var lastPara = null;

            // 1) Prefer explicit "last paragraph" helpers
            try {
              if (body && body.GetLastParagraph) lastPara = body.GetLastParagraph();
            } catch (eLP0) {}
            try {
              if (!lastPara && doc && doc.GetLastParagraph) lastPara = doc.GetLastParagraph();
            } catch (eLP0b) {}

            // 2) Fallback: count-based API (GetParagraphsCount/GetParagraph)
            try {
              if (!lastPara && body && body.GetParagraphsCount && body.GetParagraph) {
                var n1 = Number(body.GetParagraphsCount()) || 0;
                if (n1 > 0) lastPara = body.GetParagraph(n1 - 1);
              }
            } catch (eLP1) {}
            try {
              if (!lastPara && doc && doc.GetParagraphsCount && doc.GetParagraph) {
                var n2 = Number(doc.GetParagraphsCount()) || 0;
                if (n2 > 0) lastPara = doc.GetParagraph(n2 - 1);
              }
            } catch (eLP2) {}

            // 3) Fallback: content array
            try {
              if (!lastPara && body && body.GetContent) {
                var c = body.GetContent();
                if (c && c.length) lastPara = c[c.length - 1];
              }
            } catch (eLP3) {}
            try {
              if (!lastPara && doc && doc.GetContent) {
                var c2 = doc.GetContent();
                if (c2 && c2.length) lastPara = c2[c2.length - 1];
              }
            } catch (eLP4) {}

            // If still no last paragraph, last resort: try body.AddParagraph (may fall back to cursor)
            if (!lastPara || !lastPara.AddText) {
              try {
                if (body && body.AddParagraph) lastPara = body.AddParagraph();
              } catch (eLP5) {}
            }

            if (lastPara && lastPara.AddText) {
              if (wantNewPara) {
                try {
                  if (lastPara.AddLineBreak) lastPara.AddLineBreak();
                  else lastPara.AddText("\n");
                } catch (eLB) {}
              }
              lastPara.AddText(txt);
            } else {
              // Final fallback (อาจลงที่ cursor) แต่ให้ไม่ crash
              try {
                var p3 = Api.CreateParagraph();
                if (p3 && p3.AddText) p3.AddText(txt);
                if (doc && doc.InsertContent) doc.InsertContent([p3]);
              } catch (eFinal) {}
            }

            // Best-effort selection restore
            if (sel && wantPreserve) {
              try {
                if (Api && typeof Api.SetSelectionState === "function") {
                  Api.SetSelectionState(sel);
                }
              } catch (eSel1) {}
            }
          } catch (e) {
            STT.error("[STT] appendToDocumentEnd error:", e);
          }
        },
        false, // isClose
        true   // isCalc
      );
      return true;
    } catch (e) {
      STT.error("[STT] appendToDocumentEnd failed:", e);
      return false;
    }
  };

  // Live tail (interim) updater:
  // - update a dedicated paragraph at end of document by replacing its content
  // - preserve user's cursor/selection (best-effort)
  // NOTE: marker is invisible characters so user doesn't see it.
  var STT_LIVE_MARKER = "\u2063\u2063\u2063\u2063\u2060\u2060\u2060\u2060";

  STT.setLiveTailText = function (text, opts) {
    var raw = String(text || "");
    opts = opts || {};
    var preserveSelection = opts.preserveSelection !== false;

    try {
      if (!window.Asc || !window.Asc.plugin || typeof window.Asc.plugin.callCommand !== "function") {
        return false;
      }

      window.Asc.scope = window.Asc.scope || {};
      window.Asc.scope.__stt_live_text = raw;
      window.Asc.scope.__stt_live_preserve = preserveSelection ? 1 : 0;
      window.Asc.scope.__stt_live_marker = STT_LIVE_MARKER;

      window.Asc.plugin.callCommand(
        function () {
          try {
            var doc = Api.GetDocument();
            if (!doc) return;
            var body = doc.GetBody ? doc.GetBody() : null;
            if (!body) return;

            var marker = String(Asc.scope.__stt_live_marker || "");
            var txt = String(Asc.scope.__stt_live_text || "");
            var wantPreserve = Asc.scope.__stt_live_preserve ? true : false;

            var sel = null;
            if (wantPreserve) {
              try {
                if (Api && typeof Api.GetSelectionState === "function") sel = Api.GetSelectionState();
              } catch (eSel0) {}
            }

            // Find existing live paragraph near the end (scan last 50 paras)
            var livePara = null;
            var count = 0;
            try {
              if (body.GetParagraphsCount) count = Number(body.GetParagraphsCount()) || 0;
            } catch (eC0) {}
            var start = Math.max(0, count - 50);
            for (var i = count - 1; i >= start; i--) {
              try {
                if (!body.GetParagraph) break;
                var p = body.GetParagraph(i);
                if (!p || !p.GetRange || !p.GetRange().GetText) continue;
                var t = String(
                  p.GetRange().GetText({
                    Numbering: false,
                    Math: false,
                    ParaSeparator: "\n",
                    TableRowSeparator: "\n",
                    NewLineSeparator: "\n",
                  }) || ""
                );
                if (t.indexOf(marker) !== -1) {
                  livePara = p;
                  break;
                }
              } catch (eScan) {}
            }

            // If not found: create at end
            if (!livePara) {
              try {
                if (body.AddParagraph) livePara = body.AddParagraph();
              } catch (eAdd) {}
            }

            if (livePara) {
              try {
                if (livePara.RemoveAllElements) livePara.RemoveAllElements();
              } catch (eRm) {}
              try {
                if (livePara.AddText) livePara.AddText(marker + txt);
              } catch (eAddText) {}
            }

            if (sel && wantPreserve) {
              try {
                if (Api && typeof Api.SetSelectionState === "function") Api.SetSelectionState(sel);
              } catch (eSel1) {}
            }
          } catch (e) {}
        },
        false,
        true
      );
      return true;
    } catch (e0) {
      return false;
    }
  };

  // Export
  window.STT = STT;
})();
