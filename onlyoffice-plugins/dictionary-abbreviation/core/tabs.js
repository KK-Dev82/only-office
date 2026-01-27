// Tabs + debug panel UI
// NOTE: dictionary-abbreviation is now a single-page split UI (no tabs).
(function () {
  var DO = (window.DO = window.DO || {});

  DO.ui = DO.ui || {};

  DO.ui.setActiveTab = function (tab) {
    // Keep API for backward compatibility, but do NOT hide any panels.
    tab = String(tab || "single");
    DO.state.activeTab = tab || "single";

    try {
      if (DO.canUseLocalStorage()) localStorage.setItem(DO.STORAGE_KEYS.activeTab, tab);
    } catch (e0) {}

    DO.debugLog("tab_change", { tab: tab });
  };

  DO.ui.toggleDebugPanel = function (forceOpen) {
    var panel = DO.$("debugPanel");
    if (!panel) return;
    if (forceOpen === true) DO.state.debugOpen = true;
    else if (forceOpen === false) DO.state.debugOpen = false;
    else DO.state.debugOpen = !DO.state.debugOpen;

    if (DO.state.debugOpen) panel.classList.remove("doIsHidden");
    else panel.classList.add("doIsHidden");

    try {
      if (DO.canUseLocalStorage()) localStorage.setItem(DO.STORAGE_KEYS.debugOpen, DO.state.debugOpen ? "1" : "0");
    } catch (e) {}

    DO.debugLog("debug_toggle", { open: DO.state.debugOpen });
  };

  DO.ui.bindTabs = function () {
    try {
      try {
        if (DO.canUseLocalStorage()) {
          var savedTab = localStorage.getItem(DO.STORAGE_KEYS.activeTab);
          if (savedTab) DO.state.activeTab = savedTab;
          var savedOpen = localStorage.getItem(DO.STORAGE_KEYS.debugOpen);
          if (savedOpen === "1") DO.state.debugOpen = true;
        }
      } catch (e3) {}

      // Single page: just set a stable value for compatibility.
      DO.ui.setActiveTab(DO.state.activeTab || "single");
    } catch (e4) {}
  };
})();

