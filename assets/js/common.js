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

// ทำความสะอาดและ Normalize ชื่อโรงเรียน (ตัดช่องว่างซ้ำซ้อน / อักขระล่องหน / nbsp)
function normalizeSchoolName(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // remove zero-width characters
    .replace(/\u00A0/g, " ")               // non-breaking space
    .trim()
    .replace(/\s+/g, " ")                 // collapse spaces
    .normalize("NFC");
}

// รวมรายชื่อโรงเรียนจาก schools.json เท่านั้น (ไม่ดึงจากข้อมูลเด็ก เพื่อป้องกันชื่อตีกัน)
function buildUniqueSchoolList(rawList) {
  const seen = new Set();
  const result = [];

  function add(raw) {
    const s = normalizeSchoolName(raw);
    if (!s || s === "-" || s === "อื่น ๆ" || s === "อื่นๆ" || s.toLowerCase() === "other") return;
    const key = s.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(s);
    }
  }

  if (Array.isArray(rawList)) rawList.forEach(add);
  return result;
}

// สำหรับ PostgREST ilike: กันไม่ให้ % และ _ ในข้อความกลายเป็น wildcard
function escapeLike(v) {
  return String(v || "").replace(/[\\%_]/g, (c) => "\\" + c);
}

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// ตรวจจับและดึงคอลัมน์ที่เลื่อนขยับจาก ID Line กลับเข้าที่ให้อัตโนมัติ (Auto-Heal)
function autoFixShiftedAttendeeRow(r) {
  if (!r) return r;
  const isChannelLike = (val) => {
    const s = String(val || "").toLowerCase();
    return s.includes("fb") || s.includes("facebook") || s.includes("ig") || s.includes("instagram") ||
           s.includes("tiktok") || s.includes("ติ๊กต๊อก") || s.includes("เพื่อน") || s.includes("โรงเรียน") ||
           s.includes("เฟส") || s.includes("ไอจี") || s.includes("openhouse") || s.includes("แม่") ||
           s.includes("พ่อ") || s.includes("line");
  };

  const isRelationLike = (val) => {
    const s = String(val || "").toLowerCase();
    return s.includes("มารดา") || s.includes("บิดา") || s.includes("แม่") || s.includes("พ่อ") ||
           s.includes("ผู้ปกครอง") || s.includes("ญาติ") || s.includes("พี่") || s.includes("น้า") ||
           s.includes("ป้า") || s.includes("ลุง") || s.includes("ตนเอง") || s.includes("สามี") ||
           s.includes("ภรรยา") || s.includes("ลูก") || s.includes("นักเรียน");
  };

  const isPhoneLike = (val) => {
    const s = String(val || "").replace(/\D/g, "");
    return s.length >= 9 && (s.startsWith("0") || s.startsWith("66"));
  };

  const lineIsPhone = isPhoneLike(r.line_id);
  const emPhoneIsRel = isRelationLike(r.emergency_phone);
  const targetIsChannel = isChannelLike(r.target_uni);
  const channelEmpty = !r.channel || r.channel === "-";

  if (lineIsPhone && (emPhoneIsRel || targetIsChannel || channelEmpty)) {
    r.channel = r.target_uni || "-";
    r.target_uni = r.emergency_relation || "-";
    r.emergency_relation = r.emergency_phone || "-";
    r.emergency_phone = r.line_id || "-";
    r.line_id = "-";
  }
  return r;
}

const SUPABASE_ALLOWED_ATTENDEE_COLS = [
  "booking_code", "person_order", "ticket_type_category", "ticket_code",
  "full_name", "school", "phone", "line_id", "emergency_phone", "emergency_relation",
  "target_uni", "channel", "ticket_type", "amount", "discount_code", "discount_amount",
  "contact_name", "contact_phone", "email", "booking_status", "payment_status",
  "booking_date", "booking_date_iso", "qr_code", "is_checked_in", "checked_in_at",
  "checked_in_by", "marketing_discount_used", "marketing_discount_used_at",
  "marketing_discount_used_by"
];

function toSupabaseAttendeePayload(row) {
  const payload = {};
  SUPABASE_ALLOWED_ATTENDEE_COLS.forEach((k) => {
    if (row[k] !== undefined && row[k] !== null) payload[k] = row[k];
  });
  if (!payload.person_order) payload.person_order = "1/1";
  if (!payload.channel) payload.channel = "Walk-in หน้างาน";
  if (!payload.contact_name) payload.contact_name = payload.full_name || "-";
  if (!payload.contact_phone) payload.contact_phone = payload.phone || "-";
  if (typeof payload.is_checked_in !== "boolean") payload.is_checked_in = false;
  if (typeof payload.marketing_discount_used !== "boolean") payload.marketing_discount_used = false;
  if (typeof row.id === "number" && row.id > 0 && row.id < 2000000000) {
    payload.id = row.id;
  }
  return payload;
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
  if (lower.includes("walk-in") || lower.includes("walk in") || lower.includes("walkin") || t.includes("หน้างาน")) return "walkin";
  if (lower.includes("early bird")) return "early";
  if (t.includes("เช้า") || lower.includes("morning")) return "morning";
  if (t.includes("บ่าย") || t.includes("เย็น") || lower.includes("afternoon")) return "afternoon";
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

function getBookingState(row) {
  if (!row) return { key: "unknown", tone: "muted", icon: "info", label: "-", detail: "-" };
  const status = valOr(row.booking_status, "-");
  const pay = valOr(row.payment_status, "-");
  if (status.startsWith("ยกเลิก")) return { key: "cancelled", tone: "rose", icon: "ban", label: "ยกเลิกแล้ว", detail: status };
  if (status === "รอชำระเงิน" || status === "รอชำระเงินหน้างาน" || isPendingWalkInRow(row)) {
    return { key: "unpaid", tone: "amber", icon: "clock", label: "รอชำระเงินหน้างาน", detail: status };
  }
  if (pay === "รอตรวจสอบ") return { key: "verifying", tone: "sky", icon: "history", label: "ชำระแล้ว · รอตรวจสอบ", detail: status };
  if (status === "อนุมัติแล้ว" || status === "ชำระเงินแล้ว" || pay === "ยืนยันแล้ว") {
    return { key: "confirmed", tone: "teal", icon: "check-circle", label: "ยืนยันการสมัครแล้ว", detail: status };
  }
  return { key: "unknown", tone: "muted", icon: "info", label: status, detail: status };
}

// ================= 3.1 WALKIN SETTINGS & CONTROLS =================
let inMemoryWalkInSettings = null;

function getWalkInSettings() {
  const cfg = (CONFIG.rounds && CONFIG.rounds.walkin) || {};
  const defaultMorning = (cfg.maxQuota && cfg.maxQuota.morning) || 150;
  const defaultAfternoon = (cfg.maxQuota && cfg.maxQuota.afternoon) || 150;
  const defaultPriceStudent = (cfg.price && cfg.price.student) || 529;
  const defaultPriceParent = (cfg.price && cfg.price.parent) || 259;

  try {
    const raw = localStorage.getItem("smst_walkin_settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      const res = {
        isOpen: parsed.isOpen !== false,
        morningOpen: parsed.morningOpen !== false,
        afternoonOpen: parsed.afternoonOpen !== false,
        maxQuotaMorning: typeof parsed.maxQuotaMorning === "number" ? Math.max(0, parsed.maxQuotaMorning) : defaultMorning,
        maxQuotaAfternoon: typeof parsed.maxQuotaAfternoon === "number" ? Math.max(0, parsed.maxQuotaAfternoon) : defaultAfternoon,
        priceStudent: typeof parsed.priceStudent === "number" ? Math.max(0, parsed.priceStudent) : defaultPriceStudent,
        priceParent: typeof parsed.priceParent === "number" ? Math.max(0, parsed.priceParent) : defaultPriceParent,
        updatedAt: parsed.updatedAt || null,
        updatedBy: parsed.updatedBy || null,
      };
      inMemoryWalkInSettings = res;
      return res;
    }
  } catch (e) {}

  if (inMemoryWalkInSettings) return inMemoryWalkInSettings;

  return {
    isOpen: true,
    morningOpen: true,
    afternoonOpen: true,
    maxQuotaMorning: defaultMorning,
    maxQuotaAfternoon: defaultAfternoon,
    priceStudent: defaultPriceStudent,
    priceParent: defaultPriceParent,
    updatedAt: null,
    updatedBy: null,
  };
}

function saveWalkInSettings(newSettings, adminName) {
  const current = getWalkInSettings();
  const merged = {
    ...current,
    ...newSettings,
    updatedAt: new Date().toLocaleDateString("th-TH") + " " + thaiTimeNow(),
    updatedBy: adminName || "Admin",
  };
  inMemoryWalkInSettings = merged;
  try {
    localStorage.setItem("smst_walkin_settings", JSON.stringify(merged));
  } catch (e) {}

  // 1. Sync to Supabase Cloud Database (ให้ทุกเครื่อง คนทั่วไป และเครื่องสตาฟทั้งหมดเห็นราคาตรงกันทันที)
  if (supabaseClient && navigator.onLine) {
    try {
      const payloadStr = JSON.stringify(merged);
      supabaseClient
        .from("staff_users")
        .update({ password: payloadStr })
        .eq("username", "__smst_settings__")
        .select()
        .then(({ data, error }) => {
          if (!error && (!data || data.length === 0)) {
            supabaseClient.from("staff_users").insert([{
              username: "__smst_settings__",
              password: payloadStr,
              full_name: "SMST Walkin Settings",
              institution: "SYSTEM",
              year_level: "0",
              display_name: "Walk-in Global Config",
              role: "system"
            }]).catch(() => {});
          }
        })
        .catch(() => {});
    } catch (e) {}
  }

  // 2. Sync to local node server (หากกำลังรัน node server.js อยู่)
  if (typeof fetch === "function") {
    fetch("/api/walkin-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(merged)
    }).catch(() => {});
  }

  window.dispatchEvent(new CustomEvent("smst:walkinsettingschange", { detail: merged }));
  return merged;
}

// Background sync from Cloud Supabase / local server / static walkin_settings.json
async function syncWalkInSettingsFromServer() {
  let serverSettings = null;

  // 1. ดึงจาก Supabase ก่อน (Cloud Database ซิงก์ได้ทุกเครื่องแบบ Realtime)
  if (supabaseClient && navigator.onLine) {
    try {
      const { data, error } = await supabaseClient
        .from("staff_users")
        .select("password")
        .eq("username", "__smst_settings__")
        .maybeSingle();

      if (!error && data && data.password) {
        try {
          const parsed = JSON.parse(data.password);
          if (parsed && typeof parsed === "object" && (parsed.priceStudent !== undefined || parsed.isOpen !== undefined)) {
            serverSettings = parsed;
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  // 2. หาก Supabase ไม่มีข้อมูลหรือออฟไลน์ ให้ลองดึงจาก Node API /api/walkin-settings
  if (!serverSettings && typeof fetch === "function") {
    try {
      const res = await fetch("/api/walkin-settings", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json === "object" && (json.priceStudent !== undefined || json.isOpen !== undefined)) {
          serverSettings = json;
        }
      }
    } catch (e) {}
  }

  // 3. Fallback สถิต: ดึงจากไฟล์ walkin_settings.json (ทำงานได้บน Vercel / GitHub Pages / Static Hosting)
  if (!serverSettings && typeof fetch === "function") {
    try {
      const res = await fetch("walkin_settings.json?v=" + Date.now(), { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json === "object" && (json.priceStudent !== undefined || json.isOpen !== undefined)) {
          serverSettings = json;
        }
      }
    } catch (e) {}
  }

  if (serverSettings) {
    const current = getWalkInSettings();
    const merged = { ...current, ...serverSettings };
    inMemoryWalkInSettings = merged;
    try {
      localStorage.setItem("smst_walkin_settings", JSON.stringify(merged));
    } catch (e) {}
    window.dispatchEvent(new CustomEvent("smst:walkinsettingschange", { detail: merged }));
    return merged;
  }
  return null;
}

// Run server sync immediately and on DOMContentLoaded
syncWalkInSettingsFromServer();
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    syncWalkInSettingsFromServer();
  });
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
  if (lower.includes("walk-in") || lower.includes("walk in") || lower.includes("walkin") || t.includes("หน้างาน")) {
    return { eligible: false, percent: 0, label: "รอบ Walk-in ไม่ร่วมรายการ Voucher", reason: "walkin" };
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

// ================= 8. GOOGLE SHEET CENTRAL BACKUP & SYNC =================
function getGoogleSheetUrl() {
  try {
    const saved = localStorage.getItem("smst_google_sheet_url");
    if (saved && saved.trim() !== "") return saved.trim();
  } catch (e) {}
  return (window.SMST_CONFIG && window.SMST_CONFIG.googleSheetWebAppUrl) ? window.SMST_CONFIG.googleSheetWebAppUrl.trim() : "";
}

function setGoogleSheetUrl(url) {
  try {
    if (!url || typeof url !== "string" || url.trim() === "") {
      localStorage.removeItem("smst_google_sheet_url");
    } else {
      localStorage.setItem("smst_google_sheet_url", url.trim());
    }
  } catch (e) {
    console.warn("Could not save Google Sheet URL to localStorage", e);
  }
}

/**
 * Format Date object to Bangkok timestamp string: "YYYY-MM-DD HH:mm:ss น."
 */
function formatBangkokTimestamp(d) {
  const date = d instanceof Date ? d : new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(date);

    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second} น.`;
  } catch (err) {
    return date.toISOString();
  }
}

/**
 * Asynchronously send an event to Google Sheet Web App (fire-and-forget, non-blocking)
 * @param {string} action - "CHECK_IN" | "VOUCHER" | "WALK_IN" | "SYNC_BATCH" | "FULL_SYNC"
 * @param {object} data - Event payload
 */
function sendToGoogleSheetBackup(action, data) {
  try {
    const url = getGoogleSheetUrl();
    if (!url) {
      return Promise.resolve(null);
    }

    const staffName = (typeof getStaffName === "function" ? getStaffName() : "") ||
                      (typeof staffIdentity !== "undefined" && staffIdentity ? staffIdentity.name : "") ||
                      "Staff-Desk";

    const payload = {
      action: action,
      staff_name: staffName,
      sent_at: formatBangkokTimestamp(new Date()),
      ...(data || {})
    };

    const bodyStr = JSON.stringify(payload);
    // W3C fetch spec limits keepalive to 64KB (65,536 bytes). Omit keepalive on large batch syncs.
    const useKeepAlive = bodyStr.length < 60000;

    // Use text/plain with stringified JSON to avoid CORS preflight options block
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: bodyStr,
      mode: "no-cors",
      keepalive: useKeepAlive
    }).then(() => {
      return { ok: true };
    }).catch((err) => {
      // Intentionally swallow errors so backup never delays or crashes scanner workflow
      console.warn("[GoogleSheetBackup] Non-blocking sync notice:", err && err.message);
      return null;
    });
  } catch (syncErr) {
    console.warn("[GoogleSheetBackup] Sync dispatch notice:", syncErr && syncErr.message);
    return Promise.resolve(null);
  }
}

/**
 * Ping Google Sheet Web App to verify connectivity
 * @returns {Promise<{ ok: boolean, message?: string, error?: string }>}
 */
async function pingGoogleSheetBackup() {
  const url = getGoogleSheetUrl();
  if (!url) {
    return { ok: false, error: "ยังไม่ได้ระบุ Web App URL" };
  }

  try {
    const pingUrl = url + (url.includes("?") ? "&" : "?") + "action=ping&_t=" + Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(pingUrl, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const data = await res.json();
    return { ok: Boolean(data.ok), message: data.message || "Online", timestamp: data.timestamp };
  } catch (err) {
    if (err.name === "AbortError") {
      return { ok: false, error: "การเชื่อมต่อหมดเวลา (Timeout 8s)" };
    }
    return { ok: false, error: err.message || "ไม่สามารถเชื่อมต่อได้" };
  }
}

/**
 * Fetch recovery data from Google Sheet (?action=export_recovery)
 * @returns {Promise<{ ok: boolean, attendees: Array, walkins: Array, error?: string }>}
 */
async function fetchFromGoogleSheetBackup() {
  const url = getGoogleSheetUrl();
  if (!url) {
    throw new Error("ยังไม่ได้ระบุ Web App URL");
  }

  const exportUrl = url + (url.includes("?") ? "&" : "?") + "action=export_recovery&_t=" + Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(exportUrl, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.error || "เกิดข้อผิดพลาดในการดึงข้อมูลจาก Google Sheet");
    }

    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("การดึงข้อมูลจาก Google Sheet หมดเวลา (Timeout 20s)");
    }
    throw err;
  }
}

