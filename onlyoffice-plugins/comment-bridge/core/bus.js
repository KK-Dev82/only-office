// Host <-> Plugin message bus for comment commands
(function () {
  var CB = (window.CB = window.CB || {});

  function replyOk(id, result) {
    try {
      try {
        if (typeof CB.appendOutputLine === "function") {
          CB.appendOutputLine("replyOk: id=" + String(id));
        }
      } catch (e0) {}
      CB.sendToHost({ type: "do:response", id: String(id), ok: true, result: result });
    } catch (e) {}
  }

  function replyErr(id, error) {
    try {
      try {
        if (typeof CB.appendOutputLine === "function") {
          CB.appendOutputLine("replyErr: id=" + String(id) + " error=" + String(error || ""));
        }
      } catch (e0) {}
      CB.sendToHost({ type: "do:response", id: String(id), ok: false, error: String(error || "Unknown error") });
    } catch (e) {}
  }

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  window.Asc.plugin.onExternalPluginMessage = function (msg) {
    try {
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "do:command" && msg.id && msg.command) {
        var id = String(msg.id);
        var cmd = String(msg.command);
        var payload = msg.payload || {};

        try {
          if (typeof CB.appendOutputLine === "function") {
            CB.appendOutputLine("recv: cmd=" + cmd + " id=" + id);
          }
        } catch (e0) {}

        try {
          if (cmd === "getSelectedText") {
            CB.editor.getSelectedText(function (text) {
              replyOk(id, { text: String(text || "") });
            });
            return;
          }

          if (cmd === "addComment") {
            var text3 = payload && payload.text != null ? String(payload.text) : "";
            var authorName3 = payload && payload.authorName != null ? String(payload.authorName) : "";
            var quoteText3 = payload && payload.quoteText != null ? String(payload.quoteText) : undefined;
            CB.editor.addCommentAtSelection(
              { text: text3, authorName: authorName3, quoteText: quoteText3 },
              function (commentId) {
                replyOk(id, { commentId: commentId || null });
                try {
                  if (typeof CB.refreshComments === "function") CB.refreshComments("addComment");
                } catch (e0) {}
              }
            );
            return;
          }

          if (cmd === "changeComment") {
            var id3 = payload && payload.id != null ? String(payload.id) : "";
            var text4 = payload && payload.text != null ? String(payload.text) : "";
            var authorName4 = payload && payload.authorName != null ? String(payload.authorName) : "";
            var quoteText4 = payload && payload.quoteText != null ? String(payload.quoteText) : undefined;
            var solved4 = Boolean(payload && payload.solved);
            CB.editor.changeComment(
              { id: id3, text: text4, authorName: authorName4, quoteText: quoteText4, solved: solved4 },
              function (ok2) {
                replyOk(id, { ok: Boolean(ok2) });
                try {
                  if (typeof CB.refreshComments === "function") CB.refreshComments("changeComment");
                } catch (e0) {}
              }
            );
            return;
          }

          if (cmd === "removeComment") {
            var id4 = payload && payload.id != null ? String(payload.id) : "";
            CB.editor.removeComments([id4], function (ok3) {
              replyOk(id, { ok: Boolean(ok3) });
              try {
                if (typeof CB.refreshComments === "function") CB.refreshComments("removeComment");
              } catch (e0) {}
            });
            return;
          }

          if (cmd === "getAllComments") {
            if (typeof CB.editor.getAllComments !== "function") {
              replyOk(id, { comments: [] });
              return;
            }
            CB.editor.getAllComments(function (list) {
              try {
                replyOk(id, { comments: Array.isArray(list) ? list : [] });
              } catch (e0) {
                replyOk(id, { comments: [] });
              }
            });
            return;
          }

          if (cmd === "setFilter") {
            var author = payload && payload.author != null ? String(payload.author).trim() : "";
            var nameFromPayload = (payload && payload.name != null) ? String(payload.name).trim() : "";
            // อัปเดต filter เฉพาะเมื่อ payload มี author/name ไม่ว่าง — กัน payload ว่างเขียนทับค่าที่ได้จาก user-info
            if (author || nameFromPayload) {
              CB.filterByAuthor = author || nameFromPayload;
            }
            CB.currentUserDisplayName = (payload && payload.userDisplayName != null) ? String(payload.userDisplayName).trim() : (author || nameFromPayload || null);
            CB.currentUserId = (payload && payload.userId != null) ? String(payload.userId).trim() : null;
            CB.currentUserRole = (payload && payload.userRole != null) ? String(payload.userRole).trim() : null;
            try {
              if (typeof CB.appendOutputLine === "function") {
                CB.appendOutputLine("--- setFilter จาก host ---");
                CB.appendOutputLine("1. ตอนนี้ User: \"" + (CB.currentUserDisplayName || "(ไม่ระบุ)") + "\"");
                CB.appendOutputLine("2. User Role: \"" + (CB.currentUserRole || "(ไม่ระบุ)") + "\"");
                CB.appendOutputLine("3. จะโหลด Comment เฉพาะของผู้ใช้งานนี้");
              }
            } catch (e0) {}
            try {
              if (typeof CB.refreshComments === "function") CB.refreshComments("setFilter");
            } catch (e1) {}
            replyOk(id, { ok: true });
            return;
          }

          replyErr(id, "Unknown command: " + cmd);
          return;
        } catch (e) {
          replyErr(id, e);
          return;
        }
      }
    } catch (e2) {
      try {
        CB.sendToHost({ type: "do:pluginError", error: String(e2) });
      } catch (e3) {}
    }
  };
})();

