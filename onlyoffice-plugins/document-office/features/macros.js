// Macros feature (local-only placeholder)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};

  function render() {
    var root = DO.$("macroList");
    if (!root) return;
    root.innerHTML = "";

    var items = DO.store.macros || [];
    for (var i = 0; i < items.length; i++) {
      var m = items[i];
      var textValue = String(m.text || m.value || m.name || "");
      if (!textValue) continue;

      var div = document.createElement("div");
      div.className = "doItem";
      var row = document.createElement("div");
      row.className = "doItemRow";
      var text = document.createElement("div");
      text.className = "doItemText";
      text.textContent = textValue;

      var actions = document.createElement("div");
      actions.className = "doItemActions";
      var btnInsert = document.createElement("button");
      btnInsert.textContent = "Insert";
      btnInsert.addEventListener(
        "click",
        (function (t) {
          return function () {
            DO.editor.insertText(t);
          };
        })(textValue)
      );
      actions.appendChild(btnInsert);
      row.appendChild(text);
      row.appendChild(actions);
      div.appendChild(row);
      root.appendChild(div);
    }

    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "doMuted";
      empty.textContent = "ยังไม่มี macro";
      root.appendChild(empty);
    }
  }

  function reload() {
    DO.store.macros = DO.storageLoad(DO.STORAGE_KEYS.macros, []);
    render();
    DO.debugLog("macroReload", { count: (DO.store.macros || []).length });
  }

  function bind() {
    var macroReload = DO.$("macroReload");
    if (macroReload) macroReload.addEventListener("click", function () { reload(); });
  }

  DO.features.macros = {
    bind: bind,
    render: render,
    reload: reload,
  };
})();

