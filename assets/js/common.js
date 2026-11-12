// =====================================================================
//  SMST Open House 2026 — Shared helpers (ใช้ร่วมกันระหว่างหน้า landing และหน้าสตาฟ)
// =====================================================================
const SUPABASE_URL = "https://ebgauldhvwxoqczbdzic.supabase.co";
const SUPABASE_KEY = "sb_publishable_CWarN4yQwi30TiIFP6Utxw_OCkkdbem";
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const CONFIG = window.SMST_CONFIG || {};
const ROUND_ORDER = ["early", "morning", "afternoon", "walkin"];

// ================= 1. UTILITIES =================
function valOr(v, fallback) {
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim();
  return s !== "" ? s : fallback;
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(v) {
  return String(v === undefined || v === null ? "" : v).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}

// แปลงเบอร์ให้อยู่ในรูป 0XXXXXXXXX เพื่อเทียบกันได้ (รองรับ +66 / ขาดเลข 0 นำหน้า)
function normalizePhone(v) {
  let d = digitsOnly(v);
  if (d.startsWith("66") && d.length === 11) d = "0" + d.slice(2);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  return d;
}

// สำหรับ PostgREST ilike: กันไม่ให้ % และ _ ในข้อความกลายเป็น wildcard
function escapeLike(v) {
  return String(v || "").replace(/[\\%_]/g, (c) => "\\" + c);
}

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function localDateISO(d) {
  const x = d || new Date();
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
}

function formatEventDate(iso) {
  if (!iso) return null;
  const parts = String(iso).split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return iso;
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function thaiTimeNow() {
  return new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " น.";
}

// "08:45:12 น." → "08:45 น."
function shortClock(v) {
  const m = /(\d{1,2}):(\d{2})/.exec(v || "");
  return m ? m[1].padStart(2, "0") + ":" + m[2] + " น." : valOr(v, "-");
}

function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {}
}

// ================= 2. THEME (Night ↔ Lavender sky) =================
function getTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  writePref("smst_theme_mode", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#D9CCFF" : "#140B33");
  document.dispatchEvent(new CustomEvent("smst:themechange", { detail: theme }));
}

function toggleTheme() {
  setTheme(getTheme() === "light" ? "dark" : "light");
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ================= 3. รอบบัตร / ประเภทผู้สมัคร / สถานะการจอง =================
const ROUND_DEFAULTS = {
  early: { name: "รอบ Early Bird", short: "Early Bird", tone: "gold" },
  morning: { name: "รอบทั่วไป · เช้า", short: "ทั่วไป · เช้า", tone: "sky" },
  afternoon: { name: "รอบทั่วไป · บ่าย", short: "ทั่วไป · บ่าย", tone: "lav" },
  walkin: { name: "รอบ Walk-in", short: "Walk-in", tone: "mint" },
};

function normalizeTicketTypeText(rawType) {
  const s = valOr(rawType, "-");
  return s.replace(/รอบเย็น/g, "รอบบ่าย").replace(/\(เย็น\)/g, "(บ่าย)");
}

function getRoundKey(ticketTypeStr) {
  const t = normalizeTicketTypeText(ticketTypeStr);
  const lower = t.toLowerCase();
  if (lower.includes("early bird")) return "early";
  if (t.includes("เช้า") || lower.includes("morning")) return "morning";
  if (t.includes("บ่าย") || t.includes("เย็น") || lower.includes("afternoon")) return "afternoon";
  if (lower.includes("walk-in") || lower.includes("walk in") || t.includes("หน้างาน")) return "walkin";
  return "other";
}

function getRoundConfig(key) {
  return (CONFIG.rounds && CONFIG.rounds[key]) || {};
}

function getTicketRoundInfo(ticketTypeStr) {
  const key = getRoundKey(ticketTypeStr);
  if (key === "other") {
    return { key, name: normalizeTicketTypeText(ticketTypeStr), short: "รอบทั่วไป", tone: "muted" };
  }
  const def = ROUND_DEFAULTS[key];
  const cfg = getRoundConfig(key);
  return { key, name: cfg.label || def.name, short: def.short, tone: def.tone };
}

function getRoundMeta(key) {
  const def = ROUND_DEFAULTS[key] || { name: key, short: key, tone: "muted" };
  const cfg = getRoundConfig(key);
  return { key, name: cfg.label || def.name, short: def.short, tone: def.tone };
}

function roundChip(info, extraClass) {
  return '<span class="chip chip-' + info.tone + (extraClass ? " " + extraClass : "") + '"><span class="dot"></span>' + esc(info.short) + "</span>";
}

// "Early Bird · Duo pack (2 ใบ)" → "Duo pack (2 ใบ)"
function getPackageLabel(ticketType) {
  const t = normalizeTicketTypeText(ticketType);
  const i = t.indexOf("·");
  return i >= 0 ? t.slice(i + 1).trim() : t;
}

function describeRoundSchedule(key) {
  const r = getRoundConfig(key);
  let range = null;
  if (r.start && r.end) range = r.start + "–" + r.end + " น.";
  else if (r.start) range = "เริ่ม " + r.start + " น.";
  const slots =
     r.slots ||
     (r.arriveMorning && r.arriveAfternoon
       ? [
           { label: "รอบเช้า", arrive: r.arriveMorning },
           { label: "รอบบ่าย", arrive: r.arriveAfternoon },
         ]
       : null);
   return {
     arrive: r.arrive || null,
     arriveMorning: r.arriveMorning || null,
     arriveAfternoon: r.arriveAfternoon || null,
     slots,
     range,
     note: r.note || "",
   };
}

// เตือนเมื่อสแกนนอกช่วงเวลาของรอบ (เฉพาะวันงาน และเมื่อตั้งค่า checkInFrom/checkInUntil ไว้)
function getRoundTimeWarning(key) {
  const ev = CONFIG.event || {};
  const r = getRoundConfig(key);
  if (!ev.date || (!r.checkInFrom && !r.checkInUntil)) return null;
  const now = new Date();
  if (localDateISO(now) !== ev.date) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const label = r.label || (ROUND_DEFAULTS[key] || {}).name || "รอบนี้";
  const from = toMinutes(r.checkInFrom);
  const until = toMinutes(r.checkInUntil);
  if (from !== null && nowMin < from) return "ยังไม่ถึงเวลาเช็กอินของ" + label + " (เริ่ม " + r.checkInFrom + " น.)";
  if (until !== null && nowMin > until) return "เลยช่วงเช็กอินของ" + label + " แล้ว (ถึง " + r.checkInUntil + " น.)";
  return null;
}

function isParentRow(person) {
  return valOr(person.ticket_type_category, "").includes("ผู้ปกครอง");
}

function categoryChip(person) {
  return isParentRow(person)
    ? '<span class="chip chip-pink">' + icon("heart") + "ผู้ปกครอง</span>"
    : '<span class="chip chip-sky">' + icon("cap") + "นักเรียน</span>";
}

function isCancelledRow(row) {
  return valOr(row.booking_status, "").startsWith("ยกเลิก");
}

function getBookingState(row) {
  const status = valOr(row.booking_status, "-");
  const pay = valOr(row.payment_status, "-");
  if (status.startsWith("ยกเลิก")) return { key: "cancelled", tone: "rose", icon: "ban", label: "ยกเลิกแล้ว", detail: status };
  if (status === "รอชำระเงิน") return { key: "unpaid", tone: "amber", icon: "clock", label: "รอชำระเงิน", detail: status };
  if (pay === "รอตรวจสอบ") return { key: "verifying", tone: "sky", icon: "history", label: "ชำระแล้ว · รอตรวจสอบ", detail: status };
  if (status === "อนุมัติแล้ว" || status === "ชำระเงินแล้ว" || pay === "ยืนยันแล้ว") {
    return { key: "confirmed", tone: "teal", icon: "check-circle", label: "ยืนยันการสมัครแล้ว", detail: status };
  }
  return { key: "unknown", tone: "muted", icon: "info", label: status, detail: status };
}

// ================= 4. VOUCHER (สิทธิ์ส่วนลดซื้อของหน้างาน · แยกรายคน) =================
function getVoucherConfig() {
  return Object.assign(
    { enabled: true, showOnLanding: true, earlyBirdPercent: 10, generalPercent: 7, title: "Voucher ส่วนลดซื้อของหน้างาน", terms: [] },
    CONFIG.voucher || {}
  );
}

function getDiscountEligibility(person, groupSize) {
  const vc = getVoucherConfig();
  const t = normalizeTicketTypeText(person.ticket_type);
  const lower = t.toLowerCase();

  const hasParentInPackName = t.includes("ผู้ปกครอง");
  const isMultiPackName =
    lower.includes("duo") ||
    lower.includes("trio") ||
    lower.includes("group") ||
    t.includes("2 ใบ") ||
    t.includes("3 ใบ") ||
    t.includes("4 ใบ");

  const totalPeopleInBooking = groupSize || parseInt(String(valOr(person.person_order, "1/1")).split("/")[1] || "1", 10);
  const isEligibleGroup = totalPeopleInBooking >= 2 || hasParentInPackName || isMultiPackName;

  if (!vc.enabled) {
    return { eligible: false, percent: 0, label: "ปิดใช้งาน Voucher", reason: "disabled" };
  }
  if (!isEligibleGroup) {
    return { eligible: false, percent: 0, label: "ไม่มีสิทธิ์ Voucher (สมัครเดี่ยว 1 คน)", reason: "solo" };
  }
  if (lower.includes("early bird")) {
    return {
      eligible: true,
      percent: vc.earlyBirdPercent,
      label: "Voucher ส่วนลด " + vc.earlyBirdPercent + "% (Early Bird · ใช้ได้ 1 ครั้ง/คน)",
      reason: "early",
    };
  }
  if (lower.includes("walk-in") || lower.includes("walk in")) {
    return { eligible: false, percent: 0, label: "รอบ Walk-in ไม่ร่วมรายการ Voucher", reason: "walkin" };
  }
  return {
    eligible: true,
    percent: vc.generalPercent,
    label: "Voucher ส่วนลด " + vc.generalPercent + "% (รอบทั่วไป · ใช้ได้ 1 ครั้ง/คน)",
    reason: "general",
  };
}

// ================= 5. SORTING (เรียงตามเวลาจอง) =================
function parseThaiDateToISO(dateStr) {
  if (!dateStr) return "9999-99-99 99:99:99";
  const s = String(dateStr).trim();
  const parts = s.split(" ");
  const dParts = parts[0].split("/");
  if (dParts.length === 3) {
    const day = dParts[0].padStart(2, "0");
    const month = dParts[1].padStart(2, "0");
    const year = dParts[2];
    const timePart = parts[1] ? parts[1] : "00:00:00";
    return year + "-" + month + "-" + day + " " + timePart;
  }
  return s;
}

function parsePersonOrderNum(orderStr) {
  if (!orderStr) return 1;
  const num = parseInt(String(orderStr).split("/")[0], 10);
  return isNaN(num) ? 1 : num;
}

function sortAttendeeRows(rows, asc) {
  const isAsc = asc !== false;
  return rows.slice().sort((a, b) => {
    const isoA = a.booking_date_iso ? a.booking_date_iso : parseThaiDateToISO(a.booking_date);
    const isoB = b.booking_date_iso ? b.booking_date_iso : parseThaiDateToISO(b.booking_date);
    if (isoA !== isoB) {
      return isAsc ? isoA.localeCompare(isoB) : isoB.localeCompare(isoA);
    }
    const codeA = valOr(a.booking_code, "");
    const codeB = valOr(b.booking_code, "");
    if (codeA !== codeB) {
      return codeA.localeCompare(codeB);
    }
    return parsePersonOrderNum(a.person_order) - parsePersonOrderNum(b.person_order);
  });
}

// ================= 6. QR CODE (SVG, ใช้ qrcode-generator) =================
function qrSvg(text, opts) {
  if (typeof qrcode !== "function") return "";
  const o = opts || {};
  const qr = qrcode(0, o.ecc || "M");
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  const m = o.margin === undefined ? 2 : o.margin;
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += "M" + (c + m) + " " + (r + m) + "h1v1h-1z";
    }
  }
  const size = n + m * 2;
  return (
    '<svg class="qr-svg" viewBox="0 0 ' + size + " " + size + '" shape-rendering="crispEdges" role="img" aria-label="QR ' + esc(text) + '">' +
    '<rect width="' + size + '" height="' + size + '" fill="#FFFFFF"/><path d="' + d + '" fill="#14102E"/></svg>'
  );
}

// ================= 7. TOAST & DIALOG =================
const TOAST_ICONS = { success: "check-circle", error: "x-circle", warning: "alert", info: "info" };

function showToast(message, tone, opts) {
  const region = document.getElementById("toastRegion");
  if (!region) return;
  const t = tone || "info";
  const el = document.createElement("div");
  el.className = "toast toast-" + t;
  el.setAttribute("role", t === "error" ? "alert" : "status");
  el.innerHTML = icon(TOAST_ICONS[t] || "info") + "<span>" + esc(message) + "</span>";
  region.appendChild(el);
  while (region.children.length > 3) region.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 260);
  }, (opts && opts.duration) || 3200);
}

let modalStack = [];

function openModal(innerHtml, opts) {
  const o = opts || {};
  const root = document.getElementById("modalRoot") || document.body;
  const lastFocus = document.activeElement;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML =
    '<div class="modal ' + (o.className || "") + '" role="dialog" aria-modal="true"' +
    (o.label ? ' aria-label="' + esc(o.label) + '"' : "") + ">" + innerHtml + "</div>";
  root.appendChild(backdrop);
  document.body.classList.add("has-modal");

  const modal = backdrop.firstElementChild;
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    backdrop.classList.add("is-leaving");
    modalStack = modalStack.filter((m) => m !== handle);
    if (!modalStack.length) document.body.classList.remove("has-modal");
    setTimeout(() => backdrop.remove(), 180);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    if (o.onClose) o.onClose(result);
  };
  const handle = { el: modal, close };
  modalStack.push(handle);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop && o.dismissible !== false) close(null);
    const btn = e.target.closest("[data-modal-close]");
    if (btn) close(btn.dataset.modalClose || null);
  });

  const focusTarget = modal.querySelector("[autofocus], input, .btn-primary, button");
  if (focusTarget) setTimeout(() => focusTarget.focus({ preventScroll: true }), 30);
  return handle;
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalStack.length) modalStack[modalStack.length - 1].close(null);
});

// confirmDialog({ title, message, confirmText, tone: "primary"|"danger", requireText }) → Promise<boolean>
function confirmDialog(opts) {
  const o = opts || {};
  const tone = o.tone === "danger" ? "btn-danger" : "btn-primary";
  return new Promise((resolve) => {
    const needText = Boolean(o.requireText);
    const handle = openModal(
      '<div class="modal-icon tone-' + (o.tone === "danger" ? "rose" : "gold") + '">' + icon(o.icon || (o.tone === "danger" ? "alert" : "info")) + "</div>" +
        '<h2 class="modal-title">' + esc(o.title || "ยืนยันการทำรายการ") + "</h2>" +
        (o.message ? '<p class="modal-text">' + esc(o.message) + "</p>" : "") +
        (needText
          ? '<label class="field"><span>พิมพ์ <b class="mono">' + esc(o.requireText) + '</b> เพื่อยืนยัน</span><input class="input" data-confirm-input autocomplete="off" autocapitalize="characters" /></label>'
          : "") +
        '<div class="modal-actions">' +
        '<button type="button" class="btn btn-secondary" data-modal-close="cancel">' + esc(o.cancelText || "ยกเลิก") + "</button>" +
        '<button type="button" class="btn ' + tone + '" data-confirm-ok' + (needText ? " disabled" : "") + ">" + esc(o.confirmText || "ยืนยัน") + "</button>" +
        "</div>",
      { className: "modal-confirm", label: o.title, onClose: (r) => resolve(r === "ok") }
    );
    const okBtn = handle.el.querySelector("[data-confirm-ok]");
    const input = handle.el.querySelector("[data-confirm-input]");
    if (input) {
      input.addEventListener("input", () => {
        okBtn.disabled = input.value.trim().toUpperCase() !== String(o.requireText).toUpperCase();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !okBtn.disabled) handle.close("ok");
      });
    }
    okBtn.addEventListener("click", () => handle.close("ok"));
  });
}
