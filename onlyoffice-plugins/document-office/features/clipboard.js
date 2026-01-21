// Clipboard feature (local-first)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};

  function render() {
    var root = DO.$("clipList");
    if (!root) return;
    root.innerHTML = "";

    var items = DO.store.clipboard || [];
    for (var i = 0; i < items.length; i++) {
      var c = items[i];
      if (!c || !c.text) continue;

      var div = document.createElement("div");
      div.className = "item";
      var row = document.createElement("div");
      row.className = "itemRow";

      var text = document.createElement("div");
      text.className = "itemText";
      text.textContent = c.text;

      var actions = document.createElement("div");
      actions.className = "itemActions";

      var btnInsert = document.createElement("button");
      btnInsert.textContent = "Insert";
      btnInsert.addEventListener(
        "click",
        (function (t, id) {
          return function () {
            DO.debugLog("clip_insert", { id: id, textLen: String(t || "").length });
            DO.editor.insertText(t);
          };
        })(c.text, c.id)
      );

      var btnDel = document.createElement("button");
      btnDel.textContent = "Delete";
      btnDel.addEventListener(
        "click",
        (function (id) {
          return function () {
            DO.store.clipboard = (DO.store.clipboard || []).filter(function (x) {
              return String(x.id) !== String(id);
            });
            DO.persist.clipboard();
            render();
            DO.debugLog("clip_delete", { id: id });
          };
        })(c.id)
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
      empty.textContent = "ยังไม่มี clipboard";
      root.appendChild(empty);
    }
  }

  function addFromUi() {
    var el = DO.$("clipText");
    var t = el ? String(el.value || "").trim() : "";
    if (!t) {
      DO.debugLog("clipAdd_empty");
      DO.setStatus("กรอกข้อความก่อน");
      setTimeout(function () {
        DO.setStatus("ready");
      }, 800);
      return;
    }

    DO.store.clipboard = DO.store.clipboard || [];
    var id = DO.newId("clip");
    DO.store.clipboard.unshift({ id: id, text: t, scope: "Local" });
    DO.persist.clipboard();
    render();

    if (el) el.value = "";
    DO.debugLog("clipAdd_done", { id: id, count: (DO.store.clipboard || []).length });
  }

  function bind() {
    var clipAdd = DO.$("clipAdd");
    if (clipAdd) {
      clipAdd.addEventListener("click", function (e) {
        try {
          e && e.preventDefault && e.preventDefault();
        } catch (e2) {}
        addFromUi();
      });
    }

    var clipText = DO.$("clipText");
    if (clipText) {
      clipText.addEventListener("keydown", function (e) {
        try {
          if (e && e.key === "Enter") {
            e.preventDefault();
            addFromUi();
          }
        } catch (e0) {}
      });
    }

    var clipReload = DO.$("clipReload");
    if (clipReload) {
      clipReload.addEventListener("click", function () {
        DO.store.clipboard = DO.storageLoad(DO.STORAGE_KEYS.clipboard, []);
        render();
        DO.debugLog("clipReload", { count: (DO.store.clipboard || []).length });
      });
    }
  }

  DO.features.clipboard = {
    bind: bind,
    render: render,
    addFromUi: addFromUi,
  };
})();

