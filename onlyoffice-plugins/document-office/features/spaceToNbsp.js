// Space → Non-breaking space (nbsp): แทนที่ Space ด้วย nbsp เพื่อลดการขึ้นบรรทัดใหม่โดยไม่ตั้งใจ
// OnlyOffice Plugin API ไม่มี onKeyDown จึงใช้วิธี post-processing หลัง onDocumentContentChanged
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};

  var DEBOUNCE_MS = 80;
  var MIN_INTERVAL_MS = 150; // ป้องกัน replace ซ้ำซ้อนเร็วเกินไป

  function isEnabled() {
    try {
      var opts = DO.pluginOptions && DO.pluginOptions.features;
      if (!opts) return true; // เปิดใช้โดยค่าเริ่มต้น
      if (opts.spaceToNbsp === false) return false;
      return true;
    } catch (e) {
      return true;
    }
  }

  function attachEvents() {
    if (!window.Asc || !window.Asc.plugin) return;
    DO.state = DO.state || {};
    DO.state._spaceToNbspLastAt = 0;

    function attach(id, fn) {
      try {
        if (window.Asc.plugin.attachEditorEvent) {
          window.Asc.plugin.attachEditorEvent(id, fn);
          return true;
        }
        if (window.Asc.plugin.attachEvent) {
          window.Asc.plugin.attachEvent(id, fn);
          return true;
        }
        window.Asc.plugin[id] = fn;
        return true;
      } catch (e) {
        return false;
      }
    }

    var timer = 0;
    function scheduleCheck() {
      if (!isEnabled()) return;
      if (DO.state && DO.state.disposed) return;
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }
      timer = setTimeout(function () {
        timer = 0;
        if (DO.state && DO.state.disposed) return;
        if (!isEnabled()) return;
        var now = Date.now();
        if (DO.state._spaceToNbspLastAt && now - DO.state._spaceToNbspLastAt < MIN_INTERVAL_MS) return;
        DO.editor.replaceTrailingSpaceWithNbsp(function (replaced) {
          if (replaced) {
            DO.state._spaceToNbspLastAt = Date.now();
            try {
              DO.debugLog("spaceToNbsp_replaced", {});
            } catch (e) {}
          }
        });
      }, DEBOUNCE_MS);
    }

    attach("onDocumentContentChanged", scheduleCheck);
    attach("onTargetPositionChanged", scheduleCheck);
    try {
      DO.debugLog("spaceToNbsp_attached", { enabled: isEnabled() });
    } catch (e) {}
  }

  DO.features.spaceToNbsp = {
    attachEvents: attachEvents,
    isEnabled: isEnabled,
  };
})();
