// Abbreviation feature (local-first)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};
  DO.features.abbreviation = DO.features.abbreviation || {};
  DO.state = DO.state || {};
  DO.state._abbrUi = DO.state._abbrUi || { lastToken: "", items: [], selectedIndex: 0, keyBound: false, bound: false };

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

  function render() {
    var root = DO.$("abbrList");
    if (!root) return;
    root.innerHTML = "";

    var items = DO.store.abbreviations || [];
    for (var i = 0; i < items.length; i++) {
      var a = items[i];
      var div = document.createElement("div");
      div.className = "doItem";
      var row = document.createElement("div");
      row.className = "doItemRow";
      var text = document.createElement("div");
      text.className = "doItemText";
      text.textContent = String(a.shortForm || "") + " → " + String(a.fullForm || "");
      var actions = document.createElement("div");
      actions.className = "doItemActions";

      var btnInsert = document.createElement("button");
      btnInsert.textContent = "Insert";
      btnInsert.addEventListener(
        "click",
        (function (t, id) {
          return function () {
            DO.debugLog("abbr_insert", { id: id });
            DO.editor.insertText(t);
          };
        })(a.fullForm || "", a.id)
      );

      var btnDel = document.createElement("button");
      btnDel.textContent = "Delete";
      btnDel.addEventListener(
        "click",
        (function (id) {
          return function () {
            DO.store.abbreviations = (DO.store.abbreviations || []).filter(function (x) {
              return String(x.id) !== String(id);
            });
            DO.persist.abbreviations();
            render();
            DO.debugLog("abbr_delete", { id: id });
          };
        })(a.id)
      );

      actions.appendChild(btnInsert);
      actions.appendChild(btnDel);
      row.appendChild(text);
      row.appendChild(actions);
      div.appendChild(row);
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

    var abbrExpand = DO.$("abbrExpandSelection");
    if (abbrExpand) abbrExpand.addEventListener("click", function () { expandFromSelection(); });

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
  }

  function insertExpanded(fullText) {
    try {
      var full = String(fullText || "");
      if (!full) return;
      DO.editor.insertText(full);
      // cancel suggestions immediately
      try { DO.features.abbreviation.renderInlineSuggestions("", [], 0); } catch (e0) {}
    } catch (e) {}
  }

  function bindSuggestionKeysOnce() {
    try {
      if (DO.state._abbrUi.keyBound) return;
      DO.state._abbrUi.keyBound = true;
      document.addEventListener(
        "keydown",
        function (e) {
          try {
            var st = DO.state._abbrUi || {};
            var items = st.items || [];
            var key = e && e.key ? String(e.key) : "";

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
            if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter" && key !== "Tab") return;
            e.preventDefault();
            e.stopPropagation();

            if (key === "ArrowDown" || key === "Tab") {
              st.selectedIndex = (Number(st.selectedIndex || 0) + 1) % items.length;
              DO.features.abbreviation.renderInlineSuggestions(st.lastToken, items, st.selectedIndex);
              return;
            }
            if (key === "ArrowUp") {
              st.selectedIndex = (Number(st.selectedIndex || 0) - 1 + items.length) % items.length;
              DO.features.abbreviation.renderInlineSuggestions(st.lastToken, items, st.selectedIndex);
              return;
            }
            if (key === "Enter") {
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
  DO.features.abbreviation.renderInlineSuggestions = function (token, items, selectedIndex) {
    try {
      var root = DO.$("abbrSuggest");
      if (!root) return;

      token = String(token || "").trim();
      items = items || [];

      var st = DO.state._abbrUi || (DO.state._abbrUi = {});
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
      tip.appendChild(document.createTextNode('" — กด Up/Down/Tab เลือก, Enter Insert, Esc ยกเลิก'));
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
                DO.features.abbreviation.renderInlineSuggestions(st.lastToken, st.items, st.selectedIndex);
              } catch (e0) {}
            };
          })(i)
        );
        root.appendChild(div);
      }

      bindSuggestionKeysOnce();
    } catch (e2) {}
  };

  DO.features.abbreviation.bind = bind;
  DO.features.abbreviation.render = render;
})();

