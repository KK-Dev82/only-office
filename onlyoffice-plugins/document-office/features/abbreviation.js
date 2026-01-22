// Abbreviation feature (local-first)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};

  function render() {
    var root = DO.$("abbrList");
    if (!root) return;
    root.innerHTML = "";

    var items = DO.store.abbreviations || [];
    for (var i = 0; i < items.length; i++) {
      var a = items[i];
      var div = document.createElement("div");
      div.className = "item";
      var row = document.createElement("div");
      row.className = "itemRow";
      var text = document.createElement("div");
      text.className = "itemText";
      text.textContent = String(a.shortForm || "") + " → " + String(a.fullForm || "");
      var actions = document.createElement("div");
      actions.className = "itemActions";

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
      empty.className = "muted";
      empty.textContent = "ยังไม่มีคำย่อ";
      root.appendChild(empty);
    }
  }

  function addFromUi() {
    var sEl = DO.$("abbrShort");
    var fEl = DO.$("abbrFull");
    var s = sEl ? String(sEl.value || "").trim() : "";
    var f = fEl ? String(fEl.value || "").trim() : "";
    if (!s || !f) return;

    DO.store.abbreviations = DO.store.abbreviations || [];
    DO.store.abbreviations.push({ id: DO.newId("abbr"), shortForm: s, fullForm: f, scope: "Local" });
    DO.persist.abbreviations();
    if (sEl) sEl.value = "";
    if (fEl) fEl.value = "";
    render();
    DO.debugLog("abbr_add", { shortForm: s, fullLen: f.length });
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
    var abbrAdd = DO.$("abbrAdd");
    if (abbrAdd) abbrAdd.addEventListener("click", function () { addFromUi(); });

    var abbrExpand = DO.$("abbrExpandSelection");
    if (abbrExpand) abbrExpand.addEventListener("click", function () { expandFromSelection(); });
  }

  DO.features.abbreviation = {
    bind: bind,
    render: render,
  };
})();

