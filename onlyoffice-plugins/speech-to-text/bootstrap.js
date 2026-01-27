(function () {
  var STT = (window.STT = window.STT || {});

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  function resizeWindow(width, height) {
    try {
      if (window.Asc && window.Asc.plugin) {
        // Some builds support direct method
        if (typeof window.Asc.plugin.resizeWindow === "function") {
          window.Asc.plugin.resizeWindow(width, height);
          return true;
        }
        // Common: via executeMethod
        if (typeof window.Asc.plugin.executeMethod === "function") {
          window.Asc.plugin.executeMethod("ResizeWindow", [Number(width), Number(height)]);
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function setCollapsed(collapsed) {
    try {
      var root = document && document.querySelector && document.querySelector(".stt-root");
      if (root && root.classList) {
        if (collapsed) root.classList.add("is-collapsed");
        else root.classList.remove("is-collapsed");
      }
    } catch (e0) {}
  }

  function bindUI() {
    var toggle = STT.$("listenToggle");
    var btnExpand = STT.$("btnExpand");
    var btnClose = STT.$("btnClose");

    if (toggle && !toggle.__sttBound) {
      toggle.__sttBound = true;
      toggle.addEventListener("change", function () {
        try {
          if (toggle.checked) STT.startListening();
          else STT.stopListening();
        } catch (e0) {}
      });
    }

    // Expand/Collapse: 240 <-> 120
    if (btnExpand && !btnExpand.__sttBound) {
      btnExpand.__sttBound = true;
      btnExpand.addEventListener("click", function () {
        try {
          window.__stt_isCollapsed = !window.__stt_isCollapsed;
          var collapsed = Boolean(window.__stt_isCollapsed);
          setCollapsed(collapsed);
          btnExpand.textContent = collapsed ? "▸" : "▾";
          resizeWindow(400, collapsed ? 120 : 240);
        } catch (e1) {}
      });
    }

    if (btnClose && !btnClose.__sttBound) {
      btnClose.__sttBound = true;
      btnClose.addEventListener("click", function () {
        try {
          // stop listening and close plugin window
          try { STT.stopListening(); } catch {}
          if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeCommand === "function") {
            window.Asc.plugin.executeCommand("close", "");
          }
        } catch (e1) {}
      });
    }
  }

  window.Asc.plugin.init = function () {
    try {
      // Guard: ONLYOFFICE บางครั้งเรียก init ซ้ำ (ทำให้ recognition start ซ้ำ)
      if (window.__stt_plugin_inited) return;
      window.__stt_plugin_inited = true;

      // Panel v2: no status bar in UI; keep internal status for logs
      try { STT.setStatus("Ready"); } catch {}
      try { STT.setRecognitionStatus("พร้อม"); } catch {}
      bindUI();

      // Default size: 400x240
      try {
        window.__stt_isCollapsed = false;
        setCollapsed(false);
        var btnExpand = STT.$("btnExpand");
        if (btnExpand) btnExpand.textContent = "▾";
        resizeWindow(400, 240);
      } catch (eSize) {}
      
      // Check if callCommand is available
      var hasCallCommand = window.Asc && window.Asc.plugin && typeof window.Asc.plugin.callCommand === "function";
      if (!hasCallCommand) {
        STT.setStatus("⚠️ callCommand ไม่พร้อมใช้งาน (อาจเป็น Community License)");
        STT.warn("[STT] callCommand not available - text insertion may not work");
      }

      STT.log("[STT] Plugin initialized (PanelV2)", {
        version: (STT && STT.VERSION) || "unknown",
        hasCallCommand: hasCallCommand,
        pluginInfo: window.Asc && window.Asc.plugin && window.Asc.plugin.info
      });
    } catch (e) {
      STT.error("[STT] Init error:", e);
      try { STT.setStatus("เกิดข้อผิดพลาดในการเริ่มต้น"); } catch {}
    }
  };

  // Defensive: if init isn't called, still initialize
  try {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(function () {
        try {
          if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.init === "function") {
            window.Asc.plugin.init();
          }
        } catch (e2) {}
      }, 50);
    });
  } catch (e) {}

  // Export (optional)
  window.STT = STT;
})();
