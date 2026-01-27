// ONLYOFFICE editor bridge for comments/selection
(function () {
  var CB = (window.CB = window.CB || {});
  CB.editor = CB.editor || {};

  function exec(name, params, cb) {
    try {
      if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
        window.Asc.plugin.executeMethod(name, params || [], cb);
        return true;
      }
    } catch (e) {}
    return false;
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

  CB.editor.getSelectedText = function (cb) {
    execWithTimeout("GetSelectedText", [], 400, function (text) {
      try {
        cb && cb(text || "");
      } catch (e) {}
    });
  };

  function safeCall(obj, fnName, fallback) {
    try {
      var fn = obj && obj[fnName];
      if (typeof fn === "function") return fn.call(obj);
    } catch (e) {}
    return fallback;
  }

  function normalizeComment(raw) {
    var id =
      safeCall(raw, "GetId", "") ||
      safeCall(raw, "get_Id", "") ||
      raw?.Id ||
      raw?.id ||
      "";
    var data =
      safeCall(raw, "GetData", null) ||
      safeCall(raw, "get_Data", null) ||
      raw?.Data ||
      raw?.data ||
      null;
    // บาง build อาจส่ง commentData มาเป็น object ตรงๆ
    if (!data && raw && typeof raw === "object" && (raw.Text != null || raw.UserName != null)) {
      data = raw;
    }
    var text =
      safeCall(raw, "GetText", "") ||
      safeCall(raw, "get_Text", "") ||
      (data && (data.Text != null ? String(data.Text) : data.text != null ? String(data.text) : "")) ||
      "";
    var author =
      (data && (data.UserName != null ? String(data.UserName) : data.userName != null ? String(data.userName) : "")) || "";
    var quote =
      (data && (data.QuoteText != null ? String(data.QuoteText) : data.quoteText != null ? String(data.quoteText) : "")) || "";
    var time =
      (data && (data.Time != null ? String(data.Time) : data.time != null ? String(data.time) : "")) || "";
    var solved = Boolean(data && (data.Solved != null ? data.Solved : data.solved));
    return {
      id: String(id || "").trim(),
      text: String(text || ""),
      author: String(author || ""),
      quote: String(quote || ""),
      time: String(time || ""),
      solved: solved,
    };
  }

  CB.editor.getAllComments = function (cb) {
    execWithTimeout("GetAllComments", [], 1500, function (list) {
      var arr = [];
      try {
        arr = Array.isArray(list) ? list : [];
      } catch (e0) {
        arr = [];
      }
      var normalized = [];
      try {
        normalized = (arr || []).map(normalizeComment).filter(function (c) {
          return c && c.id;
        });
      } catch (e1) {
        normalized = [];
      }
      try {
        cb && cb(normalized);
      } catch (e2) {}
    });
  };

  CB.editor.moveToComment = function (id) {
    var cid = String(id || "").trim();
    if (!cid) return false;
    try {
      exec("MoveToComment", [cid], function () {});
      return true;
    } catch (e) {}
    return false;
  };

  CB.editor.addCommentAtSelection = function (opts, cb) {
    opts = opts || {};
    var text = String(opts.text || "");
    var authorName = String(opts.authorName || "");
    var quoteText = opts.quoteText != null ? String(opts.quoteText) : undefined;
    var time = String(Date.now());

    var commentData = {
      UserName: authorName || undefined,
      Text: text || "",
      Time: time,
      Solved: false,
      Replies: [],
    };
    if (quoteText) commentData.QuoteText = quoteText;

    execWithTimeout("AddComment", [commentData], 1200, function (commentId) {
      try {
        cb && cb(commentId || null);
      } catch (e) {}
    });
  };

  CB.editor.changeComment = function (opts, cb) {
    opts = opts || {};
    var id = String(opts.id || "");
    if (!id) {
      try {
        cb && cb(false);
      } catch (e0) {}
      return;
    }

    var text = String(opts.text || "");
    var authorName = String(opts.authorName || "");
    var quoteText = opts.quoteText != null ? String(opts.quoteText) : undefined;
    var solved = Boolean(opts.solved);
    var time = String(Date.now());

    var commentData = {
      UserName: authorName || undefined,
      Text: text || "",
      Time: time,
      Solved: solved,
      Replies: [],
    };
    if (quoteText) commentData.QuoteText = quoteText;

    try {
      exec("ChangeComment", [id, commentData], function () {
        try {
          cb && cb(true);
        } catch (e1) {}
      });
    } catch (e2) {
      try {
        cb && cb(false);
      } catch (e3) {}
    }
  };

  CB.editor.removeComments = function (ids, cb) {
    var arr = [];
    try {
      arr = Array.isArray(ids) ? ids : [ids];
    } catch (e0) {
      arr = [];
    }
    arr = (arr || []).map(function (x) { return String(x || "").trim(); }).filter(Boolean);
    if (!arr.length) {
      try { cb && cb(false); } catch (e1) {}
      return;
    }
    try {
      exec("RemoveComments", [arr], function () {
        try { cb && cb(true); } catch (e2) {}
      });
    } catch (e3) {
      try { cb && cb(false); } catch (e4) {}
    }
  };
})();

