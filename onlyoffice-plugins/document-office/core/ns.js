// Global namespace for DocumentOffice plugin (no bundler)
// All modules attach to `window.DO`.
(function () {
  window.DO = window.DO || {};

  // Sync version with config/index + host cache-busting
  window.DO.VERSION = "0.1.17";

  // Toggle verbose logs (set true temporarily to diagnose white screen)
  window.DO.DEBUG = true;

  window.DO.state = window.DO.state || {
    uiBound: false,
    activeTab: "clipboard",
    debugOpen: false,
    targetTimer: 0,
    lastToken: "",
    // ปิด createInputHelper/createWindow เพื่อกัน panel ถูกย่อเป็น 80×40 → หน้าขาว (เหมือน dictionary-abbreviation)
    __disableInputHelper: true,
  };

  window.DO.pluginOptions = window.DO.pluginOptions || {
    apiBaseUrl: "",
    accessToken: "",
    userName: "",
    userId: null,
    defaultCheckMode: "paragraph",
    features: {},
  };

  window.DO.store = window.DO.store || {
    abbreviations: [],
    clipboard: [],
    macros: [],
    redundant: [],
    dictionary: [],
  };
})();

