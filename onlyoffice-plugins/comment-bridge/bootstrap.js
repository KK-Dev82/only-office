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

  /** ปกติ author สำหรับเปรียบเทียบ (trim + รวมช่องว่างติดกันเป็นหนึ่ง) เพื่อให้ match กับชื่อจาก host */
  function normalizeAuthor(s) {
    try {
      return String(s || "").trim().replace(/\s+/g, " ").trim();
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
      // ถ้ามี currentUserDisplayName จาก Backend user-info แต่ filterByAuthor ยังไม่ตั้ง → ใช้เป็น filter (fallback)
      if (!CB.filterByAuthor && CB.currentUserDisplayName) {
        CB.filterByAuthor = String(CB.currentUserDisplayName).trim();
        CB.appendOutputLine("ใช้ currentUserDisplayName เป็น filter: \"" + CB.filterByAuthor + "\"");
      }
      // กรองด้วย userId เป็นหลัก (author มาจาก OnlyOffice แบบ "SM:userId displayName") — แสดงเฉพาะของเราแน่นอน
      CB.setStatus("loading comments…");
      CB.appendOutputLine("refreshComments: " + String(reason || "manual"));
      if (CB.currentUserId) {
        CB.appendOutputLine("กำลังโหลด Comment ของผู้ใช้งาน (userId: " + String(CB.currentUserId).substring(0, 8) + "…)");
      } else if (CB.filterByAuthor) {
        CB.appendOutputLine("กำลังโหลด Comment ของผู้ใช้งาน: \"" + String(CB.filterByAuthor) + "\"");
      } else {
        CB.appendOutputLine("กำลังโหลด Comment ทั้งหมด (ไม่มี filter)");
      }
    } catch (e0) {}
    try {
      if (!CB.editor || typeof CB.editor.getAllComments !== "function") {
        CB.setStatus("no GetAllComments");
        renderComments([]);
        return;
      }
      CB.editor.getAllComments(function (list) {
        try {
          var arr = Array.isArray(list) ? list : [];
          var totalBefore = arr.length;
          var filterByUserId = CB.currentUserId ? String(CB.currentUserId).trim() : "";
          var filterByAuthor = CB.filterByAuthor ? String(CB.filterByAuthor).trim() : "";
          if (filterByUserId || filterByAuthor) {
            arr = arr.filter(function (c) {
              var authorRaw = String(c && c.author != null ? c.author : "").trim();
              var authNorm = normalizeAuthor(authorRaw);
              if (filterByUserId) {
                var prefix = "SM:" + filterByUserId;
                if (authorRaw.indexOf(prefix) === 0 || authNorm.indexOf(prefix) >= 0) return true;
              }
              if (filterByAuthor && !filterByUserId) {
                var wantNorm = normalizeAuthor(filterByAuthor);
                if (authNorm === wantNorm || (wantNorm && authNorm.indexOf(wantNorm) >= 0)) return true;
              }
              return false;
            });
            CB.appendOutputLine("แสดง " + arr.length + " รายการ Comment ของผู้ใช้งาน (จากทั้งหมด " + totalBefore + " รายการ)");
          } else {
            CB.appendOutputLine("แสดง Comment ทั้งหมด " + arr.length + " รายการ (ไม่มี filter)");
          }
          renderComments(arr);
          CB.setStatus("ready");
          if (typeof updateUserBar === "function") updateUserBar();
          CB.setOutput({
            plugin: "Comment Bridge",
            version: CB.VERSION,
            comments: arr.length,
            filterByAuthor: CB.filterByAuthor || null,
            totalBeforeFilter: totalBefore,
            currentUser: CB.currentUserDisplayName != null ? CB.currentUserDisplayName : "(รอจาก host)",
            userRole: CB.currentUserRole != null ? CB.currentUserRole : "(รอจาก host)",
          });
          // บันทึก comment ของผู้ใช้ไปยัง Backend (Plugin → API บันทึก comment)
          if (typeof CB.saveCommentToBackend === "function") {
            for (var i = 0; i < arr.length; i++) {
              var c = arr[i] || {};
              var id = String(c.id || "").trim();
              if (id) CB.saveCommentToBackend(id, c.text || "", c.quote || "");
            }
          }
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

  // บันทึก comment ไปยัง Backend (Plugin → API บันทึก comment, Frontend ดึงจาก Backend)
  CB.saveCommentToBackend = function (commentId, text, quoteText) {
    var documentId = (typeof window.__CB_DOCUMENT_ID__ !== "undefined" && window.__CB_DOCUMENT_ID__ != null)
      ? String(window.__CB_DOCUMENT_ID__).trim() : "";
    var token = (typeof window.__CB_TOKEN__ !== "undefined" && window.__CB_TOKEN__ != null)
      ? String(window.__CB_TOKEN__).trim() : "";
    var apiBase = (typeof window.__CB_API_BASE__ !== "undefined" && window.__CB_API_BASE__ != null)
      ? String(window.__CB_API_BASE__).trim().replace(/\/+$/, "") + "/" : "";
    if (!documentId || !token || !commentId) return;
    var url = apiBase + "api/onlyoffice/comment-bridge/save-comment?token=" + encodeURIComponent(token);
    var body = JSON.stringify({
      documentId: documentId,
      commentId: commentId,
      text: text || "",
      quoteText: quoteText || "",
    });
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
      }).then(function (res) {
        if (!res.ok) CB.appendOutputLine("save-comment API error: " + res.status);
      }).catch(function (err) {
        CB.appendOutputLine("save-comment fetch error: " + String(err));
      });
    } catch (e) {
      CB.appendOutputLine("save-comment exception: " + String(e));
    }
  };

  // ดึงข้อมูลผู้ใช้จาก Backend API (เมื่อโหลด plugin ด้วย token ใน URL)
  // มี timeout 8 วินาที เพื่อไม่ให้ค้างที่ "loading..." ถ้า fetch ค้างหรือล้มเหลว
  function fetchUserInfoFromToken(token, apiBaseUrlFromQuery, done) {
    if (!token || typeof token !== "string" || !token.trim()) {
      if (typeof done === "function") done(null);
      return;
    }
    var finished = false;
    function onceDone(data) {
      if (finished) return;
      finished = true;
      try { if (timeoutId) clearTimeout(timeoutId); } catch (e0) {}
      if (typeof done === "function") done(data);
    }
    var timeoutId = setTimeout(function () {
      CB.appendOutputLine("user-info timeout (8s) — เรียก finishInit แล้ว");
      onceDone(null);
    }, 8000);

    var base = (apiBaseUrlFromQuery != null && String(apiBaseUrlFromQuery).trim()) ? String(apiBaseUrlFromQuery).trim() : "";
    var apiBase = base ? base.replace(/\/+$/, "") + "/" : "";
    var path = "api/onlyoffice/comment-bridge/user-info?token=" + encodeURIComponent(token.trim());
    var url = apiBase ? (apiBase + path) : "/" + path;
    CB.appendOutputLine("กำลังโหลดข้อมูลผู้ใช้จาก Backend (token)… " + (apiBase ? "apiBase=" + apiBase : "relative /" + path));
    try {
      fetch(url)
        .then(function (res) {
          if (!res.ok) {
            CB.appendOutputLine("user-info API error: " + res.status);
            onceDone(null);
            return;
          }
          return res.json();
        })
        .then(function (data) {
          if (!data || typeof data !== "object") {
            onceDone(null);
            return;
          }
          var dn = data.userDisplayName != null ? String(data.userDisplayName).trim() : "";
          var uid = data.userId != null ? String(data.userId).trim() : "";
          var role = data.userRole != null ? String(data.userRole).trim() : "";
          if (dn) {
            CB.currentUserDisplayName = dn;
            CB.filterByAuthor = dn;
          }
          if (uid) CB.currentUserId = uid;
          if (role) CB.currentUserRole = role;
          CB.appendOutputLine("ได้รับ User จาก Backend: \"" + (CB.currentUserDisplayName || "") + "\" role=\"" + (CB.currentUserRole || "") + "\"");
          onceDone(data);
        })
        .catch(function (err) {
          CB.appendOutputLine("user-info fetch error: " + String(err));
          onceDone(null);
        });
    } catch (e0) {
      CB.appendOutputLine("user-info exception: " + String(e0));
      onceDone(null);
    }
  }

  function updateUserBar() {
    try {
      var bar = CB.$("userBar");
      var nameEl = CB.$("userBarName");
      var roleEl = CB.$("userBarRole");
      if (bar && nameEl && roleEl) {
        var name = CB.currentUserDisplayName != null ? String(CB.currentUserDisplayName).trim() : "";
        var role = CB.currentUserRole != null ? String(CB.currentUserRole).trim() : "";
        nameEl.textContent = name || "—";
        roleEl.textContent = role || "—";
        bar.style.display = name || role ? "block" : "none";
      }
    } catch (e0) {}
  }

  window.Asc.plugin.init = function (initOptions) {
    try {
      CB.appendOutputLine("--- Plugin init เริ่มต้น ---");
      try {
        var search = window.location.search || "";
        CB.appendOutputLine("URL query: " + (search || "(ไม่มี)"));
        CB.appendOutputLine("token in URL: " + (search.indexOf("token=") >= 0 ? "ใช่" : "ไม่"));
        var hasWindowToken = typeof window.__CB_TOKEN__ !== "undefined" && window.__CB_TOKEN__;
        CB.appendOutputLine("window.__CB_TOKEN__: " + (hasWindowToken ? "มี" : "ไม่มี"));
        var hasWindowBase = typeof window.__CB_API_BASE__ !== "undefined" && window.__CB_API_BASE__;
        CB.appendOutputLine("window.__CB_API_BASE__: " + (hasWindowBase ? "มี" : "ไม่มี"));
      } catch (e00) {}
      // ทางเดียวที่ทำงานได้: อ่าน token จาก URL (index.html?token=...&apiBaseUrl=...) แล้ว fetch Backend user-info
      var opts = (initOptions && typeof initOptions === "object") ? initOptions : {};
      try {
        if (window.Asc && window.Asc.plugin && !opts.userDisplayName) {
          var po = window.Asc.plugin.option || window.Asc.plugin.options;
          if (po && typeof po === "object") opts = po;
        }
      } catch (e0) {}
      try {
        var params = new URLSearchParams(window.location.search || "");
        if (params.get("userDisplayName") != null) opts.userDisplayName = params.get("userDisplayName");
        if (params.get("userId") != null) opts.userId = params.get("userId");
        if (params.get("userRole") != null) opts.userRole = params.get("userRole");
      } catch (e1) {}
      if (opts && typeof opts === "object") {
        var dn = (opts.userDisplayName != null ? String(opts.userDisplayName).trim() : "") || (opts.name != null ? String(opts.name).trim() : "");
        var uid = opts.userId != null ? String(opts.userId).trim() : "";
        var role = opts.userRole != null ? String(opts.userRole).trim() : "";
        if (dn) {
          CB.currentUserDisplayName = dn;
          CB.filterByAuthor = dn;
        }
        if (uid) CB.currentUserId = uid;
        if (role) CB.currentUserRole = role;
      }

      var tokenFromUrl = null;
      var apiBaseUrlFromQuery = null;
      try {
        var params2 = new URLSearchParams(window.location.search || "");
        tokenFromUrl = params2.get("token");
        apiBaseUrlFromQuery = params2.get("apiBaseUrl");
      } catch (e2) {}
      // เมื่อ Backend serve หน้า plugin (/api/onlyoffice/comment-bridge/page) จะฝัง token ใน window
      var tokenFromWindow = (typeof window.__CB_TOKEN__ !== "undefined" && window.__CB_TOKEN__ != null)
        ? String(window.__CB_TOKEN__).trim() : "";
      var apiBaseFromWindow = (typeof window.__CB_API_BASE__ !== "undefined" && window.__CB_API_BASE__ != null)
        ? String(window.__CB_API_BASE__).trim() : "";
      var tokenFromOptions = (opts && (opts.commentBridgeToken != null || opts.token != null))
        ? String(opts.commentBridgeToken != null ? opts.commentBridgeToken : opts.token || "").trim()
        : "";
      var apiBaseUrlFromOptions = (opts && opts.apiBaseUrl != null) ? String(opts.apiBaseUrl).trim() : "";

      function finishInit() {
        updateUserBar();
        CB.setStatus("ready");
        CB.appendOutputLine("--- Plugin เปิดแล้ว ---");
        if (CB.currentUserDisplayName) {
          CB.appendOutputLine("1. ตอนนี้ User (จาก Backend user-info): \"" + CB.currentUserDisplayName + "\"");
          CB.appendOutputLine("2. User Role: \"" + (CB.currentUserRole || "(ไม่ระบุ)") + "\"");
        } else {
          CB.appendOutputLine("ไม่มี token ใน URL — เปิดเอกสารใหม่หรือรีเฟรช (Plugin ต้องโหลดจาก config?token=...)");
        }
        CB.setOutput({
          plugin: "Comment Bridge",
          version: CB.VERSION,
          note: "Left panel bridge for selection/comments",
          log: CB.currentUserDisplayName ? "Plugin เปิดแล้ว — มี User จาก Backend (token ใน URL)" : "Plugin เปิดแล้ว — ไม่มี token ใน URL",
          currentUser: CB.currentUserDisplayName || "(รอจาก host)",
          userRole: CB.currentUserRole != null && CB.currentUserRole !== "" ? CB.currentUserRole : "(รอจาก host)",
          filterByAuthor: CB.filterByAuthor || null,
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

        try {
          setTimeout(function () {
            try {
              CB.refreshComments("init");
            } catch (e0) {}
          }, 900);
        } catch (e2) {}
      }

      var tokenToUse = tokenFromUrl || tokenFromWindow || tokenFromOptions;
      var apiBaseToUse = apiBaseUrlFromQuery || apiBaseFromWindow || apiBaseUrlFromOptions;
      if (tokenToUse && !CB.currentUserDisplayName) {
        fetchUserInfoFromToken(tokenToUse, apiBaseToUse, function () {
          finishInit();
        });
      } else {
        finishInit();
      }
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

