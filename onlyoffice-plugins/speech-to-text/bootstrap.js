// Bootstrap for Speech To Text plugin - Draggable Panel Version
(function () {
  var STT = (window.STT = window.STT || {});

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  var panelElement = null;
  var isPanelVisible = false;
  var isDragging = false;
  var isResizing = false;
  var dragOffset = { x: 0, y: 0 };
  var resizeStart = { x: 0, y: 0, width: 0, height: 0 };

  // Create draggable/resizable panel
  function createPanel() {
    if (panelElement) {
      return panelElement;
    }

    // Create panel container
    panelElement = document.createElement("div");
    panelElement.id = "stt-draggable-panel";
    panelElement.className = "stt-draggable-panel";
    panelElement.innerHTML = `
      <div class="stt-panel-header" id="stt-panel-header">
        <div class="stt-panel-title">
          <span>🎤 Speech To Text</span>
          <span class="stt-status-indicator" id="stt-status-indicator"></span>
        </div>
        <div class="stt-panel-controls">
          <button class="stt-panel-btn stt-panel-minimize" id="stt-btn-minimize" title="ย่อ/ขยาย">−</button>
          <button class="stt-panel-btn stt-panel-close" id="stt-btn-close" title="ปิด">×</button>
        </div>
      </div>
      <div class="stt-panel-body" id="stt-panel-body">
        <div class="stt-controls">
          <button id="btnStart" class="stt-btn stt-btn-primary" type="button">
            เริ่มฟัง
          </button>
          <button id="btnStop" class="stt-btn stt-btn-secondary" type="button" disabled>
            หยุดฟัง
          </button>
          <button id="btnClear" class="stt-btn stt-btn-secondary" type="button">
            ล้าง
          </button>
        </div>

        <div class="stt-textarea-wrapper">
          <textarea id="textOutput" class="stt-textarea" placeholder="ข้อความที่ถอดเสียงจะแสดงที่นี่..." readonly></textarea>
        </div>

        <div class="stt-actions">
          <button id="btnInsert" class="stt-btn stt-btn-primary" type="button" disabled>
            Insert ไปยังเอกสาร
          </button>
          <button id="btnAppend" class="stt-btn stt-btn-primary" type="button" disabled>
            Append ที่ท้ายเอกสาร
          </button>
        </div>

        <div class="stt-info">
          <div class="stt-info-item">
            <span class="stt-label">ภาษา:</span>
            <select id="langSelect" class="stt-select">
              <option value="th-TH">ไทย (th-TH)</option>
              <option value="en-US">English (en-US)</option>
            </select>
          </div>
          <div class="stt-info-item">
            <span class="stt-label">สถานะ:</span>
            <span id="recognitionStatus" class="stt-value">ไม่มีการฟัง</span>
          </div>
        </div>
      </div>
      <div class="stt-panel-resize-handle" id="stt-resize-handle"></div>
    `;

    // Append to body (or editor container if available)
    var container = document.body;
    if (window.Asc && window.Asc.plugin && window.Asc.plugin.getEditorWindow) {
      try {
        var editorWindow = window.Asc.plugin.getEditorWindow();
        if (editorWindow && editorWindow.document) {
          container = editorWindow.document.body;
        }
      } catch (e) {
        console.warn("[STT] Could not get editor window, using current document");
      }
    }
    container.appendChild(panelElement);

    // Make draggable
    var header = panelElement.querySelector("#stt-panel-header");
    if (header) {
      header.addEventListener("mousedown", function (e) {
        if (e.target.closest(".stt-panel-controls")) return; // Don't drag when clicking controls
        isDragging = true;
        var rect = panelElement.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        e.preventDefault();
      });
    }

    // Make resizable
    var resizeHandle = panelElement.querySelector("#stt-resize-handle");
    if (resizeHandle) {
      resizeHandle.addEventListener("mousedown", function (e) {
        isResizing = true;
        var rect = panelElement.getBoundingClientRect();
        resizeStart.x = e.clientX;
        resizeStart.y = e.clientY;
        resizeStart.width = rect.width;
        resizeStart.height = rect.height;
        e.preventDefault();
        e.stopPropagation();
      });
    }

    // Global mouse events (not passive - we need to control dragging/resizing)
    // Note: These warnings are expected for drag/resize functionality
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // Panel controls
    var btnMinimize = panelElement.querySelector("#stt-btn-minimize");
    var btnClose = panelElement.querySelector("#stt-btn-close");
    if (btnMinimize) {
      btnMinimize.addEventListener("click", function () {
        var body = panelElement.querySelector("#stt-panel-body");
        if (body) {
          var isMinimized = body.style.display === "none";
          body.style.display = isMinimized ? "" : "none";
          btnMinimize.textContent = isMinimized ? "−" : "+";
        }
      });
    }
    if (btnClose) {
      btnClose.addEventListener("click", function () {
        hidePanel();
      });
    }

    // Bind UI
    bindUI();

    return panelElement;
  }

  function handleMouseMove(e) {
    if (isDragging && panelElement) {
      var x = e.clientX - dragOffset.x;
      var y = e.clientY - dragOffset.y;
      
      // Constrain to viewport
      var maxX = window.innerWidth - panelElement.offsetWidth;
      var maxY = window.innerHeight - panelElement.offsetHeight;
      x = Math.max(0, Math.min(x, maxX));
      y = Math.max(0, Math.min(y, maxY));
      
      panelElement.style.left = x + "px";
      panelElement.style.top = y + "px";
    } else if (isResizing && panelElement) {
      var deltaX = e.clientX - resizeStart.x;
      var deltaY = e.clientY - resizeStart.y;
      var newWidth = Math.max(300, resizeStart.width + deltaX);
      var newHeight = Math.max(400, resizeStart.height + deltaY);
      
      panelElement.style.width = newWidth + "px";
      panelElement.style.height = newHeight + "px";
    }
  }

  function handleMouseUp() {
    isDragging = false;
    isResizing = false;
  }

  function showPanel() {
    if (!panelElement) {
      createPanel();
    }
    if (panelElement) {
      panelElement.style.display = "flex";
      isPanelVisible = true;
    }
  }

  function hidePanel() {
    if (panelElement) {
      panelElement.style.display = "none";
      isPanelVisible = false;
    }
  }

  function togglePanel() {
    if (isPanelVisible) {
      hidePanel();
    } else {
      showPanel();
    }
  }

  function bindUI() {
    if (!panelElement) return;

    var btnStart = STT.$("btnStart");
    var btnStop = STT.$("btnStop");
    var btnClear = STT.$("btnClear");
    var btnInsert = STT.$("btnInsert");
    var btnAppend = STT.$("btnAppend");

    if (btnStart) {
      btnStart.addEventListener("click", function () {
        STT.startListening();
      });
    }

    if (btnStop) {
      btnStop.addEventListener("click", function () {
        STT.stopListening();
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", function () {
        STT.clearText();
      });
    }

    if (btnInsert) {
      btnInsert.addEventListener("click", function () {
        var textOutput = STT.$("textOutput");
        var text = textOutput ? textOutput.value.trim() : "";
        if (text) {
          if (STT.insertText(text)) {
            STT.setStatus("Insert สำเร็จ");
            STT.clearText();
          } else {
            STT.setStatus("Insert ล้มเหลว");
          }
        }
      });
    }

    if (btnAppend) {
      btnAppend.addEventListener("click", function () {
        var textOutput = STT.$("textOutput");
        var text = textOutput ? textOutput.value.trim() : "";
        if (text) {
          if (STT.appendToDocumentEnd(text)) {
            STT.setStatus("Append สำเร็จ");
            STT.clearText();
          } else {
            STT.setStatus("Append ล้มเหลว");
          }
        }
      });
    }
  }

  // Update status indicator
  function updateStatusIndicator(isListening) {
    var indicator = STT.$("stt-status-indicator");
    if (indicator) {
      indicator.className = "stt-status-indicator " + (isListening ? "stt-status-listening" : "stt-status-ready");
      indicator.title = isListening ? "กำลังฟัง..." : "พร้อม";
    }
  }

  // Override STT status functions to update indicator
  var originalSetStatus = STT.setStatus;
  STT.setStatus = function (text) {
    if (originalSetStatus) originalSetStatus(text);
    var isListening = text && (text.includes("กำลังฟัง") || text.includes("listening"));
    updateStatusIndicator(isListening);
  };

  window.Asc.plugin.init = function () {
    try {
      STT.setStatus("Ready");
      STT.setRecognitionStatus("พร้อม");
      
      // Check if callCommand is available
      var hasCallCommand = window.Asc && window.Asc.plugin && typeof window.Asc.plugin.callCommand === "function";
      if (!hasCallCommand) {
        STT.setStatus("⚠️ callCommand ไม่พร้อมใช้งาน (อาจเป็น Community License)");
        console.warn("[STT] callCommand not available - text insertion may not work");
      }

      // Note: Button will appear in toolbar automatically when type: "button" in config.json
      // No need to use AddToolbarMenuItem (requires executeMethod which is not available in Community License)

      console.log("[STT] Plugin initialized (Draggable Panel)", { 
        version: "0.2.0", 
        hasCallCommand: hasCallCommand,
        pluginInfo: window.Asc && window.Asc.plugin && window.Asc.plugin.info,
        pluginType: "button (should appear in toolbar automatically)"
      });
    } catch (e) {
      console.error("[STT] Init error:", e);
      STT.setStatus("เกิดข้อผิดพลาดในการเริ่มต้น");
    }
  };

  // Button click handler (when type is "button")
  window.Asc.plugin.button = function (id) {
    togglePanel();
  };

  // Execute command handler
  window.Asc.plugin.executeCommand = function (id) {
    togglePanel();
  };

  // Note: When type is "button" in config.json, OnlyOffice will automatically
  // show the button in the toolbar and call window.Asc.plugin.button() when clicked

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

  // Export
  window.STT = STT;
  window.STT.showPanel = showPanel;
  window.STT.hidePanel = hidePanel;
  window.STT.togglePanel = togglePanel;
})();
