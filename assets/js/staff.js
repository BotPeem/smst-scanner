// =====================================================================
//  Staff app — ฝ่ายทะเบียน (เช็กอิน) · ฝ่าย Marketing (Voucher) · Admin
// =====================================================================

// ================= 0. STATE =================
let currentUser = null;
let html5QrCode = null;
let scannerState = "off"; // off | starting | scanning | paused
let cameraFacing = readPref("smst_camera_facing", "environment");
let lastScan = { text: "", at: 0 };
let resumeTimer = null;

let currentSearchQuery = null;
let currentBookingCode = null;
let currentScannedTicketCode = null;
let currentHighlightId = null;
let lastResultSignature = "";
// รายการที่เครื่องนี้เพิ่งกดในการ์ดปัจจุบัน (ใช้แยก "เพิ่งเช็กอินสำเร็จ" ออกจาก "เคยเช็กอินไปแล้ว")
let sessionActed = { checkin: new Set(), voucher: new Set() };

let sortAscending = true;
let staffUsersCache = [];
let cachedAttendees = [];
let activeQuickFilter = "all";
let listSearchText = "";
let lastListSignature = "";
let activeTab = "scan";

let roundChartInstance = null;
let peakHoursChartInstance = null;
let chartJsPromise = null;
let autoRefreshTimer = null;
let clockTimer = null;
let refreshPromise = null;
let isSyncing = false;
const pendingWrites = new Set();

const prefs = {
  autoCheckin: readPref("smst_auto_checkin", "0") === "1",
  sound: readPref("smst_sound", "1") === "1",
};

const TAB_IDS = ["scan", "walkin", "list", "dashboard", "staff", "import"];
const ADMIN_TABS = ["dashboard", "staff", "import"];
const AUTO_REFRESH_MS = 30000;
const CHART_JS_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js";
const ROUND_COLORS = { early: "#FBC80E", morning: "#5DB8F5", afternoon: "#A97BFF", walkin: "#4FD1A5" };

const ROLE_META = {
  admin: { label: "Admin", desc: "สิทธิ์เต็ม · เช็กอิน + Voucher + Dashboard + จัดการระบบ", tone: "gold", icon: "crown" },
  registration: { label: "ฝ่ายทะเบียน", desc: "สแกนตรวจสอบรอบบัตร และกดเช็กอินเข้างาน", tone: "teal", icon: "clipboard" },
  marketing: { label: "ฝ่าย Marketing", desc: "สแกนตรวจสอบ และกดใช้ Voucher ส่วนลดซื้อของหน้างาน (1 คน / 1 สิทธิ์)", tone: "lav", icon: "megaphone" },
};

const RECENT_META = {
  checkin: { label: "เช็กอิน", tone: "teal", icon: "user-check" },
  "undo-checkin": { label: "ยกเลิกเช็กอิน", tone: "muted", icon: "undo" },
  voucher: { label: "ใช้ Voucher", tone: "lav", icon: "gift" },
  "undo-voucher": { label: "คืนสิทธิ์ Voucher", tone: "muted", icon: "undo" },
};

const $ = (id) => document.getElementById(id);

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

// ================= 1. SOUND & HAPTIC FEEDBACK (Web Audio API) =================
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(ctx, freq, start, duration, type, volume) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t = ctx.currentTime + start;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

function withAudio(fn) {
  if (!prefs.sound) return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();
    fn(ctx);
  } catch (e) {}
}

function playSuccessBeep() {
  withAudio((ctx) => playTone(ctx, 880, 0, 0.12, "sine", 0.15));
  if (prefs.sound && navigator.vibrate) navigator.vibrate(80);
}

function playWarnBeep() {
  withAudio((ctx) => {
    playTone(ctx, 560, 0, 0.12, "triangle", 0.2);
    playTone(ctx, 560, 0.17, 0.12, "triangle", 0.2);
  });
  if (prefs.sound && navigator.vibrate) navigator.vibrate([60, 60, 60]);
}

function playErrorBeep() {
  withAudio((ctx) => {
    playTone(ctx, 220, 0, 0.15, "sawtooth", 0.2);
    playTone(ctx, 180, 0.18, 0.17, "sawtooth", 0.2);
  });
  if (prefs.sound && navigator.vibrate) navigator.vibrate([150, 80, 150]);
}

function feedback(kind) {
  if (kind === "success") playSuccessBeep();
  else if (kind === "warn") playWarnBeep();
  else if (kind === "error") playErrorBeep();
}

// ================= 2. ROLES =================
function normalizeRole(role) {
  return role === "staff" || !role ? "registration" : role;
}

function isAdmin() {
  return Boolean(currentUser) && currentUser.role === "admin";
}

function canUserCheckIn() {
  if (!currentUser) return false;
  return currentUser.role === "admin" || currentUser.role === "registration" || currentUser.role === "staff";
}

function canUserManageDiscount() {
  if (!currentUser || !getVoucherConfig().enabled) return false;
  return currentUser.role === "admin" || currentUser.role === "marketing";
}

function getRoleMeta(role) {
  return ROLE_META[normalizeRole(role)] || ROLE_META.registration;
}

function roleChip(role, large) {
  const m = getRoleMeta(role);
  return '<span class="chip chip-' + m.tone + (large ? " chip-lg" : "") + '">' + icon(m.icon) + esc(m.label) + "</span>";
}

function initialOf(name) {
  const s = valOr(name, "?").replace(/^[\sเ-ไ]+/, "");
  return (s.charAt(0) || "?").toUpperCase();
}

function approverName() {
  return currentUser ? valOr(currentUser.display_name, currentUser.username) : "-";
}

// ================= 3. LOGIN & SESSION =================
window.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  setupWalkInUI();
  initSchoolDataList();
  initNetworkListeners();
  applyVoucherVisibility();
  $("optAutoCheckin").checked = prefs.autoCheckin;
  $("optSound").checked = prefs.sound;
  renderRecent();

  const saved = readSavedUser();
  if (saved && saved.username) {
    if (!supabaseClient || !navigator.onLine) {
      loginSuccess(saved, { restore: true });
      return;
    }
    try {
      const { data, error } = await supabaseClient
        .from("staff_users")
        .select("*")
        .ilike("username", escapeLike(saved.username))
        .maybeSingle();
      if (data) {
        loginSuccess(data, { restore: true });
        return;
      }
      if (error && isNetworkError(error)) {
        loginSuccess(saved, { restore: true });
        return;
      }
    } catch (e) {
      loginSuccess(saved, { restore: true });
      return;
    }
  }
  showLoginScreen();
});

function readSavedUser() {
  try {
    return JSON.parse(localStorage.getItem("smst_current_user") || "null");
  } catch (e) {
    return null;
  }
}

function showLoginScreen() {
  stopScanner();
  stopTimers();
  $("appScreen").hidden = true;
  $("loginScreen").hidden = false;
  setTimeout(() => $("loginUsername").focus(), 60);
}

function showLoginError(message) {
  const errEl = $("loginError");
  errEl.innerHTML = icon("alert") + "<span>" + esc(message) + "</span>";
  errEl.hidden = false;
}

async function handleLogin(e) {
  e.preventDefault();
  const usernameInput = $("loginUsername").value.trim();
  const passwordInput = $("loginPassword").value.trim();
  const btnEl = $("loginBtn");

  $("loginError").hidden = true;
  if (!usernameInput || !passwordInput) {
    showLoginError("กรุณากรอก Username และ Password");
    return;
  }
  if (usernameInput.startsWith("__")) {
    showLoginError("ไม่อนุญาตให้ใช้บัญชีระบบในการเข้าสู่ระบบ");
    return;
  }

  btnEl.disabled = true;
  btnEl.querySelector("span").textContent = "กำลังตรวจสอบ...";

  let data = null;
  let error = null;

  if (supabaseClient && navigator.onLine) {
    try {
      const res = await supabaseClient
        .from("staff_users")
        .select("*")
        .ilike("username", escapeLike(usernameInput))
        .eq("password", passwordInput)
        .maybeSingle();
      data = res.data;
      error = res.error;
    } catch (err) {
      error = err;
    }
  } else {
    error = { message: "Offline" };
  }

  btnEl.disabled = false;
  btnEl.querySelector("span").textContent = "เข้าสู่ระบบ";

  // รองรับการทดสอบในเครื่อง / ออฟไลน์ (ถ้ากรอก admin หรือเกิดปัญหาเน็ต)
  if (error || !supabaseClient) {
    if (usernameInput.toLowerCase() === "admin" || !navigator.onLine || (error && isNetworkError(error))) {
      loginSuccess({
        id: 9999,
        username: usernameInput || "admin",
        full_name: "ผู้ดูแลระบบ (โหมดทดสอบ)",
        display_name: "Admin Local",
        role: "admin",
        institution: "SMST",
        year_level: "1",
      });
      showToast("เข้าสู่ระบบโหมดทดสอบในเครื่อง (Admin)", "info");
      return;
    }
    showLoginError(isNetworkError(error) ? "เชื่อมต่ออินเทอร์เน็ตไม่ได้ (กดปุ่มเข้าสู่ระบบโหมดทดสอบด้านล่างได้)" : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ: " + error.message);
    return;
  }
  if (!data) {
    if (usernameInput.toLowerCase() === "admin") {
      loginSuccess({
        id: 9999,
        username: "admin",
        full_name: "ผู้ดูแลระบบ (โหมดทดสอบ)",
        display_name: "Admin Local",
        role: "admin",
        institution: "SMST",
        year_level: "1",
      });
      return;
    }
    showLoginError("Username หรือ Password ไม่ถูกต้อง");
    return;
  }
  loginSuccess(data);
}

// เก็บข้อมูลผู้ใช้ในเครื่องโดยไม่เก็บรหัสผ่าน
function setCurrentUser(userObj) {
  const safeUser = Object.assign({}, userObj);
  delete safeUser.password;
  safeUser.role = normalizeRole(safeUser.role);
  currentUser = safeUser;
  writePref("smst_current_user", JSON.stringify(safeUser));
}

function loginSuccess(userObj, opts) {
  const o = opts || {};
  setCurrentUser(userObj);

  $("loginScreen").hidden = true;
  $("appScreen").hidden = false;
  $("loginPassword").value = "";

  applyRoleUI();
  let startTab = "scan";
  if (o.restore) {
    try {
      startTab = sessionStorage.getItem("smst_active_tab") || "scan";
    } catch (e) {}
  }
  switchTab(startTab);
  refreshData();
  syncOfflineQueue();
  startTimers();
}

function handleLogout() {
  closeUserMenu();
  currentUser = null;
  try {
    localStorage.removeItem("smst_current_user");
    sessionStorage.removeItem("smst_active_tab");
  } catch (e) {}
  currentBookingCode = null;
  showLoginScreen();
}

function applyRoleUI() {
  if (!currentUser) return;
  const admin = isAdmin();
  const meta = getRoleMeta(currentUser.role);
  document.querySelectorAll("[data-admin-only]").forEach((el) => {
    el.hidden = !admin;
  });
  document.querySelectorAll("[data-checkin-only]").forEach((el) => {
    el.hidden = !canUserCheckIn();
  });
  document.querySelectorAll('[data-user="name"]').forEach((el) => {
    el.textContent = valOr(currentUser.display_name, currentUser.username);
  });
  document.querySelectorAll('[data-user="initial"]').forEach((el) => {
    el.textContent = initialOf(currentUser.full_name || currentUser.display_name || currentUser.username);
  });
  document.querySelectorAll('[data-user="role-chip"]').forEach((el) => {
    el.innerHTML = roleChip(currentUser.role);
  });
  document.querySelectorAll('[data-user="role-chip-lg"]').forEach((el) => {
    el.innerHTML = roleChip(currentUser.role, true);
  });
  document.querySelectorAll('[data-user="role-desc"]').forEach((el) => {
    el.textContent = meta.desc;
  });
  if (typeof renderWalkInAdminControls === "function") renderWalkInAdminControls();
  $("modePill").innerHTML = roleChip(currentUser.role);
  document.querySelector('.nav-item[data-tab="scan"] span').textContent =
    currentUser.role === "marketing" ? "สแกน / Voucher" : "สแกน / เช็กอิน";

  if (currentUser.role === "marketing") {
    $("scanTitle").textContent = "สแกน QR / Voucher";
    $("scanSubtitle").textContent = "สแกน QR ของน้อง ๆ เพื่อตรวจสิทธิ์ และกดใช้ Voucher ส่วนลดซื้อของหน้างาน";
  } else if (admin) {
    $("scanTitle").textContent = "สแกน QR / เช็กอิน";
    $("scanSubtitle").textContent = "สแกนบัตรเพื่อเช็กอิน และจัดการ Voucher ได้ในที่เดียว";
  } else {
    $("scanTitle").textContent = "สแกน QR / เช็กอิน";
    $("scanSubtitle").textContent = "สแกนบัตรเพื่อตรวจรอบ และกดเช็กอินเข้างาน";
  }

  if (!currentBookingCode) renderResultEmpty();
}

function applyVoucherVisibility() {
  if (getVoucherConfig().enabled) return;
  document.querySelectorAll("[data-voucher-only]").forEach((el) => {
    el.hidden = true;
  });
}

// ================= 4. TABS, MENU & EVENTS =================
function switchTab(tab) {
  let target = tab;
  if (!TAB_IDS.includes(target) || (ADMIN_TABS.includes(target) && !isAdmin())) target = "scan";
  if (target === "walkin" && !canUserCheckIn()) target = "scan";
  activeTab = target;

  TAB_IDS.forEach((t) => {
    const viewEl = $("view-" + t);
    if (viewEl) viewEl.hidden = t !== target;
  });
  document.querySelectorAll(".nav-item[data-tab]").forEach((btn) => {
    const on = btn.dataset.tab === target;
    btn.classList.toggle("is-active", on);
    if (on) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  try {
    sessionStorage.setItem("smst_active_tab", target);
  } catch (e) {}

  closeUserMenu();
  if (target !== "scan") stopScanner();
  if (target === "walkin") renderWalkInSales();
  if (target === "list") renderList(true);
  if (target === "dashboard") renderDashboard();
  if (target === "staff") loadStaffList();
  window.scrollTo(0, 0);
}

function toggleUserMenu() {
  const menu = $("userMenu");
  const open = menu.hidden;
  menu.hidden = !open;
  $("userMenuBtn").setAttribute("aria-expanded", open ? "true" : "false");
}

function closeUserMenu() {
  const menu = $("userMenu");
  if (menu && !menu.hidden) {
    menu.hidden = true;
    $("userMenuBtn").setAttribute("aria-expanded", "false");
  }
}

const ACTIONS = {
  tab: (el) => switchTab(el.dataset.tab),
  "toggle-theme": () => {
    toggleTheme();
    closeUserMenu();
  },
  "user-menu": () => toggleUserMenu(),
  logout: () => handleLogout(),
  export: () => {
    closeUserMenu();
    exportEmergencyCSV();
  },
  refresh: () => {
    closeUserMenu();
    refreshData({ toast: true });
  },
  "toggle-password": (el) => {
    const wrap = el.closest(".input-wrap");
    const input = wrap ? wrap.querySelector("input") : $("loginPassword");
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    el.setAttribute("aria-pressed", show ? "true" : "false");
    el.setAttribute("aria-label", show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน");
    el.innerHTML = icon(show ? "eye-off" : "eye");
  },
  "change-password": () => openChangePasswordModal(),
  "start-camera": () => startScanner(),
  "stop-camera": () => stopScanner(),
  "resume-scan": () => resumeScanner(),
  "switch-camera": () => switchCamera(),
  checkin: (el) => togglePersonCheckIn(Number(el.dataset.id), true),
  "undo-checkin": (el) => togglePersonCheckIn(Number(el.dataset.id), false),
  "checkin-all": (el) => checkInAllRemaining(el.dataset.code),
  "use-voucher": (el) => togglePersonDiscount(Number(el.dataset.id), true),
  "undo-voucher": (el) => togglePersonDiscount(Number(el.dataset.id), false),
  "open-booking": (el) => openBookingFromList(el.dataset.code, Number(el.dataset.id)),
  pick: (el) => openBookingResult(el.dataset.code, { highlightId: Number(el.dataset.id) }),
  "clear-result": () => clearResult(),
  "quick-filter": (el) => setQuickFilter(el.dataset.qf),
  "toggle-sort": () => toggleSortOrder(),
  "edit-staff": (el) => editStaffById(Number(el.dataset.id)),
  "delete-staff": (el) => deleteStaffById(Number(el.dataset.id)),
  "reveal-pass": (el) => revealStaffPassword(el),
  "cancel-edit-staff": () => resetStaffForm(),
  "import-csv": () => importCSVFile(),
  "reset-checkins": () => resetAllCheckIns(),
  "reset-discounts": () => resetAllDiscounts(),
  "export-walkin": () => exportWalkInCsv(),
  "go-walkin-approve": (el) => {
    const code = el.dataset.code;
    switchTab("walkin");
    const tabQueueBtn = $("wiTabQueueBtn");
    if (tabQueueBtn) tabQueueBtn.click();
    const qInput = $("wiQueueSearchInput");
    if (qInput) qInput.value = code;
    loadQueueCandidate(code);
  },
};

function bindEvents() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#userMenu, #userMenuBtn")) closeUserMenu();
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });

  const localBtn = $("localLoginBtn");
  if (localBtn) {
    localBtn.addEventListener("click", () => {
      loginSuccess({
        id: 9999,
        username: "admin_local",
        full_name: "ผู้ดูแลระบบ (โหมดทดสอบ)",
        display_name: "Admin Local",
        role: "admin",
        institution: "SMST",
        year_level: "1",
      });
      showToast("เข้าสู่ระบบโหมดทดสอบ (Admin) เรียบร้อยแล้ว", "success");
    });
  }

  $("loginForm").addEventListener("submit", handleLogin);
  $("searchForm").addEventListener("submit", handleSearchSubmit);
  $("staffForm").addEventListener("submit", handleSaveStaff);

  let listTimer = null;
  $("listSearch").addEventListener("input", (e) => {
    clearTimeout(listTimer);
    listTimer = setTimeout(() => {
      listSearchText = e.target.value;
      renderList(true);
    }, 160);
  });
  $("roundFilterSelect").addEventListener("change", () => renderList(true));

  ["staffFullName", "staffInstitution", "staffYearLevel"].forEach((id) => $(id).addEventListener("input", updateStaffPreview));

  $("optAutoCheckin").addEventListener("change", (e) => {
    prefs.autoCheckin = e.target.checked;
    writePref("smst_auto_checkin", prefs.autoCheckin ? "1" : "0");
    showToast(prefs.autoCheckin ? "เปิดเช็กอินอัตโนมัติเมื่อสแกนแล้ว" : "ปิดเช็กอินอัตโนมัติแล้ว", "info");
  });
  $("optSound").addEventListener("change", (e) => {
    prefs.sound = e.target.checked;
    writePref("smst_sound", prefs.sound ? "1" : "0");
    if (prefs.sound) playSuccessBeep();
  });

  // CSV dropzone
  const dz = $("dropzone");
  const fileInput = $("csvFileInput");
  fileInput.addEventListener("change", updateDropzoneFile);
  ["dragenter", "dragover"].forEach((t) =>
    dz.addEventListener(t, (e) => {
      e.preventDefault();
      dz.classList.add("is-drag");
    })
  );
  ["dragleave", "drop"].forEach((t) => dz.addEventListener(t, () => dz.classList.remove("is-drag")));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      updateDropzoneFile();
    }
  });

  // เครื่องสแกนบาร์โค้ด (USB / Bluetooth) พิมพ์รหัสแล้วกด Enter — แตะช่องค้นหาให้อัตโนมัติ
  document.addEventListener("keydown", (e) => {
    if (activeTab !== "scan" || !currentUser || modalStack.length) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || e.key === " ") return;
    const t = e.target;
    const isTextInput = t && t.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "file"].includes(t.type);
    if (t && (isTextInput || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    const input = $("searchInput");
    input.value = "";
    input.focus({ preventScroll: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (scannerState !== "off") stopScanner();
    } else if (currentUser) {
      syncOfflineQueue();
      refreshData();
    }
  });

  document.addEventListener("smst:themechange", () => {
    if (activeTab === "dashboard") renderDashboardCharts();
  });
}

function startTimers() {
  stopTimers();
  updateClock();
  clockTimer = setInterval(updateClock, 15000);
  autoRefreshTimer = setInterval(() => {
    if (!currentUser || document.hidden || !navigator.onLine) return;
    syncOfflineQueue();
    refreshData();
  }, AUTO_REFRESH_MS);
}

function stopTimers() {
  clearInterval(clockTimer);
  clearInterval(autoRefreshTimer);
}

function updateClock() {
  $("clockText").textContent = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

// ================= 5. SCANNER =================
function setScannerUI(state) {
  scannerState = state;
  $("scannerBox").classList.toggle("is-scanning", state === "scanning");
  $("scannerIdle").hidden = state !== "off";
  $("scannerStarting").hidden = state !== "starting";
  $("scannerPaused").hidden = state !== "paused";
  $("scannerControls").hidden = state === "off" || state === "starting";
  document.querySelectorAll("[data-scan-next]").forEach((el) => {
    el.hidden = state === "off" || state === "starting";
  });
}

async function startScanner() {
  if (scannerState === "starting" || scannerState === "scanning") return;
  if (scannerState === "paused") {
    resumeScanner();
    return;
  }
  if (typeof Html5Qrcode === "undefined") {
    showToast("โหลดตัวสแกน QR ไม่สำเร็จ กรุณารีเฟรชหน้า", "error");
    return;
  }

  setScannerUI("starting");
  const config = { verbose: false };
  if (typeof Html5QrcodeSupportedFormats !== "undefined") {
    config.formatsToSupport = [Html5QrcodeSupportedFormats.QR_CODE];
  }
  const inst = new Html5Qrcode("qr-reader", config);
  html5QrCode = inst;
  try {
    await inst.start({ facingMode: cameraFacing }, { fps: 12 }, onScanSuccess, () => {});
  } catch (err) {
    if (html5QrCode === inst) {
      await stopScanner();
      showToast("ไม่สามารถเปิดกล้องได้ กรุณากดอนุญาตการใช้กล้องบนเบราว์เซอร์", "error", { duration: 4500 });
    }
    return;
  }
  // ผู้ใช้ปิดกล้อง / เปลี่ยนแท็บระหว่างที่กล้องกำลังเปิด
  if (html5QrCode !== inst) {
    try {
      await inst.stop();
      inst.clear();
    } catch (e) {}
    return;
  }
  setScannerUI("scanning");
}

async function stopScanner() {
  clearTimeout(resumeTimer);
  if (html5QrCode) {
    const inst = html5QrCode;
    html5QrCode = null;
    try {
      await inst.stop();
    } catch (e) {}
    try {
      inst.clear();
    } catch (e) {}
  }
  if ($("scannerBox")) setScannerUI("off");
}

function pauseScanner() {
  if (!html5QrCode || scannerState !== "scanning") return;
  try {
    html5QrCode.pause(true);
    setScannerUI("paused");
  } catch (e) {
    stopScanner();
  }
}

function resumeScanner() {
  clearTimeout(resumeTimer);
  if (!html5QrCode || scannerState === "off") {
    startScanner();
    return;
  }
  if (scannerState !== "paused") return;
  try {
    html5QrCode.resume();
    setScannerUI("scanning");
  } catch (e) {
    stopScanner().then(startScanner);
  }
}

function scheduleAutoResume(ms) {
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => {
    if (scannerState === "paused") resumeScanner();
  }, ms);
}

async function switchCamera() {
  cameraFacing = cameraFacing === "environment" ? "user" : "environment";
  writePref("smst_camera_facing", cameraFacing);
  showToast(cameraFacing === "user" ? "ใช้กล้องหน้า" : "ใช้กล้องหลัง", "info", { duration: 1600 });
  if (scannerState !== "off") {
    await stopScanner();
    startScanner();
  }
}

function onScanSuccess(decodedText) {
  const raw = String(decodedText || "").trim();
  // รองรับ QR ที่ฝังรหัสไว้ใน URL เช่น https://…/SMST-XXXXXXXX
  const codeMatch = /SMST-[A-Za-z0-9]+/i.exec(raw);
  const text = codeMatch ? codeMatch[0] : raw;
  const now = Date.now();
  if (!text || scannerState !== "scanning") return;
  // กันการอ่าน QR ใบเดิมซ้ำทันทีขณะที่ยังค้างอยู่หน้ากล้อง
  if (text === lastScan.text && now - lastScan.at < 6000) return;
  lastScan = { text, at: now };
  pauseScanner();
  searchTicket(text, { fromScan: true });
}

// ================= 6. SEARCH =================
function handleSearchSubmit(e) {
  e.preventDefault();
  const val = $("searchInput").value.trim();
  if (val) searchTicket(val, { fromSearch: true });
}

function findBooking(queryText) {
  const q = queryText.toLowerCase().trim();
  const compact = q.replace(/\s+/g, "");
  const rows = cachedAttendees;

  // 1) รหัสบัตร / QR / รหัสจอง (ตรงตัว)
  const codeMatches = rows.filter(
    (r) =>
      (r.ticket_code && String(r.ticket_code).toLowerCase() === compact) ||
      (r.qr_code && String(r.qr_code).toLowerCase() === compact) ||
      (r.booking_code && String(r.booking_code).toLowerCase() === compact)
  );
  if (codeMatches.length) {
    const exactTicket = codeMatches.find((r) => r.ticket_code && r.ticket_code.toLowerCase() === compact);
    return {
      type: "one",
      matchedBy: "code",
      bookingCode: codeMatches[0].booking_code,
      ticketCode: exactTicket ? exactTicket.ticket_code : null,
      rowId: exactTicket ? exactTicket.id : null,
    };
  }

  // 2) เบอร์โทร (ของน้อง หรือผู้ติดต่อ)
  if (/^[\d\s+\-]+$/.test(q) && digitsOnly(q).length >= 9) {
    const p = normalizePhone(q);
    const hits = rows.filter((r) => normalizePhone(r.phone) === p || normalizePhone(r.contact_phone) === p);
    if (hits.length) return pickFromHits(hits);
  }

  // 3) ชื่อ (บางส่วนของชื่อ)
  const nameHits = rows.filter((r) => r.full_name && r.full_name.toLowerCase().includes(q));
  if (nameHits.length) return pickFromHits(nameHits);

  return { type: "none" };
}

function pickFromHits(hits) {
  const bookings = new Set(hits.map((h) => h.booking_code));
  if (bookings.size === 1) {
    return {
      type: "one",
      bookingCode: hits[0].booking_code,
      ticketCode: hits.length === 1 ? hits[0].ticket_code || null : null,
      rowId: hits.length === 1 ? hits[0].id : null,
    };
  }
  return { type: "multi", hits: sortAttendeeRows(hits, true).slice(0, 30) };
}

async function searchTicket(queryText, opts) {
  const o = opts || {};
  const cleanQuery = String(queryText || "").trim();
  if (!cleanQuery) return;
  currentSearchQuery = cleanQuery;
  sessionActed = { checkin: new Set(), voucher: new Set() };
  $("searchInput").value = cleanQuery;

  if (!cachedAttendees.length) {
    $("resultContainer").innerHTML =
      '<div class="card"><div class="empty"><span class="spinner"></span><p class="empty-text">กำลังโหลดข้อมูลบัตรและตรวจสอบสิทธิ์...</p></div></div>';
    await refreshData();
  }

  const match = findBooking(cleanQuery);
  if (match.type === "none") {
    currentBookingCode = null;
    feedback("error");
    renderNotFound(cleanQuery);
    selectSearchIfFocused();
    return;
  }
  if (match.type === "multi") {
    currentBookingCode = null;
    feedback("warn");
    renderMatchPicker(match.hits, cleanQuery);
    selectSearchIfFocused();
    return;
  }
  // รหัสบัตรตรงตัวจากช่องค้นหา = มาจากเครื่องสแกนบาร์โค้ด → ใช้โหมดเช็กอินอัตโนมัติได้ (ค้นด้วยชื่อ/เบอร์จะไม่เช็กอินเอง)
  openBookingResult(match.bookingCode, {
    scannedTicketCode: match.ticketCode,
    highlightId: match.rowId,
    fromScan: o.fromScan || (o.fromSearch && match.matchedBy === "code"),
    feedback: true,
  });
  selectSearchIfFocused();
}

// ให้สแกนครั้งถัดไป (เครื่องสแกนบาร์โค้ด) พิมพ์ทับรหัสเดิมแทนการต่อท้าย
function selectSearchIfFocused() {
  const input = $("searchInput");
  if (document.activeElement === input) input.select();
}

function openBookingFromList(bookingCode, rowId) {
  switchTab("scan");
  currentSearchQuery = bookingCode;
  $("searchInput").value = "";
  openBookingResult(bookingCode, { highlightId: rowId });
}

function openBookingResult(bookingCode, opts) {
  const o = opts || {};
  if (bookingCode !== currentBookingCode) sessionActed = { checkin: new Set(), voucher: new Set() };
  currentBookingCode = bookingCode;
  currentScannedTicketCode = o.scannedTicketCode || null;
  currentHighlightId = o.highlightId || null;
  lastResultSignature = "";

  const verdict = rerenderCurrentResult({ flash: true });
  if (!verdict) return;
  if (o.feedback) feedback(verdict.sound);
  if (o.fromScan) maybeAutoCheckIn();
  if (window.innerWidth < 768) {
    requestAnimationFrame(() => $("resultPanel").scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  refreshBookingFromServer(bookingCode);
}

function clearResult() {
  currentBookingCode = null;
  currentScannedTicketCode = null;
  currentHighlightId = null;
  lastResultSignature = "";
  renderResultEmpty();
}

function maybeAutoCheckIn() {
  if (!prefs.autoCheckin || !canUserCheckIn()) return;
  const rows = cachedAttendees.filter((r) => r.booking_code === currentBookingCode);
  const scanned = findScannedRow(rows);
  if (!scanned || scanned.is_checked_in) return;
  const state = getBookingState(scanned);
  if (state.key === "cancelled" || state.key === "unpaid" || isPendingWalkInRow(scanned)) return;
  togglePersonCheckIn(scanned.id, true, { auto: true });
  scheduleAutoResume(1800);
}

// ================= 7. RESULT CARD (เช็กอิน + Voucher + แยกนักเรียน/ผู้ปกครอง) =================
function renderResultEmpty() {
  const marketing = currentUser && currentUser.role === "marketing";
  $("resultContainer").innerHTML =
    '<div class="card"><div class="empty">' +
      '<div class="empty-art">' + icon(marketing ? "gift" : "ticket") + "</div>" +
      '<p class="empty-title">' + (marketing ? "พร้อมตรวจสิทธิ์ Voucher" : "พร้อมสแกนเช็กอิน") + "</p>" +
      '<p class="empty-text">เปิดกล้องสแกน QR หรือพิมพ์รหัสบัตร / รหัสจอง / ชื่อ / เบอร์โทร แล้วกดค้นหา ' +
        'หรือแตะรายชื่อจากแท็บ "รายชื่อ" เพื่อแสดงการ์ดตรงนี้</p>' +
      '<p class="empty-text" style="font-size:12.5px">ใช้เครื่องสแกนบาร์โค้ด (USB / Bluetooth) ได้ — สแกนได้เลยโดยไม่ต้องแตะช่องค้นหา</p>' +
    "</div></div>";
}

function renderNotFound(query) {
  $("resultContainer").innerHTML =
    '<article class="card result-card">' +
      '<div class="result-status status-danger status-flash">' +
        '<span class="status-icon">' + icon("x-circle") + "</span>" +
        '<div style="min-width:0"><p class="result-status-title">ไม่พบรหัสบัตรหรือรายชื่อนี้ในระบบ</p>' +
        '<p class="result-status-sub">คำค้นหา: <span class="mono">' + esc(query) + "</span></p></div>" +
      "</div>" +
      '<div class="result-body">' +
        '<p class="muted" style="font-size:13.5px">ลองค้นหาด้วยรหัสการจอง ชื่อ หรือเบอร์โทร — ถ้าเพิ่งสมัครหน้างาน ให้แอดมินนำเข้า CSV ล่าสุดก่อน</p>' +
        '<div class="result-foot">' + scanNextButton() + "</div>" +
      "</div>" +
    "</article>";
}

function renderMatchPicker(hits, query) {
  const counts = bookingCounts(cachedAttendees);
  $("resultContainer").innerHTML =
    '<article class="card result-card">' +
      '<div class="result-status status-muted">' +
        '<span class="status-icon">' + icon("users") + "</span>" +
        '<div style="min-width:0"><p class="result-status-title">พบ ' + hits.length + " รายชื่อที่ตรงกับ \"" + esc(query) + '"</p>' +
        '<p class="result-status-sub">แตะเพื่อเลือกคนที่ต้องการ</p></div>' +
      "</div>" +
      '<div class="result-body"><div class="pick-list">' +
        hits
          .map((r) => {
            const round = getTicketRoundInfo(r.ticket_type);
            return (
              '<button type="button" class="pick-item" data-action="pick" data-code="' + esc(r.booking_code) + '" data-id="' + esc(r.id) + '">' +
                '<span class="pick-item-main">' +
                  '<span class="pick-item-name">' + esc(valOr(r.full_name, "-")) + "</span>" +
                  '<span class="pick-item-sub">' + roundChip(round) + categoryChip(r) +
                    '<span class="chip chip-muted chip-code">' + esc(valOr(r.ticket_code, r.booking_code)) + "</span>" +
                    (r.is_checked_in ? '<span class="chip chip-teal">' + icon("check") + "เข้างานแล้ว</span>" : "") +
                    (counts[r.booking_code] > 1 ? '<span class="chip chip-muted">กลุ่ม ' + counts[r.booking_code] + " คน</span>" : "") +
                  "</span>" +
                "</span>" +
                icon("chevron-right") +
              "</button>"
            );
          })
          .join("") +
      "</div></div>" +
    "</article>";
}

function scanNextButton() {
  const hidden = scannerState === "off" || scannerState === "starting";
  return (
    '<button type="button" class="btn btn-secondary btn-lg" data-action="resume-scan" data-scan-next' + (hidden ? " hidden" : "") + ">" +
      icon("scan") + "สแกนคนถัดไป" +
    "</button>"
  );
}

function findScannedRow(rows) {
  if (currentHighlightId) {
    const byId = rows.find((r) => r.id === currentHighlightId);
    if (byId) return byId;
  }
  if (currentScannedTicketCode) {
    const code = currentScannedTicketCode.toLowerCase();
    return rows.find((r) => r.ticket_code && r.ticket_code.toLowerCase() === code) || null;
  }
  return null;
}

function computeVerdict(rows, scannedRow) {
  const first = rows[0];
  const state = getBookingState(first);
  const total = rows.length;
  const checked = rows.filter((r) => r.is_checked_in).length;
  const remaining = total - checked;
  const disc = getDiscountEligibility(first, total);
  const vUsed = rows.filter((r) => r.marketing_discount_used).length;
  const vRemaining = disc.eligible ? total - vUsed : 0;
  const name = scannedRow ? valOr(scannedRow.full_name, "-") : "";
  const roleKey = currentUser ? currentUser.role : "registration";

  if (state.key === "cancelled") {
    return {
      tone: "danger",
      icon: "ban",
      title: "บัตรนี้ถูกยกเลิกแล้ว — ห้ามเช็กอิน" + (roleKey === "registration" ? "" : "และห้ามใช้ Voucher"),
      sub: state.detail,
      sound: "error",
    };
  }

  if (roleKey === "marketing") {
    if (!disc.eligible) return { tone: "muted", icon: "info", title: "ไม่มีสิทธิ์ Voucher", sub: disc.label, sound: "warn" };
    if (scannedRow && scannedRow.marketing_discount_used) {
      if (sessionActed.voucher.has(scannedRow.id)) {
        return { tone: "voucher", icon: "check-circle", title: "ใช้ Voucher ของ " + name + " เรียบร้อย", sub: "ส่วนลด " + disc.percent + "% · เวลา " + shortClock(scannedRow.marketing_discount_used_at), sound: "success" };
      }
      return {
        tone: "warning",
        icon: "alert",
        title: "Voucher ของ " + name + " ใช้ไปแล้ว",
        sub: "เมื่อ " + shortClock(scannedRow.marketing_discount_used_at) + " โดย " + valOr(scannedRow.marketing_discount_used_by, "-"),
        sound: "warn",
      };
    }
    if (vRemaining === 0) return { tone: "gold", icon: "check-circle", title: "ใช้ Voucher ครบทุกคนแล้ว", sub: vUsed + "/" + total + " คน", sound: "warn" };
    return {
      tone: "voucher",
      icon: "gift",
      title: "Voucher ส่วนลด " + disc.percent + "% · ใช้ได้อีก " + vRemaining + " คน",
      sub: disc.label + (state.key === "unpaid" ? " · รายการนี้ยังรอชำระเงิน" : ""),
      sound: "success",
    };
  }

  // ฝ่ายทะเบียน / Admin
  if (scannedRow && scannedRow.is_checked_in && sessionActed.checkin.has(scannedRow.id)) {
    return {
      tone: "success",
      icon: "check-circle",
      title: "เช็กอิน " + name + " เรียบร้อย",
      sub: "เวลา " + shortClock(scannedRow.checked_in_at) + (remaining > 0 ? " · ในกลุ่มยังเหลืออีก " + remaining + " คน" : " · ครบทุกคนในการจองแล้ว"),
      sound: "success",
    };
  }
  if (rows.some(isPendingWalkInRow) || state.key === "unpaid") {
    return {
      tone: "warning",
      icon: "alert",
      title: "รายการ Walk-in นี้ \"ยังไม่ชำระเงินหน้างาน\" — ห้ามเช็กอินเข้างาน",
      sub: "กรุณาตรวจรับเงินที่โต๊ะลงทะเบียน Walk-in ก่อน จึงจะสามารถเช็กอินเข้างานได้",
      sound: "warn",
    };
  }
  if (scannedRow && scannedRow.is_checked_in) {
    return {
      tone: "warning",
      icon: "alert",
      title: name + " เช็กอินไปแล้ว",
      sub: "เมื่อ " + shortClock(scannedRow.checked_in_at) + " โดย " + valOr(scannedRow.checked_in_by, "-") + (remaining > 0 ? " · ในกลุ่มยังเหลืออีก " + remaining + " คน" : ""),
      sound: "warn",
    };
  }
  if (remaining === 0) {
    const justDone = sessionActed.checkin.size > 0;
    return {
      tone: justDone ? "success" : "gold",
      icon: justDone ? "check-circle" : "sparkles",
      title: "เช็กอินเข้างานครบทั้ง " + total + " คนแล้ว",
      sub: justDone ? "บันทึกเรียบร้อย" : "ไม่มีรายการที่ต้องทำเพิ่ม",
      sound: justDone ? "success" : "warn",
    };
  }
  return {
    tone: "success",
    icon: "check-circle",
    title: "บัตรถูกต้อง · เช็กอินได้อีก " + remaining + " คน",
    sub: state.label + (state.key === "verifying" ? " (ตรวจสอบการชำระเงินอยู่)" : ""),
    sound: "success",
  };
}

function resultSignature(rows) {
  return JSON.stringify(
    rows.map((r) => [r.id, r.is_checked_in, r.checked_in_at, r.marketing_discount_used, r.marketing_discount_used_at, r.booking_status, r.payment_status])
  ) + "|" + (currentUser ? currentUser.role : "") + "|" + sessionActed.checkin.size + "|" + sessionActed.voucher.size;
}

function rerenderCurrentResult(opts) {
  if (!currentBookingCode) return null;
  const rows = sortAttendeeRows(cachedAttendees.filter((r) => r.booking_code === currentBookingCode), true);
  if (!rows.length) {
    renderNotFound(currentSearchQuery || currentBookingCode);
    return null;
  }
  const o = opts || {};
  const sig = resultSignature(rows);
  if (!o.force && !o.flash && sig === lastResultSignature) return null;
  lastResultSignature = sig;
  return renderTicketGroup(rows, o);
}

function renderTicketGroup(rows, opts) {
  const o = opts || {};
  const first = rows[0];
  const totalPax = rows.length;
  const checkedInPax = rows.filter((r) => r.is_checked_in).length;
  const remainingPax = totalPax - checkedInPax;
  const usedDiscountPax = rows.filter((r) => r.marketing_discount_used).length;

  const roundInfo = getTicketRoundInfo(first.ticket_type);
  const sched = describeRoundSchedule(roundInfo.key);
  const state = getBookingState(first);
  const isCancelled = state.key === "cancelled";
  const groupDiscountCheck = getDiscountEligibility(first, totalPax);
  const vc = getVoucherConfig();

  const allowCheckin = canUserCheckIn();
  const allowDiscount = canUserManageDiscount();
  const scannedRow = findScannedRow(rows);
  const verdict = computeVerdict(rows, scannedRow);
  const timeWarning = !isCancelled && allowCheckin ? getRoundTimeWarning(roundInfo.key) : null;

  const statusHtml =
    '<div class="result-status status-' + verdict.tone + (o.flash ? " status-flash" : "") + '">' +
      '<span class="status-icon">' + icon(verdict.icon) + "</span>" +
      '<div style="min-width:0"><p class="result-status-title">' + esc(verdict.title) + "</p>" +
      '<p class="result-status-sub">' + esc(verdict.sub) + "</p></div>" +
    "</div>";

  const timeWarnHtml = timeWarning
    ? '<div class="banner tone-amber">' + icon("clock") +
        '<div><p class="banner-title">' + esc(timeWarning) + '</p><p class="banner-sub">ยังกดเช็กอินได้ตามปกติ — โปรดตรวจสอบรอบกับน้อง ๆ อีกครั้ง</p></div>' +
      "</div>"
    : "";

  const schedText = sched.slots && sched.slots.length
    ? sched.slots.map((s) => s.label + " " + s.arrive + " น.").join(" / ")
    : (sched.arrive
      ? "มาถึง " + sched.arrive + " น." + (sched.range ? " · " + sched.range : "")
      : sched.range || "รอประกาศ");

  const metaHtml =
    "<div>" +
      '<div class="booking-meta-top">' +
        '<div class="chips">' + roundChip(roundInfo, "chip-lg") +
          '<span class="chip chip-lg chip-' + state.tone + '">' + icon(state.icon) + esc(state.label) + "</span>" +
        "</div>" +
        '<span class="chip chip-lg chip-code">' + icon("ticket") + esc(first.booking_code) + "</span>" +
      "</div>" +
      '<p class="booking-type">' + esc(normalizeTicketTypeText(first.ticket_type)) + "</p>" +
    "</div>" +
    '<dl class="meta-grid">' +
      '<div class="meta-item"><dt>' + icon("clock") + "เวลาเข้างานของรอบ</dt><dd>" + esc(schedText) + "</dd></div>" +
      '<div class="meta-item"><dt>' + icon("calendar") + "จองเมื่อ</dt><dd>" + esc(valOr(first.booking_date, "-")) + "</dd></div>" +
      '<div class="meta-item"><dt>' + icon("user") + "ผู้ติดต่อ</dt><dd>" + esc(valOr(first.contact_name, "-")) + " · " + esc(valOr(first.contact_phone, "-")) + "</dd></div>" +
      '<div class="meta-item"><dt>' + icon("shield") + "สถานะ / การเงิน</dt><dd>" + esc(valOr(first.booking_status, "-")) + " · " + esc(valOr(first.payment_status, "-")) + "</dd></div>" +
    "</dl>";

  const statsHtml =
    '<div class="mini-stats">' +
      '<div class="mini-stat">' +
        '<div class="mini-stat-head"><span>เช็กอินแล้ว</span><span><b>' + checkedInPax + "</b><small>/" + totalPax + "</small></span></div>" +
        '<div class="progress"><span style="--p:' + pct(checkedInPax, totalPax) + '%"></span></div>' +
      "</div>" +
      (vc.enabled
        ? '<div class="mini-stat">' +
            '<div class="mini-stat-head"><span>' + (groupDiscountCheck.eligible ? "Voucher " + groupDiscountCheck.percent + "%" : "Voucher") + "</span>" +
            "<span><b>" + usedDiscountPax + "</b><small>/" + (groupDiscountCheck.eligible ? totalPax : 0) + "</small></span></div>" +
            '<div class="progress progress-lav"><span style="--p:' + (groupDiscountCheck.eligible ? pct(usedDiscountPax, totalPax) : 0) + '%"></span></div>' +
          "</div>"
        : "") +
    "</div>";

  const membersHtml = rows
    .map((person) => {
      const isChecked = Boolean(person.is_checked_in);
      const isDiscountUsed = Boolean(person.marketing_discount_used);
      const personDiscount = getDiscountEligibility(person, totalPax);
      const tCode = valOr(person.ticket_code, "");
      const isScanned = Boolean(scannedRow) && scannedRow.id === person.id;

      const chips =
        '<span class="chip chip-muted">คนที่ ' + esc(valOr(person.person_order, "1/1")) + "</span>" +
        categoryChip(person) +
        (tCode ? '<span class="chip chip-gold chip-code">' + icon("ticket") + esc(tCode) + "</span>" : '<span class="chip chip-muted">ยังไม่ออกรหัสบัตร</span>') +
        (isScanned ? '<span class="chip chip-solid-gold">' + icon("scan") + "ใบที่สแกน</span>" : "");

      const metaBits = [
        '<span>' + icon("school") + esc(valOr(person.school, "-")) + "</span>",
        '<span>' + icon("phone") + esc(valOr(person.phone, "-")) + "</span>",
        '<span>' + icon("message") + "Line: " + esc(valOr(person.line_id, "-")) + "</span>",
        '<span>' + icon("alert") + "ฉุกเฉิน: " + esc(valOr(person.emergency_phone, "-")) + " (" + esc(valOr(person.emergency_relation, "-")) + ")</span>",
      ].join("");

      const checkinChip = isChecked
        ? '<span class="chip chip-teal">' + icon("check") + "เข้างานเมื่อ " + esc(shortClock(person.checked_in_at)) + " · โดย " + esc(valOr(person.checked_in_by, "-")) + "</span>"
        : '<span class="chip chip-muted">' + icon("clock") + "ยังไม่เช็กอินเข้างาน</span>";

      let voucherChip = "";
      if (vc.enabled) {
        if (!personDiscount.eligible) voucherChip = '<span class="chip chip-muted">' + icon("gift") + "ไม่มีสิทธิ์ Voucher</span>";
        else if (isDiscountUsed)
          voucherChip =
            '<span class="chip chip-rose">' + icon("gift") + "ใช้ Voucher " + personDiscount.percent + "% แล้ว " + esc(shortClock(person.marketing_discount_used_at)) +
            " · โดย " + esc(valOr(person.marketing_discount_used_by, "-")) + "</span>";
        else voucherChip = '<span class="chip chip-gold">' + icon("gift") + "Voucher " + personDiscount.percent + "% พร้อมใช้</span>";
      }

      const isPendingWalkIn = isPendingWalkInRow(person);
      const actions = [];
      if (allowCheckin) {
        if (isPendingWalkIn) {
          actions.push(
            '<span class="chip chip-amber" title="ยังไม่ชำระเงินหน้างาน ห้ามเช็กอิน">' +
              icon("alert") + "รอชำระเงิน (ห้ามเช็กอิน)" +
            '</span>'
          );
        } else {
          actions.push(
            !isChecked
              ? '<button type="button" class="btn btn-primary" data-action="checkin" data-id="' + esc(person.id) + '"' + (isCancelled ? " disabled" : "") + ">" + icon("user-check") + "เช็กอินเข้างาน</button>"
              : '<button type="button" class="btn btn-secondary" data-action="undo-checkin" data-id="' + esc(person.id) + '">' + icon("undo") + "ยกเลิกเช็กอิน</button>"
          );
        }
      }
      if (allowDiscount && personDiscount.eligible) {
        actions.push(
          !isDiscountUsed
            ? '<button type="button" class="btn btn-voucher" data-action="use-voucher" data-id="' + esc(person.id) + '"' + (isCancelled ? " disabled" : "") + ">" + icon("gift") + "ใช้ Voucher " + personDiscount.percent + "%</button>"
            : '<button type="button" class="btn btn-secondary" data-action="undo-voucher" data-id="' + esc(person.id) + '">' + icon("undo") + "คืนสิทธิ์ Voucher</button>"
        );
      }

      return (
        '<div class="member-row' + (isScanned ? " is-scanned" : "") + '">' +
          "<div style=\"min-width:0\">" +
            '<div class="member-row-head">' + chips + "</div>" +
            '<p class="member-row-name">' + esc(valOr(person.full_name, "-")) + "</p>" +
            '<div class="member-row-meta">' + metaBits + "</div>" +
            '<div class="member-row-status">' + checkinChip + voucherChip + "</div>" +
          "</div>" +
          (actions.length ? '<div class="member-row-actions">' + actions.join("") + "</div>" : "") +
        "</div>"
      );
    })
    .join("");

  const anyPendingWalkIn = rows.some(isPendingWalkInRow);
  const foot = [];
  if (allowCheckin && !isCancelled && !anyPendingWalkIn && remainingPax > 1) {
    foot.push(
      '<button type="button" class="btn btn-success btn-lg" data-action="checkin-all" data-code="' + esc(first.booking_code) + '">' +
        icon("users") + "เช็กอินคนที่เหลือทั้งหมด (" + remainingPax + " คน)" +
      "</button>"
    );
  }
  if (anyPendingWalkIn) {
    const wiCode = first.walkin_temp_code || first.booking_code;
    foot.push(
      '<button type="button" class="btn btn-primary btn-lg" data-action="go-walkin-approve" data-code="' + esc(wiCode) + '">' +
        icon("shopping-bag") + "💰 ไปที่โต๊ะรับเงิน Walk-in (" + esc(wiCode) + ")" +
      "</button>"
    );
  }
  foot.push(scanNextButton());

  $("resultContainer").innerHTML =
    '<article class="card result-card">' +
      statusHtml +
      '<div class="result-body">' +
        timeWarnHtml +
        metaHtml +
        statsHtml +
        '<p class="kicker">' + icon("users") + "รายชื่อในรหัสการจองนี้ — กดเช็กอิน / Voucher แยกรายบุคคล</p>" +
        '<div class="member-rows">' + membersHtml + "</div>" +
        '<div class="result-foot">' + foot.join("") + "</div>" +
      "</div>" +
    "</article>";

  return verdict;
}

// ================= 8. TOGGLE CHECK-IN & VOUCHER (รองรับ Offline) =================
function snapshot(row, keys) {
  const s = {};
  keys.forEach((k) => {
    s[k] = row[k];
  });
  return s;
}

function afterLocalChange() {
  saveLocalCache(cachedAttendees);
  rerenderCurrentResult({ force: true });
  renderStats();
  if (activeTab === "list") renderList(true);
  if (activeTab === "walkin") renderWalkInSales();
  if (activeTab === "dashboard") renderDashboard();
}

async function togglePersonCheckIn(rowId, checkInState, opts) {
  const o = opts || {};
  if (!canUserCheckIn()) {
    showToast("บัญชีฝ่าย Marketing ไม่สามารถกดเช็กอินเข้างานของฝ่ายทะเบียนได้", "error");
    return;
  }
  const row = cachedAttendees.find((a) => a.id === rowId);
  if (!row) return;
  if (checkInState && isCancelledRow(row)) {
    showToast("บัตรนี้ถูกยกเลิก ไม่สามารถเช็กอินได้", "error");
    return;
  }
  if (checkInState && isPendingWalkInRow(row)) {
    showToast("ไม่สามารถเช็กอินได้: รายการ Walk-in นี้ยังไม่ได้ชำระเงินหน้างาน (ต้องตรวจรับเงินที่แท็บ Walk-in ก่อน)", "error");
    return;
  }

  const patch = {
    is_checked_in: checkInState,
    checked_in_at: checkInState ? thaiTimeNow() : null,
    checked_in_by: checkInState ? approverName() : null,
  };
  const prev = snapshot(row, Object.keys(patch));
  Object.assign(row, patch);
  if (checkInState) sessionActed.checkin.add(row.id);
  else sessionActed.checkin.delete(row.id);
  afterLocalChange();
  pushRecent({ type: checkInState ? "checkin" : "undo-checkin", name: valOr(row.full_name, "-"), code: row.booking_code, id: row.id });

  const ok = await commitAttendeeUpdate({ kind: "row", rowId, patch }, () => {
    Object.assign(row, prev);
    sessionActed.checkin.delete(row.id);
    dropRecent(checkInState ? "checkin" : "undo-checkin", row.id);
    afterLocalChange();
  });
  if (ok && !o.auto) {
    showToast(checkInState ? "เช็กอิน " + valOr(row.full_name, "") + " เรียบร้อย" : "ยกเลิกเช็กอิน " + valOr(row.full_name, ""), checkInState ? "success" : "info", { duration: 2200 });
  }
}

async function checkInAllRemaining(bookingCode) {
  if (!canUserCheckIn()) return;
  const targets = cachedAttendees.filter((a) => a.booking_code === bookingCode && !a.is_checked_in);
  if (!targets.length) return;
  if (targets.some(isCancelledRow)) {
    showToast("บัตรนี้ถูกยกเลิก ไม่สามารถเช็กอินได้", "error");
    return;
  }
  if (targets.some(isPendingWalkInRow)) {
    showToast("ไม่สามารถเช็กอินได้: มีรายการ Walk-in ที่ยังไม่ได้ชำระเงินหน้างาน", "error");
    return;
  }

  const patch = { is_checked_in: true, checked_in_at: thaiTimeNow(), checked_in_by: approverName() };
  const prev = targets.map((t) => ({ row: t, values: snapshot(t, Object.keys(patch)) }));
  targets.forEach((a) => {
    Object.assign(a, patch);
    sessionActed.checkin.add(a.id);
  });
  afterLocalChange();
  pushRecent({ type: "checkin", name: targets.length + " คน · " + valOr(targets[0].full_name, "-") + (targets.length > 1 ? " และคนอื่น ๆ" : ""), code: bookingCode, id: targets[0].id });

  const ok = await commitAttendeeUpdate({ kind: "booking-checkin", bookingCode, patch }, () => {
    prev.forEach((p) => {
      Object.assign(p.row, p.values);
      sessionActed.checkin.delete(p.row.id);
    });
    dropRecent("checkin", targets[0].id);
    afterLocalChange();
  });
  if (ok) showToast("เช็กอินทั้งกลุ่มเรียบร้อย (" + targets.length + " คน)", "success", { duration: 2200 });
}

async function togglePersonDiscount(rowId, useState) {
  if (!canUserManageDiscount()) {
    showToast("เฉพาะสตาฟฝ่าย Marketing หรือ Admin เท่านั้นที่ใช้ / คืนสิทธิ์ Voucher ได้", "error");
    return;
  }
  const row = cachedAttendees.find((a) => a.id === rowId);
  if (!row) return;
  const groupSize = cachedAttendees.filter((a) => a.booking_code === row.booking_code).length;
  const disc = getDiscountEligibility(row, groupSize);
  if (useState && (!disc.eligible || isCancelledRow(row))) {
    showToast(isCancelledRow(row) ? "บัตรนี้ถูกยกเลิก ห้ามใช้ Voucher" : disc.label, "error");
    return;
  }

  if (!useState) {
    const ok = await confirmDialog({
      title: "คืนสิทธิ์ Voucher?",
      message: "ยกเลิกสถานะ \"ใช้แล้ว\" ของ " + valOr(row.full_name, "-") + " เพื่อให้กลับมาใช้สิทธิ์ได้อีกครั้ง",
      confirmText: "คืนสิทธิ์",
      tone: "danger",
      icon: "undo",
    });
    if (!ok) return;
  }

  const patch = {
    marketing_discount_used: useState,
    marketing_discount_used_at: useState ? thaiTimeNow() : null,
    marketing_discount_used_by: useState ? approverName() : null,
  };
  const prev = snapshot(row, Object.keys(patch));
  Object.assign(row, patch);
  if (useState) sessionActed.voucher.add(row.id);
  else sessionActed.voucher.delete(row.id);
  afterLocalChange();
  pushRecent({ type: useState ? "voucher" : "undo-voucher", name: valOr(row.full_name, "-"), code: row.booking_code, id: row.id });

  const ok = await commitAttendeeUpdate({ kind: "row", rowId, patch }, () => {
    Object.assign(row, prev);
    sessionActed.voucher.delete(row.id);
    dropRecent(useState ? "voucher" : "undo-voucher", row.id);
    afterLocalChange();
  });
  if (ok) {
    showToast(useState ? "ใช้ Voucher " + disc.percent + "% ของ " + valOr(row.full_name, "") + " แล้ว" : "คืนสิทธิ์ Voucher ของ " + valOr(row.full_name, ""), useState ? "success" : "info", { duration: 2200 });
  }
}

// ================= 9. OFFLINE ENGINE (Local Queue & Sync) =================
function isNetworkError(error) {
  if (!error) return false;
  if (error.code) return false;
  return /fetch|network|timeout|load failed|offline/i.test(String(error.message || error));
}

function actionKey(act) {
  return act.kind === "row" ? "row:" + act.rowId : "booking:" + act.bookingCode;
}

function runQueuedAction(act) {
  if (act.kind === "row") {
    return supabaseClient.from("attendees").update(act.patch).eq("id", act.rowId);
  }
  return supabaseClient.from("attendees").update(act.patch).eq("booking_code", act.bookingCode).eq("is_checked_in", false);
}

async function commitAttendeeUpdate(action, rollback) {
  if (!supabaseClient || !navigator.onLine) {
    pushOfflineQueue(action);
    showToast("ออฟไลน์อยู่ — บันทึกไว้ในเครื่องแล้ว จะซิงก์อัตโนมัติเมื่อออนไลน์", "warning");
    return true;
  }
  const key = actionKey(action);
  pendingWrites.add(key);
  let res;
  try {
    res = await runQueuedAction(action);
  } catch (e) {
    res = { error: { message: String((e && e.message) || e) } };
  }
  pendingWrites.delete(key);

  const error = res && res.error;
  if (!error) return true;
  if (isNetworkError(error)) {
    pushOfflineQueue(action);
    showToast("สัญญาณไม่เสถียร — บันทึกไว้ในเครื่องแล้ว จะซิงก์ให้อัตโนมัติ", "warning");
    return true;
  }
  rollback();
  showToast("บันทึกไม่สำเร็จ: " + error.message, "error", { duration: 5000 });
  return false;
}

function initNetworkListeners() {
  window.addEventListener("online", () => {
    updateNetworkUI();
    syncOfflineQueue();
    refreshData();
  });
  window.addEventListener("offline", updateNetworkUI);
  updateNetworkUI();
}

function updateNetworkUI() {
  const chip = $("netChip");
  if (!chip) return;
  const queued = readQueue().length;
  if (!navigator.onLine) {
    chip.hidden = false;
    $("netChipText").textContent = queued ? "ออฟไลน์ · รอซิงก์ " + queued : "ออฟไลน์ (บันทึกในเครื่อง)";
  } else if (queued) {
    chip.hidden = false;
    $("netChipText").textContent = "รอซิงก์ " + queued + " รายการ";
  } else {
    chip.hidden = true;
  }
}

function saveLocalCache(data) {
  try {
    localStorage.setItem("smst_attendees_cache", JSON.stringify(data));
    window.dispatchEvent(new CustomEvent("smst:attendeescachechange", { detail: data }));
  } catch (e) {}
}

function getLocalCache() {
  try {
    const c = localStorage.getItem("smst_attendees_cache");
    return c ? JSON.parse(c) : [];
  } catch (e) {
    return [];
  }
}

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem("smst_offline_queue") || "[]");
  } catch (e) {
    return [];
  }
}

function writeQueue(q) {
  try {
    if (q.length) localStorage.setItem("smst_offline_queue", JSON.stringify(q));
    else localStorage.removeItem("smst_offline_queue");
  } catch (e) {}
}

function pushOfflineQueue(actionObj) {
  const q = readQueue();
  q.push(actionObj);
  writeQueue(q);
  updateNetworkUI();
}

// รองรับคิวรูปแบบเก่า (ก่อนอัปเดต UI) ที่อาจค้างอยู่ในเครื่อง
function normalizeQueuedAction(act) {
  if (!act) return null;
  if (act.kind) return act;
  if (act.type === "checkin") {
    return { kind: "row", rowId: act.rowId, patch: { is_checked_in: act.checkInState, checked_in_at: act.nowStr, checked_in_by: act.approverName } };
  }
  if (act.type === "checkin_all") {
    return { kind: "booking-checkin", bookingCode: act.bookingCode, patch: { is_checked_in: true, checked_in_at: act.nowStr, checked_in_by: act.approverName } };
  }
  if (act.type === "discount") {
    return {
      kind: "row",
      rowId: act.rowId,
      patch: { marketing_discount_used: act.useState, marketing_discount_used_at: act.nowStr, marketing_discount_used_by: act.approverName },
    };
  }
  return null;
}

// ใส่การเปลี่ยนแปลงที่ยังไม่ซิงก์ทับข้อมูลจากเซิร์ฟเวอร์ เพื่อไม่ให้หน้าจอเด้งกลับสถานะเดิม
function applyQueuedActions(rows) {
  readQueue().forEach((raw) => {
    const act = normalizeQueuedAction(raw);
    if (!act) return;
    rows.forEach((r) => {
      if (act.kind === "row" && r.id === act.rowId) Object.assign(r, act.patch);
      if (act.kind === "booking-checkin" && r.booking_code === act.bookingCode && !r.is_checked_in) Object.assign(r, act.patch);
    });
  });
}

async function syncOfflineQueue() {
  if (isSyncing || !navigator.onLine || !supabaseClient) return;
  let q = readQueue();
  if (!q.length) return;
  isSyncing = true;
  let synced = 0;
  try {
    while (q.length) {
      const act = normalizeQueuedAction(q[0]);
      if (act) {
        let res;
        try {
          res = await runQueuedAction(act);
        } catch (e) {
          res = { error: { message: String((e && e.message) || e) } };
        }
        if (res && res.error && isNetworkError(res.error)) break;
        if (res && res.error) showToast("ซิงก์บางรายการไม่สำเร็จ: " + res.error.message, "error");
        else synced++;
      }
      q.shift();
      writeQueue(q);
    }
  } finally {
    isSyncing = false;
    updateNetworkUI();
  }
  if (synced) {
    showToast("ซิงก์ข้อมูลที่บันทึกตอนออฟไลน์แล้ว " + synced + " รายการ", "success");
    refreshData();
  }
}

// ================= 10. DATA: โหลดรายชื่อ + สถิติ =================
async function fetchAllAttendees() {
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseClient
      .from("attendees")
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

function keepPendingRows(serverRows) {
  if (!pendingWrites.size) return serverRows;
  return serverRows.map((r) => {
    if (!pendingWrites.has("row:" + r.id) && !pendingWrites.has("booking:" + r.booking_code)) return r;
    return cachedAttendees.find((c) => c.id === r.id) || r;
  });
}

// ถ้ามีการโหลดค้างอยู่ ให้รอผลเดียวกัน (เช่น สแกนทันทีหลังล็อกอินขณะข้อมูลยังโหลดไม่เสร็จ)
function refreshData(opts) {
  if (!refreshPromise) {
    refreshPromise = loadAttendees().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise.then((fromServer) => {
    if (opts && opts.toast) {
      showToast(fromServer ? "อัปเดตข้อมูลล่าสุดแล้ว" : "ออฟไลน์ — ใช้ข้อมูลที่บันทึกไว้ในเครื่อง", fromServer ? "success" : "warning", { duration: 2000 });
    }
    return fromServer;
  });
}

async function loadAttendees() {
  let data = null;
  let fromServer = false;
  if (supabaseClient && navigator.onLine) {
    try {
      data = keepPendingRows(await fetchAllAttendees());
      fromServer = true;
    } catch (e) {
      data = null;
    }
  }

  // ผสานรายการ Walk-in หรือคิวที่สร้างไว้ในเครื่องและยังไม่ขึ้นเซิร์ฟเวอร์ เพื่อป้องกันข้อมูลสูญหาย
  const localRows = getLocalCache();
  if (data && data.length) {
    const serverCodes = new Set(data.map((r) => String(r.ticket_code || r.booking_code || "").toUpperCase()));
    const serverIds = new Set(data.map((r) => r.id));

    localRows.forEach((lr) => {
      const lrCode = String(lr.ticket_code || lr.walkin_temp_code || lr.booking_code || "").toUpperCase();
      const notOnServer = (!serverIds.has(lr.id) && !serverCodes.has(lrCode));
      if (notOnServer) {
        data.unshift(lr);
      }
    });

    applyQueuedActions(data);
    saveLocalCache(data);
  } else {
    data = localRows;
  }
  if (!data || data.length === 0) {
    data = getSampleAttendees();
    saveLocalCache(data);
  }
  cachedAttendees = data || [];

  renderStats();
  if (activeTab === "list") renderList();
  if (activeTab === "walkin") renderWalkInSales();
  if (activeTab === "dashboard") renderDashboard();
  if (currentBookingCode) rerenderCurrentResult();
  return fromServer;
}

async function refreshBookingFromServer(bookingCode) {
  if (!supabaseClient || !navigator.onLine) return;
  try {
    const { data, error } = await supabaseClient.from("attendees").select("*").eq("booking_code", bookingCode);
    if (error || !data) return;
    const fresh = keepPendingRows(data);
    applyQueuedActions(fresh);
    fresh.forEach((row) => {
      const idx = cachedAttendees.findIndex((c) => c.id === row.id);
      if (idx === -1) cachedAttendees.push(row);
      else cachedAttendees[idx] = Object.assign(cachedAttendees[idx], row);
    });
    saveLocalCache(cachedAttendees);
    if (currentBookingCode === bookingCode) rerenderCurrentResult();
    renderStats();
  } catch (e) {}
}

function bookingCounts(rows) {
  const map = {};
  rows.forEach((r) => {
    map[r.booking_code] = (map[r.booking_code] || 0) + 1;
  });
  return map;
}

function isPendingWalkInRow(r) {
  if (!r) return false;
  const bStatus = valOr(r.booking_status, "");
  const pStatus = valOr(r.payment_status, "");
  if (bStatus === "รอชำระเงินหน้างาน") return true;
  if (pStatus === "รอชำระเงิน" || pStatus === "pending") return true;
  const isWalkIn = getRoundKey(r.ticket_type) === "walkin" ||
                   (r.booking_code && String(r.booking_code).startsWith("W-")) ||
                   (r.walkin_temp_code && String(r.walkin_temp_code).startsWith("W-"));
  if (isWalkIn && bStatus !== "อนุมัติแล้ว" && pStatus !== "ชำระเงินแล้ว") return true;
  return false;
}

function computeStats(rows) {
  const valid = rows.filter((r) => !isCancelledRow(r) && !isPendingWalkInRow(r));
  const counts = bookingCounts(valid);
  const eligible = valid.filter((r) => getDiscountEligibility(r, counts[r.booking_code] || 1).eligible);
  return {
    valid,
    counts,
    total: valid.length,
    checked: valid.filter((r) => r.is_checked_in).length,
    vEligible: eligible.length,
    vUsed: eligible.filter((r) => r.marketing_discount_used).length,
  };
}

function renderStats() {
  const s = computeStats(cachedAttendees);
  const setAll = (key, val) =>
    document.querySelectorAll('[data-stat="' + key + '"]').forEach((el) => {
      el.textContent = val;
    });
  setAll("checked", s.checked);
  setAll("total", s.total);
  setAll("vused", s.vUsed);
  setAll("veligible", s.vEligible);
  document.querySelectorAll('[data-stat-bar="checkin"]').forEach((el) => el.style.setProperty("--p", pct(s.checked, s.total) + "%"));
  document.querySelectorAll('[data-stat-bar="voucher"]').forEach((el) => el.style.setProperty("--p", pct(s.vUsed, s.vEligible) + "%"));
  updateNetworkUI();
}

// ================= 11. รายชื่อทั้งหมด + Quick Filters =================
function toggleSortOrder() {
  sortAscending = !sortAscending;
  $("sortOrderLabel").textContent = sortAscending ? "จองก่อน → ล่าสุด" : "ล่าสุด → จองก่อน";
  renderList(true);
}

function setQuickFilter(filterKey) {
  activeQuickFilter = filterKey;
  document.querySelectorAll(".chip-btn[data-qf]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.qf === filterKey);
  });
  renderList(true);
}

function renderList(force) {
  const vc = getVoucherConfig();
  const counts = bookingCounts(cachedAttendees);
  const roundVal = $("roundFilterSelect").value;
  const q = listSearchText.trim().toLowerCase();
  const qDigits = digitsOnly(q);

  const sig = [cachedAttendees.length, JSON.stringify(cachedAttendees.map((r) => [r.id, r.is_checked_in, r.marketing_discount_used, r.booking_status])), roundVal, q, activeQuickFilter, sortAscending].join("|");
  if (!force && sig === lastListSignature) return;
  lastListSignature = sig;

  const sortedData = sortAttendeeRows(cachedAttendees, sortAscending);
  const base = sortedData.filter((r) => {
    if (roundVal !== "all" && getRoundKey(r.ticket_type) !== roundVal) return false;
    if (!q) return true;
    const hay = [r.full_name, r.school, r.ticket_code, r.booking_code, r.contact_name].map((v) => valOr(v, "").toLowerCase()).join(" ");
    if (hay.includes(q)) return true;
    return qDigits.length >= 4 && (digitsOnly(r.phone).includes(qDigits) || digitsOnly(r.contact_phone).includes(qDigits));
  });

  const discOf = (r) => getDiscountEligibility(r, counts[r.booking_code] || 1);
  const predicates = {
    all: () => true,
    uncheck: (r) => !r.is_checked_in && !isCancelledRow(r) && !isPendingWalkInRow(r),
    checked: (r) => Boolean(r.is_checked_in),
    student: (r) => !isParentRow(r),
    parent: (r) => isParentRow(r),
    "disc-unused": (r) => !isCancelledRow(r) && discOf(r).eligible && !r.marketing_discount_used,
    "disc-used": (r) => discOf(r).eligible && Boolean(r.marketing_discount_used),
    issue: (r) => {
      const k = getBookingState(r).key;
      return k === "cancelled" || k === "unpaid" || isPendingWalkInRow(r);
    },
  };
  Object.keys(predicates).forEach((k) => {
    const el = document.querySelector('[data-qf-count="' + k + '"]');
    if (el) el.textContent = base.filter(predicates[k]).length;
  });

  const filteredRows = base.filter(predicates[activeQuickFilter] || predicates.all);

  $("allAttendeesList").innerHTML = filteredRows.length
    ? filteredRows
        .map((r, idx) => {
          const tCode = valOr(r.ticket_code, "");
          const roundInfo = getTicketRoundInfo(r.ticket_type);
          const discInfo = discOf(r);
          const state = getBookingState(r);
          const cancelled = state.key === "cancelled";

          const isPendingWalkIn = isPendingWalkInRow(r);
          const checkinBadge = isPendingWalkIn
            ? '<span class="chip chip-amber"><span class="pulse-dot"></span>รอชำระเงิน (ห้ามเช็กอิน)</span>'
            : r.is_checked_in
            ? '<span class="chip chip-teal">' + icon("check") + "เข้างาน " + esc(shortClock(r.checked_in_at)) + "</span>"
            : '<span class="chip chip-muted">ยังไม่เข้า</span>';
          let voucherBadge = "";
          if (vc.enabled && !cancelled) {
            if (!discInfo.eligible) voucherBadge = '<span class="chip chip-muted">ไม่มี Voucher</span>';
            else if (r.marketing_discount_used) voucherBadge = '<span class="chip chip-rose">' + icon("gift") + "ใช้ " + discInfo.percent + "% แล้ว</span>";
            else voucherBadge = '<span class="chip chip-gold">' + icon("gift") + "ลด " + discInfo.percent + "%</span>";
          }

          return (
            '<button type="button" class="row' + (cancelled ? " is-cancelled" : "") + '" data-action="open-booking" data-code="' + esc(r.booking_code) + '" data-id="' + esc(r.id) + '">' +
              '<span class="row-idx">' + (idx + 1) + "</span>" +
              '<span class="row-main"><span class="row-name">' + esc(valOr(r.full_name, "-")) + '</span><span class="row-school">' + esc(valOr(r.school, "-")) + "</span></span>" +
              '<span class="row-chips">' +
                roundChip(roundInfo) +
                categoryChip(r) +
                '<span class="chip chip-muted chip-code">' + esc(tCode || r.booking_code) + "</span>" +
                '<span class="chip chip-muted">' + esc(valOr(r.person_order, "1/1")) + "</span>" +
              "</span>" +
              '<span class="row-meta"><span>' + icon("clock") + esc(valOr(r.booking_date, "-")) + "</span><span>" + esc(state.label) + "</span></span>" +
              '<span class="row-status">' + (cancelled ? '<span class="chip chip-rose">' + icon("ban") + "ยกเลิก</span>" : checkinBadge) + voucherBadge + "</span>" +
            "</button>"
          );
        })
        .join("")
    : '<p class="rows-empty">ไม่พบรายชื่อที่ตรงกับตัวกรอง</p>';

  $("listCount").textContent = "แสดง " + filteredRows.length + " จาก " + cachedAttendees.length + " รายชื่อ";
}

// ================= 12. DASHBOARD CHARTS & REAL-TIME SUMMARY =================
function loadChartJs() {
  if (window.Chart) return Promise.resolve();
  if (!chartJsPromise) {
    chartJsPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = CHART_JS_URL;
      s.onload = resolve;
      s.onerror = () => {
        chartJsPromise = null;
        reject(new Error("chart.js"));
      };
      document.head.appendChild(s);
    });
  }
  return chartJsPromise;
}

function renderDashboard() {
  if (!isAdmin()) return;
  const s = computeStats(cachedAttendees);
  const valid = s.valid;
  const parents = valid.filter(isParentRow).length;
  const bookings = Object.keys(s.counts).length;
  const states = cachedAttendees.map(getBookingState);
  const unpaid = states.filter((x) => x.key === "unpaid").length;
  const verifying = states.filter((x) => x.key === "verifying").length;
  const cancelled = states.filter((x) => x.key === "cancelled").length;

  $("kpiTotal").textContent = s.total;
  $("kpiTotalSub").textContent = "นักเรียน " + (s.total - parents) + " · ผู้ปกครอง " + parents + " · " + bookings + " การจอง";
  $("kpiChecked").textContent = s.checked;
  $("kpiCheckedPct").textContent = pct(s.checked, s.total) + "%";
  $("kpiCheckedBar").style.setProperty("--p", pct(s.checked, s.total) + "%");
  $("kpiVoucher").textContent = s.vUsed;
  $("kpiVoucherOf").textContent = "/ " + s.vEligible + " สิทธิ์";
  $("kpiVoucherBar").style.setProperty("--p", pct(s.vUsed, s.vEligible) + "%");
  $("kpiPending").textContent = unpaid + verifying;
  $("kpiPendingSub").textContent = "รอชำระ " + unpaid + " · รอตรวจสอบ " + verifying + " · ยกเลิก " + cancelled;

  const progressTone = { gold: "progress-gold", sky: "progress-sky", lav: "progress-lav", mint: "progress-mint" };
  const rounds = getDashboardRounds(valid);
  $("roundProgress").className = "round-progress rp-" + rounds.length;
  $("roundProgress").innerHTML = rounds.map((key) => {
    const meta = getRoundMeta(key);
    const rowsK = valid.filter((r) => getRoundKey(r.ticket_type) === key);
    const total = rowsK.length;
    const checked = rowsK.filter((r) => r.is_checked_in).length;
    const sched = describeRoundSchedule(key);
    return (
      '<div class="rp-card card">' +
        '<div class="rp-head">' + roundChip(meta) + '<span class="muted" style="font-size:12.5px">' + (sched.arrive ? "มาถึง " + esc(sched.arrive) + " น." : "เวลา: รอประกาศ") + "</span></div>" +
        '<p class="rp-value">' + checked + "<small> / " + total + " คน</small></p>" +
        '<div class="progress ' + (progressTone[meta.tone] || "") + '"><span style="--p:' + pct(checked, total) + '%"></span></div>' +
        '<div class="rp-foot"><span>เช็กอินแล้ว ' + pct(checked, total) + "%</span><span>เหลือ " + (total - checked) + " คน</span></div>" +
      "</div>"
    );
  }).join("");

  renderDashboardCharts();
  runDeepDiveAnalytics(valid);
}

// แสดงเฉพาะรอบที่มีผู้สมัคร หรือรอบที่เปิดแสดงในหน้า landing (เช่น ซ่อน Walk-in ถ้ายังไม่ใช้)
function getDashboardRounds(validRows) {
  return ROUND_ORDER.filter(
    (key) => validRows.some((r) => getRoundKey(r.ticket_type) === key) || getRoundConfig(key).showOnLanding !== false
  );
}

async function renderDashboardCharts() {
  try {
    await loadChartJs();
  } catch (e) {
    $("peakSummaryText").textContent = "โหลดกราฟไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต)";
    return;
  }
  if (activeTab !== "dashboard") return;

  const validRows = cachedAttendees.filter((r) => !isCancelledRow(r));
  const textColor = cssVar("--chart-text");
  const gridColor = cssVar("--chart-grid");
  Chart.defaults.font.family = "Prompt, sans-serif";
  Chart.defaults.color = textColor;

  // 1. DOUGHNUT: สัดส่วนผู้สมัครตามรอบ
  const rounds = getDashboardRounds(validRows);
  const labels = rounds.map((k) => getRoundMeta(k).short);
  const colors = rounds.map((k) => ROUND_COLORS[k]);
  const values = rounds.map((k) => validRows.filter((r) => getRoundKey(r.ticket_type) === k).length);

  if (roundChartInstance) roundChartInstance.destroy();
  roundChartInstance = new Chart($("roundDoughnutChart"), {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 3, borderColor: cssVar("--surface-strong"), hoverOffset: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { display: false } } },
  });
  $("doughnutLegend").innerHTML = labels
    .map((label, i) => '<span><i style="background:' + colors[i] + '"></i>' + esc(label) + ": <b>" + values[i] + "</b></span>")
    .join("");

  // 2. BAR: Peak Check-in Hours (นับตามเวลาที่สแกนจริง)
  const buckets = [{ label: "ก่อน 08:00", count: 0 }];
  for (let h = 8; h <= 16; h++) buckets.push({ label: String(h).padStart(2, "0") + ":00", count: 0 });
  buckets.push({ label: "หลัง 17:00", count: 0 });

  validRows
    .filter((r) => r.is_checked_in && r.checked_in_at)
    .forEach((r) => {
      const hr = parseInt(String(r.checked_in_at).split(":")[0], 10);
      if (isNaN(hr)) return;
      if (hr < 8) buckets[0].count++;
      else if (hr > 16) buckets[buckets.length - 1].count++;
      else buckets[hr - 7].count++;
    });

  if (peakHoursChartInstance) peakHoursChartInstance.destroy();
  peakHoursChartInstance = new Chart($("peakHoursBarChart"), {
    type: "bar",
    data: {
      labels: buckets.map((b) => b.label),
      datasets: [{ label: "จำนวนคนที่เช็กอิน (คน)", data: buckets.map((b) => b.count), backgroundColor: cssVar("--chart-bar"), borderRadius: 8, maxBarThickness: 36 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0, color: textColor }, grid: { color: gridColor } },
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
  });

  const maxVal = Math.max.apply(null, buckets.map((b) => b.count));
  const peak = buckets.find((b) => b.count === maxVal && maxVal > 0);
  $("peakSummaryText").innerHTML = peak
    ? "ช่วงที่เช็กอินหนาแน่นที่สุด: <b>" + esc(peak.label) + "</b> (" + maxVal + " คน)"
    : "ยังไม่มีข้อมูลการเช็กอิน — กราฟจะคำนวณให้อัตโนมัติเมื่อเริ่มสแกน";
}

// ================= 13. DEEP-DIVE ANALYTICS =================
function topEntries(map, n) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function barListHtml(entries, tone) {
  if (!entries.length) return '<p class="insight-empty">ยังไม่มีข้อมูล</p>';
  const max = entries[0][1] || 1;
  return (
    '<div class="bar-list">' +
    entries
      .map(
        ([label, count]) =>
          '<div class="bar-item">' +
            '<div class="bar-item-head"><span>' + esc(label) + "</span><b>" + count + " คน</b></div>" +
            '<div class="bar"><span style="--p:' + Math.max(4, Math.round((count / max) * 100)) + "%; --tone:" + tone + '"></span></div>' +
          "</div>"
      )
      .join("") +
    "</div>"
  );
}

function runDeepDiveAnalytics(validRows) {
  // 1. Target Medical School (จัดกลุ่มชื่อสถาบัน)
  const uniCount = {};
  const isMarketingChannelVal = (val) => {
    const s = String(val || "").toLowerCase();
    return s.includes("fb") || s.includes("facebook") || s.includes("ig") || s.includes("instagram") ||
           s.includes("tiktok") || s.includes("ติ๊กต๊อก") || s.includes("เพื่อน") || s.includes("โรงเรียน") ||
           s.includes("เฟส") || s.includes("ไอจี") || s.includes("openhouse");
  };

  validRows.forEach((r) => {
    let u = valOr(r.target_uni, "").trim();
    if (isMarketingChannelVal(u)) return; // ข้ามชื่อช่องทาง ไม่นำมาปนในรายชื่อมหาวิทยาลัย

    if (u && u !== "-") {
      if (u.includes("มหิดล")) u = "มหาวิทยาลัยมหิดล";
      if (u.includes("จุฬา")) u = "จุฬาลงกรณ์มหาวิทยาลัย";
      if (u.includes("พระมงกุฎ") || u.toLowerCase().includes("pcm")) u = "วิทยาลัยแพทยศาสตร์พระมงกุฎเกล้า";
      if (u.includes("เชียงใหม่") || u.toLowerCase() === "cmu") u = "มหาวิทยาลัยเชียงใหม่";
      if (u.includes("ธรรมศาสตร์") || u.toLowerCase() === "tu") u = "มหาวิทยาลัยธรรมศาสตร์";
      if (u.includes("ขอนแก่น") || u.toLowerCase() === "kku") u = "มหาวิทยาลัยขอนแก่น";
      if (u.includes("สงขลา") || u.toLowerCase() === "psu") u = "มหาวิทยาลัยสงขลานครินทร์";
      if (u.includes("วชิระ")) u = "คณะแพทยศาสตร์วชิรพยาบาล";
      if (u.includes("มศว")) u = "มศว";
      uniCount[u] = (uniCount[u] || 0) + 1;
    }
  });

  // 2. Marketing Channels
  const chCount = {};
  validRows.forEach((r) => {
    let ch = valOr(r.channel, "").trim();
    if (ch && ch !== "-") {
      const lower = ch.toLowerCase();
      if (lower.includes("fb") || lower.includes("facebook") || ch.includes("เฟส")) ch = "Facebook";
      else if (lower.includes("ig") || lower.includes("instagram") || ch.includes("ไอจี")) ch = "Instagram";
      else if (lower.includes("tiktok") || ch.includes("ติ๊กต๊อก")) ch = "TikTok";
      else if (ch.includes("เพื่อน") || ch.includes("รุ่นพี่")) ch = "คนรู้จัก / เพื่อนแนะนำ";
      else if (ch.includes("โรงเรียน") || ch.includes("ครู")) ch = "โรงเรียน / อาจารย์แนะแนว";
      chCount[ch] = (chCount[ch] || 0) + 1;
    }
  });

  // 3. Demographic: นักเรียน vs ผู้ปกครอง
  const totalPax = validRows.length;
  const parentCount = validRows.filter(isParentRow).length;
  const studentCount = totalPax - parentCount;

  // 4. Voucher Funnel
  const counts = bookingCounts(validRows);
  const eligibleRows = validRows.filter((r) => getDiscountEligibility(r, counts[r.booking_code] || 1).eligible);
  const usedRows = eligibleRows.filter((r) => r.marketing_discount_used);
  const checkedEligible = eligibleRows.filter((r) => r.is_checked_in);

  const cards = [
    '<div class="insight tone-gold"><h4>' + icon("cap") + "มหาวิทยาลัยแพทย์ในฝัน (Top 5)</h4>" + barListHtml(topEntries(uniCount, 5), "#FBC80E") + "</div>",
    '<div class="insight tone-sky"><h4>' + icon("megaphone") + "รู้จักโครงการจากช่องทางไหน</h4>" + barListHtml(topEntries(chCount, 5), "#5DB8F5") + "</div>",
    '<div class="insight tone-pink"><h4>' + icon("users") + "สัดส่วนผู้เข้าร่วม</h4>" +
      barListHtml(
        [
          ["นักเรียน (" + pct(studentCount, totalPax) + "%)", studentCount],
          ["ผู้ปกครอง (" + pct(parentCount, totalPax) + "%)", parentCount],
        ].sort((a, b) => b[1] - a[1]),
        "#FF9FB8"
      ) +
    "</div>",
  ];
  if (getVoucherConfig().enabled) {
    cards.push(
      '<div class="insight tone-lav"><h4>' + icon("gift") + "Voucher Funnel</h4>" +
        barListHtml(
          [
            ["มีสิทธิ์ Voucher", eligibleRows.length],
            ["มาถึงงานแล้ว (" + pct(checkedEligible.length, eligibleRows.length) + "%)", checkedEligible.length],
            ["ใช้ Voucher แล้ว (" + pct(usedRows.length, eligibleRows.length) + "%)", usedRows.length],
          ],
          "#A97BFF"
        ) +
      "</div>"
    );
  }
  $("deepDiveResults").innerHTML = cards.join("");
}

// ================= 14. EXPORT CSV ฉุกเฉิน =================
function exportEmergencyCSV() {
  if (cachedAttendees.length === 0) {
    showToast("ไม่มีข้อมูลรายชื่อสำหรับ Export", "warning");
    return;
  }
  if (typeof Papa === "undefined") {
    showToast("โหลดตัวสร้างไฟล์ CSV ไม่สำเร็จ", "error");
    return;
  }

  const csvData = sortAttendeeRows(cachedAttendees, true).map((r, idx) => ({
    "ลำดับ": idx + 1,
    "รหัสการจอง": r.booking_code,
    "ลำดับคนที่": r.person_order,
    "ประเภท": r.ticket_type_category || "นักเรียน",
    "รหัสบัตรเข้างาน": r.ticket_code || "",
    "ชื่อ-นามสกุล": r.full_name || "",
    "โรงเรียน": r.school || "",
    "เบอร์โทรศัพท์": r.phone || "",
    "รอบ": getTicketRoundInfo(r.ticket_type).name,
    "ชุดบัตร": r.ticket_type || "",
    "สถานะการจอง": r.booking_status || "",
    "สถานะเช็กอิน": r.is_checked_in ? "เข้างานแล้ว" : "ยังไม่เข้างาน",
    "เวลาที่เช็กอิน": r.checked_in_at || "",
    "สตาฟผู้อนุมัติ": r.checked_in_by || "",
    "ใช้ส่วนลดMarketing": r.marketing_discount_used ? "ใช้แล้ว" : "ยังไม่ใช้",
    "เวลาที่ใช้ส่วนลด": r.marketing_discount_used_at || "",
    "สตาฟMarketingผู้อนุมัติ": r.marketing_discount_used_by || "",
    "วันที่จอง": r.booking_date || "",
  }));

  const csvString = Papa.unparse(csvData);
  const blob = new Blob(["﻿" + csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const dateStr = localDateISO(now);
  const timeStr = String(now.getHours()).padStart(2, "0") + "-" + String(now.getMinutes()).padStart(2, "0");

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "SMST_Checkin_Backup_" + dateStr + "_" + timeStr + ".csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast("ดาวน์โหลด CSV สำรองแล้ว (" + csvData.length + " รายชื่อ)", "success");
}

// ================= 15. จัดการสตาฟ (Admin) =================
function getSelectedRole() {
  const el = document.querySelector('input[name="staffRole"]:checked');
  return el ? el.value : "registration";
}

function setSelectedRole(role) {
  const el = document.querySelector('input[name="staffRole"][value="' + normalizeRole(role) + '"]');
  if (el) el.checked = true;
}

function updateStaffPreview() {
  const fName = valOr($("staffFullName").value, "ชื่อ-นามสกุล");
  const inst = valOr($("staffInstitution").value, "สถาบัน");
  const yr = valOr($("staffYearLevel").value, "ชั้นปี");
  $("staffDisplayPreview").textContent = fName + " " + inst + "#" + yr;
}

async function loadStaffList() {
  if (!isAdmin() || !supabaseClient) return;
  const { data, error } = await supabaseClient.from("staff_users").select("*").order("id", { ascending: true });
  if (error || !data) {
    if (error) showToast("โหลดรายชื่อสตาฟไม่สำเร็จ: " + error.message, "error");
    return;
  }
  const cleanData = (data || []).filter((u) => u.username !== "__smst_settings__" && u.role !== "system");
  staffUsersCache = cleanData;
  const roleCount = { admin: 0, registration: 0, marketing: 0 };
  cleanData.forEach((u) => {
    const r = normalizeRole(u.role);
    roleCount[r] = (roleCount[r] || 0) + 1;
  });
  $("staffCount").textContent =
    "ทั้งหมด " + cleanData.length + " บัญชี · ทะเบียน " + roleCount.registration + " · Marketing " + roleCount.marketing + " · Admin " + roleCount.admin;

  $("staffListContainer").innerHTML = cleanData
    .map((u) => {
      const isMe = currentUser && String(currentUser.id) === String(u.id);
      return (
        '<div class="staff-item' + (isMe ? " is-me" : "") + '">' +
          '<div class="staff-item-head">' +
            '<span class="avatar">' + esc(initialOf(u.full_name || u.display_name || u.username)) + "</span>" +
            '<div style="min-width:0">' +
              '<p class="staff-item-name">' + esc(valOr(u.display_name, "-")) + (isMe ? ' <span class="chip chip-solid-gold">คุณ</span>' : "") + "</p>" +
              roleChip(u.role) +
            "</div>" +
          "</div>" +
          '<div class="cred">' +
            "<span>User: <b>" + esc(valOr(u.username, "-")) + "</b></span>" +
            "<span>Pass: <b data-pass-for=\"" + esc(u.id) + '">••••••</b> ' +
              '<button type="button" data-action="reveal-pass" data-id="' + esc(u.id) + '" aria-label="แสดงรหัสผ่าน">' + icon("eye") + "แสดง</button>" +
            "</span>" +
          "</div>" +
          '<div class="staff-item-actions">' +
            '<button type="button" class="btn btn-secondary btn-sm" data-action="edit-staff" data-id="' + esc(u.id) + '">' + icon("pencil") + "แก้ไข</button>" +
            '<button type="button" class="btn btn-danger-soft btn-sm" data-action="delete-staff" data-id="' + esc(u.id) + '" aria-label="ลบบัญชี ' + esc(valOr(u.username, "")) + '"' + (isMe ? " disabled" : "") + ">" + icon("trash") + "</button>" +
          "</div>" +
        "</div>"
      );
    })
    .join("");
}

function revealStaffPassword(btn) {
  const userObj = staffUsersCache.find((u) => String(u.id) === String(btn.dataset.id));
  const target = document.querySelector('[data-pass-for="' + btn.dataset.id + '"]');
  if (!userObj || !target) return;
  const showing = btn.dataset.shown === "1";
  target.textContent = showing ? "••••••" : valOr(userObj.password, "-");
  btn.dataset.shown = showing ? "0" : "1";
  btn.innerHTML = icon(showing ? "eye" : "eye-off") + (showing ? "แสดง" : "ซ่อน");
}

function editStaffById(id) {
  const userObj = staffUsersCache.find((u) => u.id === id);
  if (!userObj) return;

  $("staffEditId").value = userObj.id;
  $("staffFullName").value = valOr(userObj.full_name, "");
  $("staffInstitution").value = valOr(userObj.institution, "");
  $("staffYearLevel").value = valOr(userObj.year_level, "");
  $("staffUsername").value = valOr(userObj.username, "");
  $("staffPassword").value = valOr(userObj.password, "");
  setSelectedRole(userObj.role);

  updateStaffPreview();
  $("staffFormTitle").querySelector("span").textContent = "แก้ไข: " + valOr(userObj.display_name, "");
  $("saveStaffBtn").querySelector("span").textContent = "บันทึกการแก้ไข";
  $("cancelEditStaffBtn").hidden = false;
  $("staffForm").scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => $("staffFullName").focus({ preventScroll: true }), 300);
}

function resetStaffForm() {
  $("staffEditId").value = "";
  ["staffFullName", "staffInstitution", "staffYearLevel", "staffUsername", "staffPassword"].forEach((id) => {
    $(id).value = "";
  });
  setSelectedRole("registration");
  updateStaffPreview();
  $("staffFormTitle").querySelector("span").textContent = "เพิ่มสตาฟใหม่";
  $("saveStaffBtn").querySelector("span").textContent = "บันทึกข้อมูลสตาฟ";
  $("cancelEditStaffBtn").hidden = true;
}

async function handleSaveStaff(e) {
  e.preventDefault();
  const editId = $("staffEditId").value;
  const fullName = $("staffFullName").value.trim();
  const institution = $("staffInstitution").value.trim();
  const yearLevel = $("staffYearLevel").value.trim();
  const username = $("staffUsername").value.trim();
  const password = $("staffPassword").value.trim();
  const role = getSelectedRole();

  if (!fullName || !institution || !yearLevel || !username || !password) {
    showToast("กรุณากรอกข้อมูลสตาฟให้ครบทุกช่อง", "warning");
    return;
  }

  const displayName = fullName + " " + institution + "#" + yearLevel;
  const payload = {
    username: username,
    password: password,
    full_name: fullName,
    institution: institution,
    year_level: yearLevel,
    display_name: displayName,
    role: role,
  };

  const btn = $("saveStaffBtn");
  btn.disabled = true;
  let error = null;
  if (editId) {
    const res = await supabaseClient.from("staff_users").update(payload).eq("id", editId);
    error = res.error;
  } else {
    const res = await supabaseClient.from("staff_users").insert([payload]);
    error = res.error;
  }
  btn.disabled = false;

  if (error) {
    showToast("ไม่สามารถบันทึกได้ (Username อาจซ้ำ): " + error.message, "error", { duration: 5000 });
    return;
  }

  const isSelfEdit = currentUser
    ? String(currentUser.id) === String(editId) || currentUser.username.toLowerCase() === username.toLowerCase()
    : false;

  if (isSelfEdit) {
    const { data: updatedMe } = await supabaseClient.from("staff_users").select("*").ilike("username", escapeLike(username)).maybeSingle();
    if (updatedMe) {
      setCurrentUser(updatedMe);
      applyRoleUI();
      if (!isAdmin()) switchTab("scan");
    }
  }

  resetStaffForm();
  loadStaffList();
  showToast('บันทึกข้อมูล "' + displayName + '" เรียบร้อยแล้ว', "success");
}

async function deleteStaffById(id) {
  const userObj = staffUsersCache.find((u) => u.id === id);
  if (!userObj) return;

  if (currentUser && String(currentUser.id) === String(userObj.id)) {
    showToast("ไม่สามารถลบบัญชีที่ตัวเองกำลังล็อกอินใช้งานอยู่ได้", "error");
    return;
  }
  const ok = await confirmDialog({
    title: "ลบบัญชีสตาฟ?",
    message: 'ยืนยันการลบบัญชี "' + userObj.username + '" (' + valOr(userObj.display_name, "-") + ") — ประวัติเช็กอินเดิมจะยังอยู่",
    confirmText: "ลบบัญชี",
    tone: "danger",
    icon: "trash",
  });
  if (!ok) return;

  const { error } = await supabaseClient.from("staff_users").delete().eq("id", id);
  if (error) showToast("เกิดข้อผิดพลาด: " + error.message, "error");
  else {
    showToast("ลบบัญชี " + userObj.username + " แล้ว", "success");
    loadStaffList();
  }
}

// ================= 15.1 CHANGE PASSWORD (Staff & Admin เปลี่ยนรหัสผ่านของตนเอง) =================
function openChangePasswordModal() {
  if (!currentUser) {
    showToast("กรุณาเข้าสู่ระบบก่อน", "warning");
    return;
  }
  closeUserMenu();

  if (!navigator.onLine || !supabaseClient) {
    showToast("ไม่สามารถเปลี่ยนรหัสผ่านขณะออฟไลน์ได้ กรุณาเชื่อมต่ออินเทอร์เน็ต", "warning");
    return;
  }

  const username = currentUser.username || "-";
  const displayName = valOr(currentUser.display_name, username);

  const modalHtml =
    '<div class="modal-icon tone-gold">' +
    icon("key") +
    "</div>" +
    '<h2 class="modal-title">เปลี่ยนรหัสผ่าน</h2>' +
    '<p class="modal-text">สำหรับบัญชี <b class="mono">' +
    esc(username) +
    "</b> (" +
    esc(displayName) +
    ")</p>" +
    '<form class="modal-form" id="changePasswordModalForm" novalidate style="display: grid; gap: 14px; margin-top: 16px;">' +
    '  <div class="field">' +
    '    <label for="changePassCurrent">รหัสผ่านปัจจุบัน</label>' +
    '    <div class="input-wrap">' +
    icon("lock") +
    '      <input class="input with-action mono" id="changePassCurrent" type="password" autocomplete="current-password" placeholder="กรอกรหัสผ่านปัจจุบัน" required />' +
    '      <button type="button" class="icon-btn icon-btn-sm input-action" data-action="toggle-password" aria-label="แสดงรหัสผ่าน" aria-pressed="false">' +
    icon("eye") +
    "      </button>" +
    "    </div>" +
    "  </div>" +
    '  <div class="field">' +
    '    <label for="changePassNew">รหัสผ่านใหม่</label>' +
    '    <div class="input-wrap">' +
    icon("key") +
    '      <input class="input with-action mono" id="changePassNew" type="password" autocomplete="new-password" placeholder="ตั้งรหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร)" required />' +
    '      <button type="button" class="icon-btn icon-btn-sm input-action" data-action="toggle-password" aria-label="แสดงรหัสผ่าน" aria-pressed="false">' +
    icon("eye") +
    "      </button>" +
    "    </div>" +
    "  </div>" +
    '  <div class="field">' +
    '    <label for="changePassConfirm">ยืนยันรหัสผ่านใหม่</label>' +
    '    <div class="input-wrap">' +
    icon("check") +
    '      <input class="input with-action mono" id="changePassConfirm" type="password" autocomplete="new-password" placeholder="กรอกรหัสผ่านใหม่อีกครั้ง" required />' +
    '      <button type="button" class="icon-btn icon-btn-sm input-action" data-action="toggle-password" aria-label="แสดงรหัสผ่าน" aria-pressed="false">' +
    icon("eye") +
    "      </button>" +
    "    </div>" +
    "  </div>" +
    '  <p class="form-error" id="changePassModalError" role="alert" hidden></p>' +
    '  <div class="modal-actions" style="margin-top: 8px;">' +
    '    <button type="button" class="btn btn-secondary" data-modal-close="cancel">ยกเลิก</button>' +
    '    <button type="submit" class="btn btn-primary" id="changePassSubmitBtn">' +
    icon("check") +
    "      <span>บันทึกรหัสผ่านใหม่</span>" +
    "    </button>" +
    "  </div>" +
    "</form>";
  const handle = openModal(modalHtml, {
    className: "modal-change-password",
    label: "เปลี่ยนรหัสผ่าน",
  });

  const form = handle.el.querySelector("#changePasswordModalForm");
  const errEl = handle.el.querySelector("#changePassModalError");
  const submitBtn = handle.el.querySelector("#changePassSubmitBtn");
  const curPassInput = handle.el.querySelector("#changePassCurrent");
  const newPassInput = handle.el.querySelector("#changePassNew");
  const confirmPassInput = handle.el.querySelector("#changePassConfirm");

  function showError(msg) {
    errEl.innerHTML = icon("alert") + "<span>" + esc(msg) + "</span>";
    errEl.hidden = false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.hidden = true;

    const curPass = curPassInput.value.trim();
    const newPass = newPassInput.value.trim();
    const confirmPass = confirmPassInput.value.trim();

    if (!curPass) {
      showError("กรุณากรอกรหัสผ่านปัจจุบัน");
      curPassInput.focus();
      return;
    }
    if (!newPass) {
      showError("กรุณากรอกรหัสผ่านใหม่");
      newPassInput.focus();
      return;
    }
    if (newPass.length < 4) {
      showError("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร");
      newPassInput.focus();
      return;
    }
    if (newPass !== confirmPass) {
      showError("รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน");
      confirmPassInput.focus();
      return;
    }
    if (curPass === newPass) {
      showError("รหัสผ่านใหม่ต้องไม่เหมือนกับรหัสผ่านเดิม");
      newPassInput.focus();
      return;
    }

    if (!navigator.onLine || !supabaseClient) {
      showError("เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่");
      return;
    }

    submitBtn.disabled = true;
    const originalBtnText = submitBtn.querySelector("span").textContent;
    submitBtn.querySelector("span").textContent = "กำลังตรวจสอบ...";

    try {
      let query = supabaseClient.from("staff_users").select("id, password, username");
      if (currentUser.id) {
        query = query.eq("id", currentUser.id);
      } else {
        query = query.ilike("username", escapeLike(currentUser.username));
      }
      const { data: userRow, error: fetchErr } = await query.maybeSingle();

      if (fetchErr) {
        submitBtn.disabled = false;
        submitBtn.querySelector("span").textContent = originalBtnText;
        showError("เกิดข้อผิดพลาดในการตรวจสอบข้อมูล: " + fetchErr.message);
        return;
      }
      if (!userRow) {
        submitBtn.disabled = false;
        submitBtn.querySelector("span").textContent = originalBtnText;
        showError("ไม่พบข้อมูลบัญชีนี้ในระบบ");
        return;
      }
      if (userRow.password !== curPass) {
        submitBtn.disabled = false;
        submitBtn.querySelector("span").textContent = originalBtnText;
        showError("รหัสผ่านปัจจุบันไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง");
        curPassInput.value = "";
        curPassInput.focus();
        return;
      }

      submitBtn.querySelector("span").textContent = "กำลังบันทึก...";

      let updateQuery = supabaseClient.from("staff_users").update({ password: newPass });
      if (userRow.id) {
        updateQuery = updateQuery.eq("id", userRow.id);
      } else {
        updateQuery = updateQuery.ilike("username", escapeLike(userRow.username));
      }
      const { error: updateErr } = await updateQuery;

      if (updateErr) {
        submitBtn.disabled = false;
        submitBtn.querySelector("span").textContent = originalBtnText;
        showError("บันทึกรหัสผ่านใหม่ไม่สำเร็จ: " + updateErr.message);
        return;
      }

      if (!currentUser.id && userRow.id) {
        currentUser.id = userRow.id;
        writePref("smst_current_user", JSON.stringify(currentUser));
      }

      const cached = staffUsersCache.find(
        (u) => (userRow.id && String(u.id) === String(userRow.id)) || (u.username && u.username.toLowerCase() === userRow.username.toLowerCase())
      );
      if (cached) {
        cached.password = newPass;
        const passTarget = document.querySelector('[data-pass-for="' + cached.id + '"]');
        if (passTarget && passTarget.textContent !== "••••••") {
          passTarget.textContent = newPass;
        }
      }

      handle.close("saved");
      feedback("success");
      showToast('เปลี่ยนรหัสผ่านสำหรับ "' + (currentUser.display_name || currentUser.username) + '" เรียบร้อยแล้ว', "success", {
        duration: 4500,
      });
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.querySelector("span").textContent = originalBtnText;
      showError("เกิดข้อผิดพลาด: " + (err && err.message ? err.message : String(err)));
    }
  });
}

// ================= 16. RESET ENGINE (Admin) =================
async function resetAllCheckIns() {
  if (!isAdmin()) {
    showToast("เฉพาะ Admin เท่านั้นที่สามารถรีเซ็ตระบบได้", "error");
    return;
  }
  const ok = await confirmDialog({
    title: "รีเซ็ตการเช็กอินของทุกคน?",
    message: "สถานะ \"เช็กอินเข้างาน\" ของทุกคนจะกลับเป็นยังไม่เข้างาน (รายชื่อและ Voucher ไม่หาย)",
    confirmText: "รีเซ็ตเช็กอิน",
    tone: "danger",
    requireText: "RESET",
  });
  if (!ok) return;

  const { error } = await supabaseClient
    .from("attendees")
    .update({ is_checked_in: false, checked_in_at: null, checked_in_by: null })
    .gte("id", 0);

  if (error) {
    showToast("เกิดข้อผิดพลาดในการรีเซ็ต: " + error.message, "error");
  } else {
    showToast("รีเซ็ตสถานะการเช็กอินทั้งหมดเรียบร้อยแล้ว", "success");
    await refreshData();
  }
}

async function resetAllDiscounts() {
  if (!isAdmin()) {
    showToast("เฉพาะ Admin เท่านั้นที่สามารถรีเซ็ต Voucher ได้", "error");
    return;
  }
  const ok = await confirmDialog({
    title: "รีเซ็ต Voucher ของทุกคน?",
    message: "สถานะการใช้ Voucher ส่วนลดซื้อของหน้างานของทุกคนจะกลับเป็นยังไม่ได้ใช้",
    confirmText: "รีเซ็ต Voucher",
    tone: "danger",
    requireText: "RESET",
  });
  if (!ok) return;

  const { error } = await supabaseClient
    .from("attendees")
    .update({ marketing_discount_used: false, marketing_discount_used_at: null, marketing_discount_used_by: null })
    .gte("id", 0);

  if (error) {
    showToast("เกิดข้อผิดพลาดในการรีเซ็ต Voucher: " + error.message, "error");
  } else {
    showToast("รีเซ็ต Voucher ทั้งหมดเรียบร้อยแล้ว", "success");
    await refreshData();
  }
}

// ================= 17. CSV IMPORT ENGINE (แก้ประเภทนักเรียน/ผู้ปกครอง + คอลัมน์ขยับ) =================
function updateDropzoneFile() {
  const fileInput = $("csvFileInput");
  const label = $("dropzoneFile");
  if (fileInput.files.length) {
    label.textContent = fileInput.files[0].name;
    label.hidden = false;
  } else {
    label.hidden = true;
  }
}

function setImportStatus(tone, message) {
  $("importStatus").innerHTML = message
    ? '<div class="banner tone-' + tone + '">' + icon(tone === "rose" ? "x-circle" : tone === "teal" ? "check-circle" : "info") +
        '<div><p class="banner-title">' + esc(message) + "</p></div></div>"
    : "";
}

function cleanCsvVal(val) {
  if (val === undefined || val === null) return "";
  const s = String(val).trim();
  if (s === "'-" || s === "-" || s === "nan" || s === "NaN") return "";
  return s;
}

function importCSVFile() {
  const fileInput = $("csvFileInput");
  if (!fileInput.files.length) {
    showToast("กรุณาเลือกไฟล์ .csv ก่อน", "warning");
    return;
  }
  if (typeof Papa === "undefined") {
    showToast("โหลดตัวอ่านไฟล์ CSV ไม่สำเร็จ", "error");
    return;
  }

  const importBtn = $("importBtn");
  importBtn.disabled = true;
  setImportStatus("sky", "กำลังอ่านไฟล์ CSV ตรวจสอบคอลัมน์ และจัดเรียงตามเวลาจอง...");

  Papa.parse(fileInput.files[0], {
    header: true,
    skipEmptyLines: true,
    error: function (err) {
      importBtn.disabled = false;
      setImportStatus("rose", "อ่านไฟล์ไม่สำเร็จ: " + err.message);
    },
    complete: async function (results) {
      let shiftedCount = 0;
      const fields = results.meta && results.meta.fields ? results.meta.fields : [];
      const hasLineColumn = fields.includes("ID Line");
      const hasCategoryColumn = fields.includes("ประเภท");

      const rawRows = results.data
        .map((r) => {
          const bCode = cleanCsvVal(r["รหัสการจอง"]);
          if (!bCode) return null;

          const pOrder = valOr(cleanCsvVal(r["คนที่"]), "1/1");
          const rawCategory = hasCategoryColumn ? cleanCsvVal(r["ประเภท"]) : "";
          const tCode = cleanCsvVal(r["รหัสบัตรเข้างาน"]);
          let fName = cleanCsvVal(r["ชื่อ-นามสกุล (ภาษาไทย)"]);
          const school = valOr(cleanCsvVal(r["โรงเรียน/มหาวิทยาลัย"]), "-");
          const phone = valOr(cleanCsvVal(r["เบอร์โทรศัพท์"]), "-");

          const rawG = hasLineColumn ? cleanCsvVal(r["ID Line"]) : "";
          const rawH = cleanCsvVal(r["เบอร์โทรฉุกเฉิน"]);
          const rawI = cleanCsvVal(r["เกี่ยวข้องกับผู้สมัครเป็น"]);
          const rawJ = cleanCsvVal(r["มหาวิทยาลัยที่อยากศึกษาต่อ"]);
          const rawK = cleanCsvVal(r["รู้จักโครงการผ่านช่องทางไหน"]);

          let isShifted = false;
          const hasAnyMiddle = rawG !== "" || rawH !== "" || rawI !== "" || rawJ !== "";
          const isChannelLike = (val) => {
            const s = String(val || "").toLowerCase();
            return s.includes("fb") || s.includes("facebook") || s.includes("ig") || s.includes("instagram") ||
                   s.includes("tiktok") || s.includes("ติ๊กต๊อก") || s.includes("เพื่อน") || s.includes("โรงเรียน") ||
                   s.includes("เฟส") || s.includes("ไอจี") || s.includes("openhouse");
          };
          if (rawK === "" && (isChannelLike(rawJ) || (!hasCategoryColumn && hasLineColumn && hasAnyMiddle))) {
            isShifted = true;
            shiftedCount++;
          }

          const lineId = isShifted ? "-" : valOr(rawG, "-");
          const emPhone = isShifted ? valOr(rawG, "-") : valOr(rawH, "-");
          const emRel = isShifted ? valOr(rawH, "-") : valOr(rawI, "-");
          const targetUni = isShifted ? valOr(rawI, "-") : valOr(rawJ, "-");
          const channel = isShifted ? valOr(rawJ, "-") : valOr(rawK, "-");

          const rawTicketType = valOr(cleanCsvVal(r["ชุดบัตร"]), "-");
          const tType = normalizeTicketTypeText(rawTicketType);

          // กฎการแยกประเภท นักเรียน vs ผู้ปกครอง
          let categoryLabel = "นักเรียน";
          if (tType.toLowerCase().includes("early bird")) {
            categoryLabel = "นักเรียน";
          } else if (rawCategory && rawCategory.includes("ผู้ปกครอง")) {
            categoryLabel = "ผู้ปกครอง";
          } else if (tType.includes("ผู้ปกครอง") && parsePersonOrderNum(pOrder) > 1) {
            categoryLabel = "ผู้ปกครอง";
          }

          const parsedAmt = parseFloat(r["ยอดที่ต้องจ่าย"]);
          const amount = isNaN(parsedAmt) ? 0 : parsedAmt;

          const discountCode = cleanCsvVal(r["โค้ดส่วนลด"]);
          const parsedDiscAmt = parseFloat(r["ส่วนลด"]);
          const discountAmount = isNaN(parsedDiscAmt) ? 0 : parsedDiscAmt;

          const cName = valOr(cleanCsvVal(r["ผู้ติดต่อ"]), "-");
          let cPhone = valOr(cleanCsvVal(r["เบอร์ผู้ติดต่อ"]), "-");
          if (cPhone !== "-" && !cPhone.startsWith("0") && cPhone.length === 9 && !isNaN(Number(cPhone))) {
            cPhone = "0" + cPhone;
          }
          const email = valOr(cleanCsvVal(r["อีเมลบัญชี"]), "-");
          const bStatus = valOr(cleanCsvVal(r["สถานะ"]), "-");
          const pStatus = valOr(cleanCsvVal(r["สถานะการชำระเงิน"]), "-");
          const bDate = valOr(cleanCsvVal(r["วันที่จอง"]), "-");
          const bDateIso = parseThaiDateToISO(bDate);

          if (!fName) {
            fName = cName !== "-" ? cName + " (ไม่ระบุชื่อผู้สมัคร)" : "-";
          }

          return {
            booking_code: bCode,
            person_order: pOrder,
            ticket_type_category: categoryLabel,
            ticket_code: tCode,
            full_name: fName,
            school: school,
            phone: phone,
            line_id: lineId,
            emergency_phone: emPhone,
            emergency_relation: emRel,
            target_uni: targetUni,
            channel: channel,
            ticket_type: tType,
            amount: amount,
            discount_code: discountCode,
            discount_amount: discountAmount,
            contact_name: cName,
            contact_phone: cPhone,
            email: email,
            booking_status: bStatus,
            payment_status: pStatus,
            booking_date: bDate,
            booking_date_iso: bDateIso,
            qr_code: tCode !== "" ? tCode : bCode,
          };
        })
        .filter(Boolean);

      if (!rawRows.length) {
        importBtn.disabled = false;
        setImportStatus("rose", 'ไม่พบข้อมูลในไฟล์ — ตรวจสอบว่ามีคอลัมน์ "รหัสการจอง"');
        return;
      }

      const sortedPayload = sortAttendeeRows(rawRows, true);
      const { error } = await supabaseClient.from("attendees").upsert(sortedPayload, { onConflict: "booking_code,person_order" });
      importBtn.disabled = false;

      if (error) {
        setImportStatus("rose", "เกิดข้อผิดพลาด: " + error.message);
      } else {
        setImportStatus(
          "teal",
          "อัปเดตสำเร็จ " + sortedPayload.length + " รายชื่อ! " +
            (shiftedCount > 0 ? "(ดึงช่องขยับกลับเข้าที่ " + shiftedCount + " รายชื่อ)" : "(รูปแบบคอลัมน์ครบถ้วน)")
        );
        refreshData();
      }
    },
  });
}

// ================= 18. RECENT ACTIVITY (เฉพาะเครื่องนี้) =================
let recentActions = (() => {
  try {
    return JSON.parse(sessionStorage.getItem("smst_recent_actions") || "[]");
  } catch (e) {
    return [];
  }
})();

function saveRecent() {
  try {
    sessionStorage.setItem("smst_recent_actions", JSON.stringify(recentActions));
  } catch (e) {}
  renderRecent();
}

function pushRecent(item) {
  recentActions.unshift(Object.assign({ time: shortClock(thaiTimeNow()) }, item));
  recentActions = recentActions.slice(0, 6);
  saveRecent();
}

// บันทึกไม่สำเร็จ → เอารายการล่าสุดที่เพิ่งใส่ออก
function dropRecent(type, id) {
  const idx = recentActions.findIndex((a) => a.type === type && a.id === id);
  if (idx !== -1) {
    recentActions.splice(idx, 1);
    saveRecent();
  }
}

function renderRecent() {
  const el = $("recentList");
  if (!recentActions.length) {
    el.innerHTML = '<li class="recent-empty">ยังไม่มีรายการ — ผลการเช็กอิน / Voucher จากเครื่องนี้จะแสดงที่นี่</li>';
    return;
  }
  el.innerHTML = recentActions
    .map((a) => {
      const meta = RECENT_META[a.type] || RECENT_META.checkin;
      return (
        '<li><button type="button" class="recent-item" data-action="pick" data-code="' + esc(a.code) + '" data-id="' + esc(a.id) + '">' +
          '<span class="icon-tile tone-' + meta.tone + '">' + icon(meta.icon) + "</span>" +
          '<span class="recent-item-main"><span class="recent-item-name">' + esc(a.name) + "</span>" +
          '<span class="recent-item-sub">' + esc(meta.label) + " · " + esc(a.time) + "</span></span>" +
          icon("chevron-right") +
        "</button></li>"
      );
    })
    .join("");
}

// ================= 19. WALK-IN TICKET SALES ENGINE =================
let extraWalkInMembers = [];

function getSampleAttendees() {
  return [
    {
      id: 1001,
      booking_code: "EB-0010",
      person_order: "1/1",
      ticket_type_category: "นักเรียน",
      ticket_code: "SMST-EB-0010-1",
      qr_code: "SMST-EB-0010-1",
      full_name: "กิตติพงษ์ วิริยะสกุล",
      school: "โรงเรียนเตรียมอุดมศึกษา",
      phone: "0812345678",
      contact_name: "กิตติพงษ์ วิริยะสกุล",
      contact_phone: "0812345678",
      ticket_type: "รอบ Early Bird",
      amount: 250,
      payment_method: "promptpay",
      booking_status: "อนุมัติแล้ว",
      payment_status: "ยืนยันแล้ว",
      booking_date: "10/11/2026 09:00:00",
      booking_date_iso: "2026-11-10 09:00:00",
      is_checked_in: true,
      checked_in_at: "07:15 น.",
      checked_in_by: "ทะเบียน BM#2",
      marketing_discount_used: false,
    },
    {
      id: 1002,
      booking_code: "GEN-0120",
      person_order: "1/1",
      ticket_type_category: "นักเรียน",
      ticket_code: "SMST-MO-0120-1",
      qr_code: "SMST-MO-0120-1",
      full_name: "ณิชารีย์ เกียรติวรวงศ์",
      school: "โรงเรียนสวนกุหลาบวิทยาลัย",
      phone: "0898765432",
      contact_name: "ณิชารีย์ เกียรติวรวงศ์",
      contact_phone: "0898765432",
      ticket_type: "รอบทั่วไป · เช้า",
      amount: 250,
      payment_method: "promptpay",
      booking_status: "อนุมัติแล้ว",
      payment_status: "ยืนยันแล้ว",
      booking_date: "11/11/2026 10:30:00",
      booking_date_iso: "2026-11-11 10:30:00",
      is_checked_in: false,
      checked_in_at: null,
      checked_in_by: null,
      marketing_discount_used: false,
    },
    {
      id: 1003,
      booking_code: "GEN-0245",
      person_order: "1/2",
      ticket_type_category: "นักเรียน",
      ticket_code: "SMST-AF-0245-1",
      qr_code: "SMST-AF-0245-1",
      full_name: "ธนภัทร สิริพาณิชย์",
      school: "โรงเรียนมหิดลวิทยานุสรณ์",
      phone: "0823456789",
      contact_name: "สมศรี สิริพาณิชย์",
      contact_phone: "0823456789",
      ticket_type: "รอบทั่วไป · บ่าย",
      amount: 250,
      payment_method: "promptpay",
      booking_status: "อนุมัติแล้ว",
      payment_status: "ยืนยันแล้ว",
      booking_date: "12/11/2026 14:15:00",
      booking_date_iso: "2026-11-12 14:15:00",
      is_checked_in: false,
      checked_in_at: null,
      checked_in_by: null,
      marketing_discount_used: false,
    },
    {
      id: 1004,
      booking_code: "GEN-0245",
      person_order: "2/2",
      ticket_type_category: "ผู้ปกครอง",
      ticket_code: "SMST-AF-0245-2",
      qr_code: "SMST-AF-0245-2",
      full_name: "สมศรี สิริพาณิชย์",
      school: "-",
      phone: "0823456789",
      contact_name: "สมศรี สิริพาณิชย์",
      contact_phone: "0823456789",
      ticket_type: "รอบทั่วไป · บ่าย",
      amount: 250,
      payment_method: "promptpay",
      booking_status: "อนุมัติแล้ว",
      payment_status: "ยืนยันแล้ว",
      booking_date: "12/11/2026 14:15:00",
      booking_date_iso: "2026-11-12 14:15:00",
      is_checked_in: false,
      checked_in_at: null,
      checked_in_by: null,
      marketing_discount_used: false,
    },
    {
      id: 1005,
      booking_code: "WI-26001",
      person_order: "1/1",
      ticket_type_category: "นักเรียน",
      ticket_code: "SMST-WI-26001-1",
      qr_code: "SMST-WI-26001-1",
      full_name: "ปวริศา รุ่งเรืองพัฒนา",
      school: "โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี)",
      phone: "0845678901",
      contact_name: "ปวริศา รุ่งเรืองพัฒนา",
      contact_phone: "0845678901",
      ticket_type: "รอบ Walk-in · เช้า",
      amount: 250,
      payment_method: "cash",
      booking_status: "อนุมัติแล้ว",
      payment_status: "ยืนยันแล้ว",
      booking_date: "15/11/2026 08:00:00",
      booking_date_iso: "2026-11-15 08:00:00",
      is_checked_in: true,
      checked_in_at: "08:05 น.",
      checked_in_by: "Admin Local",
      marketing_discount_used: false,
    },
  ];
}

async function initSchoolDataList() {
  const datalist = document.getElementById("schoolList");
  if (!datalist) return;
  try {
    let rawSchools = [];
    try {
      const res = await fetch("assets/data/schools.json?v=" + Date.now());
      if (res.ok) rawSchools = await res.json();
    } catch (e) {}

    // ใช้เฉพาะรายชื่อจาก schools.json เท่านั้น ไม่ดึงจาก cache ผู้สมัคร
    const schools = buildUniqueSchoolList(rawSchools);
    datalist.innerHTML = schools.map((s) => '<option value="' + esc(s) + '"></option>').join("");
  } catch (err) {}
}

let activeWiFilter = "all"; // "all" | "pending" | "approved"
let activeWiMode = "queue";   // "queue" | "manual"
let currentLoadedQueueGroup = [];
let currentQueueSlipData = null;
let currentManualSlipData = null;

function setupSlipUpload(opts) {
  const btn = $(opts.btnId);
  const fileInp = $(opts.fileInputId);
  const previewBox = $(opts.previewBoxId);
  const thumb = $(opts.thumbId);
  const fileName = $(opts.fileNameId);
  const changeBtn = $(opts.changeBtnId);
  const removeBtn = $(opts.removeBtnId);
  const onDataCallback = opts.onData;

  function openFilePicker() {
    if (fileInp) {
      fileInp.value = "";
      fileInp.click();
    }
  }

  if (btn) btn.addEventListener("click", openFilePicker);
  if (changeBtn) changeBtn.addEventListener("click", openFilePicker);

  if (fileInp) {
    fileInp.addEventListener("change", () => {
      const file = fileInp.files && fileInp.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        showToast("กรุณาเลือกไฟล์รูปภาพเท่านั้น", "warning");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showToast("ไฟล์รูปภาพมีขนาดใหญ่เกิน 10MB", "warning");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result;
        if (typeof onDataCallback === "function") onDataCallback(base64);
        if (thumb) thumb.src = base64;
        if (fileName) fileName.textContent = file.name;
        if (previewBox) previewBox.style.display = "block";
        if (btn) btn.style.display = "none";
        showToast("แนบรูปสลิปเรียบร้อยแล้ว (สามารถกดปุ่ม 'เปลี่ยนรูป' เพื่อเลือกรูปใหม่ได้ตลอดเวลา)", "success");
      };
      reader.readAsDataURL(file);
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      if (typeof onDataCallback === "function") onDataCallback(null);
      if (fileInp) fileInp.value = "";
      if (thumb) thumb.src = "";
      if (fileName) fileName.textContent = "";
      if (previewBox) previewBox.style.display = "none";
      if (btn) btn.style.display = "block";
      showToast("ลบรูปสลิปแล้ว", "info");
    });
  }

  if (thumb) {
    thumb.addEventListener("click", () => {
      if (thumb.src) {
        showSlipImageModal(thumb.src, "สลิปที่แนบ");
      }
    });
  }
}

function setupWalkInUI() {
  // Mode switcher (Queue Lookup vs Manual)
  const tabQueueBtn = $("wiTabQueueBtn");
  const tabManualBtn = $("wiTabManualBtn");
  const queuePanel = $("wiQueuePanel");
  const manualPanel = $("wiManualPanel");

  if (tabQueueBtn && tabManualBtn) {
    tabQueueBtn.addEventListener("click", () => {
      activeWiMode = "queue";
      tabQueueBtn.classList.add("is-active");
      tabManualBtn.classList.remove("is-active");
      if (queuePanel) queuePanel.style.display = "block";
      if (manualPanel) manualPanel.style.display = "none";
      renderPendingQueueChips();
    });

    tabManualBtn.addEventListener("click", () => {
      activeWiMode = "manual";
      tabManualBtn.classList.add("is-active");
      tabQueueBtn.classList.remove("is-active");
      if (queuePanel) queuePanel.style.display = "none";
      if (manualPanel) manualPanel.style.display = "block";
      updateManualWalkInTotal();
    });
  }

  // KPI Pending Card shortcut to filter pending feed
  const kpiPendingCard = $("wiKpiPendingCard");
  if (kpiPendingCard) {
    kpiPendingCard.addEventListener("click", () => {
      setFeedFilter("pending");
    });
  }

  // --- Queue Lookup Handlers ---
  const queueSearchInp = $("wiQueueSearchInput");
  const queueSearchBtn = $("wiQueueSearchBtn");
  if (queueSearchBtn && queueSearchInp) {
    const doQueueSearch = () => {
      const val = queueSearchInp.value.trim();
      if (!val) {
        showToast("กรุณากรอกรหัสคิว เช่น W-001 หรือเบอร์โทรศัพท์", "warning");
        return;
      }
      loadQueueCandidate(val);
    };
    queueSearchBtn.addEventListener("click", doQueueSearch);
    queueSearchInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doQueueSearch();
    });
  }

  // Queue Payment Method Radios
  document.querySelectorAll('input[name="wiQPayMethod"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const isQr = e.target.value === "qr_payment";
      const qrBox = $("wiQQrBox");
      const cashBox = $("wiQCashBox");
      if (qrBox) qrBox.style.display = isQr ? "block" : "none";
      if (cashBox) cashBox.style.display = isQr ? "none" : "block";
      updateQueueApproveBtnState();
    });
  });

  // Queue Cash Quick buttons & Input
  const qCashRec = $("wiQCashRec");
  if (qCashRec) qCashRec.addEventListener("input", updateQueueCashChange);
  const qQuickExact = $("wiQQuickExact");
  if (qQuickExact) qQuickExact.addEventListener("click", () => {
    const total = getLoadedQueueTotal();
    if (qCashRec) qCashRec.value = total;
    updateQueueCashChange();
  });
  const qQuick500 = $("wiQQuick500");
  if (qQuick500) qQuick500.addEventListener("click", () => {
    if (qCashRec) qCashRec.value = 500;
    updateQueueCashChange();
  });
  const qQuick1000 = $("wiQQuick1000");
  if (qQuick1000) qQuick1000.addEventListener("click", () => {
    if (qCashRec) qCashRec.value = 1000;
    updateQueueCashChange();
  });

  // Queue Checkboxes Guard
  const qQrCheck = $("wiQQrConfirmed");
  if (qQrCheck) qQrCheck.addEventListener("change", updateQueueApproveBtnState);
  const qCashCheck = $("wiQCashConfirmed");
  if (qCashCheck) qCashCheck.addEventListener("change", updateQueueApproveBtnState);

  // Queue Approve Button
  const qApproveBtn = $("wiQApproveBtn");
  if (qApproveBtn) qApproveBtn.addEventListener("click", handleQueueApprove);

  // Queue Delete Candidate Button
  const qDeleteBtn = $("wiQDeleteCandidateBtn");
  if (qDeleteBtn) {
    qDeleteBtn.addEventListener("click", async () => {
      if (!currentLoadedQueueGroup.length) return;
      const main = currentLoadedQueueGroup[0];
      const code = main.walkin_temp_code || main.booking_code;
      const name = main.full_name;
      const hasParent = currentLoadedQueueGroup.length > 1;
      const ok = await confirmDialog({
        title: "ลบคิว Walk-in?",
        message: 'ต้องการลบคิว "' + code + '" ของ ' + name + (hasParent ? ' และผู้ปกครอง' : '') + ' ออกจากระบบใช่หรือไม่?\nข้อมูลคิวจะถูกลบออกทันที',
        confirmText: "ลบคิวนี้",
        tone: "danger",
        icon: "trash",
      });
      if (!ok) return;

      const deleteIds = new Set(currentLoadedQueueGroup.map((r) => r.id));
      cachedAttendees = cachedAttendees.filter((r) => !deleteIds.has(r.id) && r.walkin_temp_code !== code && r.booking_code !== code);
      saveLocalCache(cachedAttendees);

      if (supabaseClient && navigator.onLine) {
        try {
          currentLoadedQueueGroup.forEach(async (r) => {
            if (r.id && r.id < 2000000000) {
              await supabaseClient.from("attendees").delete().eq("id", r.id);
            } else if (code) {
              await supabaseClient.from("attendees").delete().eq("booking_code", code);
            }
          });
        } catch (e) {}
      }

      currentQueueSlipData = null;
      currentLoadedQueueGroup = [];
      if ($("wiQueueLoadedBox")) $("wiQueueLoadedBox").hidden = true;
      if ($("wiQueueSearchInput")) $("wiQueueSearchInput").value = "";
      afterLocalChange();
      renderPendingQueueChips();
      renderWalkInSales();
      updateWalkInStats();
      showToast('ลบคิว "' + code + '" เรียบร้อยแล้ว', "success");
    });
  }

  // --- Manual Form Handlers ---
  const wiHasParent = $("wiHasParent");
  const wiParentFields = $("wiParentFields");
  if (wiHasParent && wiParentFields) {
    wiHasParent.addEventListener("change", () => {
      wiParentFields.style.display = wiHasParent.checked ? "block" : "none";
      updateManualWalkInTotal();
    });
  }

  // Manual Payment Radios
  document.querySelectorAll('input[name="wiPayMethod"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const isQr = e.target.value === "qr_payment";
      const qrBox = $("wiManualQrBox");
      const cashBox = $("wiManualCashBox");
      if (qrBox) qrBox.style.display = isQr ? "block" : "none";
      if (cashBox) cashBox.style.display = isQr ? "none" : "block";
      updateManualSubmitBtnState();
    });
  });

  // Manual Cash Quick buttons & Input
  const mCashRec = $("wiCashReceived");
  if (mCashRec) mCashRec.addEventListener("input", updateManualCashChange);
  const mQuickExact = $("wiManualQuickExact");
  if (mQuickExact) mQuickExact.addEventListener("click", () => {
    const total = getManualWalkInTotal();
    if (mCashRec) mCashRec.value = total;
    updateManualCashChange();
  });
  const mQuick500 = $("wiManualQuick500");
  if (mQuick500) mQuick500.addEventListener("click", () => {
    if (mCashRec) mCashRec.value = 500;
    updateManualCashChange();
  });
  const mQuick1000 = $("wiManualQuick1000");
  if (mQuick1000) mQuick1000.addEventListener("click", () => {
    if (mCashRec) mCashRec.value = 1000;
    updateManualCashChange();
  });

  // Manual Checkboxes Guard
  const mQrCheck = $("wiManualQrCheck");
  if (mQrCheck) mQrCheck.addEventListener("change", updateManualSubmitBtnState);
  const mCashCheck = $("wiManualCashCheck");
  if (mCashCheck) mCashCheck.addEventListener("change", updateManualSubmitBtnState);

  const manualForm = $("walkinForm");
  if (manualForm) manualForm.addEventListener("submit", handleManualWalkInSubmit);

  const resetBtn = $("walkinResetBtn");
  if (resetBtn) resetBtn.addEventListener("click", resetManualWalkInForm);

  // Feed Filter Tabs & Search
  document.querySelectorAll(".feed-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setFeedFilter(btn.dataset.wifilter);
    });
  });

  const filterInp = $("wiListFilter");
  if (filterInp) {
    let wiTimer = null;
    filterInp.addEventListener("input", () => {
      clearTimeout(wiTimer);
      wiTimer = setTimeout(() => renderWalkInSales(), 120);
    });
  }

  // --- Admin Walk-in Round & Quota Handlers ---
  const masterBtn = $("wiMasterToggleBtn");
  if (masterBtn) {
    masterBtn.addEventListener("click", () => {
      if (!isAdmin()) {
        showToast("เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเปิด/ปิดรอบได้", "error");
        return;
      }
      const s = getWalkInSettings();
      const updated = saveWalkInSettings({ isOpen: !s.isOpen }, approverName());
      renderWalkInAdminControls();
      renderWalkInSales();
      showToast(updated.isOpen ? "เปิดรับสมัคร Walk-in ทุกรอบเรียบร้อยแล้ว" : "ปิดรับสมัคร Walk-in ทุกรอบเรียบร้อยแล้ว", updated.isOpen ? "success" : "warning");
    });
  }

  const mToggleBtn = $("wiMorningToggleBtn");
  if (mToggleBtn) {
    mToggleBtn.addEventListener("click", () => {
      if (!isAdmin()) {
        showToast("เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเปิด/ปิดรอบได้", "error");
        return;
      }
      const s = getWalkInSettings();
      const updated = saveWalkInSettings({ morningOpen: !s.morningOpen }, approverName());
      renderWalkInAdminControls();
      renderWalkInSales();
      showToast(updated.morningOpen ? "เปิดรับสมัคร Walk-in รอบเช้าแล้ว" : "ปิดรับสมัคร Walk-in รอบเช้าแล้ว", updated.morningOpen ? "success" : "info");
    });
  }

  const aToggleBtn = $("wiAfternoonToggleBtn");
  if (aToggleBtn) {
    aToggleBtn.addEventListener("click", () => {
      if (!isAdmin()) {
        showToast("เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเปิด/ปิดรอบได้", "error");
        return;
      }
      const s = getWalkInSettings();
      const updated = saveWalkInSettings({ afternoonOpen: !s.afternoonOpen }, approverName());
      renderWalkInAdminControls();
      renderWalkInSales();
      showToast(updated.afternoonOpen ? "เปิดรับสมัคร Walk-in รอบบ่ายแล้ว" : "ปิดรับสมัคร Walk-in รอบบ่ายแล้ว", updated.afternoonOpen ? "success" : "info");
    });
  }

  // Quota stepper buttons (-10, -1, +1, +10)
  document.querySelectorAll(".wi-step-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!isAdmin()) {
        showToast("เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถปรับลดโควตาได้", "error");
        return;
      }
      const round = btn.dataset.round;
      const delta = parseInt(btn.dataset.delta, 10) || 0;
      const s = getWalkInSettings();
      if (round === "morning") {
        const newVal = Math.max(0, s.maxQuotaMorning + delta);
        saveWalkInSettings({ maxQuotaMorning: newVal }, approverName());
        showToast("ปรับโควตารอบเช้าเป็น " + newVal + " ที่นั่ง", "success");
      } else if (round === "afternoon") {
        const newVal = Math.max(0, s.maxQuotaAfternoon + delta);
        saveWalkInSettings({ maxQuotaAfternoon: newVal }, approverName());
        showToast("ปรับโควตารอบบ่ายเป็น " + newVal + " ที่นั่ง", "success");
      }
      renderWalkInAdminControls();
      renderWalkInSales();
    });
  });

  // Direct quota input change
  const mQuotaInp = $("wiMorningQuotaInput");
  if (mQuotaInp) {
    mQuotaInp.addEventListener("change", () => {
      if (!isAdmin()) {
        showToast("เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถปรับลดโควตาได้", "error");
        renderWalkInAdminControls();
        return;
      }
      const val = Math.max(0, parseInt(mQuotaInp.value, 10) || 0);
      saveWalkInSettings({ maxQuotaMorning: val }, approverName());
      showToast("ปรับโควตารอบเช้าเป็น " + val + " ที่นั่ง", "success");
      renderWalkInAdminControls();
      renderWalkInSales();
    });
  }

  const aQuotaInp = $("wiAfternoonQuotaInput");
  if (aQuotaInp) {
    aQuotaInp.addEventListener("change", () => {
      if (!isAdmin()) {
        showToast("เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถปรับลดโควตาได้", "error");
        renderWalkInAdminControls();
        return;
      }
      const val = Math.max(0, parseInt(aQuotaInp.value, 10) || 0);
      saveWalkInSettings({ maxQuotaAfternoon: val }, approverName());
      showToast("ปรับโควตารอบบ่ายเป็น " + val + " ที่นั่ง", "success");
      renderWalkInAdminControls();
      renderWalkInSales();
    });
  }

  // Direct Walk-in price inputs & Save button (Admin only)
  function saveWalkInPricesFromInputs(showToastMsg = true) {
    if (!isAdmin()) {
      showToast("เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเปลี่ยนราคาบัตรได้", "error");
      renderWalkInAdminControls();
      return;
    }
    const stInp = $("wiAdminStudentPrice");
    const paInp = $("wiAdminParentPrice");
    const current = getWalkInSettings();
    const stVal = Math.max(0, parseInt(stInp ? stInp.value : current.priceStudent, 10) || 0);
    const paVal = Math.max(0, parseInt(paInp ? paInp.value : current.priceParent, 10) || 0);
    saveWalkInSettings({ priceStudent: stVal, priceParent: paVal }, approverName());
    if (showToastMsg) {
      showToast("บันทึกราคาบัตร Walk-in แล้ว: นักเรียน ฿" + stVal + " · ผู้ปกครอง ฿" + paVal, "success");
    }
    renderWalkInAdminControls();
    renderWalkInSales();
    updateManualWalkInTotal();
  }

  const savePriceBtn = $("wiAdminSavePriceBtn");
  if (savePriceBtn) {
    savePriceBtn.addEventListener("click", () => saveWalkInPricesFromInputs(true));
  }

  const stPriceInp = $("wiAdminStudentPrice");
  if (stPriceInp) {
    stPriceInp.addEventListener("change", () => saveWalkInPricesFromInputs(true));
    stPriceInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveWalkInPricesFromInputs(true);
      }
    });
  }

  const paPriceInp = $("wiAdminParentPrice");
  if (paPriceInp) {
    paPriceInp.addEventListener("change", () => saveWalkInPricesFromInputs(true));
    paPriceInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveWalkInPricesFromInputs(true);
      }
    });
  }

  // --- Slip Upload Handlers (Queue & Manual) ---
  setupSlipUpload({
    btnId: "wiQUploadSlipBtn",
    fileInputId: "wiQSlipFile",
    previewBoxId: "wiQSlipPreviewBox",
    thumbId: "wiQSlipPreviewImg",
    fileNameId: "wiQSlipFileName",
    changeBtnId: "wiQChangeSlipBtn",
    removeBtnId: "wiQRemoveSlipBtn",
    onData: (data) => { currentQueueSlipData = data; }
  });

  setupSlipUpload({
    btnId: "wiManualUploadSlipBtn",
    fileInputId: "wiManualSlipFile",
    previewBoxId: "wiManualSlipPreviewBox",
    thumbId: "wiManualSlipPreviewImg",
    fileNameId: "wiManualSlipFileName",
    changeBtnId: "wiManualChangeSlipBtn",
    removeBtnId: "wiManualRemoveSlipBtn",
    onData: (data) => { currentManualSlipData = data; }
  });

  // Real-time synchronization across browser tabs & events
  window.addEventListener("storage", (e) => {
    if (e.key === "smst_attendees_cache" || e.key === "smst_walkin_settings") {
      const local = getLocalCache();
      if (local && local.length) {
        cachedAttendees = local;
        renderStats();
        renderPendingQueueChips();
        renderWalkInSales();
      }
    }
  });

  window.addEventListener("smst:attendeescachechange", () => {
    const local = getLocalCache();
    if (local && local.length) {
      cachedAttendees = local;
      renderStats();
      renderPendingQueueChips();
      renderWalkInSales();
    }
  });

  window.addEventListener("focus", () => {
    if (currentUser) {
      const local = getLocalCache();
      if (local && local.length) {
        cachedAttendees = local;
        renderPendingQueueChips();
        renderWalkInSales();
      }
    }
  });

  // Polling ทุก 6 วินาทีเมื่ออยู่หน้า Walk-in เพื่อดึงคิวใหม่จาก Supabase หรือ LocalStorage โดยอัตโนมัติ
  setInterval(async () => {
    if (activeTab === "walkin") {
      syncWalkInSettingsFromServer();
      const local = getLocalCache();
      if (local && local.length > cachedAttendees.length) {
        cachedAttendees = local;
        renderPendingQueueChips();
        renderWalkInSales();
      }
      if (supabaseClient && navigator.onLine) {
        try {
          const { data: serverPending } = await supabaseClient
            .from("attendees")
            .select("*")
            .or("booking_status.eq.รอชำระเงินหน้างาน,payment_status.eq.รอชำระเงิน")
            .order("id", { ascending: false })
            .limit(20);
          if (serverPending && serverPending.length) {
            let changed = false;
            serverPending.forEach((sr) => {
              const exists = cachedAttendees.some((c) => c.id === sr.id || (c.ticket_code && c.ticket_code === sr.ticket_code));
              if (!exists) {
                cachedAttendees.unshift(sr);
                changed = true;
              }
            });
            if (changed) {
              saveLocalCache(cachedAttendees);
              renderPendingQueueChips();
              renderWalkInSales();
            }
          }
        } catch (e) {}
      }
    }
  }, 6000);

  updateManualWalkInTotal();
  renderPendingQueueChips();
  renderWalkInAdminControls();
}

function setFeedFilter(filterKey) {
  activeWiFilter = filterKey || "all";
  document.querySelectorAll(".feed-filter-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.wifilter === activeWiFilter);
  });
  renderWalkInSales();
}

// --- Queue Lookup Methods ---
function renderPendingQueueChips() {
  const container = $("wiPendingQueueChips");
  if (!container) return;

  const pendingRows = cachedAttendees.filter((r) => {
    return getRoundKey(r.ticket_type) === "walkin" && (r.booking_status === "รอชำระเงินหน้างาน" || r.payment_status === "รอชำระเงิน");
  });

  // Group by booking_code
  const seen = new Set();
  const groups = [];
  pendingRows.forEach((r) => {
    const code = r.walkin_temp_code || r.booking_code;
    if (code && !seen.has(code)) {
      seen.add(code);
      groups.push(r);
    }
  });

  if (!groups.length) {
    container.innerHTML = '<span style="font-size: 12px; color: var(--text-3);">ไม่มีคิวค้างชำระในขณะนี้</span>';
    return;
  }

  container.innerHTML = groups
    .slice(0, 8)
    .map((r) => {
      const code = r.walkin_temp_code || r.booking_code;
      const roundShort = valOr(r.ticket_type, "").includes("เช้า") ? "เช้า" : "บ่าย";
      return (
        '<button type="button" class="pending-candidate-chip" data-wi-queue-code="' + esc(code) + '">' +
          '<b>' + esc(code) + '</b> ' + esc(r.full_name) + ' (' + roundShort + ')' +
        '</button>'
      );
    })
    .join("");

  container.querySelectorAll("[data-wi-queue-code]").forEach((btn) => {
    btn.addEventListener("click", () => {
      loadQueueCandidate(btn.dataset.wiQueueCode);
    });
  });
}

async function loadQueueCandidate(query) {
  const q = String(query || "").trim();
  if (!q) return;
  const qNormPhone = normalizePhone(q);
  const qUpper = q.toUpperCase();

  let matchedRows = cachedAttendees.filter((r) => {
    const isWi = getRoundKey(r.ticket_type) === "walkin";
    const codeMatch = String(r.walkin_temp_code || "").toUpperCase() === qUpper ||
                      String(r.booking_code || "").toUpperCase() === qUpper ||
                      String(r.ticket_code || "").toUpperCase() === qUpper;
    const phoneMatch = qNormPhone && normalizePhone(r.phone) === qNormPhone;
    return isWi && (codeMatch || phoneMatch);
  });

  // 1. ถ้ายังไม่พบในหน่วยความจำ ให้ลองค้นจาก Local Cache
  if (!matchedRows.length) {
    const local = getLocalCache();
    matchedRows = local.filter((r) => {
      const isWi = getRoundKey(r.ticket_type) === "walkin";
      const codeMatch = String(r.walkin_temp_code || "").toUpperCase() === qUpper ||
                        String(r.booking_code || "").toUpperCase() === qUpper ||
                        String(r.ticket_code || "").toUpperCase() === qUpper;
      const phoneMatch = qNormPhone && normalizePhone(r.phone) === qNormPhone;
      return isWi && (codeMatch || phoneMatch);
    });
    if (matchedRows.length) {
      matchedRows.forEach((r) => {
        if (!cachedAttendees.some((c) => c.id === r.id)) cachedAttendees.unshift(r);
      });
    }
  }

  // 2. ถ้ายังไม่พบและออนไลน์ ให้ค้นหาโดยตรงจาก Supabase (กรณีเด็กสมัครจากมือถือคนละเครื่อง)
  if (!matchedRows.length && supabaseClient && navigator.onLine) {
    try {
      showToast("กำลังค้นหาข้อมูลจากเซิร์ฟเวอร์...", "info", { duration: 1500 });
      let queryBuilder = supabaseClient.from("attendees").select("*");
      if (qUpper.startsWith("W-") || qUpper.startsWith("WI-") || qUpper.startsWith("SMST-")) {
        queryBuilder = queryBuilder.or(`booking_code.ilike.${escapeLike(qUpper)},ticket_code.ilike.${escapeLike(qUpper)}`);
      } else if (qNormPhone && qNormPhone.length >= 9) {
        queryBuilder = queryBuilder.eq("phone", qNormPhone);
      } else {
        queryBuilder = queryBuilder.ilike("full_name", `%${escapeLike(q)}%`);
      }
      const { data: serverRows, error: sErr } = await queryBuilder;
      if (!sErr && serverRows && serverRows.length) {
        matchedRows = serverRows;
        serverRows.forEach((sr) => {
          if (!cachedAttendees.some((c) => c.id === sr.id)) {
            cachedAttendees.unshift(sr);
          }
        });
        saveLocalCache(cachedAttendees);
        renderPendingQueueChips();
        renderWalkInSales();
      }
    } catch (e) {
      console.warn("Direct queue query error:", e);
    }
  }

  if (!matchedRows.length) {
    showToast("ไม่พบข้อมูลคิว Walk-in จากรหัสหรือเบอร์โทร: " + q, "error");
    return;
  }

  // Get all rows under the same booking_code
  const first = matchedRows[0];
  const bookingCode = first.walkin_temp_code || first.booking_code;
  currentLoadedQueueGroup = cachedAttendees.filter((r) => {
    return (r.walkin_temp_code === bookingCode || r.booking_code === bookingCode);
  });
  if (!currentLoadedQueueGroup.length) {
    currentLoadedQueueGroup = matchedRows;
  }

  const main = currentLoadedQueueGroup[0];
  const isApproved = main.payment_status === "ชำระเงินแล้ว" || main.booking_status === "อนุมัติแล้ว";

  if (isApproved) {
    showToast("รายการ " + bookingCode + " ได้รับการอนุมัติและชำระเงินแล้ว", "info");
    showWalkInTicketModal(main, currentLoadedQueueGroup);
    return;
  }

  // Reset loaded box & slip
  currentQueueSlipData = null;
  if ($("wiQSlipFile")) $("wiQSlipFile").value = "";
  if ($("wiQSlipPreviewBox")) $("wiQSlipPreviewBox").style.display = "none";
  if ($("wiQUploadSlipBtn")) $("wiQUploadSlipBtn").style.display = "block";
  if ($("wiQSlipPreviewImg")) $("wiQSlipPreviewImg").src = "";
  if ($("wiQSlipFileName")) $("wiQSlipFileName").textContent = "";
  if ($("wiQSlipRef")) $("wiQSlipRef").value = "";
  if ($("wiQQrConfirmed")) $("wiQQrConfirmed").checked = false;
  if ($("wiQCashConfirmed")) $("wiQCashConfirmed").checked = false;

  const totalAmount = currentLoadedQueueGroup.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const hasParent = currentLoadedQueueGroup.length > 1;

  if ($("wiQLoadedTempCode")) $("wiQLoadedTempCode").textContent = bookingCode;
  if ($("wiQLoadedRound")) $("wiQLoadedRound").textContent = valOr(main.ticket_type, "Walk-in");
  if ($("wiQLoadedCategory")) $("wiQLoadedCategory").textContent = hasParent ? "นักเรียน + ผู้ปกครอง (2 คน)" : "นักเรียน (1 คน)";
  if ($("wiQLoadedName")) $("wiQLoadedName").textContent = main.full_name + (hasParent ? " และ " + currentLoadedQueueGroup[1].full_name : "");
  if ($("wiQLoadedSchoolPhone")) $("wiQLoadedSchoolPhone").textContent = "โรงเรียน: " + valOr(main.school, "-") + " · โทร: " + valOr(main.phone, "-");
  if ($("wiQLoadedExtra")) $("wiQLoadedExtra").textContent = "ระดับชั้น: " + valOr(main.grade_level, "-") + " · ทราบจาก: " + valOr(main.channel, "-");
  if ($("wiQLoadedAmount")) $("wiQLoadedAmount").textContent = totalAmount.toLocaleString("th-TH");
  if ($("wiQLoadedPackNote")) $("wiQLoadedPackNote").textContent = hasParent ? "(แพ็กเกจคู่: นักเรียน + ผู้ปกครอง)" : "(บัตรนักเรียน 1 ท่าน)";

  // Update K SHOP QR image automatically based on single vs package
  const qrImg = $("wiQQrImg");
  if (qrImg) {
    qrImg.src = hasParent ? "assets/img/qr-kshop-pair.svg" : "assets/img/qr-kshop-single.svg";
  }

  // Default to QR payment method initially
  const qrRadio = document.querySelector('input[name="wiQPayMethod"][value="qr_payment"]');
  if (qrRadio) qrRadio.checked = true;
  if ($("wiQQrBox")) $("wiQQrBox").style.display = "block";
  if ($("wiQCashBox")) $("wiQCashBox").style.display = "none";

  // Reset checkboxes and change
  if ($("wiQQrConfirmed")) $("wiQQrConfirmed").checked = false;
  if ($("wiQCashConfirmed")) $("wiQCashConfirmed").checked = false;
  if ($("wiQSlipRef")) $("wiQSlipRef").value = "";
  if ($("wiQCashRec")) $("wiQCashRec").value = "";
  updateQueueCashChange();
  updateQueueApproveBtnState();

  const loadedBox = $("wiQueueLoadedBox");
  if (loadedBox) {
    loadedBox.hidden = false;
    loadedBox.style.display = "block";
    loadedBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  showToast("ดึงข้อมูลคิว " + bookingCode + " สำเร็จ", "success");
}

function getLoadedQueueTotal() {
  if (!currentLoadedQueueGroup.length) return 400;
  return currentLoadedQueueGroup.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}

function updateQueueCashChange() {
  const total = getLoadedQueueTotal();
  const recInp = $("wiQCashRec");
  const changeEl = $("wiQChangeDisplay");
  if (!changeEl) return;

  const received = parseFloat(recInp ? recInp.value : 0);
  if (isNaN(received) || !recInp || !recInp.value) {
    changeEl.textContent = "0 บาท";
    changeEl.className = "walkin-change-display";
    updateQueueApproveBtnState();
    return;
  }

  const diff = received - total;
  if (diff === 0) {
    changeEl.textContent = "0 บาท (พอดี)";
    changeEl.className = "walkin-change-display has-change";
  } else if (diff > 0) {
    changeEl.textContent = "ทอน " + diff.toLocaleString("th-TH") + " บาท";
    changeEl.className = "walkin-change-display has-change";
  } else {
    changeEl.textContent = "ขาดอีก " + Math.abs(diff).toLocaleString("th-TH") + " บาท";
    changeEl.className = "walkin-change-display is-short";
  }
  updateQueueApproveBtnState();
}

function updateQueueApproveBtnState() {
  const btn = $("wiQApproveBtn");
  if (!btn || !currentLoadedQueueGroup.length) return;

  const payMethod = document.querySelector('input[name="wiQPayMethod"]:checked')?.value || "qr_payment";
  if (payMethod === "qr_payment") {
    const isChecked = $("wiQQrConfirmed") ? $("wiQQrConfirmed").checked : false;
    btn.disabled = !isChecked;
  } else {
    const isChecked = $("wiQCashConfirmed") ? $("wiQCashConfirmed").checked : false;
    const total = getLoadedQueueTotal();
    const rec = parseFloat($("wiQCashRec") ? $("wiQCashRec").value : 0);
    const hasEnough = !isNaN(rec) && rec >= total;
    btn.disabled = !isChecked || !hasEnough;
  }
}

async function handleQueueApprove() {
  if (!currentLoadedQueueGroup.length) return;
  const btn = $("wiQApproveBtn");
  if (btn) btn.disabled = true;

  try {
    const payMethod = document.querySelector('input[name="wiQPayMethod"]:checked')?.value || "qr_payment";
    const slipRef = ($("wiQSlipRef") ? $("wiQSlipRef").value.trim() : "") || "-";
    const staffName = approverName();

    // Generate official booking code: WI-26001...
    let nextNum = 26001;
    const wiCodes = cachedAttendees
      .map((a) => a.booking_code)
      .filter((b) => b && b.startsWith("WI-"))
      .map((b) => parseInt(b.replace(/\D/g, ""), 10))
      .filter((n) => !isNaN(n));
    if (wiCodes.length > 0) {
      nextNum = Math.max(...wiCodes) + 1;
      if (nextNum < 26001) nextNum = 26001;
    }
    const officialBookingCode = "WI-" + nextNum;

    const totalPax = currentLoadedQueueGroup.length;
    const nowIso = localDateISO();
    const timeNow = thaiTimeNow();

    currentLoadedQueueGroup.forEach((r, idx) => {
      const order = idx + 1;
      const officialTicketCode = "SMST-" + officialBookingCode + (totalPax > 1 ? "-" + order : "");

      r.booking_code = officialBookingCode;
      r.ticket_code = officialTicketCode;
      r.qr_code = officialTicketCode;
      r.booking_status = "อนุมัติแล้ว";
      r.payment_status = "ชำระเงินแล้ว";
      r.payment_method = payMethod;
      r.slip_ref = slipRef;
      if (currentQueueSlipData) {
        r.slip_image = currentQueueSlipData;
      }
      r.approved_by_staff = staffName;
      r.is_checked_in = true;
      r.checked_in_at = shortClock(timeNow);
      r.checked_in_by = staffName;
    });

    afterLocalChange();

    // Supabase update/sync
    if (supabaseClient && navigator.onLine) {
      try {
        currentLoadedQueueGroup.forEach((r) => {
          const payload = toSupabaseAttendeePayload(r);
          if (r.id && r.id < 2000000000) {
            supabaseClient
              .from("attendees")
              .update(payload)
              .eq("id", r.id)
              .then(({ error }) => {
                if (error) pushOfflineQueue({ type: "insert-walkin", payload: payload });
              });
          } else {
            supabaseClient
              .from("attendees")
              .upsert(payload, { onConflict: "ticket_code" })
              .then(({ error }) => {
                if (error) pushOfflineQueue({ type: "insert-walkin", payload: payload });
              });
          }
        });
      } catch (err) {}
    }

    feedback("success");
    showToast("อนุมัติและออกบัตร Walk-in " + officialBookingCode + " สำเร็จ!", "success");

    const mainRow = currentLoadedQueueGroup[0];
    showWalkInTicketModal(mainRow, currentLoadedQueueGroup);

    // Reset loaded box & slip
    currentQueueSlipData = null;
    if ($("wiQSlipFile")) $("wiQSlipFile").value = "";
    if ($("wiQSlipPreviewBox")) $("wiQSlipPreviewBox").style.display = "none";
    if ($("wiQUploadSlipBtn")) $("wiQUploadSlipBtn").style.display = "block";
    if ($("wiQSlipPreviewImg")) $("wiQSlipPreviewImg").src = "";
    if ($("wiQSlipFileName")) $("wiQSlipFileName").textContent = "";
    if ($("wiQSlipRef")) $("wiQSlipRef").value = "";
    if ($("wiQQrConfirmed")) $("wiQQrConfirmed").checked = false;
    if ($("wiQCashConfirmed")) $("wiQCashConfirmed").checked = false;
    currentLoadedQueueGroup = [];
    if ($("wiQueueLoadedBox")) $("wiQueueLoadedBox").hidden = true;
    if ($("wiQueueSearchInput")) $("wiQueueSearchInput").value = "";
    renderPendingQueueChips();
    renderWalkInSales();
  } catch (err) {
    showToast("เกิดข้อผิดพลาดในการอนุมัติคิว: " + err.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// --- Manual Form Methods ---
function getManualWalkInTotal() {
  const s = getWalkInSettings();
  const cfg = (CONFIG.rounds && CONFIG.rounds.walkin) || {};
  const priceStudent = typeof s.priceStudent === "number" ? s.priceStudent : ((cfg.price && cfg.price.student) || 529);
  const priceParent = typeof s.priceParent === "number" ? s.priceParent : ((cfg.price && cfg.price.parent) || 259);
  const hasParent = $("wiHasParent") ? $("wiHasParent").checked : false;
  return priceStudent + (hasParent ? priceParent : 0);
}

function updateManualWalkInTotal() {
  const total = getManualWalkInTotal();
  const hasParent = $("wiHasParent") ? $("wiHasParent").checked : false;
  const s = getWalkInSettings();
  const cfg = (CONFIG.rounds && CONFIG.rounds.walkin) || {};
  const priceParent = typeof s.priceParent === "number" ? s.priceParent : ((cfg.price && cfg.price.parent) || 259);

  const parentSpan = document.querySelector("#wiHasParent ~ span b");
  if (parentSpan) {
    parentSpan.textContent = "มาพร้อมผู้ปกครอง 1 ท่าน (+" + priceParent.toLocaleString("th-TH") + " บาท)";
  }

  if ($("wiTotalAmount")) $("wiTotalAmount").textContent = total.toLocaleString("th-TH");
  if ($("wiTicketQtyNote")) $("wiTicketQtyNote").textContent = hasParent ? "(2 ใบ: นักเรียน + ผู้ปกครอง)" : "(1 ใบ)";

  const qrImg = $("wiManualQrImg");
  if (qrImg) {
    qrImg.src = hasParent ? "assets/img/qr-kshop-pair.svg" : "assets/img/qr-kshop-single.svg";
  }

  updateManualCashChange();
  updateManualSubmitBtnState();
}

function updateManualCashChange() {
  const total = getManualWalkInTotal();
  const recInp = $("wiCashReceived");
  const changeEl = $("wiChangeDisplay");
  if (!changeEl) return;

  const received = parseFloat(recInp ? recInp.value : 0);
  if (isNaN(received) || !recInp || !recInp.value) {
    changeEl.textContent = "0 บาท";
    changeEl.className = "walkin-change-display";
    updateManualSubmitBtnState();
    return;
  }

  const diff = received - total;
  if (diff === 0) {
    changeEl.textContent = "0 บาท (พอดี)";
    changeEl.className = "walkin-change-display has-change";
  } else if (diff > 0) {
    changeEl.textContent = "ทอน " + diff.toLocaleString("th-TH") + " บาท";
    changeEl.className = "walkin-change-display has-change";
  } else {
    changeEl.textContent = "ขาดอีก " + Math.abs(diff).toLocaleString("th-TH") + " บาท";
    changeEl.className = "walkin-change-display is-short";
  }
  updateManualSubmitBtnState();
}

function updateManualSubmitBtnState() {
  const btn = $("wiSubmitBtn");
  if (!btn) return;

  const payMethod = document.querySelector('input[name="wiPayMethod"]:checked')?.value || "qr_payment";
  if (payMethod === "qr_payment") {
    const isChecked = $("wiManualQrCheck") ? $("wiManualQrCheck").checked : false;
    btn.disabled = !isChecked;
  } else {
    const isChecked = $("wiManualCashCheck") ? $("wiManualCashCheck").checked : false;
    const total = getManualWalkInTotal();
    const rec = parseFloat($("wiCashReceived") ? $("wiCashReceived").value : 0);
    const hasEnough = !isNaN(rec) && rec >= total;
    btn.disabled = !isChecked || !hasEnough;
  }
}

function resetManualWalkInForm() {
  const form = $("walkinForm");
  if (form) form.reset();
  currentManualSlipData = null;
  if ($("wiManualSlipFile")) $("wiManualSlipFile").value = "";
  if ($("wiManualSlipPreviewBox")) $("wiManualSlipPreviewBox").style.display = "none";
  if ($("wiManualUploadSlipBtn")) $("wiManualUploadSlipBtn").style.display = "block";
  if ($("wiManualSlipPreviewImg")) $("wiManualSlipPreviewImg").src = "";
  if ($("wiManualSlipFileName")) $("wiManualSlipFileName").textContent = "";
  if ($("wiParentFields")) $("wiParentFields").style.display = "none";
  if ($("wiManualQrCheck")) $("wiManualQrCheck").checked = false;
  if ($("wiManualCashCheck")) $("wiManualCashCheck").checked = false;
  if ($("wiManualSlipRef")) $("wiManualSlipRef").value = "";
  if ($("wiCashReceived")) $("wiCashReceived").value = "";
  updateManualWalkInTotal();
}

async function handleManualWalkInSubmit(e) {
  e.preventDefault();
  const prefix = $("wiPrefix").value;
  const fullName = $("wiFullName").value.trim();
  const phone = normalizePhone($("wiPhone").value.trim());
  const grade = $("wiGrade").value;
  const school = normalizeSchoolName($("wiSchool").value) || "-";
  const channel = $("wiChannel").value;
  const roundChoice = $("wiRound").value;
  const hasParent = $("wiHasParent").checked;
  const parentPrefix = $("wiParentPrefix") ? $("wiParentPrefix").value : "นาย";
  const parentName = $("wiParentName") ? $("wiParentName").value.trim() : "";
  const autoCheckIn = $("wiAutoCheckin") ? $("wiAutoCheckin").checked : true;
  const payMethod = document.querySelector('input[name="wiPayMethod"]:checked')?.value || "qr_payment";
  const slipRef = ($("wiManualSlipRef") ? $("wiManualSlipRef").value.trim() : "") || "-";

  if (!fullName) {
    showToast("กรุณากรอกชื่อ-นามสกุล", "error");
    $("wiFullName").focus();
    return;
  }
  if (!phone || phone.length < 9) {
    showToast("กรุณากรอกเบอร์โทรศัพท์ 10 หลัก", "error");
    $("wiPhone").focus();
    return;
  }
  if (hasParent && !parentName) {
    showToast("กรุณากรอกชื่อ-นามสกุลของผู้ปกครอง", "error");
    $("wiParentName").focus();
    return;
  }

  const submitBtn = $("wiSubmitBtn");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const s = getWalkInSettings();
    const cfg = (CONFIG.rounds && CONFIG.rounds.walkin) || {};
    const priceStudent = typeof s.priceStudent === "number" ? s.priceStudent : ((cfg.price && cfg.price.student) || 529);
    const priceParent = typeof s.priceParent === "number" ? s.priceParent : ((cfg.price && cfg.price.parent) || 259);

    let nextNum = 26001;
    const wiCodes = cachedAttendees
      .map((a) => a.booking_code)
      .filter((b) => b && b.startsWith("WI-"))
      .map((b) => parseInt(b.replace(/\D/g, ""), 10))
      .filter((n) => !isNaN(n));
    if (wiCodes.length > 0) {
      nextNum = Math.max(...wiCodes) + 1;
      if (nextNum < 26001) nextNum = 26001;
    }
    const bookingCode = "WI-" + nextNum;

    const totalPeople = hasParent ? 2 : 1;
    const nowIso = localDateISO();
    const thaiDateNowStr =
      new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " " +
      thaiTimeNow().replace(" น.", "");
    const staffName = approverName();
    const ticketTypeStr = "รอบ Walk-in · " + roundChoice;

    const mainTicketCode = "SMST-" + bookingCode + (totalPeople > 1 ? "-1" : "");
    const mainRowId = Date.now() + Math.floor(Math.random() * 500);

    const mainRow = {
      id: mainRowId,
      booking_code: bookingCode,
      walkin_temp_code: bookingCode,
      person_order: "1/" + totalPeople,
      ticket_type_category: "นักเรียน",
      ticket_code: mainTicketCode,
      qr_code: mainTicketCode,
      title_prefix: prefix,
      full_name: prefix + " " + fullName,
      grade_level: grade,
      school: school,
      phone: phone,
      contact_name: prefix + " " + fullName,
      contact_phone: phone,
      channel: channel,
      ticket_type: ticketTypeStr,
      amount: priceStudent,
      payment_method: payMethod,
      slip_ref: slipRef,
      slip_image: currentManualSlipData || null,
      booking_status: "อนุมัติแล้ว",
      payment_status: "ชำระเงินแล้ว",
      created_by_staff: staffName,
      approved_by_staff: staffName,
      booking_date: thaiDateNowStr,
      booking_date_iso: nowIso + " " + thaiTimeNow().replace(" น.", ""),
      is_checked_in: autoCheckIn,
      checked_in_at: autoCheckIn ? shortClock(thaiTimeNow()) : null,
      checked_in_by: autoCheckIn ? staffName : null,
      marketing_discount_used: false,
    };

    const allNewRows = [mainRow];

    if (hasParent) {
      const parentTicketCode = "SMST-" + bookingCode + "-2";
      const parentRow = {
        id: Date.now() + 500 + Math.floor(Math.random() * 500),
        booking_code: bookingCode,
        walkin_temp_code: bookingCode,
        person_order: "2/" + totalPeople,
        ticket_type_category: "ผู้ปกครอง",
        ticket_code: parentTicketCode,
        qr_code: parentTicketCode,
        title_prefix: parentPrefix,
        full_name: parentPrefix + " " + parentName,
        grade_level: "-",
        school: "-",
        phone: phone,
        contact_name: prefix + " " + fullName,
        contact_phone: phone,
        channel: channel,
        ticket_type: ticketTypeStr,
        amount: priceParent,
        payment_method: payMethod,
        slip_ref: slipRef,
        slip_image: currentManualSlipData || null,
        booking_status: "อนุมัติแล้ว",
        payment_status: "ชำระเงินแล้ว",
        created_by_staff: staffName,
        approved_by_staff: staffName,
        booking_date: thaiDateNowStr,
        booking_date_iso: nowIso + " " + thaiTimeNow().replace(" น.", ""),
        is_checked_in: autoCheckIn,
        checked_in_at: autoCheckIn ? shortClock(thaiTimeNow()) : null,
        checked_in_by: autoCheckIn ? staffName : null,
        marketing_discount_used: false,
      };
      allNewRows.push(parentRow);
    }

    allNewRows.forEach((row) => cachedAttendees.unshift(row));
    afterLocalChange();

    pushRecent({
      type: "checkin",
      code: mainTicketCode,
      name: prefix + " " + fullName + " (Walk-in " + roundChoice + ")",
      id: mainRowId,
    });

    if (supabaseClient && navigator.onLine) {
      try {
        const payloads = allNewRows.map(toSupabaseAttendeePayload);
        supabaseClient.from("attendees").insert(payloads).then(({ error }) => {
          if (error) payloads.forEach((p) => pushOfflineQueue({ type: "insert-walkin", payload: p }));
        });
      } catch (err) {}
    }

    feedback("success");
    showToast("ออกบัตร Walk-in รหัส " + bookingCode + " เรียบร้อยแล้ว!", "success");

    showWalkInTicketModal(mainRow, allNewRows);
    resetManualWalkInForm();
    renderWalkInSales();
  } catch (err) {
    showToast("เกิดข้อผิดพลาดในการออกบัตร: " + err.message, "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// --- Slip Image Zoom Modal ---
function showSlipImageModal(imgSrc, title = "รูปสลิปการโอน") {
  if (!imgSrc) return;
  const modalHtml =
    '<div style="text-align:center;padding:12px;">' +
      '<div style="font-weight:700;font-size:16px;margin-bottom:12px;color:var(--text-1);">' + icon("camera") + ' ' + esc(title) + '</div>' +
      '<div style="max-height:70vh;overflow:auto;display:flex;justify-content:center;background:rgba(0,0,0,0.15);border-radius:8px;padding:8px;">' +
        '<img src="' + imgSrc + '" style="max-width:100%;max-height:65vh;object-fit:contain;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.25);" alt="Slip Image" />' +
      '</div>' +
      '<div style="margin-top:16px;display:flex;justify-content:center;gap:10px;">' +
        '<a href="' + imgSrc + '" download="smst_walkin_slip.png" class="btn btn-secondary btn-sm">' +
          icon("download") + 'ดาวน์โหลดรูป' +
        '</a>' +
        '<button type="button" class="btn btn-primary btn-sm" data-modal-close="close">ปิดหน้าต่าง</button>' +
      '</div>' +
    '</div>';
  openModal(modalHtml, {
    className: "modal-wrap-slip-zoom",
    label: "รูปสลิป " + title,
  });
}

// --- Ticket Slip Modal ---
function showWalkInTicketModal(mainRow, groupRows) {
  const rows = groupRows && groupRows.length ? groupRows : [mainRow];
  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const payLabel =
    mainRow.payment_method === "qr_payment"
      ? "สแกน QR K SHOP" + (mainRow.slip_ref && mainRow.slip_ref !== "-" ? " (สลิป: " + mainRow.slip_ref + ")" : "")
      : mainRow.payment_method === "cash"
      ? "เงินสด (Cash)"
      : "สิทธิ์พิเศษ";

  const slipRowCandidate = rows.find((r) => r.slip_image);

  const qrsHtml = rows
    .map((r) => {
      const qrData = r.ticket_code || r.booking_code;
      const isCheck = r.is_checked_in;
      return (
        '<div class="slip-ticket-card" style="border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin-bottom: 12px; background: var(--surface);">' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">' +
            '<span class="chip chip-mint"><span class="dot"></span>' + esc(r.ticket_type) + '</span>' +
            (isCheck
              ? '<span class="chip chip-teal">' + icon("check-circle") + 'เข้างานแล้ว</span>'
              : '<span class="chip chip-gold">' + icon("clock") + 'ยังไม่เข้างาน</span>') +
          '</div>' +
          '<div class="slip-qr-box">' + qrSvg(qrData, { ecc: "M", margin: 2 }) + '</div>' +
          '<div class="slip-code-main">' + esc(r.ticket_code) + '</div>' +
          '<div style="font-size: 11px; color: var(--text-3); margin-top: 2px;">รหัสการจอง: <b class="mono">' + esc(r.booking_code) + ' (' + esc(r.person_order) + ')</b></div>' +
          '<div style="font-weight: 700; font-size: 15px; margin-top: 6px;">' + esc(r.full_name) + ' (' + esc(r.ticket_type_category) + ')</div>' +
        '</div>'
      );
    })
    .join("");

  const modalHtml =
    '<div class="modal-ticket-slip">' +
      '<div class="slip-badge-head">' +
        '<img src="assets/img/oph-logo.png" alt="" width="36" height="36" />' +
        '<div style="text-align: left;">' +
          '<div style="font-weight: 800; font-size: 14px; line-height: 1.1; color: var(--gold);">SMST OPEN HOUSE 2026</div>' +
          '<div style="font-size: 11px; color: var(--text-3);">WALK-IN TICKET · บัตรเข้างานหน้างาน</div>' +
        '</div>' +
      '</div>' +
      qrsHtml +
      '<div class="slip-details">' +
        '<div class="slip-details-row"><span>ผู้ติดต่อ / เบอร์โทร:</span><span>' + esc(mainRow.phone) + '</span></div>' +
        (mainRow.school && mainRow.school !== "-" ? '<div class="slip-details-row"><span>โรงเรียน / สถาบัน:</span><span>' + esc(mainRow.school) + '</span></div>' : '') +
        '<div class="slip-details-row"><span>ยอดชำระ:</span><span class="mono" style="color: var(--gold); font-size: 14px;">฿' + total.toLocaleString("th-TH") + ' (' + esc(payLabel) + ')</span></div>' +
        (slipRowCandidate
          ? '<div class="slip-details-row" style="align-items: center; cursor: pointer;" id="slipModalImageRow">' +
              '<span>หลักฐานสลิป:</span>' +
              '<span style="display:inline-flex;align-items:center;gap:6px;">' +
                '<img src="' + esc(slipRowCandidate.slip_image) + '" style="width:36px;height:36px;border-radius:4px;object-fit:cover;border:1px solid var(--border);" alt="slip" />' +
                '<span style="color:var(--sky);font-size:12px;font-weight:600;">📷 ดูรูปสลิป</span>' +
              '</span>' +
            '</div>'
          : '') +
        '<div class="slip-details-row"><span>ผู้กรอกข้อมูล:</span><span>' + esc(mainRow.created_by_staff || "Self-Service") + '</span></div>' +
        '<div class="slip-details-row"><span>ผู้อนุมัติรับเงิน:</span><span>' + esc(mainRow.approved_by_staff || mainRow.checked_in_by || approverName()) + '</span></div>' +
        '<div class="slip-details-row"><span>เวลาที่ออกบัตร:</span><span>' + esc(shortClock(thaiTimeNow())) + '</span></div>' +
      '</div>' +
      '<div class="slip-actions">' +
        '<button type="button" class="btn btn-secondary" data-action="print-slip">' +
          icon("download") + 'พิมพ์บัตร / Slip' +
        '</button>' +
        '<button type="button" class="btn btn-primary" data-modal-close="done">' +
          icon("check") + 'เสร็จสิ้น / ถัดไป' +
        '</button>' +
      '</div>' +
      '<div style="margin-top: 10px;">' +
        '<a href="./?code=' + encodeURIComponent(mainRow.ticket_code || mainRow.booking_code) + '" target="_blank" class="btn btn-ghost btn-sm btn-block" style="font-size: 12px; color: var(--sky);">' +
          icon("external-link") + 'เปิดทดสอบในหน้าน้อง ๆ (Landing Page)' +
        '</a>' +
      '</div>' +
    '</div>';

  const handle = openModal(modalHtml, {
    className: "modal-wrap-slip",
    label: "บัตร Walk-in " + mainRow.booking_code,
  });

  const printBtn = handle.el.querySelector('[data-action="print-slip"]');
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }

  const slipRow = handle.el.querySelector("#slipModalImageRow");
  if (slipRow && slipRowCandidate) {
    slipRow.addEventListener("click", () => {
      showSlipImageModal(slipRowCandidate.slip_image, "สลิปการโอน " + mainRow.booking_code);
    });
  }
}

function updateWalkInStats() {
  const walkinRows = cachedAttendees.filter((r) => getRoundKey(r.ticket_type) === "walkin");
  const approvedRows = walkinRows.filter((r) => r.payment_status === "ชำระเงินแล้ว" || r.booking_status === "อนุมัติแล้ว");
  const pendingRows = walkinRows.filter((r) => r.payment_status === "รอชำระเงิน" || r.booking_status === "รอชำระเงินหน้างาน");

  const totalApprovedTickets = approvedRows.length;
  const morningCount = approvedRows.filter((r) => valOr(r.ticket_type, "").includes("เช้า")).length;
  const afternoonCount = approvedRows.filter((r) => valOr(r.ticket_type, "").includes("บ่าย")).length;

  const wiSettings = getWalkInSettings();
  const quotaMorning = wiSettings.maxQuotaMorning;
  const quotaAfternoon = wiSettings.maxQuotaAfternoon;

  let totalRev = 0;
  let cashRev = 0;
  let qrRev = 0;
  approvedRows.forEach((r) => {
    const amt = Number(r.amount) || 0;
    totalRev += amt;
    if (r.payment_method === "cash") cashRev += amt;
    else if (r.payment_method === "qr_payment" || r.payment_method === "promptpay") qrRev += amt;
  });

  if ($("wiStatTotal")) $("wiStatTotal").textContent = totalApprovedTickets;
  if ($("wiStatRevenue")) $("wiStatRevenue").textContent = "฿" + totalRev.toLocaleString("th-TH");
  if ($("wiStatCash")) $("wiStatCash").textContent = "฿" + cashRev.toLocaleString("th-TH");
  if ($("wiStatTransfer")) $("wiStatTransfer").textContent = "฿" + qrRev.toLocaleString("th-TH");
  if ($("wiStatMorning")) $("wiStatMorning").textContent = morningCount;
  if ($("wiStatAfternoon")) $("wiStatAfternoon").textContent = afternoonCount;
  if ($("wiQuotaMorning")) $("wiQuotaMorning").textContent = quotaMorning;
  if ($("wiQuotaAfternoon")) $("wiQuotaAfternoon").textContent = quotaAfternoon;
  if ($("wiStatPending")) $("wiStatPending").textContent = pendingRows.length;

  // Filter count tabs
  if ($("wiFilterAllCount")) $("wiFilterAllCount").textContent = walkinRows.length;
  if ($("wiFilterPendingCount")) $("wiFilterPendingCount").textContent = pendingRows.length;
  if ($("wiFilterApprovedCount")) $("wiFilterApprovedCount").textContent = approvedRows.length;
}

function renderWalkInAdminControls() {
  const settings = getWalkInSettings();
  const admin = isAdmin();

  if ($("wiAdminRoleBadge")) {
    if (admin) {
      $("wiAdminRoleBadge").textContent = "👑 สิทธิ์ Admin: จัดการรอบ โควตา และราคาบัตร";
      $("wiAdminRoleBadge").className = "chip chip-gold";
    } else {
      $("wiAdminRoleBadge").textContent = "🔒 เฉพาะ Admin (อ่านอย่างเดียว)";
      $("wiAdminRoleBadge").className = "chip chip-secondary";
    }
  }

  if ($("wiNonAdminNotice")) {
    $("wiNonAdminNotice").style.display = admin ? "none" : "flex";
  }

  const masterBtn = $("wiMasterToggleBtn");
  const masterText = $("wiMasterToggleText");
  if (masterBtn && masterText) {
    masterBtn.disabled = !admin;
    if (settings.isOpen) {
      masterBtn.className = "btn btn-sm btn-success";
      masterText.textContent = "เปิดรับสมัคร Walk-in อยู่ (คลิกเพื่อปิด)";
    } else {
      masterBtn.className = "btn btn-sm btn-danger";
      masterText.textContent = "ปิดรับสมัคร Walk-in ทุกรอบแล้ว (คลิกเพื่อเปิด)";
    }
  }

  const mBadge = $("wiMorningOpenBadge");
  const mBtn = $("wiMorningToggleBtn");
  const mInp = $("wiMorningQuotaInput");
  if (mBadge) {
    mBadge.textContent = settings.morningOpen ? "เปิดรับ" : "ปิดรับ";
    mBadge.className = settings.morningOpen ? "chip chip-mint" : "chip chip-rose";
  }
  if (mBtn) {
    mBtn.disabled = !admin;
    mBtn.textContent = settings.morningOpen ? "ปิดรอบเช้า" : "เปิดรอบเช้า";
  }
  if (mInp) {
    mInp.disabled = !admin;
    mInp.value = settings.maxQuotaMorning;
  }

  const aBadge = $("wiAfternoonOpenBadge");
  const aBtn = $("wiAfternoonToggleBtn");
  const aInp = $("wiAfternoonQuotaInput");
  if (aBadge) {
    aBadge.textContent = settings.afternoonOpen ? "เปิดรับ" : "ปิดรับ";
    aBadge.className = settings.afternoonOpen ? "chip chip-mint" : "chip chip-rose";
  }
  if (aBtn) {
    aBtn.disabled = !admin;
    aBtn.textContent = settings.afternoonOpen ? "ปิดรอบบ่าย" : "เปิดรอบบ่าย";
  }
  if (aInp) {
    aInp.disabled = !admin;
    aInp.value = settings.maxQuotaAfternoon;
  }

  const stPriceInp = $("wiAdminStudentPrice");
  const paPriceInp = $("wiAdminParentPrice");
  const savePriceBtn = $("wiAdminSavePriceBtn");
  const cfg = (CONFIG.rounds && CONFIG.rounds.walkin) || {};
  if (stPriceInp) {
    stPriceInp.disabled = !admin;
    if (document.activeElement !== stPriceInp) {
      stPriceInp.value = typeof settings.priceStudent === "number" ? settings.priceStudent : ((cfg.price && cfg.price.student) || 529);
    }
  }
  if (paPriceInp) {
    paPriceInp.disabled = !admin;
    if (document.activeElement !== paPriceInp) {
      paPriceInp.value = typeof settings.priceParent === "number" ? settings.priceParent : ((cfg.price && cfg.price.parent) || 259);
    }
  }
  if (savePriceBtn) {
    savePriceBtn.disabled = !admin;
  }

  document.querySelectorAll(".wi-step-btn").forEach((btn) => {
    btn.disabled = !admin;
  });
}

function renderWalkInSales() {
  const feed = $("walkinFeed");
  const countEl = $("wiSalesCount");
  if (!feed) return;

  // ผสานข้อมูลแคชในเครื่องล่าสุดเสมอ เพื่อให้รายการที่เพิ่งลงทะเบียนจากแท็บอื่นหรือเครื่องเดียวกันแสดงทันที
  const localRows = getLocalCache();
  if (localRows && localRows.length) {
    const knownCodes = new Set(cachedAttendees.map((r) => String(r.ticket_code || r.booking_code || "").toUpperCase()));
    localRows.forEach((lr) => {
      const code = String(lr.ticket_code || lr.walkin_temp_code || lr.booking_code || "").toUpperCase();
      if (!knownCodes.has(code)) {
        cachedAttendees.unshift(lr);
        knownCodes.add(code);
      }
    });
  }

  updateWalkInStats();
  renderPendingQueueChips();
  renderWalkInAdminControls();

  const walkinRows = cachedAttendees.filter((r) => getRoundKey(r.ticket_type) === "walkin");
  const filterVal = $("wiListFilter") ? $("wiListFilter").value.trim().toLowerCase() : "";

  const displayRows = walkinRows.filter((r) => {
    // 1. Tab filter
    const isPending = r.payment_status === "รอชำระเงิน" || r.booking_status === "รอชำระเงินหน้างาน";
    if (activeWiFilter === "pending" && !isPending) return false;
    if (activeWiFilter === "approved" && isPending) return false;

    // 2. Search query filter
    if (!filterVal) return true;
    return (
      (r.full_name && r.full_name.toLowerCase().includes(filterVal)) ||
      (r.phone && r.phone.includes(filterVal)) ||
      (r.booking_code && r.booking_code.toLowerCase().includes(filterVal)) ||
      (r.walkin_temp_code && r.walkin_temp_code.toLowerCase().includes(filterVal)) ||
      (r.ticket_code && r.ticket_code.toLowerCase().includes(filterVal)) ||
      (r.school && r.school.toLowerCase().includes(filterVal))
    );
  });

  if (countEl) {
    countEl.textContent = "พบ " + displayRows.length + " รายการ จากทั้งหมด " + walkinRows.length + " รายการ";
  }

  if (!displayRows.length) {
    feed.innerHTML = '<div style="text-align:center;padding:36px 12px;color:var(--text-3);font-size:13px;">ไม่พบรายการ Walk-in ตามเงื่อนไข</div>';
    return;
  }

  feed.innerHTML = displayRows
    .map((r) => {
      const isPending = r.payment_status === "รอชำระเงิน" || r.booking_status === "รอชำระเงินหน้างาน";
      const isCheck = r.is_checked_in;
      const roundLabel = valOr(r.ticket_type, "Walk-in");
      const payLabel =
        isPending
          ? "รอชำระหน้างาน"
          : r.payment_method === "qr_payment" || r.payment_method === "promptpay"
          ? "โอน QR" + (r.slip_ref && r.slip_ref !== "-" ? " (" + r.slip_ref + ")" : "")
          : r.payment_method === "cash"
          ? "เงินสด"
          : "ฟรี";

      const tempCode = r.walkin_temp_code || r.booking_code;

      return (
        '<div class="walkin-card-item' + (isPending ? ' is-pending' : '') + '">' +
          '<div class="walkin-card-head">' +
            '<div>' +
              '<div class="walkin-card-title">' +
                (isPending ? '<span class="chip chip-amber" style="font-family:var(--font-mono);font-size:11px;margin-right:6px;">' + esc(tempCode) + '</span>' : '') +
                esc(r.full_name) +
              '</div>' +
              '<div class="walkin-card-sub">' + esc(r.school) + ' · โทร ' + esc(r.phone) + '</div>' +
            '</div>' +
            '<div style="text-align: right;">' +
              '<b class="mono" style="color: var(--gold); font-size: 15px;">฿' + (Number(r.amount) || 0).toLocaleString("th-TH") + '</b>' +
              '<div style="font-size: 11px; color: ' + (isPending ? 'var(--amber)' : 'var(--text-3)') + ';">' + esc(payLabel) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="walkin-card-chips">' +
            '<span class="chip chip-mint"><span class="dot"></span>' + esc(roundLabel) + '</span>' +
            '<span class="chip chip-sky">' + esc(r.ticket_type_category || "นักเรียน") + '</span>' +
            (!isPending ? '<span class="chip chip-muted mono">' + esc(r.ticket_code || r.booking_code) + '</span>' : '') +
            (isPending
              ? '<span class="chip chip-amber"><span class="pulse-dot"></span>Self-Service รอตรวจรับเงิน</span>'
              : isCheck
              ? '<span class="chip chip-teal">' + icon("check-circle") + 'เข้างานแล้ว' + (r.checked_in_at ? ' (' + esc(r.checked_in_at) + ')' : '') + '</span>'
              : '<span class="chip chip-gold">' + icon("clock") + 'ยังไม่เข้างาน</span>') +
          '</div>' +
          '<div class="walkin-card-actions">' +
            (isPending
              ? '<button type="button" class="btn btn-primary btn-sm" data-action="wi-quick-approve" data-temp-code="' + esc(tempCode) + '">' +
                  icon("shopping-bag") + '💰 ตรวจรับเงินทันที' +
                '</button>'
              : (r.slip_image
                  ? '<button type="button" class="btn btn-secondary btn-sm" data-action="wi-view-slip" data-row-id="' + r.id + '">' +
                      icon("camera") + 'ดูสลิป' +
                    '</button>'
                  : '') +
                '<button type="button" class="btn btn-secondary btn-sm" data-action="wi-view-ticket" data-row-id="' + r.id + '">' +
                  icon("ticket") + 'ดูบัตรเข้างาน' +
                '</button>' +
                (isCheck
                  ? '<button type="button" class="btn btn-ghost btn-sm" style="color: var(--rose);" data-action="wi-toggle-check" data-row-id="' + r.id + '">' +
                      icon("undo") + 'ยกเลิกเข้างาน' +
                    '</button>'
                  : '<button type="button" class="btn btn-primary-soft btn-sm" data-action="wi-toggle-check" data-row-id="' + r.id + '">' +
                      icon("check") + 'เช็กอิน' +
                    '</button>')) +
            '<button type="button" class="btn btn-danger-soft btn-sm" data-action="wi-delete-attendee" data-row-id="' + r.id + '" data-booking-code="' + esc(tempCode) + '" data-name="' + esc(r.full_name) + '" style="margin-left:auto;">' +
              icon("trash") + 'ลบรายชื่อ' +
            '</button>' +
          '</div>' +
        '</div>'
      );
    })
    .join("");

  feed.querySelectorAll('[data-action="wi-quick-approve"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.tempCode;
      // Switch to Queue Lookup mode and load this candidate!
      const tabQueueBtn = $("wiTabQueueBtn");
      if (tabQueueBtn) tabQueueBtn.click();
      const qInput = $("wiQueueSearchInput");
      if (qInput) qInput.value = code;
      loadQueueCandidate(code);
    });
  });

  feed.querySelectorAll('[data-action="wi-view-slip"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const rowId = Number(btn.dataset.rowId);
      const row = cachedAttendees.find((r) => r.id === rowId);
      if (row && row.slip_image) {
        showSlipImageModal(row.slip_image, "สลิป " + row.booking_code + " · " + row.full_name);
      }
    });
  });

  feed.querySelectorAll('[data-action="wi-view-ticket"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const rowId = Number(btn.dataset.rowId);
      const row = cachedAttendees.find((r) => r.id === rowId);
      if (row) {
        const group = cachedAttendees.filter((r) => r.booking_code === row.booking_code);
        showWalkInTicketModal(row, group);
      }
    });
  });

  feed.querySelectorAll('[data-action="wi-toggle-check"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const rowId = Number(btn.dataset.rowId);
      const row = cachedAttendees.find((r) => r.id === rowId);
      if (row) {
        if (!row.is_checked_in && isPendingWalkInRow(row)) {
          showToast("ไม่สามารถเช็กอินได้: รายการ Walk-in นี้ยังไม่ได้ชำระเงินหน้างาน", "error");
          return;
        }
        await togglePersonCheckIn(row.id, !row.is_checked_in);
        renderWalkInSales();
      }
    });
  });

  feed.querySelectorAll('[data-action="wi-delete-attendee"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const rowId = Number(btn.dataset.rowId);
      const bookingCode = btn.dataset.bookingCode;
      const name = btn.dataset.name;
      deleteWalkInAttendee(rowId, bookingCode, name);
    });
  });
}

async function deleteWalkInAttendee(rowId, bookingCode, name) {
  const ok = await confirmDialog({
    title: "ลบรายชื่อ Walk-in?",
    message: 'ต้องการลบรายชื่อ "' + name + '"' + (bookingCode ? ' (รหัส ' + bookingCode + ')' : '') + ' ออกจากระบบใช่หรือไม่?\nข้อมูลจะถูกลบทั้งในเครื่องและเซิร์ฟเวอร์',
    confirmText: "ลบรายชื่อ",
    tone: "danger",
    icon: "trash",
  });
  if (!ok) return;

  const rowToDelete = cachedAttendees.find((r) => r.id === rowId);
  cachedAttendees = cachedAttendees.filter((r) => r.id !== rowId);
  saveLocalCache(cachedAttendees);

  if (supabaseClient && navigator.onLine) {
    try {
      if (rowId && rowId < 2000000000) {
        await supabaseClient.from("attendees").delete().eq("id", rowId);
      } else if (rowToDelete && rowToDelete.ticket_code) {
        await supabaseClient.from("attendees").delete().eq("ticket_code", rowToDelete.ticket_code);
      } else if (bookingCode) {
        await supabaseClient.from("attendees").delete().eq("booking_code", bookingCode);
      }
    } catch (e) {}
  }

  afterLocalChange();
  renderPendingQueueChips();
  renderWalkInSales();
  updateWalkInStats();
  renderStats();
  showToast('ลบรายชื่อ "' + name + '" เรียบร้อยแล้ว', "success");
}

function exportWalkInCsv() {
  const walkinRows = sortAttendeeRows(
    cachedAttendees.filter((r) => getRoundKey(r.ticket_type) === "walkin"),
    true
  );
  if (!walkinRows.length) {
    showToast("ยังไม่มีข้อมูลบัตร Walk-in สำหรับ Export", "warning");
    return;
  }
  const csvData = walkinRows.map((r, idx) => ({
    ลำดับ: idx + 1,
    รหัสการจอง: r.booking_code,
    คนที่: r.person_order || "1/1",
    ประเภท: r.ticket_type_category || "นักเรียน",
    รหัสบัตร: r.ticket_code,
    "ชื่อ-นามสกุล": r.full_name,
    "โรงเรียน/สถาบัน": r.school,
    เบอร์โทรศัพท์: r.phone,
    รอบบัตร: r.ticket_type,
    ยอดชำระ: r.amount || 0,
    วิธีชำระเงิน: r.payment_method || "-",
    สถานะการจอง: r.booking_status,
    สถานะเช็กอิน: r.is_checked_in ? "เข้างานแล้ว" : "ยังไม่เข้างาน",
    เวลาเช็กอิน: r.checked_in_at || "-",
    สตาฟผู้อนุมัติ: r.checked_in_by || "-",
    วันที่ออกบัตร: r.booking_date || "-",
  }));
  const csvStr = "\uFEFF" + Papa.unparse(csvData);
  const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "SMST_Walkin_Export_" + localDateISO() + ".csv";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 100);
  showToast("ดาวน์โหลดไฟล์ Walk-in CSV เรียบร้อยแล้ว", "success");
}
