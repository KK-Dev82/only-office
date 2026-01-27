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
      } catch (eLog0) {}
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
      } catch (eLog1) {}
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

  // Replace word in document (search and replace)
  DO.editor.replaceWord = function (oldWord, newWord, replaceAll, cb) {
    var old = String(oldWord || "");
    var new_ = String(newWord || "");
    var replaceAllFlag = replaceAll === true;
    
    try {
      if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
        // eslint-disable-next-line no-console
        console.log("[DocumentOfficePlugin] 🔍 replaceWord called", {
          oldWord: old,
          newWord: new_,
          replaceAll: replaceAllFlag,
          hasExecuteMethod: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) === "function",
          hasCallCommand: canCallCommand(),
        });
      }
    } catch (eLog0) {}
    
    if (!old) {
      try {
        if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
          // eslint-disable-next-line no-console
          console.warn("[DocumentOfficePlugin] ⚠️ replaceWord: oldWord is required");
        }
      } catch (eLog1) {}
      try {
        cb && cb({ ok: false, error: "oldWord is required" });
      } catch (e0) {}
      return;
    }

    // Use ONLYOFFICE SearchAndReplace API
    if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
      try {
        try {
          if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
            // eslint-disable-next-line no-console
            console.log("[DocumentOfficePlugin] 🔄 replaceWord: Trying executeMethod SearchAndReplace", {
              oldWord: old,
              newWord: new_,
              replaceAll: replaceAllFlag,
            });
          }
        } catch (eLog3) {}
        
        // SearchAndReplace method signature: (searchText, replaceText, replaceAll)
        exec("SearchAndReplace", [old, new_, replaceAllFlag], function (result) {
          try {
            var ok = result !== false && result !== undefined;
            try {
              if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
                // eslint-disable-next-line no-console
                console.log("[DocumentOfficePlugin] ✅ replaceWord_executeMethod_result", {
                  ok: ok,
                  result: result,
                  resultType: typeof result,
                });
              }
            } catch (eLog1) {}
            try {
              cb && cb({ ok: ok, replaced: ok });
            } catch (e1) {}
          } catch (e2) {
            try {
              if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
                // eslint-disable-next-line no-console
                console.error("[DocumentOfficePlugin] ❌ replaceWord_executeMethod_callback_error", { error: String(e2) });
              }
            } catch (eLog4) {}
            try {
              cb && cb({ ok: false, error: String(e2) });
            } catch (e3) {}
          }
        });
        return;
      } catch (e4) {
        try {
          if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
            // eslint-disable-next-line no-console
            console.warn("[DocumentOfficePlugin] ⚠️ replaceWord_executeMethod_failed", { error: String(e4) });
          }
        } catch (eLog2) {}
      }
    }

    // Fallback: Use callCommand to search and replace
    if (canCallCommand()) {
      try {
        try {
          if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
            // eslint-disable-next-line no-console
            console.log("[DocumentOfficePlugin] 🔄 replaceWord: Trying callCommand fallback", {
              oldWord: old,
              newWord: new_,
              replaceAll: replaceAllFlag,
            });
          }
        } catch (eLog5) {}
        
        window.Asc.scope = window.Asc.scope || {};
        window.Asc.scope.__do_replace_old = old;
        window.Asc.scope.__do_replace_new = new_;
        window.Asc.scope.__do_replace_all = replaceAllFlag ? 1 : 0;
        window.Asc.plugin.callCommand(
          function () {
            try {
              var doc = Api.GetDocument();
              if (!doc) return { ok: false, error: "No document" };
              
              var oldText = Asc.scope.__do_replace_old || "";
              var newText = Asc.scope.__do_replace_new || "";
              var replaceAll = Asc.scope.__do_replace_all ? true : false;
              
              if (!oldText) return { ok: false, error: "oldWord is required" };
              
              // Use Api.SearchAndReplace if available
              if (Api && typeof Api.SearchAndReplace === "function") {
                Api.SearchAndReplace(oldText, newText, replaceAll);
                return { ok: true, replaced: true };
              }
              
              // Fallback: Manual search and replace using paragraphs
              var body = doc.GetBody ? doc.GetBody() : null;
              if (!body) return { ok: false, error: "Cannot get document body" };
              
              var replaced = false;
              var paraCount = body.GetElementsCount ? body.GetElementsCount() : 0;
              
              for (var i = 0; i < paraCount; i++) {
                try {
                  var para = body.GetElement ? body.GetElement(i) : null;
                  if (!para || !para.GetRange) continue;
                  
                  var range = para.GetRange();
                  if (!range || !range.GetText) continue;
                  
                  var paraText = range.GetText({
                    Numbering: false,
                    Math: false,
                    ParaSeparator: "\n",
                    TableRowSeparator: "\n",
                    NewLineSeparator: "\n",
                  }) || "";
                  
                  if (paraText.includes(oldText)) {
                    var newParaText = replaceAll 
                      ? paraText.split(oldText).join(newText)
                      : paraText.replace(oldText, newText);
                    
                    if (newParaText !== paraText) {
                      para.RemoveAllElements();
                      para.AddText(newParaText);
                      replaced = true;
                      if (!replaceAll) break; // Only replace first occurrence
                    }
                  }
                } catch (ePara) {
                  // Continue with next paragraph
                }
              }
              
              return { ok: replaced, replaced: replaced };
            } catch (e) {
              return { ok: false, error: String(e) };
            }
          },
          false,
          true,
          function (result) {
            try {
              var ok = result && result.ok === true;
              try {
                if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
                  // eslint-disable-next-line no-console
                  console.log("[DocumentOfficePlugin] ✅ replaceWord_callCommand_result", {
                    ok: ok,
                    result: result,
                    resultType: typeof result,
                    hasOk: result && typeof result === 'object' && 'ok' in result,
                  });
                }
              } catch (eLog3) {}
              try {
                cb && cb(result || { ok: false, error: "Unknown error" });
              } catch (e5) {}
            } catch (e6) {
              try {
                if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
                  // eslint-disable-next-line no-console
                  console.error("[DocumentOfficePlugin] ❌ replaceWord_callCommand_callback_error", { error: String(e6) });
                }
              } catch (eLog6) {}
              try {
                cb && cb({ ok: false, error: String(e6) });
              } catch (e7) {}
            }
          }
        );
        return;
      } catch (e8) {
        try {
          if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
            // eslint-disable-next-line no-console
            console.error("[DocumentOfficePlugin] ❌ replaceWord_callCommand_failed", { error: String(e8) });
          }
        } catch (eLog4) {}
      }
    }

    // Final fallback: failed
    try {
      if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
        // eslint-disable-next-line no-console
        console.error("[DocumentOfficePlugin] ❌ replaceWord: No supported method available", {
          hasExecuteMethod: typeof (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) === "function",
          hasCallCommand: canCallCommand(),
        });
      }
    } catch (eLog7) {}
    try {
      cb && cb({ ok: false, error: "No supported method available for replaceWord" });
    } catch (e9) {}
  };
})();

