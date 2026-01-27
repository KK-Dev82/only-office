// Host <-> Plugin message bus (DocsAPI.DocEditor.sendExternalMessage)
(function () {
  var DO = (window.DO = window.DO || {});

  function mergeOptions(payload) {
    if (!payload || typeof payload !== "object") return;
    DO.pluginOptions = DO.pluginOptions || {};
    for (var k in payload) DO.pluginOptions[k] = payload[k];
  }

  function replyOk(id, result) {
    var ok = false;
    try {
      ok = DO.sendToHost({ type: "do:response", id: String(id), ok: true, result: result }) === true;
    } catch (e0) {}
    if (!ok) {
      try {
        if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
          // eslint-disable-next-line no-console
          console.warn("[DocumentOfficePlugin] replyOk_failed", id);
        }
      } catch (e1) {}
    }
  }

  function replyErr(id, error) {
    var ok = false;
    try {
      ok = DO.sendToHost({ type: "do:response", id: String(id), ok: false, error: String(error || "Unknown error") }) === true;
    } catch (e0) {}
    if (!ok) {
      try {
        if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
          // eslint-disable-next-line no-console
          console.warn("[DocumentOfficePlugin] replyErr_failed", id, error);
        }
      } catch (e1) {}
    }
  }

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  window.Asc.plugin.onExternalPluginMessage = function (msg) {
    try {
      try {
        if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
          // eslint-disable-next-line no-console
          console.log("[DocumentOfficePlugin] bus_rx_raw", msg, typeof msg);
        }
      } catch (eLog0) {}
      if (!msg || typeof msg !== "object") {
        try {
          if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
            // eslint-disable-next-line no-console
            console.warn("[DocumentOfficePlugin] bus_rx_invalid", { msg: msg, type: typeof msg });
          }
        } catch (eLog1) {}
        return;
      }
      try {
        if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
          // eslint-disable-next-line no-console
          console.log("[DocumentOfficePlugin] bus_rx", msg);
        }
      } catch (eLog) {}

      // v1 envelope (request/response)
      if (msg.type === "do:command" && msg.id && msg.command) {
        var id = String(msg.id);
        var cmd = String(msg.command);
        var payload = msg.payload;

        try {
          if (cmd === "setOptions" && payload && typeof payload === "object") {
            mergeOptions(payload);
            replyOk(id, { hasAccessToken: Boolean(DO.pluginOptions && DO.pluginOptions.accessToken) });
            return;
          }

          if (cmd === "insertText") {
            DO.editor.insertText((payload && payload.text) || "");
            replyOk(id, true);
            return;
          }

          // STT-safe: always append at end (ignore cursor)
          if (cmd === "appendToEnd") {
            try {
              if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
                // eslint-disable-next-line no-console
                console.log("[DocumentOfficePlugin] bus_appendToEnd", { len: ((payload && payload.text) || "").length });
              }
            } catch (e0) {}
            try {
              DO.editor.appendToDocumentEnd((payload && payload.text) || "", { forceNewParagraph: true });
              // Try to reply immediately (Community License may not support SendExternalMessage)
              // If reply fails, the text was still inserted (best-effort)
              try {
                replyOk(id, true);
              } catch (eReply) {
                try {
                  if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
                    // eslint-disable-next-line no-console
                    console.warn("[DocumentOfficePlugin] replyOk failed (may be Community License limitation)", eReply);
                  }
                } catch (eLog2) {}
                // Text was inserted, but response may not reach host
              }
            } catch (eInsert) {
              replyErr(id, "Insert failed: " + String(eInsert));
            }
            return;
          }

          if (cmd === "replaceContext") {
            var mode2 = (payload && payload.mode) || (DO.pluginOptions && DO.pluginOptions.defaultCheckMode) || "paragraph";
            var text2 = (payload && payload.text) || "";
            if (mode2 === "selection") DO.editor.replaceSelectionText(text2);
            else DO.editor.replaceCurrentParagraph(text2);
            replyOk(id, true);
            return;
          }

          if (cmd === "getStatus") {
            replyOk(id, {
              plugin: "DocumentOffice",
              version: DO.VERSION,
              hasAccessToken: Boolean(DO.pluginOptions && DO.pluginOptions.accessToken),
              apiBaseUrl: (DO.pluginOptions && DO.pluginOptions.apiBaseUrl) || "",
              defaultCheckMode: (DO.pluginOptions && DO.pluginOptions.defaultCheckMode) || "paragraph",
            });
            return;
          }

          if (cmd === "getContext") {
            var mode = (payload && payload.mode) || (DO.pluginOptions && DO.pluginOptions.defaultCheckMode) || "paragraph";
            DO.editor.getContext(mode, function (ctx) {
              replyOk(id, { context: ctx });
            });
            return;
          }

          replyErr(id, "Unknown command: " + cmd);
          return;
        } catch (e) {
          replyErr(id, e);
          return;
        }
      }

      // legacy messages (no response)
      var type = msg.type;
      if (type === "setOptions" && msg.data) {
        mergeOptions(msg.data);
        DO.setOutput({ ok: true, type: "setOptions", hasAccessToken: Boolean(DO.pluginOptions && DO.pluginOptions.accessToken) });
        return;
      }

      if (type === "insertText") {
        DO.editor.insertText(msg.text || "");
        return;
      }

      if (type === "appendToEnd") {
        try {
          if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
            // eslint-disable-next-line no-console
            console.log("[DocumentOfficePlugin] bus_legacy_appendToEnd", { len: ((msg.text || "") || "").length });
          }
        } catch (e0) {}
        try {
          DO.editor.appendToDocumentEnd(msg.text || "", { forceNewParagraph: true });
          try {
            if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
              // eslint-disable-next-line no-console
              console.log("[DocumentOfficePlugin] bus_legacy_appendToEnd_ok");
            }
          } catch (eLog3) {}
        } catch (e1) {
          try {
            if (DO && DO.isLogsEnabled && DO.isLogsEnabled()) {
              // eslint-disable-next-line no-console
              console.error("[DocumentOfficePlugin] bus_legacy_appendToEnd_failed", e1);
            }
          } catch (eLog4) {}
        }
        return;
      }
    } catch (e2) {
      DO.setOutput({ ok: false, error: String(e2) });
      DO.sendToHost({ type: "do:pluginError", error: String(e2) });
    }
  };
})();

