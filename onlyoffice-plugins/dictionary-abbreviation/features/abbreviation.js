// Abbreviation feature (local-first)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};
  DO.features.abbreviation = DO.features.abbreviation || {};
  DO.state = DO.state || {};
  DO.state._abbrUi = DO.state._abbrUi || { lastToken: "", items: [], selectedIndex: 0, keyBound: false, bound: false };

  // จำนวนตัวอักษรขั้นต่ำของคำย่อที่ใช้สำหรับ live-suggest
  var ABBR_MIN_CHARS = 2;

  function isAutoFocusEnabled() {
    try {
      var href = String((window.location && window.location.href) || "");
      var q = String((window.location && window.location.search) || "");
      return /(?:\?|&)af=1(?:&|$)/.test(q) || /(?:\?|&)af=1(?:&|$)/.test(href);
    } catch (e) {
      return false;
    }
  }

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderHighlight(text, prefix) {
    var t = String(text || "");
    var p = String(prefix || "");
    if (!p) return escHtml(t);
    var idx = t.toLowerCase().indexOf(p.toLowerCase());
    if (idx < 0) return escHtml(t);
    return (
      escHtml(t.slice(0, idx)) +
      '<span class="doHL">' +
      escHtml(t.slice(idx, idx + p.length)) +
      "</span>" +
      escHtml(t.slice(idx + p.length))
    );
  }

  function iconSvg(type) {
    if (type === "insert") {
      return (
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path fill="currentColor" d="M5 20h14v-2H5v2zm7-18c-.55 0-1 .45-1 1v9.17l-3.59-3.58L6 10l6 6 6-6-1.41-1.41L13 12.17V3c0-.55-.45-1-1-1z"/>' +
        "</svg>"
      );
    }
    if (type === "delete") {
      return (
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path fill="currentColor" d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2zm-5 2h16v2H4V6z"/>' +
        "</svg>"
      );
    }
    return "";
  }

  function makeIconButton(opts) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "doIconBtn";
    try { btn.setAttribute("aria-label", String(opts.ariaLabel || "")); } catch (e0) {}
    try { btn.title = String(opts.title || opts.ariaLabel || ""); } catch (e1) {}
    btn.innerHTML = String(opts.svg || "");
    if (typeof opts.onClick === "function") btn.addEventListener("click", opts.onClick);
    return btn;
  }

  function render() {
    var root = DO.$("abbrList");
    if (!root) return;
    root.innerHTML = "";

    var items = DO.store.abbreviations || [];
    for (var i = 0; i < items.length; i++) {
      var a = items[i];
      var scope = String(a.scope || a.Scope || "Local");
      var isLocal = scope === "Local";
      if (!isLocal) continue; // แสดงเฉพาะ Local ตาม requirement
      var div = document.createElement("div");
      div.className = "doItem";
      var row = document.createElement("div");
      row.className = "doItemRow";
      var text = document.createElement("div");
      text.className = "doItemText";
      text.textContent = String(a.shortForm || "") + " → " + String(a.fullForm || "");
      var actions = document.createElement("div");
      actions.className = "doItemActions doItemActionsUnder";

      actions.appendChild(
        makeIconButton({
          ariaLabel: "Insert",
          title: "Insert",
          svg: iconSvg("insert"),
          onClick: (function (t, id) {
            return function () {
              DO.debugLog("abbr_insert", { id: id });
              DO.editor.insertText(t);
            };
          })(a.fullForm || "", a.id),
        })
      );

      actions.appendChild(
        makeIconButton({
          ariaLabel: "Delete",
          title: "Delete",
          svg: iconSvg("delete"),
          onClick: (function (id) {
            return function () {
              DO.store.abbreviations = (DO.store.abbreviations || []).filter(function (x) {
                return String(x.id) !== String(id);
              });
              DO.persist.abbreviations();
              render();
              DO.debugLog("abbr_delete", { id: id });
            };
          })(a.id),
        })
      );

      row.appendChild(text);
      div.appendChild(row);
      div.appendChild(actions);
      root.appendChild(div);
    }

    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "doMuted";
      empty.textContent = "ยังไม่มีคำย่อ";
      root.appendChild(empty);
    }
  }

  function addFromUi() {
    var sEl = DO.$("abbrShort");
    var fEl = DO.$("abbrFull");
    var s = sEl ? String(sEl.value || "").trim() : "";
    var f = fEl ? String(fEl.value || "").trim() : "";
    if (!s || !f) {
      try {
        if (DO.setStatus) DO.setStatus("กรุณากรอกคำย่อและคำเต็ม");
      } catch (e0) {}
      return;
    }

    DO.store.abbreviations = DO.store.abbreviations || [];
    DO.store.abbreviations.push({ id: DO.newId("abbr"), shortForm: s, fullForm: f, scope: "Local" });
    DO.persist.abbreviations();
    if (sEl) sEl.value = "";
    if (fEl) fEl.value = "";
    render();
    DO.debugLog("abbr_add", { shortForm: s, fullLen: f.length });
    try {
      if (DO.setStatus) DO.setStatus('เพิ่มคำย่อแล้ว: "' + s + '"');
    } catch (e1) {}
  }

  function expandFromSelection() {
    DO.editor.getSelectedText(function (sel) {
      var key = String(sel || "").trim().toLowerCase();
      if (!key) return;

      var found = null;
      var items = DO.store.abbreviations || [];
      for (var i = 0; i < items.length; i++) {
        if (String(items[i].shortForm || "").trim().toLowerCase() === key) {
          found = items[i];
          break;
        }
      }

      if (found) {
        DO.debugLog("abbr_expand", { shortForm: key });
        DO.editor.replaceSelectionText(found.fullForm || "");
      } else {
        DO.debugLog("abbr_expand_not_found", { selection: sel });
        DO.setOutput({ ok: false, error: "ไม่พบคำย่อสำหรับ selection", selection: sel });
      }
    });
  }

  function bind() {
    try {
      if (DO.state._abbrUi.bound) return;
      DO.state._abbrUi.bound = true;
    } catch (e0) {}

    var abbrAdd = DO.$("abbrAdd");
    if (abbrAdd) abbrAdd.addEventListener("click", function () { addFromUi(); });

    // Enter triggers add
    var sEl = DO.$("abbrShort");
    if (sEl) {
      sEl.addEventListener("keydown", function (e) {
        try {
          if (e && e.key === "Enter") {
            e.preventDefault();
            addFromUi();
          }
        } catch (e0) {}
      });
    }
    var fEl = DO.$("abbrFull");
    if (fEl) {
      fEl.addEventListener("keydown", function (e) {
        try {
          if (e && e.key === "Enter") {
            e.preventDefault();
            addFromUi();
          }
        } catch (e0) {}
      });
    }

    // โหมดคำย่อ: ปรับให้เป็น auto เสมอ (ไม่มี checkbox)
    try {
      DO.state = DO.state || {};
      DO.state.abbreviationMode = "auto";
      try {
        if (DO.canUseLocalStorage && DO.canUseLocalStorage() && DO.STORAGE_KEYS && DO.STORAGE_KEYS.abbreviationMode) {
          DO.storageSave(DO.STORAGE_KEYS.abbreviationMode, "auto");
        }
      } catch (eStore) {}
    } catch (e2) {}
  }

  function insertExpanded(fullText) {
    try {
      var full = String(fullText || "");
      if (!full) return;
      try { DO.debugLog && DO.debugLog("abbr_accept", { fullLen: full.length }); } catch (eLog) {}
      // Prefer replace token (autocomplete-like) instead of appending after token.
      try {
        var st = DO.state._abbrUi || {};
        var tokenNow = String(st.lastToken || "").trim();
        if (!tokenNow) {
          // fallback: sometimes token is tracked under dictSuggest state (shared detector)
          try { tokenNow = String((DO.state._dictSuggest && DO.state._dictSuggest.lastToken) || "").trim(); } catch (e1) {}
        }
        if (tokenNow && DO.editor && typeof DO.editor.replaceLastTokenInParagraph === "function") {
          DO.editor.replaceLastTokenInParagraph(tokenNow, full);
        } else {
          DO.editor.insertText(full);
        }
      } catch (e0) {
        DO.editor.insertText(full);
      }
      // cancel suggestions immediately
      try { DO.features.abbreviation.renderInlineSuggestions("", [], 0); } catch (e0) {}
    } catch (e) {}
  }

  // Expose accept method for InputHelper integration (keyboard from editor)
  DO.features.abbreviation.insertExpanded = insertExpanded;

  function bindSuggestionKeysOnce() {
    try {
      if (DO.state._abbrUi.keyBound) return;
      DO.state._abbrUi.keyBound = true;
      document.addEventListener(
        "keydown",
        function (e) {
          try {
            // Only handle keys when Abbreviation tab is active (avoid conflicts with Dictionary tab)
            try {
              if (DO.state && DO.state.activeTab && String(DO.state.activeTab) !== "abbreviation") return;
            } catch (eTab) {}
            var st = DO.state._abbrUi || {};
            var items = st.items || [];
            var key = e && e.key ? String(e.key) : "";

            // If user is typing into an input in the panel, do not hijack keys
            try {
              var tgt = e && e.target;
              var tag = tgt && tgt.tagName ? String(tgt.tagName).toLowerCase() : "";
              if (tag === "input" || tag === "textarea") return;
            } catch (eTgt) {}

            if (key === "Escape") {
              st.selectedIndex = 0;
              st.items = [];
              st.lastToken = "";
              try { DO.features.abbreviation.renderInlineSuggestions("", [], 0); } catch (e0) {}
              e.preventDefault();
              e.stopPropagation();
              return;
            }

            if (!items.length) return;
            // Navigation + accept (works when plugin panel is focused):
            // - ArrowUp/ArrowDown: select
            // - Enter / ArrowRight / Tab: accept/insert
            if (
              key !== "ArrowDown" &&
              key !== "ArrowUp" &&
              key !== "Enter" &&
              key !== "ArrowRight" &&
              key !== "Tab"
            )
              return;
            e.preventDefault();
            e.stopPropagation();

            if (key === "ArrowDown") {
              st.selectedIndex = (Number(st.selectedIndex || 0) + 1) % items.length;
              DO.features.abbreviation.renderInlineSuggestions(st.lastToken, items, st.selectedIndex);
              return;
            }
            if (key === "ArrowUp") {
              st.selectedIndex = (Number(st.selectedIndex || 0) - 1 + items.length) % items.length;
              DO.features.abbreviation.renderInlineSuggestions(st.lastToken, items, st.selectedIndex);
              return;
            }
            if (key === "Enter" || key === "ArrowRight" || key === "Tab") {
              var pick = items[Number(st.selectedIndex || 0)] || null;
              if (pick && pick.fullForm) insertExpanded(pick.fullForm);
              return;
            }
          } catch (e0) {}
        },
        true
      );
    } catch (e1) {}
  }

  // Suggestion rendering for abbreviations (panel-only mode)
  function renderInlineSuggestions(token, items, selectedIndex) {
    try {
      var root = DO.$("abbrSuggest");
      if (!root) return;

      token = String(token || "").trim();
      items = items || [];

      var st = DO.state._abbrUi || (DO.state._abbrUi = {});
      var hadItems = Boolean(st.items && st.items.length);
      var prevToken = String(st.lastToken || "");
      st.lastToken = token;
      st.items = items.slice(0);
      if (selectedIndex === undefined || selectedIndex === null) selectedIndex = st.selectedIndex || 0;
      st.selectedIndex = Math.max(0, Math.min(Number(selectedIndex || 0), Math.max(0, items.length - 1)));

      root.innerHTML = "";

      if (!token || token.length < 1) {
        var hint = document.createElement("div");
        hint.className = "doMuted";
        hint.textContent = "พิมพ์คำย่อในเอกสาร แล้วดูคำแนะนำที่นี่ (Esc ยกเลิก)";
        root.appendChild(hint);
        return;
      }

      if (!items.length) {
        var empty = document.createElement("div");
        empty.className = "doMuted";
        empty.textContent = "ไม่พบคำย่อสำหรับ: " + token;
        root.appendChild(empty);
        return;
      }

      var tip = document.createElement("div");
      tip.className = "doMuted";
      tip.appendChild(document.createTextNode('คำย่อที่พบ: "'));
      var sp = document.createElement("span");
      sp.className = "doHL";
      sp.textContent = token;
      tip.appendChild(sp);
      tip.appendChild(document.createTextNode('" — กด ↑/↓ เลือก, Enter เพื่อ Insert, Esc ยกเลิก'));
      root.appendChild(tip);

      for (var i = 0; i < items.length; i++) {
        var a = items[i] || {};
        var shortForm = String(a.shortForm || "");
        var fullForm = String(a.fullForm || "");
        if (!shortForm && !fullForm) continue;

        var div = document.createElement("div");
        div.className = "doItem" + (i === st.selectedIndex ? " doIsSelected" : "");
        var row = document.createElement("div");
        row.className = "doItemRow";
        var text = document.createElement("div");
        text.className = "doItemText";
        text.innerHTML = renderHighlight(shortForm, token) + " → " + escHtml(fullForm);
        var actions = document.createElement("div");
        actions.className = "doItemActions";
        var btn = document.createElement("button");
        btn.textContent = "Insert";
        btn.addEventListener(
          "click",
          (function (ff, idx) {
            return function () {
              try { st.selectedIndex = idx; } catch (e0) {}
              insertExpanded(ff);
            };
          })(fullForm, i)
        );
        actions.appendChild(btn);
        row.appendChild(text);
        row.appendChild(actions);
        div.appendChild(row);
        div.addEventListener(
          "click",
          (function (idx) {
            return function () {
              try {
                st.selectedIndex = idx;
                // Click = accept immediately (doesn't require panel focus / Enter)
                var pick = (st.items || [])[idx] || null;
                if (pick && pick.fullForm) {
                  insertExpanded(pick.fullForm);
                  return;
                }
                DO.features.abbreviation.renderInlineSuggestions(st.lastToken, st.items, st.selectedIndex);
              } catch (e0) {}
            };
          })(i)
        );
        root.appendChild(div);
      }

      bindSuggestionKeysOnce();
      // IMPORTANT:
      // Auto-focus will steal focus from the editor, making it feel like "typing is blocked"
      // when suggestions appear (e.g. after typing "สฟ"). Keep it opt-in only.
      if (isAutoFocusEnabled()) {
        try {
          var shouldFocus = (!hadItems && items.length) || (prevToken !== token && items.length);
          if (shouldFocus) {
            try {
              var p = window.Asc && window.Asc.plugin;
              if (p && typeof p.executeMethod === "function") {
                try { p.executeMethod("SetFocusToPlugin", []); } catch (e0) {}
              }
            } catch (e1) {}
            try { window.focus(); } catch (e2) {}
            try {
              var trap = document.getElementById("doFocusTrap");
              if (trap && trap.focus) trap.focus({ preventScroll: true });
            } catch (e3) {}
          }
        } catch (e4) {}
      }
    } catch (e2) {}
  }

  // เชื่อมต่อ function ภายในกับ namespace ภายนอก
  DO.features.abbreviation.renderInlineSuggestions = renderInlineSuggestions;

  // -------- Live-suggest handler (ใช้จาก inputhelper.js) --------

  function shouldDetectAbbrFromTokenInfo(tokenInfo) {
    // ปรับ boundary ให้ simple ขึ้น:
    // - มองจาก token สุดท้ายอย่างเดียว
    // - ขอเพียงยาวอย่างน้อย ABBR_MIN_CHARS ก็ให้เริ่ม detect ได้
    // ทำให้กรณีที่คำย่อพิมพ์ต่อท้ายคำอื่น (เช่น "การสฝฝ") ก็ยัง detect ได้ตามที่ออกแบบไว้
    try {
      tokenInfo = tokenInfo || {};
      var token = String(tokenInfo.token || "");
      if (!token || token.length < ABBR_MIN_CHARS) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function findAbbrMatchesForToken(token) {
    var q = String(token || "").trim().toLowerCase();
    if (!q) return [];
    var items = (DO.store && DO.store.abbreviations) ? DO.store.abbreviations : [];
    var out = [];
    var seen = {};
    for (var i = 0; i < items.length; i++) {
      var a = items[i] || {};
      var shortForm = String(a.shortForm || "").trim();
      var fullForm = String(a.fullForm || "").trim();
      if (!shortForm || !fullForm) continue;
      if (shortForm.toLowerCase().indexOf(q) === 0) {
        var key = shortForm.toLowerCase() + "|" + fullForm;
        if (seen[key]) continue; // กัน duplicate จาก storage เก่า/ใหม่
        seen[key] = true;
        out.push({ id: a.id, shortForm: shortForm, fullForm: fullForm });
      }
    }
    // เรียงยาวสุดก่อน (สสฝฝ ก่อน สฝฝ) ให้สอดคล้องกับ findCompletedAbbreviationFromParagraph
    try {
      out.sort(function (a, b) {
        var la = (a.shortForm || "").length;
        var lb = (b.shortForm || "").length;
        return lb - la;
      });
    } catch (eSort) {}
    return out;
  }

  function handleLiveToken(tokenInfo) {
    try {
      tokenInfo = tokenInfo || { token: "", start: -1, text: "" };
      var token = String(tokenInfo.token || "").trim();

      if (!token || !shouldDetectAbbrFromTokenInfo(tokenInfo)) {
        try {
          DO.state._lastAbbrHasMatches = false;
        } catch (e0) {}
        try {
          renderInlineSuggestions("", [], 0);
        } catch (e1) {}
        return;
      }

      var matches = findAbbrMatchesForToken(token);

      try {
        DO.state = DO.state || {};
        DO.state._lastAbbrHasMatches = matches.length > 0;
      } catch (e0) {}
      try {
        if (DO.debugLog) 
          DO.debugLog("abbr_live_token", { token: token, matches: matches.length });
      } catch (eLog) {}

      // ส่งข้อมูลเข้า hub กลาง (ถ้ามี) เพื่อเตรียมรวม Dict+Abbr ในอนาคต
      try {
        if (DO.features && DO.features.suggestHub && typeof DO.features.suggestHub.update === "function") {
          DO.features.suggestHub.update(tokenInfo, null, matches);
        }
      } catch (eHub) {}

      renderInlineSuggestions(token, matches, 0);
    } catch (e) {}
  }

  DO.features.abbreviation.handleLiveToken = handleLiveToken;

  // -------- ตรวจ “คำย่อที่พิมพ์ครบแล้ว” ทั้งย่อหน้า --------

  function findCompletedAbbreviationFromParagraph(paraText) {
    try {
      var s = String(paraText || "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+$/g, ""); // ตัดช่องว่าง/newline ท้ายสุดออก
      if (!s) return null;

      var list = (DO.store && DO.store.abbreviations) ? DO.store.abbreviations : [];
      if (!list.length) return null;

      var lower = s.toLowerCase();
      var matches = [];
      var seen = {};
      for (var i = 0; i < list.length; i++) {
        var a = list[i] || {};
        var shortForm = String(a.shortForm || "").trim();
        var fullForm = String(a.fullForm || "").trim();
        if (!shortForm || !fullForm) continue;
        if (shortForm.length < ABBR_MIN_CHARS) continue;

        if (lower.slice(-shortForm.length).toLowerCase() === shortForm.toLowerCase()) {
          var key = shortForm.toLowerCase() + "|" + fullForm;
          if (seen[key]) continue; // กัน duplicate จาก prefix เก่า/ใหม่
          seen[key] = true;
          matches.push({ id: a.id, shortForm: shortForm, fullForm: fullForm });
        }
      }

      if (!matches.length) return null;

      // เรียงตามความยาว shortForm จากยาวไปสั้น (ยาวสุดก่อน) เพื่อจัดการคำย่อซ้อน เช่น สสฝฝ vs สฝฝ
      // เมื่อท้าย paragraph ลงท้าย "สสฝฝ" จะเลือก สสฝฝ แทน สฝฝ
      try {
        matches.sort(function (a, b) {
          var la = (a.shortForm || "").length;
          var lb = (b.shortForm || "").length;
          return lb - la;
        });
      } catch (eSort) {}

      try {
        if (DO.debugLog) DO.debugLog("abbr_completed_detected", { text: s.slice(-40), matches: matches.length });
      } catch (eLog) {}

      return { text: s, matches: matches };
    } catch (e) {
      return null;
    }
  }

  function handleCompletedAbbreviation(abbrInfo) {
    try {
      if (!abbrInfo || !abbrInfo.matches || !abbrInfo.matches.length) return;
      // ปรับเป็นโหมด auto เสมอ (ไม่มี UI ให้สลับ)
      var mode = "auto";
      var matches = abbrInfo.matches || [];
      var first = matches[0];

      DO.state = DO.state || {};

      // Prevent duplicate attempts for same paragraph within a very short window
      try {
        var now0 = Date.now();
        var fp0 = String(abbrInfo.text || "") + "|" + String(first.shortForm || "");
        DO.state._abbrLastAttempt = DO.state._abbrLastAttempt || { fp: "", at: 0 };
        if (DO.state._abbrLastAttempt.fp === fp0 && now0 - Number(DO.state._abbrLastAttempt.at || 0) < 600) {
          return;
        }
        DO.state._abbrLastAttempt.fp = fp0;
        DO.state._abbrLastAttempt.at = now0;
      } catch (eDup) {}

      // Circuit breaker:
      // ถ้า replace ไม่สำเร็จจริง (เช่น Delete range ไม่ทำงาน) จะเกิด loop:
      // - ตรวจพบคำย่อท้ายย่อหน้า
      // - callCommand แทรกข้อความ แต่คำย่อเดิมยังอยู่
      // - event onDocumentContentChanged ยิงซ้ำ -> detect ซ้ำ -> แทรกซ้ำแบบ "เพิ่มเองรัวๆ"
      //
      // ป้องกันโดยนับจำนวนครั้งที่ auto-expand token เดิมภายในช่วงเวลาสั้น ๆ
      // ถ้าเกิน threshold ให้หยุด auto ชั่วคราวและปล่อยให้ผู้ใช้เลือกเองจาก panel
      try {
        var now = Date.now();
        DO.state._abbrAutoGuard = DO.state._abbrAutoGuard || { token: "", count: 0, since: 0 };
        var g = DO.state._abbrAutoGuard;
        var tok = String(first.shortForm || "");
        if (g.token === tok && (now - Number(g.since || 0)) < 2000) {
          g.count = (Number(g.count || 0) || 0) + 1;
        } else {
          g.token = tok;
          g.count = 1;
          g.since = now;
        }
        if (g.count >= 4) {
          DO.state._abbrAutoDisabledUntil = now + 10_000; // disable auto for 10s
          try {
            if (DO.debugLog) DO.debugLog("abbr_auto_guard_trip", { token: tok, count: g.count });
          } catch (eLogGuard) {}
          // Show suggestions instead of auto-replacing
          renderInlineSuggestions(first.shortForm, matches, 0);
          return false;
        }
      } catch (eGuard) {}

      // matches เรียงตามความยาว shortForm ลดหลั่นแล้ว (ยาวสุดแรก)
      // โหมด auto: ใช้ตัวแรก (ยาวสุด) แทนทันที ถ้ามีแค่ 1 ตัวเท่านั้น
      if (mode === "auto" && matches.length === 1) {
        try {
          if (DO.editor && typeof DO.editor.replaceLastTokenInParagraph === "function") {
            DO.editor.replaceLastTokenInParagraph(
              first.shortForm,
              first.fullForm,
              { fallbackInsertAtCursor: false, verify: true },
              function (result) {
                // Only treat as success when verified.
                var ok = false;
                try {
                  ok = !!(result && result.ok && result.verified);
                } catch (e0) {
                  ok = false;
                }
                if (!ok) {
                  // If replacement didn't happen, show suggestions instead of claiming success.
                  try { renderInlineSuggestions(first.shortForm, matches, 0); } catch (e1) {}
                  try {
                    var now = Date.now();
                    DO.state._abbrAutoDisabledUntil = now + 1500; // short cool-down to avoid rapid retries
                  } catch (e2) {}
                  return;
                }

                // เคลียร์ panel ทั้งคำย่อและ dictionary ลดความสับสน
                try { renderInlineSuggestions("", [], 0); } catch (e3) {}
                try {
                  if (DO.features && DO.features.dictionary && typeof DO.features.dictionary.renderInlineSuggestions === "function") {
                    DO.features.dictionary.renderInlineSuggestions("", [], 0);
                  }
                } catch (e4) {}
              }
            );
          } else {
            DO.editor.insertText(first.fullForm);
          }
          try {
            if (DO.debugLog) DO.debugLog("abbr_auto_expand_ok", { shortForm: first.shortForm, fullLen: first.fullForm.length });
          } catch (eLog) {}
        } catch (eIns) {}
        return true;
      }

      // โหมด confirm หรือมีหลาย match → แสดงใน panel ให้เลือกเอง
      try {
        if (DO.debugLog) DO.debugLog("abbr_confirm_needed", { mode: mode, matches: matches.length });
      } catch (eLog2) {}
      renderInlineSuggestions(first.shortForm, matches, 0);
    } catch (e) {}
    return false;
  }

  DO.features.abbreviation.findCompletedAbbreviationFromParagraph = findCompletedAbbreviationFromParagraph;
  DO.features.abbreviation.handleCompletedAbbreviation = handleCompletedAbbreviation;

  DO.features.abbreviation.bind = bind;
  DO.features.abbreviation.render = render;
})();

