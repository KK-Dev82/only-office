// Comment Bridge bootstrap
(function () {
  var CB = (window.CB = window.CB || {});
  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  function escapeHtml(s) {
    try {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    } catch (e) {
      return "";
    }
  }

  function formatTime(msOrStr) {
    try {
      var n = Number(msOrStr);
      if (!Number.isFinite(n) || n <= 0) return "";
      var d = new Date(n);
      if (String(d) === "Invalid Date") return "";
      return d.toLocaleString();
    } catch (e) {
      return "";
    }
  }

  function renderComments(list) {
    var host = CB.$("comments");
    if (!host) return;
    var arr = [];
    try {
      arr = Array.isArray(list) ? list : [];
    } catch (e0) {
      arr = [];
    }

    if (!arr.length) {
      host.innerHTML = '<div class="cbEmpty">ยังไม่พบคอมเมนต์ในเอกสาร (หรือยังโหลดไม่เสร็จ)</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i] || {};
      var id = String(c.id || "").trim();
      var author = String(c.author || "").trim() || "ไม่ทราบชื่อ";
      var text = String(c.text || "");
      var solved = Boolean(c.solved);
      var ts = formatTime(c.time);
      var quote = String(c.quote || "").trim();
      html +=
        '<div class="cbCommentItem" data-cid="' +
        escapeHtml(id) +
        '">' +
        '<div class="cbCommentTop">' +
        '<div class="cbCommentAuthor">' +
        escapeHtml(author) +
        "</div>" +
        '<div class="cbCommentTime">' +
        escapeHtml(ts) +
        "</div>" +
        "</div>" +
        '<div class="cbCommentText">' +
        escapeHtml(text || "(ไม่มีข้อความ)") +
        "</div>" +
        '<div class="cbCommentMeta">' +
        '<span class="cbPill">id: ' +
        escapeHtml(id) +
        "</span>" +
        (solved ? '<span class="cbPill">Solved</span>' : '<span class="cbPill">Open</span>') +
        (quote ? '<span class="cbPill">Quote: ' + escapeHtml(quote) + "</span>" : "") +
        "</div>" +
        "</div>";
    }
    host.innerHTML = html;

    // click -> jump to comment
    try {
      host.onclick = function (ev) {
        var el = ev && ev.target ? ev.target : null;
        while (el && el !== host) {
          if (el && el.getAttribute) {
            var cid = el.getAttribute("data-cid");
            if (cid) {
              try {
                CB.editor && CB.editor.moveToComment && CB.editor.moveToComment(cid);
              } catch (e1) {}
              return;
            }
          }
          el = el && el.parentNode ? el.parentNode : null;
        }
      };
    } catch (e2) {}
  }

  CB.refreshComments = function (reason) {
    try {
      CB.setStatus("loading comments…");
      CB.appendOutputLine("refreshComments: " + String(reason || "manual"));
    } catch (e0) {}
    try {
      if (!CB.editor || typeof CB.editor.getAllComments !== "function") {
        CB.setStatus("no GetAllComments");
        renderComments([]);
        return;
      }
      CB.editor.getAllComments(function (list) {
        try {
          renderComments(list || []);
          CB.setStatus("ready");
          CB.setOutput({
            plugin: "Comment Bridge",
            version: CB.VERSION,
            comments: Array.isArray(list) ? list.length : 0,
          });
        } catch (e1) {
          try {
            CB.setStatus("error");
            CB.appendOutputLine("refreshComments error: " + String(e1));
          } catch (e2) {}
        }
      });
    } catch (e3) {
      try {
        CB.setStatus("error");
        CB.appendOutputLine("refreshComments exception: " + String(e3));
      } catch (e4) {}
    }
  };

  window.Asc.plugin.init = function () {
    try {
      CB.setStatus("ready");
      CB.setOutput({
        plugin: "Comment Bridge",
        version: CB.VERSION,
        note: "Left panel bridge for selection/comments",
      });
      CB.sendToHost({ type: "do:pluginReady", version: CB.VERSION, plugin: "comment-bridge" });

      try {
        var btn = CB.$("refreshBtn");
        if (btn) {
          btn.onclick = function () {
            try {
              CB.refreshComments("button");
            } catch (e0) {}
          };
        }
      } catch (e1) {}

      // initial refresh (wait a bit for document load)
      try {
        setTimeout(function () {
          try {
            CB.refreshComments("init");
          } catch (e0) {}
        }, 350);
      } catch (e2) {}
    } catch (e) {
      try {
        CB.setStatus("error");
        CB.setOutput({ ok: false, error: String(e) });
        CB.sendToHost({ type: "do:pluginError", error: String(e) });
      } catch (e2) {}
    }
  };

  window.Asc.plugin.button = function () {
    // ต้องการให้ panel เปิดค้าง: ไม่สั่งปิดจากปุ่ม
  };

  window.Asc.plugin.onClose = function () {
    // ต้องการให้ panel เปิดค้าง: ไม่ต้องทำอะไรเป็นพิเศษ
    // (ถ้าผู้ใช้ปิดเองจาก UI ระบบอาจจะยังปิดได้ตาม behavior ของ ONLYOFFICE)
  };
})();

