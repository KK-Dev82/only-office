// Global namespace for DocumentOffice plugin (no bundler)
// All modules attach to `window.DO`.
(function () {
  window.DO = window.DO || {};

  // Sync version with config/index + host cache-busting
  window.DO.VERSION = "0.1.71";
  // Alias DA to DO for compatibility
  window.DA = window.DO;

  // Toggle verbose logs
  window.DO.DEBUG = true;

  window.DO.state = window.DO.state || {
    uiBound: false,
    // IMPORTANT: this plugin tabs are: dictionary, abbreviation
    activeTab: "dictionary",
    debugOpen: false,
    targetTimer: 0,
    lastToken: "",
    // InputHelper (Dictionary):
    // หมายเหตุ: บาง build จะ "ย่อ panel iframe" ตามขนาดที่ส่งเข้า ShowInputHelper เสมอ
    // ทำให้ UI เพี้ยน (80×40/10×10) แม้จะ createWindow แล้วก็ตาม
    // จึงปิดถาวรในปลั๊กอินนี้ และใช้การเลือกจาก Panel เท่านั้น
    __disableInputHelper: true,
    dictInputHelperEnabled: false,
    //โหมดการทำงานของคำย่อ:
    // - "confirm" (ค่าเริ่มต้น): เจอคำย่อแล้วให้ขึ้นใน panel ให้ผู้ใช้กดเลือก/กด Esc
    // - "auto": เจอคำย่อที่ครบคำแล้ว แทนเป็นคำเต็มให้อัตโนมัติ
    abbreviationMode: "confirm",
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

