// Debug panel buttons
(function () {
  var DO = (window.DO = window.DO || {});
  DO.ui = DO.ui || {};

  DO.ui.bindDebug = function () {
    var btnGetSelection = DO.$("btnGetSelection");
    if (btnGetSelection) {
      btnGetSelection.addEventListener("click", function () {
        DO.editor.getSelectedText(function (text) {
          DO.setOutput({
            selectedText: text || "",
            hasToken: Boolean(DO.pluginOptions && DO.pluginOptions.accessToken),
            apiBaseUrl: (DO.pluginOptions && DO.pluginOptions.apiBaseUrl) || "",
          });
        });
      });
    }

    var btnInsertDemo = DO.$("btnInsertDemo");
    if (btnInsertDemo) {
      btnInsertDemo.addEventListener("click", function () {
        DO.editor.insertText("DocumentOffice plugin demo insert");
      });
    }

    var btnGetContext = DO.$("btnGetContext");
    if (btnGetContext) {
      btnGetContext.addEventListener("click", function () {
        var modeEl = DO.$("checkMode");
        var mode = (modeEl && modeEl.value) || (DO.pluginOptions && DO.pluginOptions.defaultCheckMode) || "paragraph";
        DO.editor.getContext(mode, function (ctx) {
          DO.setOutput({ ok: true, type: "ui_getContext", context: ctx });
        });
      });
    }
  };
})();

