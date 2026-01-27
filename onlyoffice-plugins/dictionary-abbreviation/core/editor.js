// Editor bridge: executeMethod + callCommand helpers
(function () {
  var DO = (window.DO = window.DO || {});

  DO.editor = DO.editor || {};

  function exec(name, params, cb) {
    try {
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
        // NOTE:
        // - executeMethod return value is not reliable across builds (we've seen `false` even when it works).
        // - Treat presence of executeMethod as "supported" and rely on callbacks/timeouts for verification.
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

  function canCallCommand() {
    try {
      return Boolean(window.Asc && window.Asc.plugin && typeof window.Asc.plugin.callCommand === "function");
    } catch (e) {
      return false;
    }
  }

  function execWithTimeout(name, params, timeoutMs, cb) {
    var done = false;
    var tId = 0;
    function finish(v) {
      if (done) return;
      done = true;
      try {
        if (tId) clearTimeout(tId);
      } catch (e0) {}
      try {
        cb && cb(v);
      } catch (e1) {}
    }
    try {
      tId = setTimeout(function () {
        finish(undefined);
      }, Math.max(0, Number(timeoutMs || 0) || 0));
    } catch (e2) {}

    try {
      exec(name, params || [], function (v) {
        finish(v);
      });
    } catch (e3) {
      finish(undefined);
    }
  }

  // Reliable way to read current paragraph text:
  // - executeMethod("GetCurrentParagraph") is not supported on some builds / returns empty
  // - callCommand + ApiParagraph.GetRange().GetText works across more versions
  function getCurrentParagraphTextViaCallCommand(cb) {
    if (!canCallCommand()) {
      try {
        cb && cb("");
      } catch (e0) {}
      return;
    }
    try {
      window.Asc.plugin.callCommand(
        function () {
          try {
            var doc = Api.GetDocument();
            if (!doc || !doc.GetCurrentParagraph) return "";
            var p = doc.GetCurrentParagraph();
            if (!p) return "";
            var r = p.GetRange ? p.GetRange() : null;
            if (!r || !r.GetText) return "";
            return String(
              r.GetText({
                Numbering: false,
                Math: false,
                ParaSeparator: "\n",
                TableRowSeparator: "\n",
                NewLineSeparator: "\n",
              }) || ""
            );
          } catch (e) {
            return "";
          }
        },
        false,
        true,
        function (text) {
          try {
            cb && cb(String(text || ""));
          } catch (e1) {}
        }
      );
    } catch (e2) {
      try {
        cb && cb("");
      } catch (e3) {}
    }
  }

  DO.editor.insertText = function (text) {
    var t = String(text || "");
    if (!t) return;
    DO.state = DO.state || {};
    DO.state.lastInsertAt = Date.now();

    function callCommandInsert() {
      if (!canCallCommand()) return false;
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
              doc.InsertContent([p]);
            } catch (e) {}
          },
          false,
          true
        );
        try {
          DO.debugLog("insert_ok", { via: "callCommand", len: t.length });
        } catch (e0) {}
        return true;
      } catch (e1) {
        try {
          DO.debugLog("insert_callCommand_failed", { error: String(e1) });
        } catch (e2) {}
        return false;
      }
    }

    // Best-effort focus (helps in some builds)
    try {
      exec("SetFocusToEditor", []);
    } catch (e3) {}

    // IMPORTANT: Do not call multiple insert methods in a row (will duplicate text).
    // Prefer PasteText; fallback to callCommand if executeMethod is not available.
    if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
      try {
        exec("PasteText", [t]);
        try {
          DO.debugLog("insert_ok", { via: "PasteText", len: t.length });
        } catch (e4) {}
        return;
      } catch (e5) {
        try {
          DO.debugLog("insert_paste_failed", { error: String(e5) });
        } catch (e6) {}
      }
    }

    if (callCommandInsert()) return;

    // Final fallback: Try using InsertText API directly if available
    // This might work even when callCommand is not available
    try {
      if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
        // Try InsertText method as last resort
        exec("InsertText", [t]);
        try {
          DO.debugLog("insert_ok", { via: "InsertText", len: t.length });
        } catch (e8) {}
        return;
      }
    } catch (e9) {
      try {
        DO.debugLog("insert_insertText_failed", { error: String(e9) });
      } catch (e10) {}
    }

    try {
      DO.debugLog("insert_failed", { reason: "no_supported_method", len: t.length });
      try {
        if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
          // eslint-disable-next-line no-console
          console.warn("[DocumentOfficePlugin] insertText failed - no supported method available", {
            hasExecuteMethod: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) === "function",
            hasCallCommand: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.callCommand) === "function",
          });
        }
      } catch (eLog) {}
    } catch (e7) {}
    DO.setOutput({ ok: false, error: "Insert failed: executeMethod/callCommand unavailable" });
  };

  DO.editor.appendToDocumentEnd = function (text, opts) {
    var t = String(text || "");
    if (!t) {
      try {
        DO.debugLog("appendToEnd_empty_text");
      } catch (e0) {}
      return;
    }
    opts = opts || {};
    var forceNewParagraph = opts.forceNewParagraph !== false; // default: true

    try {
      DO.debugLog("appendToEnd_start", { len: t.length, forceNewPara: forceNewParagraph });
    } catch (e0) {}

    // Best-effort: guaranteed "end of document" insertion
    // Following OnlyOffice plugin examples pattern using callCommand
    if (canCallCommand()) {
      try {
        DO.debugLog("appendToEnd_using_callCommand");
      } catch (e0) {}
      try {
        window.Asc.scope = window.Asc.scope || {};
        window.Asc.scope.__do_append_text = t;
        window.Asc.scope.__do_append_newpara = forceNewParagraph ? 1 : 0;
        window.Asc.plugin.callCommand(
          function () {
            try {
              var doc = Api.GetDocument();
              if (!doc) return;
              
              var body = doc.GetBody ? doc.GetBody() : null;
              if (!body) {
                // Fallback: use InsertContent if GetBody not available
                var p = Api.CreateParagraph();
                p.AddText(Asc.scope.__do_append_text || "");
                doc.InsertContent([p]);
                return;
              }

              var txt = Asc.scope.__do_append_text || "";
              var newPara = Asc.scope.__do_append_newpara ? true : false;

              // Append at end by creating a new paragraph (safe, predictable)
              // This matches the pattern from OnlyOffice plugin examples
              if (newPara) {
                var p = body.AddParagraph();
                if (p && p.AddText) {
                  p.AddText(txt);
                } else {
                  // Fallback: use InsertContent
                  doc.InsertContent([Api.CreateParagraph().AddText(txt)]);
                }
              } else {
                // Try append to last paragraph if API exists, else fallback to new paragraph
                var last = null;
                try {
                  if (body.GetLastParagraph) last = body.GetLastParagraph();
                } catch (e0) {}
                if (last && last.AddText) {
                  last.AddText(txt);
                } else {
                  var p2 = body.AddParagraph();
                  if (p2 && p2.AddText) {
                    p2.AddText(txt);
                  } else {
                    // Final fallback: use InsertContent
                    doc.InsertContent([Api.CreateParagraph().AddText(txt)]);
                  }
                }
              }
            } catch (e) {
              try {
                if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
                  // eslint-disable-next-line no-console
                  console.error("[DocumentOfficePlugin] appendToEnd error in callCommand", e);
                }
              } catch (eLog) {}
            }
          },
          false, // isClose: don't close plugin
          true   // isCalc: recalculate document
        );
        try {
          DO.debugLog("appendToEnd_ok", { via: "callCommand", len: t.length, newPara: forceNewParagraph });
        } catch (e3) {}
        return;
      } catch (e1) {
        try {
          DO.debugLog("appendToEnd_callCommand_failed", { error: String(e1) });
        } catch (e2) {}
      }
    }

    // Fallback: cannot guarantee end; inserts at cursor
    // This is still better than nothing
    try {
      DO.debugLog("appendToEnd_fallback_to_insertText", { len: t.length });
      try {
        if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
          // eslint-disable-next-line no-console
          console.warn("[DocumentOfficePlugin] appendToDocumentEnd: callCommand not available, using insertText fallback");
        }
      } catch (eLog2) {}
    } catch (e4) {}
    // Use insertText which has multiple fallback mechanisms
    DO.editor.insertText(t);
  };

  DO.editor.getSelectedText = function (cb) {
    execWithTimeout("GetSelectedText", [], 300, function (text) {
      try {
        cb && cb(text || "");
      } catch (e) {}
    });
  };

  DO.editor.getCurrentParagraphText = function (cb) {
    // Prefer callCommand approach for reliability (works even when executeMethod is misleading/unsupported)
    getCurrentParagraphTextViaCallCommand(function (t) {
      if (t && String(t).length) {
        try {
          cb && cb(String(t));
        } catch (e0) {}
        return;
      }
      // Fallback: executeMethod (best-effort)
      execWithTimeout("GetCurrentParagraph", [], 400, function (p) {
        var text = "";
        try {
          if (typeof p === "string") text = p || "";
          else if (p && typeof p.text === "string") text = p.text || "";
          else if (p && p.GetText) text = p.GetText() || "";
        } catch (e) {}
        try {
          cb && cb(text);
        } catch (e2) {}
      });
    });
  };

  // Replace a range within the current paragraph (0-based indices in paragraph text).
  // This enables "autocomplete-like" replacement even when caret is in the middle of paragraph.
  DO.editor.replaceRangeInCurrentParagraph = function (start, end, replacement, cb) {
    start = Number(start || 0) || 0;
    end = Number(end || 0) || 0;
    if (end < start) {
      var tmp = start;
      start = end;
      end = tmp;
    }
    var rpl = String(replacement == null ? "" : replacement);
    if (!rpl) {
      try { cb && cb({ ok: false, error: "empty_replacement" }); } catch (e0) {}
      return;
    }
    if (!canCallCommand()) {
      // Can't safely replace without callCommand; fallback to inserting at cursor.
      DO.editor.insertText(rpl);
      try { cb && cb({ ok: false, error: "no_callCommand_fallback_insert" }); } catch (e1) {}
      return;
    }

    DO.state = DO.state || {};
    DO.state.lastInsertAt = Date.now();

    try {
      window.Asc.scope = window.Asc.scope || {};
      window.Asc.scope.__do_rr_start = start;
      window.Asc.scope.__do_rr_end = end;
      window.Asc.scope.__do_rr_text = rpl;
      window.Asc.plugin.callCommand(
        function () {
          try {
            var s = Number(Asc.scope.__do_rr_start || 0) || 0;
            var e = Number(Asc.scope.__do_rr_end || 0) || 0;
            if (e < s) { var t = s; s = e; e = t; }
            var text = String(Asc.scope.__do_rr_text || "");
            if (!text) return { ok: false, error: "empty_replacement" };

            var doc = Api.GetDocument();
            if (!doc || !doc.GetCurrentParagraph) return { ok: false, error: "no_doc" };
            var p = doc.GetCurrentParagraph();
            if (!p || !p.GetRange) return { ok: false, error: "no_paragraph" };

            // Delete range then insert replacement at start.
            try {
              var del = p.GetRange(s, e);
              if (del && del.Delete) del.Delete();
            } catch (eDel) {}
            try {
              var ins = p.GetRange(s, s);
              if (ins && ins.AddText) ins.AddText(text, "before");
              else if (doc && doc.InsertText) doc.InsertText(text);
            } catch (eIns) {
              if (doc && doc.InsertText) doc.InsertText(text);
            }
            return { ok: true, start: s, end: e, replLen: text.length };
          } catch (e) {
            return { ok: false, error: String(e) };
          }
        },
        false,
        true,
        function (result) {
          try {
            DO.debugLog("replace_range_done", result || {});
          } catch (e0) {}
          try { cb && cb(result); } catch (e1) {}
        }
      );
      try {
        DO.debugLog("replace_range", { start: start, end: end, replLen: rpl.length });
      } catch (e2) {}
    } catch (e3) {
      try {
        DO.debugLog("replace_range_failed", { error: String(e3) });
      } catch (e4) {}
      DO.editor.insertText(rpl);
      try { cb && cb({ ok: false, error: String(e3), fallback: "insertText" }); } catch (e5) {}
    }
  };

  DO.editor.replaceSelectionText = function (text) {
    // PasteText handles selection if any
    DO.editor.insertText(text);
  };

  // Replace the last token at the end of current paragraph.
  // This is used for autocomplete-like behavior:
  // - user types token (e.g. "สฟฟ")
  // - plugin replaces it with full text (e.g. "สวัสดีนะ")
  // Note: This keeps formatting mostly intact (only touches the token range),
  // and avoids appending after the token (which causes "สฟฟสวัสดีนะ").
  DO.editor.replaceLastTokenInParagraph = function (token, replacement, opts, cb) {
    var t = String(token || "").trim();
    var rpl = String(replacement || "");
    // opts is optional; allow (token, replacement, cb)
    if (typeof opts === "function") {
      cb = opts;
      opts = null;
    }
    opts = opts || {};
    var fallbackInsertAtCursor = opts.fallbackInsertAtCursor !== false; // default true
    var verify = opts.verify !== false; // default true
    if (!t || !rpl) {
      // fallback
      DO.editor.insertText(rpl);
      return;
    }

    if (!canCallCommand()) {
      // Best-effort: can't safely delete the typed token, so at least insert something.
      DO.editor.insertText(rpl);
      return;
    }

    try {
      // Suppress abbreviation auto-detect briefly after we mutate the document,
      // otherwise onDocumentContentChanged can trigger a rapid loop.
      try {
        DO.state = DO.state || {};
        DO.state._abbrSuppressUntil = Date.now() + 800;
        DO.state._abbrSuppressToken = t;
      } catch (eSup) {}

      window.Asc.scope = window.Asc.scope || {};
      window.Asc.scope.__do_token = t;
      window.Asc.scope.__do_repl = rpl;
      window.Asc.scope.__do_repl_opts = {
        fallbackInsertAtCursor: fallbackInsertAtCursor ? 1 : 0,
        verify: verify ? 1 : 0,
      };
      window.Asc.plugin.callCommand(
        function () {
          try {
            var tokenNow = String(Asc.scope.__do_token || "");
            var replNow = String(Asc.scope.__do_repl || "");
            var o = Asc.scope.__do_repl_opts || {};
            var allowFallback = !!(o && o.fallbackInsertAtCursor);
            var doVerify = !!(o && o.verify);
            if (!tokenNow || !replNow) return { ok: false, didReplace: false, verified: false, reason: "empty_args" };

            var doc = Api.GetDocument();
            if (!doc || !doc.GetCurrentParagraph) {
              if (allowFallback && doc && doc.InsertText) doc.InsertText(replNow);
              return { ok: false, didReplace: false, verified: false, reason: "no_doc_or_para" };
            }
            var p = doc.GetCurrentParagraph();
            if (!p || !p.GetRange) {
              if (allowFallback && doc && doc.InsertText) doc.InsertText(replNow);
              return { ok: false, didReplace: false, verified: false, reason: "no_para_range" };
            }

            var fullRange = p.GetRange();
            var txt = "";
            try {
              txt = String(
                fullRange.GetText({
                  Numbering: false,
                  Math: false,
                  ParaSeparator: "\n",
                  TableRowSeparator: "\n",
                  NewLineSeparator: "\n",
                }) || ""
              );
            } catch (e0) {}

            // Normalize: GetText for paragraph often includes a trailing "\n" (ParaSeparator),
            // so we must trim line breaks/spaces before checking token suffix.
            var norm = String(txt || "").replace(/\u00A0/g, " ");
            var trimmed = norm.replace(/[\s\u00A0]+$/g, "");

            // Only replace when paragraph (trimmed) ends with token (common typing case).
            if (trimmed && trimmed.slice(-tokenNow.length) === tokenNow) {
              var end = trimmed.length;
              var start = Math.max(0, end - tokenNow.length);
              var prefix = trimmed.slice(0, start);
              var expected = prefix + replNow;
              try {
                var tr = p.GetRange(start, end);
                tr.Delete();
              } catch (e1) {}
              try {
                // Insert replacement at the original start position.
                var ins = p.GetRange(start, start);
                var ok0 = ins.AddText(replNow, "before");
                // Do NOT fallback to doc.InsertText here; that can insert at cursor and leave token intact.
                // We'll verify and then fallback to paragraph rewrite if needed.
                void ok0;
              } catch (e2) {
                // ignore; will verify and possibly fallback below
              }

              // Verify replacement actually happened (some builds silently fail Delete/AddText)
              if (doVerify) {
                try {
                  var after = "";
                  try {
                    after = String(
                      p.GetRange().GetText({
                        Numbering: false,
                        Math: false,
                        ParaSeparator: "\n",
                        TableRowSeparator: "\n",
                        NewLineSeparator: "\n",
                      }) || ""
                    ).replace(/\u00A0/g, " ");
                  } catch (eV0) {
                    after = "";
                  }
                  var afterTrim = String(after || "").replace(/[\s\u00A0]+$/g, "");
                  if (afterTrim && afterTrim.slice(-replNow.length) === replNow && afterTrim.indexOf(expected) !== -1) {
                    return { ok: true, didReplace: true, verified: true, token: tokenNow, replLen: replNow.length };
                  }
                } catch (eV1) {}
              } else {
                return { ok: true, didReplace: true, verified: true, token: tokenNow, replLen: replNow.length };
              }

              // Fallback: rewrite whole paragraph text (may lose formatting, but ensures correctness)
              try {
                if (p.RemoveAllElements) p.RemoveAllElements();
              } catch (eR0) {}
              try {
                if (p.AddText) p.AddText(expected);
              } catch (eR1) {
                try {
                  if (allowFallback && doc && doc.InsertText) doc.InsertText(replNow);
                } catch (eR2) {}
              }

              if (doVerify) {
                try {
                  var after2 = "";
                  try {
                    after2 = String(
                      p.GetRange().GetText({
                        Numbering: false,
                        Math: false,
                        ParaSeparator: "\n",
                        TableRowSeparator: "\n",
                        NewLineSeparator: "\n",
                      }) || ""
                    ).replace(/\u00A0/g, " ");
                  } catch (eV2) {
                    after2 = "";
                  }
                  var after2Trim = String(after2 || "").replace(/[\s\u00A0]+$/g, "");
                  if (after2Trim && after2Trim.indexOf(expected) !== -1) {
                    return { ok: true, didReplace: true, verified: true, token: tokenNow, replLen: replNow.length, fallback: "rewrite" };
                  }
                } catch (eV3) {}
              }

              return { ok: false, didReplace: false, verified: false, token: tokenNow, reason: "replace_failed" };
            }

            // If not at end, fallback to inserting at cursor.
            if (allowFallback && doc && doc.InsertText) doc.InsertText(replNow);
            return { ok: true, didReplace: false, verified: false, token: tokenNow, reason: "token_not_at_end" };
          } catch (e) {}
        },
        false,
        true,
        function (result) {
          try {
            DO.debugLog("replace_token_done", result || {});
          } catch (e0) {}
          try {
            if (typeof cb === "function") cb(result || {});
          } catch (eCb) {}
        }
      );
      try {
        DO.debugLog("replace_token", { tokenLen: t.length, replLen: rpl.length, via: "callCommand" });
      } catch (e3) {}
    } catch (e4) {
      try {
        DO.debugLog("replace_token_failed", { error: String(e4) });
      } catch (e5) {}
      // fallback: only insert when allowed (default true)
      try {
        if (fallbackInsertAtCursor) DO.editor.insertText(rpl);
      } catch (e6) {}
      try {
        if (typeof cb === "function") cb({ ok: false, didReplace: false, verified: false, error: String(e4), fallback: "insertText" });
      } catch (eCb2) {}
    }
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

