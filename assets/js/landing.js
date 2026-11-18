// =====================================================================
//  Landing page — น้อง ๆ เช็กได้ว่าสมัครรอบไหน ต้องมากี่โมง สถานะเช็กอิน และ Voucher
//  ค้นหาได้เฉพาะ "เบอร์โทร" หรือ "รหัสการจอง / รหัสบัตร" แบบตรงตัว (ไม่เปิดค้นหาด้วยชื่อ)
//  และดึงเฉพาะคอลัมน์ที่จำเป็น — ไม่ดึงเบอร์โทร / ผู้ติดต่อฉุกเฉิน / อีเมล มาแสดง
// =====================================================================
const PUBLIC_FIELDS = [
  "id",
  "booking_code",
  "person_order",
  "ticket_type",
  "ticket_type_category",
  "ticket_code",
  "qr_code",
  "full_name",
  "booking_status",
  "payment_status",
  "is_checked_in",
  "checked_in_at",
  "marketing_discount_used",
  "marketing_discount_used_at",
  "booking_date",
  "booking_date_iso",
].join(",");

let lastResultRows = [];
let lastGroupSizes = {};

// ================= 1. INIT =================
document.addEventListener("DOMContentLoaded", () => {
  const ev = CONFIG.event || {};
  if (ev.organizer) {
    document.getElementById("organizerText").textContent = ev.organizer;
    document.getElementById("footerOrganizer").textContent = ev.organizer;
  }

  renderHeroMeta();
  renderSchedule();
  renderFooterLinks();
  initWalkInSelfService();

  if (!getVoucherConfig().enabled || !getVoucherConfig().showOnLanding) {
    document.querySelectorAll("[data-voucher-only]").forEach((el) => el.remove());
  }

  // สตาฟที่ล็อกอินค้างไว้ในเครื่องนี้ → ปุ่มมุมขวาบนพาไปหน้าสตาฟได้ทันที
  if (readPref("smst_current_user", null)) {
    document.getElementById("staffLinkLabel").textContent = "ไปหน้าสตาฟ";
  }

  document.getElementById("lookupForm").addEventListener("submit", (e) => {
    e.preventDefault();
    runLookup(document.getElementById("lookupInput").value);
  });

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (action === "toggle-theme") toggleTheme();
    if (action === "show-qr") openQrModal(Number(el.dataset.id));
    if (action === "new-search") focusLookup();
    if (action === "open-walkin-modal") openWalkinSelfModal();
    if (action === "lookup-walkin-queue") openLookupWalkinQueueModal();
  });

  const header = document.getElementById("siteHeader");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ลิงก์ตรง เช่น /?code=SMST-XXXXXXXX หรือ /?q=...
  const params = new URLSearchParams(location.search);
  const codeParam = params.get("code") || params.get("q");
  if (codeParam && /^[A-Za-z0-9-]{3,32}$/.test(codeParam)) {
    document.getElementById("lookupInput").value = codeParam;
    runLookup(codeParam);
  }
});

function focusLookup() {
  const input = document.getElementById("lookupInput");
  document.getElementById("lookupForm").scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => {
    input.focus({ preventScroll: true });
    input.select();
  }, 350);
}

// ================= 2. EVENT INFO (วัน / สถานที่ / รอบ) =================
function renderHeroMeta() {
  const ev = CONFIG.event || {};
  const dateText = formatEventDate(ev.date);
  const pills = [];
  pills.push(
    '<span class="meta-pill' + (dateText ? "" : " is-tba") + '">' + icon("calendar") +
      (dateText ? esc(dateText) : "วันงาน: รอประกาศ") + "</span>"
  );
  if (ev.venue && ev.mapUrl) {
    pills.push(
      '<a class="meta-pill" href="' + esc(ev.mapUrl) + '" target="_blank" rel="noopener">' + icon("map-pin") + esc(ev.venue) + icon("external-link") + "</a>"
    );
  } else {
    pills.push(
      '<span class="meta-pill' + (ev.venue ? "" : " is-tba") + '">' + icon("map-pin") + (ev.venue ? esc(ev.venue) : "สถานที่: รอประกาศ") + "</span>"
    );
  }
  document.getElementById("heroMeta").innerHTML = pills.join("");
}

function renderSchedule() {
  const cards = ROUND_ORDER.filter((key) => getRoundConfig(key).showOnLanding !== false).map((key) => {
    const meta = getRoundMeta(key);
    const sched = describeRoundSchedule(key);
    const slots =
      sched.slots && sched.slots.length
        ? sched.slots
        : sched.arrive
        ? [{ label: key === "afternoon" ? "รอบบ่าย" : "รอบเช้า", arrive: sched.arrive }]
        : [{ label: key === "afternoon" ? "รอบบ่าย" : "รอบเช้า", arrive: null }];

    const isSingle = slots.length === 1;
    const timeHtml =
      '<div class="round-card-slots' + (isSingle ? " is-single" : "") + '">' +
      slots
        .map(
          (s) =>
            '<div class="round-slot">' +
              (s.label ? '<span class="round-slot-label">' + esc(s.label) + "</span>" : "") +
              (s.arrive
                ? '<span class="round-slot-time">' + esc(s.arrive) + "<small>น.</small></span>"
                : '<span class="round-slot-time is-tba">รอประกาศ</span>') +
            "</div>"
        )
        .join("") +
      "</div>";
    return (
      '<article class="round-card card tone-' + meta.tone + '">' +
        "<div>" + roundChip(meta) + "</div>" +
        "<h3>" + esc(meta.name) + "</h3>" +
        '<p class="kicker">' + icon("clock") + "ควรมาถึง</p>" +
        timeHtml +
        (sched.range ? "<p>ช่วงกิจกรรม " + esc(sched.range) + "</p>" : "") +
        (sched.note ? "<p>" + esc(sched.note) + "</p>" : "") +
      "</article>"
    );
  });
  document.getElementById("roundGrid").innerHTML = cards.join("");
}

function renderFooterLinks() {
  const c = CONFIG.contact || {};
  const links = [
    ["facebook", "Facebook", "link"],
    ["instagram", "Instagram", "link"],
    ["line", "LINE", "message"],
  ]
    .filter(([key]) => c[key])
    .map(
      ([key, label, ic]) =>
        '<a class="btn btn-secondary btn-sm" href="' + esc(c[key]) + '" target="_blank" rel="noopener">' + icon(ic) + esc(label) + "</a>"
    );
  if (links.length) document.getElementById("footerLinks").insertAdjacentHTML("afterbegin", links.join(""));
}

// ================= 3. LOOKUP =================
function classifyQuery(raw) {
  const q = String(raw || "").trim();
  const compact = q.replace(/[\s-]/g, "");
  if (/^\+?\d{9,12}$/.test(compact) && compact.replace(/\D/g, "").length >= 9) {
    return { kind: "phone", value: normalizePhone(compact) };
  }
  const code = q.replace(/\s+/g, "").toUpperCase();
  if (/^[A-Z0-9-]{4,32}$/.test(code)) return { kind: "code", value: code };
  return { kind: "invalid" };
}

// รูปแบบเบอร์ที่พบในไฟล์ CSV จริง: 0812345678 / 081-234-5678 / 081 234 5678 / 08-1234-5678 / 812345678
function phoneVariants(local) {
  if (local.length !== 10) return [local];
  const v = new Set([
    local,
    local.slice(1),
    local.slice(0, 3) + "-" + local.slice(3, 6) + "-" + local.slice(6),
    local.slice(0, 3) + " " + local.slice(3, 6) + " " + local.slice(6),
    local.slice(0, 2) + "-" + local.slice(2, 6) + "-" + local.slice(6),
    "+66" + local.slice(1),
    "66" + local.slice(1),
  ]);
  return Array.from(v);
}

async function findMatches(query) {
  if (query.kind === "phone") {
    const list = phoneVariants(query.value).map((v) => '"' + v + '"').join(",");
    return supabaseClient
      .from("attendees")
      .select("id, booking_code")
      .or("phone.in.(" + list + "),contact_phone.in.(" + list + ")")
      .limit(60);
  }
  const c = escapeLike(query.value);
  return supabaseClient
    .from("attendees")
    .select("id, booking_code")
    .or("ticket_code.ilike." + c + ",qr_code.ilike." + c + ",booking_code.ilike." + c)
    .limit(60);
}

function setLookupError(message) {
  const el = document.getElementById("lookupError");
  if (!message) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.innerHTML = icon("alert") + "<span>" + esc(message) + "</span>";
  el.hidden = false;
}

async function runLookup(raw) {
  const resultsEl = document.getElementById("results");
  const btn = document.getElementById("lookupBtn");
  const query = classifyQuery(raw);
  setLookupError("");

  if (query.kind === "invalid") {
    setLookupError(
      String(raw || "").trim()
        ? "กรุณากรอกเบอร์โทร 10 หลัก หรือรหัสการจอง / รหัสบัตร (เช่น SMST-XXXXXXXX) — ระบบไม่ค้นหาด้วยชื่อเพื่อความเป็นส่วนตัว"
        : "กรุณากรอกเบอร์โทร หรือรหัสการจอง / รหัสบัตร"
    );
    return;
  }
  btn.disabled = true;
  resultsEl.innerHTML = '<div class="card results-loading"><span class="spinner"></span>กำลังค้นหาการสมัคร...</div>';
  scrollToResults();

  try {
    let rows = [];
    let matchedIds = new Set();
    let found = false;

    if (supabaseClient && navigator.onLine) {
      try {
        const { data: matches, error } = await findMatches(query);
        if (!error && matches && matches.length > 0) {
          const codes = Array.from(new Set(matches.map((m) => m.booking_code))).slice(0, 10);
          const { data: serverRows, error: groupError } = await supabaseClient
            .from("attendees")
            .select(PUBLIC_FIELDS)
            .in("booking_code", codes);
          if (!groupError && serverRows && serverRows.length > 0) {
            rows = serverRows;
            matchedIds = new Set(matches.map((m) => m.id));
            found = true;
          }
        }
      } catch (onlineErr) {
        // Fallback to local
      }
    }

    // ตรวจสอบข้อมูลในแคชเครื่อง (รองรับโหมดออฟไลน์ หรือบัตร Walk-in ที่เพิ่งออกในเครื่องนี้)
    if (!found) {
      try {
        const localData = JSON.parse(localStorage.getItem("smst_attendees_cache") || "[]");
        if (localData && localData.length > 0) {
          const matchedCodes = new Set();
          if (query.kind === "phone") {
            const variants = phoneVariants(query.value).map((v) => normalizePhone(v));
            localData.forEach((r) => {
              if (variants.includes(normalizePhone(r.phone)) || variants.includes(normalizePhone(r.contact_phone))) {
                matchedCodes.add(r.booking_code);
                matchedIds.add(r.id);
              }
            });
          } else {
            const qVal = query.value.toLowerCase().replace(/\s+/g, "");
            localData.forEach((r) => {
              const tCode = String(r.ticket_code || "").toLowerCase().replace(/\s+/g, "");
              const bCode = String(r.booking_code || "").toLowerCase().replace(/\s+/g, "");
              const qCode = String(r.qr_code || "").toLowerCase().replace(/\s+/g, "");
              if (tCode === qVal || bCode === qVal || qCode === qVal || tCode.includes(qVal) || bCode.includes(qVal)) {
                matchedCodes.add(r.booking_code);
                matchedIds.add(r.id);
              }
            });
          }
          if (matchedCodes.size > 0) {
            rows = localData.filter((r) => matchedCodes.has(r.booking_code));
            found = true;
          }
        }
      } catch (localErr) {}
    }

    if (!found || rows.length === 0) {
      renderNotFound(query);
      return;
    }

    renderResults(rows, matchedIds);
  } catch (err) {
    resultsEl.innerHTML = "";
    setLookupError("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    showToast("เชื่อมต่อระบบไม่สำเร็จ", "error");
  } finally {
    btn.disabled = false;
  }
}

function scrollToResults() {
  const el = document.getElementById("results");
  requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
}

// ================= 4. RESULTS =================
function renderNotFound(query) {
  const what = query.kind === "phone" ? "เบอร์โทรนี้" : "รหัสนี้";
  document.getElementById("results").innerHTML =
    '<div class="card">' +
      '<div class="empty">' +
        '<div class="empty-art tone-rose" style="color: var(--rose); background: var(--rose-soft); border-color: var(--rose-line)">' + icon("search") + "</div>" +
        '<p class="empty-title">ไม่พบการสมัครจาก' + what + "</p>" +
        '<p class="empty-text">ลองตรวจสอบตัวเลข/ตัวอักษรอีกครั้ง หรือค้นหาด้วยรหัสการจองจากอีเมลยืนยัน ' +
          "ถ้ายังไม่พบ ติดต่อสตาฟฝ่ายทะเบียนที่หน้างานได้เลย</p>" +
        '<button type="button" class="btn btn-secondary" data-action="new-search">' + icon("search") + "ค้นหาใหม่</button>" +
      "</div>" +
    "</div>";
}

function renderResults(rows, matchedIds) {
  const groups = {};
  rows.forEach((r) => {
    (groups[r.booking_code] = groups[r.booking_code] || []).push(r);
  });
  const bookings = Object.values(groups)
    .map((g) => sortAttendeeRows(g, true))
    .sort((a, b) => {
      // การจองที่ยังใช้งานได้ขึ้นก่อนการจองที่ถูกยกเลิก
      const ca = isCancelledRow(a[0]) ? 1 : 0;
      const cb = isCancelledRow(b[0]) ? 1 : 0;
      return ca - cb || valOr(a[0].booking_date_iso, "").localeCompare(valOr(b[0].booking_date_iso, ""));
    });

  lastResultRows = rows;
  lastGroupSizes = {};
  bookings.forEach((g) => {
    lastGroupSizes[g[0].booking_code] = g.length;
  });

  const head =
    '<div class="card results-head">' +
      "<div><h2>พบ " + bookings.length + " การจอง</h2>" +
      '<p class="muted" style="font-size:13px">กด QR เพื่อเปิดรหัสสำหรับเช็กอินที่จุดลงทะเบียน</p></div>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-action="new-search">' + icon("search") + "ค้นหาใหม่</button>" +
    "</div>";

  document.getElementById("results").innerHTML = head + bookings.map((g) => renderBookingCard(g, matchedIds)).join("");
}

function renderBookingCard(rows, matchedIds) {
  const first = rows[0];
  const round = getTicketRoundInfo(first.ticket_type);
  const sched = describeRoundSchedule(round.key);
  const state = getBookingState(first);
  const ev = CONFIG.event || {};
  const total = rows.length;
  const checked = rows.filter((r) => r.is_checked_in).length;
  const someMatched = rows.some((r) => matchedIds.has(r.id)) && !rows.every((r) => matchedIds.has(r.id));

  const dateText = formatEventDate(ev.date);
  const venueHtml = ev.venue
    ? esc(ev.venue) + (ev.mapUrl ? ' · <a href="' + esc(ev.mapUrl) + '" target="_blank" rel="noopener">แผนที่</a>' : "")
    : null;

  let note = "";
  if (state.key === "cancelled") {
    note = noteBanner("rose", "ban", "การจองนี้ถูกยกเลิกแล้ว", state.detail + " — บัตรนี้ใช้เข้างานไม่ได้ หากคิดว่าผิดพลาดกรุณาติดต่อทีมงาน");
  } else if (state.key === "unpaid") {
    note = noteBanner("amber", "clock", "ยังไม่ได้ชำระเงิน", "กรุณาชำระเงินให้เรียบร้อยเพื่อยืนยันสิทธิ์ ไม่เช่นนั้นการจองอาจถูกยกเลิกอัตโนมัติ");
  } else if (state.key === "verifying") {
    note = noteBanner("sky", "history", "ได้รับการชำระเงินแล้ว · รอเจ้าหน้าที่ตรวจสอบ", "ไม่ต้องทำอะไรเพิ่ม ระบบจะยืนยันให้อัตโนมัติเมื่อตรวจสอบเสร็จ");
  } else if (checked === total && total > 0) {
    note = noteBanner("teal", "check-circle", "เช็กอินเข้างานครบทุกคนแล้ว", "ขอให้สนุกกับ SMST Open House 2026 นะ!");
  }

  return (
    '<article class="booking card tone-' + round.tone + '">' +
      '<header class="booking-head">' +
        '<div class="booking-round">' +
          '<span class="round-orb" aria-hidden="true"></span>' +
          "<div>" +
            '<p class="kicker">รอบที่สมัคร</p>' +
            '<h3 class="booking-round-name">' + esc(round.name) + "</h3>" +
            '<p class="booking-sub">' + esc(getPackageLabel(first.ticket_type)) + "</p>" +
          "</div>" +
        "</div>" +
        '<span class="chip chip-lg chip-' + state.tone + '">' + icon(state.icon) + esc(state.label) + "</span>" +
      "</header>" +

      '<div class="time-panel">' +
        '<div class="time-hero">' +
          '<p class="kicker">' + icon("clock") + "เวลาที่ต้องมาถึง</p>" +
          (sched.arrive
            ? '<p class="time-value">' + esc(sched.arrive) + "<small>น.</small></p>"
            : '<p class="time-value is-tba">รอประกาศ</p>') +
          '<p class="time-range">' +
            (sched.range ? "ช่วงกิจกรรม " + esc(sched.range) : sched.arrive ? "" : "ทีมงานจะแจ้งเวลาอย่างเป็นทางการอีกครั้ง") +
          "</p>" +
          (sched.note ? '<p class="time-range">' + esc(sched.note) + "</p>" : "") +
        "</div>" +
        '<dl class="time-facts">' +
          "<div><dt>" + icon("calendar") + "วันงาน</dt><dd" + (dateText ? "" : ' class="is-tba"') + ">" + (dateText ? esc(dateText) : "รอประกาศ") + "</dd></div>" +
          "<div><dt>" + icon("map-pin") + "สถานที่</dt><dd" + (venueHtml ? "" : ' class="is-tba"') + ">" + (venueHtml || "รอประกาศ") + "</dd></div>" +
          "<div><dt>" + icon("ticket") + "รหัสการจอง</dt><dd class=\"mono\">" + esc(first.booking_code) + "</dd></div>" +
        "</dl>" +
      "</div>" +

      (note ? '<div class="booking-note">' + note + "</div>" : "") +

      '<div class="members">' +
        '<div class="members-head">' +
          '<p class="kicker">' + icon("users") + "ผู้เข้าร่วมในการจองนี้ " + total + " คน</p>" +
          '<p class="kicker">' + icon("user-check") + "เช็กอินแล้ว " + checked + "/" + total + "</p>" +
        "</div>" +
        '<ul class="member-list">' + rows.map((r) => renderMember(r, someMatched && matchedIds.has(r.id), state)).join("") + "</ul>" +
      "</div>" +

      renderVoucher(rows, state) +
    "</article>"
  );
}

function noteBanner(tone, ic, title, sub) {
  return (
    '<div class="banner tone-' + tone + '">' + icon(ic) +
      '<div><p class="banner-title">' + esc(title) + '</p><p class="banner-sub">' + esc(sub) + "</p></div>" +
    "</div>"
  );
}

function getEntryCode(r) {
  return valOr(r.ticket_code, valOr(r.qr_code, r.booking_code));
}

function renderMember(r, isYou, state) {
  const parent = isParentRow(r);
  const ticket = valOr(r.ticket_code, "");
  const canShowQr = state.key !== "cancelled";
  return (
    '<li class="member' + (isYou ? " is-you" : "") + '">' +
      '<span class="icon-tile ' + (parent ? "tone-pink" : "tone-sky") + '">' + icon(parent ? "heart" : "cap") + "</span>" +
      '<div class="member-main">' +
        '<p class="member-name">' + esc(valOr(r.full_name, "-")) + (isYou ? '<span class="chip chip-solid-gold">คุณ</span>' : "") + "</p>" +
        '<p class="member-meta">' +
          "<span>" + (parent ? "ผู้ปกครอง" : "นักเรียน") + " · คนที่ " + esc(valOr(r.person_order, "1/1")) + "</span>" +
          (ticket ? '<span class="mono">' + esc(ticket) + "</span>" : "<span>ยังไม่ออกรหัสบัตร</span>") +
        "</p>" +
      "</div>" +
      '<div class="member-side">' +
        (r.is_checked_in
          ? '<span class="chip chip-teal">' + icon("check") + "เข้างานแล้ว " + esc(shortClock(r.checked_in_at)) + "</span>"
          : '<span class="chip chip-muted">ยังไม่เช็กอิน</span>') +
        (canShowQr
          ? '<button type="button" class="btn btn-secondary btn-sm" data-action="show-qr" data-id="' + esc(r.id) + '">' + icon("qr") + "QR</button>"
          : "") +
      "</div>" +
    "</li>"
  );
}

function renderVoucher(rows, state) {
  const vc = getVoucherConfig();
  if (!vc.enabled || !vc.showOnLanding || state.key === "cancelled") return "";

  const disc = getDiscountEligibility(rows[0], rows.length);
  if (!disc.eligible) {
    return (
      '<div class="voucher-none">' + icon("gift") +
        "<div><b>ไม่มี Voucher สำหรับการจองนี้</b><p>" + esc(disc.label) + "</p></div>" +
      "</div>"
    );
  }

  const people = rows
    .map(
      (r) =>
        "<li><span>" + esc(valOr(r.full_name, "-")) + "</span>" +
        (r.marketing_discount_used
          ? '<span class="chip chip-muted">' + icon("check") + "ใช้แล้ว " + esc(shortClock(r.marketing_discount_used_at)) + "</span>"
          : '<span class="chip chip-gold">' + icon("sparkles") + "พร้อมใช้</span>") +
        "</li>"
    )
    .join("");
  const terms = (vc.terms || []).map((t) => "<li>" + esc(t) + "</li>").join("");

  return (
    '<section class="voucher" aria-label="' + esc(vc.title) + '">' +
      '<div class="voucher-stub">' +
        '<p class="voucher-kicker">VOUCHER</p>' +
        '<p class="voucher-value">' + esc(disc.percent) + "<span>%</span></p>" +
        '<p class="voucher-stub-sub">ส่วนลดซื้อของหน้างาน</p>' +
      "</div>" +
      '<div class="voucher-body">' +
        '<p class="voucher-title">' + icon("gift") + esc(vc.title) + "</p>" +
        '<ul class="voucher-people">' + people + "</ul>" +
        (terms ? '<ul class="voucher-terms">' + terms + "</ul>" : "") +
      "</div>" +
    "</section>"
  );
}

// ================= 5. QR MODAL =================
function openQrModal(rowId) {
  const r = lastResultRows.find((x) => x.id === rowId);
  if (!r) return;
  const code = getEntryCode(r);
  const round = getTicketRoundInfo(r.ticket_type);
  const vc = getVoucherConfig();
  const disc = getDiscountEligibility(r, lastGroupSizes[r.booking_code]);
  const showVoucher = vc.enabled && vc.showOnLanding && disc.eligible;

  const chips = [roundChip(round)];
  chips.push(
    r.is_checked_in
      ? '<span class="chip chip-teal">' + icon("check") + "เข้างานแล้ว " + esc(shortClock(r.checked_in_at)) + "</span>"
      : '<span class="chip chip-muted">ยังไม่เช็กอิน</span>'
  );
  if (showVoucher) {
    chips.push(
      r.marketing_discount_used
        ? '<span class="chip chip-muted">' + icon("gift") + "Voucher ใช้แล้ว</span>"
        : '<span class="chip chip-gold">' + icon("gift") + "Voucher " + esc(disc.percent) + "% พร้อมใช้</span>"
    );
  }

  openModal(
    '<div class="qr-modal">' +
      '<p class="kicker" style="justify-content:center">' + icon("qr") + "QR สำหรับเช็กอิน" + (showVoucher ? " และ Voucher" : "") + "</p>" +
      "<h2>" + esc(valOr(r.full_name, "-")) + "</h2>" +
      '<div class="qr-box">' + qrSvg(code, { ecc: "M", margin: 2 }) + "</div>" +
      '<p class="qr-code-text mono">' + esc(code) + "</p>" +
      '<div class="qr-chips">' + chips.join("") + "</div>" +
      '<p class="qr-tip">แสดง QR นี้ให้สตาฟที่จุดลงทะเบียนสแกน' + (showVoucher ? " และใช้ QR เดิมที่บูธ Marketing เพื่อรับส่วนลด" : "") +
        " · เพิ่มความสว่างหน้าจอจะช่วยให้สแกนเร็วขึ้น</p>" +
      '<button type="button" class="btn btn-secondary btn-block" data-modal-close>ปิด</button>' +
    "</div>",
    { label: "QR ของ " + valOr(r.full_name, "") }
  );
}


// ================= 6. WALK-IN SELF-SERVICE (IN-QUEUE REGISTRATION) =================
let walkinSyncInterval = null;

async function initWalkInSelfService() {
  await initSchoolDataList();
  await syncWalkInSettingsFromServer();
  renderLandingQuotaPills();
  window.addEventListener("storage", (e) => {
    if (e.key === "smst_attendees_cache" || e.key === "smst_walkin_settings") {
      renderLandingQuotaPills();
    }
  });
  window.addEventListener("smst:walkinsettingschange", () => {
    renderLandingQuotaPills();
  });
  window.addEventListener("focus", () => {
    syncWalkInSettingsFromServer();
    renderLandingQuotaPills();
  });
  setInterval(renderLandingQuotaPills, 3000);
  setInterval(() => {
    syncWalkInSettingsFromServer();
  }, 15000);
}

let CACHED_SCHOOLS_LIST = null;

async function getCachedSchoolsList(forceRefresh = false) {
  if (!forceRefresh && CACHED_SCHOOLS_LIST && CACHED_SCHOOLS_LIST.length > 0) {
    return CACHED_SCHOOLS_LIST;
  }
  let rawSchools = [];
  try {
    const res = await fetch("assets/data/schools.json?v=" + Date.now());
    if (res.ok) rawSchools = await res.json();
  } catch (e) {}

  // โหลดจาก schools.json เท่านั้น ไม่ดึงจาก cache ผู้สมัคร เพื่อป้องกันชื่อตีกัน
  CACHED_SCHOOLS_LIST = buildUniqueSchoolList(rawSchools);
  return CACHED_SCHOOLS_LIST;
}

async function initSchoolDataList() {
  const datalist = document.getElementById("schoolList");
  try {
    const schools = await getCachedSchoolsList(true);
    if (datalist) {
      datalist.innerHTML = schools.map((s) => '<option value="' + esc(s) + '"></option>').join("");
    }
  } catch (err) {}
}

function setupSchoolAutocomplete(container) {
  const input = container.querySelector("#wsSchool");
  const clearBtn = container.querySelector("#btnClearSchool");
  const suggestBox = container.querySelector("#schoolSuggestBox");
  const suggestList = container.querySelector("#schoolSuggestList");
  const countBadge = container.querySelector("#schoolSuggestCount");

  if (!input || !suggestBox || !suggestList) return;

  let activeIndex = -1;

  async function renderList(query) {
    const schools = await getCachedSchoolsList();
    const q = normalizeSchoolName(query).toLowerCase();
    
    // Strict uniqueness guarantee for matched items
    const matchedSeen = new Set();
    const matches = [];

    for (const school of schools) {
      const clean = normalizeSchoolName(school);
      const key = clean.toLowerCase();
      if (matchedSeen.has(key)) continue;

      if (!q || key.includes(q)) {
        matchedSeen.add(key);
        matches.push(clean);
        if (matches.length >= (q ? 30 : 15)) break;
      }
    }

    if (countBadge) {
      countBadge.textContent = matches.length + " แห่ง";
    }

    if (matches.length === 0) {
      suggestList.innerHTML = '<div class="school-suggest-empty">ไม่พบชื่อโรงเรียนที่ตรงกัน — น้องสามารถพิมพ์ชื่อโรงเรียนได้เลย</div>';
      suggestBox.style.display = "block";
      activeIndex = -1;
      return;
    }

    suggestList.innerHTML = matches
      .map((school, idx) => {
        let displayName = esc(school);
        if (q) {
          const regex = new RegExp("(" + q.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&") + ")", "gi");
          displayName = esc(school).replace(regex, '<mark class="school-match-mark">$1</mark>');
        }
        return (
          '<div class="school-suggest-item" data-value="' +
          esc(school) +
          '" data-index="' +
          idx +
          '">' +
          '<svg class="icon"><use href="#i-cap"></use></svg>' +
          '<span>' +
          displayName +
          "</span>" +
          "</div>"
        );
      })
      .join("");

    suggestBox.style.display = "block";
    activeIndex = -1;
  }

  function selectSchool(val) {
    input.value = normalizeSchoolName(val);
    suggestBox.style.display = "none";
    if (clearBtn) clearBtn.style.display = "inline-flex";
    input.focus();
  }

  input.addEventListener("focus", () => {
    renderList(input.value);
  });

  input.addEventListener("input", () => {
    if (clearBtn) {
      clearBtn.style.display = input.value ? "inline-flex" : "none";
    }
    renderList(input.value);
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.value = "";
      clearBtn.style.display = "none";
      renderList("");
      input.focus();
    });
  }

  suggestList.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".school-suggest-item");
    if (item && item.dataset.value) {
      e.preventDefault();
      selectSchool(item.dataset.value);
    }
  });

  input.addEventListener("keydown", (e) => {
    const items = suggestList.querySelectorAll(".school-suggest-item");
    if (!items.length || suggestBox.style.display === "none") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveItem(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActiveItem(items);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && items[activeIndex]) {
        e.preventDefault();
        selectSchool(items[activeIndex].dataset.value);
      }
    } else if (e.key === "Escape") {
      suggestBox.style.display = "none";
    }
  });

  function updateActiveItem(items) {
    items.forEach((it, i) => {
      if (i === activeIndex) {
        it.classList.add("is-active");
        it.scrollIntoView({ block: "nearest" });
      } else {
        it.classList.remove("is-active");
      }
    });
  }

  const onDocClick = (e) => {
    if (!container.contains(e.target)) {
      suggestBox.style.display = "none";
    }
  };
  document.addEventListener("click", onDocClick);
}

function getWalkinQuotaStats() {
  const cfg = (CONFIG.rounds && CONFIG.rounds.walkin) || {};
  const wiSettings = getWalkInSettings();

  const maxMorning = wiSettings.maxQuotaMorning;
  const maxAfternoon = wiSettings.maxQuotaAfternoon;

  const cache = JSON.parse(localStorage.getItem("smst_attendees_cache") || "[]");
  const confirmedWalkins = cache.filter((r) => {
    const isWi = getRoundKey(r.ticket_type) === "walkin";
    const isPaid = r.payment_status === "ชำระเงินแล้ว" || r.booking_status === "อนุมัติแล้ว";
    return isWi && isPaid && !isCancelledRow(r);
  });

  const morningCount = confirmedWalkins.filter((r) => valOr(r.ticket_type, "").includes("เช้า")).length;
  const afternoonCount = confirmedWalkins.filter((r) => valOr(r.ticket_type, "").includes("บ่าย")).length;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const untilMorningMin = toMinutes(cfg.checkInUntilMorning || "12:00");
  const untilAfternoonMin = toMinutes(cfg.checkInUntilAfternoon || "16:30");

  const isEventDay = (CONFIG.event && CONFIG.event.date) === localDateISO(now);
  // Auto-time cutoff only runs on event day
  const morningTimeClosed = isEventDay && untilMorningMin !== null && nowMin > untilMorningMin;
  const afternoonTimeClosed = isEventDay && untilAfternoonMin !== null && nowMin > untilAfternoonMin;

  const masterClosed = !wiSettings.isOpen;
  const morningClosed = masterClosed || !wiSettings.morningOpen || morningTimeClosed;
  const afternoonClosed = masterClosed || !wiSettings.afternoonOpen || afternoonTimeClosed;

  return {
    maxMorning,
    maxAfternoon,
    morningCount,
    afternoonCount,
    remMorning: Math.max(0, maxMorning - morningCount),
    remAfternoon: Math.max(0, maxAfternoon - afternoonCount),
    masterClosed,
    morningClosed,
    afternoonClosed,
    morningTimeClosed,
    afternoonTimeClosed,
    wiSettings,
    cfg,
  };
}

function renderLandingQuotaPills() {
  const container = document.getElementById("landingQuotaPills");
  if (!container) return;

  const q = getWalkinQuotaStats();
  const pills = [];

  if (q.masterClosed) {
    pills.push('<span class="quota-pill is-closed">' + icon("ban") + 'ปิดรับสมัคร Walk-in ทุกรอบแล้ว (โดย Admin)</span>');
    container.innerHTML = pills.join("");
    return;
  }

  // รอบเช้า
  if (q.morningClosed) {
    pills.push('<span class="quota-pill is-closed">' + icon("clock") + 'รอบเช้า: ' + (!q.wiSettings.morningOpen ? 'ปิดรับแล้ว' : 'ปิดรับแล้ว') + '</span>');
  } else if (q.remMorning <= 0) {
    pills.push('<span class="quota-pill is-full">' + icon("x-circle") + 'รอบเช้า: เต็มแล้ว</span>');
  } else {
    pills.push('<span class="quota-pill is-open">' + icon("check-circle") + 'รอบเช้า: เหลือ ' + q.remMorning + ' ที่</span>');
  }

  // รอบบ่าย
  if (q.afternoonClosed) {
    pills.push('<span class="quota-pill is-closed">' + icon("clock") + 'รอบบ่าย: ' + (!q.wiSettings.afternoonOpen ? 'ปิดรับแล้ว' : 'ปิดรับแล้ว') + '</span>');
  } else if (q.remAfternoon <= 0) {
    pills.push('<span class="quota-pill is-full">' + icon("x-circle") + 'รอบบ่าย: เต็มแล้ว</span>');
  } else {
    pills.push('<span class="quota-pill is-open">' + icon("check-circle") + 'รอบบ่าย: เหลือ ' + q.remAfternoon + ' ที่</span>');
  }

  container.innerHTML = pills.join("");
}

async function openWalkinSelfModal() {
  await syncWalkInSettingsFromServer();
  const q = getWalkinQuotaStats();
  const cfg = q.cfg;
  const wiSettings = q.wiSettings;
  const priceStudent = typeof wiSettings.priceStudent === "number" ? wiSettings.priceStudent : ((cfg.price && cfg.price.student) || 529);
  const priceParent = typeof wiSettings.priceParent === "number" ? wiSettings.priceParent : ((cfg.price && cfg.price.parent) || 259);
  const pricePackage = priceStudent + priceParent;

  if (q.masterClosed) {
    showToast("ขออภัย ขณะนี้ระบบ Walk-in ปิดรับสมัครทุกรอบชั่วคราวโดยผู้ดูแลระบบ (Admin)", "warning");
    return;
  }

  const morningDisabled = q.morningClosed || q.remMorning <= 0;
  const afternoonDisabled = q.afternoonClosed || q.remAfternoon <= 0;

  if (morningDisabled && afternoonDisabled) {
    showToast("ขออภัย โควตา Walk-in ทุกรอบเต็มหรือปิดรับแล้วสำหรับตอนนี้", "warning");
    return;
  }

  const defaultRound = !morningDisabled ? "เช้า" : "บ่าย";

  const modalHtml =
    '<div class="modal-walkin">' +
      '<div class="walkin-modal-head">' +
        '<h2><svg class="icon" style="color:var(--teal)"><use href="#i-ticket"></use></svg>ลงทะเบียน Walk-in หน้างาน</h2>' +
        '<p>กรอกข้อมูลระหว่างรอแถวเพื่อรับรหัสคิว แล้วยื่นให้สตาฟที่โต๊ะลงทะเบียนเพื่อชำระเงิน</p>' +
      '</div>' +
      '<form id="walkinSelfForm" novalidate>' +
        '<div class="walkin-form-grid">' +
          '<div class="form-grid-name">' +
            '<div class="field">' +
              '<label for="wsPrefix">คำนำหน้า <span class="req">*</span></label>' +
              '<select class="select" id="wsPrefix" required>' +
                '<option value="นาย">นาย</option>' +
                '<option value="นางสาว">นางสาว</option>' +
                '<option value="เด็กชาย">เด็กชาย</option>' +
                '<option value="เด็กหญิง">เด็กหญิง</option>' +
              '</select>' +
            '</div>' +
            '<div class="field">' +
              '<label for="wsFullName">ชื่อ - นามสกุล <span class="req">*</span></label>' +
              '<input class="input" id="wsFullName" type="text" placeholder="เช่น สมชาย ใจดี" required />' +
            '</div>' +
          '</div>' +

          '<div class="form-grid-2">' +
            '<div class="field">' +
              '<label for="wsPhone">เบอร์โทรศัพท์ (10 หลัก) <span class="req">*</span></label>' +
              '<input class="input" id="wsPhone" type="tel" inputmode="numeric" placeholder="0XXXXXXXXX" maxlength="10" required />' +
            '</div>' +
            '<div class="field">' +
              '<label for="wsGrade">ระดับชั้น</label>' +
              '<select class="select" id="wsGrade">' +
                '<option value="ม.6">ม.6</option>' +
                '<option value="ม.5">ม.5</option>' +
                '<option value="ม.4">ม.4</option>' +
                '<option value="ม.ต้น (ม.1-3)">ม.ต้น (ม.1-3)</option>' +
                '<option value="ปวช. / ปวส.">ปวช. / ปวส.</option>' +
                '<option value="เด็กซิ่ว / เทียบเท่า">เด็กซิ่ว / เทียบเท่า</option>' +
                '<option value="อื่น ๆ">อื่น ๆ</option>' +
              '</select>' +
            '</div>' +
          '</div>' +

          '<div class="field autocomplete-field">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">' +
              '<label for="wsSchool" style="margin-bottom:0;">โรงเรียน / สถาบัน</label>' +
              '<span class="school-hint-badge"><svg class="icon" style="width:12px;height:12px;"><use href="#i-cap"></use></svg> มีระบบแนะนำโรงเรียน</span>' +
            '</div>' +
            '<div class="wi-school-input-wrap">' +
              '<svg class="icon"><use href="#i-cap"></use></svg>' +
              '<input class="input" id="wsSchool" type="text" autocomplete="off" placeholder="ค้นหาหรือพิมพ์ชื่อโรงเรียน / สถาบัน..." />' +
              '<button type="button" class="btn-clear-school" id="btnClearSchool" title="ล้างข้อความ" style="display:none;" tabindex="-1">' +
                '<svg class="icon"><use href="#i-x"></use></svg>' +
              '</button>' +
            '</div>' +
            '<div class="school-suggest-box" id="schoolSuggestBox" style="display:none;">' +
              '<div class="school-suggest-header">' +
                '<span>รายชื่อโรงเรียนแนะนำ</span>' +
                '<span class="school-suggest-count" id="schoolSuggestCount">0 แห่ง</span>' +
              '</div>' +
              '<div class="school-suggest-list" id="schoolSuggestList"></div>' +
              '<div class="school-suggest-footer">' +
                '<span>💡 หากไม่พบในรายการ สามารถพิมพ์ชื่อโรงเรียนของน้องได้โดยตรง</span>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="field">' +
            '<label for="wsChannel">รู้จักโครงการจาก</label>' +
            '<select class="select" id="wsChannel">' +
              '<option value="Facebook">Facebook</option>' +
              '<option value="Instagram">Instagram</option>' +
              '<option value="TikTok">TikTok</option>' +
              '<option value="Twitter (X)">Twitter (X)</option>' +
              '<option value="Roadshow">Roadshow ประชาสัมพันธ์</option>' +
              '<option value="เพื่อน / คุณครูแนะนำ">เพื่อน / คุณครูแนะนำ</option>' +
              '<option value="Walk-in หน้างาน">Walk-in หน้างาน</option>' +
            '</select>' +
          '</div>' +

          '<div class="field wi-round-section">' +
            '<div class="wi-round-section-label">' +
              '<span>เลือกรอบที่ต้องการเข้างาน <span class="req">*</span></span>' +
              '<span class="hint">แตะเพื่อเลือกรอบ</span>' +
            '</div>' +
            '<div class="wi-round-selector-grid">' +
              '<label class="wi-round-card' + (morningDisabled ? ' is-disabled' : '') + '">' +
                '<input type="radio" name="wsRound" value="เช้า"' + (defaultRound === "เช้า" ? ' checked' : '') + (morningDisabled ? ' disabled' : '') + ' />' +
                '<div class="wi-round-card-box">' +
                  '<div class="wi-round-top-row">' +
                    '<div class="wi-round-title-group">' +
                      '<div class="wi-round-icon-wrap morning">' +
                        '<svg class="icon"><use href="#i-sun"></use></svg>' +
                      '</div>' +
                      '<span class="wi-round-title">รอบเช้า</span>' +
                    '</div>' +
                    '<div class="wi-round-card-check">' +
                      '<svg class="icon"><use href="#i-check"></use></svg>' +
                    '</div>' +
                  '</div>' +
                  '<div class="wi-round-bottom-row">' +
                    '<div class="wi-round-time">' +
                      '<svg class="icon"><use href="#i-clock"></use></svg> 07:00 - 12:00 น.' +
                    '</div>' +
                    '<span class="wi-round-quota ' + (morningDisabled ? 'quota-closed' : (q.remMorning <= 20 ? 'quota-warn' : 'quota-avail')) + '">' +
                      (morningDisabled ? 'ปิดรับแล้ว' : 'เหลือ ' + q.remMorning + ' ที่') +
                    '</span>' +
                  '</div>' +
                '</div>' +
              '</label>' +
              '<label class="wi-round-card' + (afternoonDisabled ? ' is-disabled' : '') + '">' +
                '<input type="radio" name="wsRound" value="บ่าย"' + (defaultRound === "บ่าย" ? ' checked' : '') + (afternoonDisabled ? ' disabled' : '') + ' />' +
                '<div class="wi-round-card-box">' +
                  '<div class="wi-round-top-row">' +
                    '<div class="wi-round-title-group">' +
                      '<div class="wi-round-icon-wrap afternoon">' +
                        '<svg class="icon"><use href="#i-clock"></use></svg>' +
                      '</div>' +
                      '<span class="wi-round-title">รอบบ่าย</span>' +
                    '</div>' +
                    '<div class="wi-round-card-check">' +
                      '<svg class="icon"><use href="#i-check"></use></svg>' +
                    '</div>' +
                  '</div>' +
                  '<div class="wi-round-bottom-row">' +
                    '<div class="wi-round-time">' +
                      '<svg class="icon"><use href="#i-clock"></use></svg> 13:00 - 16:30 น.' +
                    '</div>' +
                    '<span class="wi-round-quota ' + (afternoonDisabled ? 'quota-closed' : (q.remAfternoon <= 20 ? 'quota-warn' : 'quota-avail')) + '">' +
                      (afternoonDisabled ? 'ปิดรับแล้ว' : 'เหลือ ' + q.remAfternoon + ' ที่') +
                    '</span>' +
                  '</div>' +
                '</div>' +
              '</label>' +
            '</div>' +
          '</div>' +

          '<div class="parent-expand-box">' +
            '<label class="checkbox-confirm" style="background:transparent;border:none;padding:0;">' +
              '<input type="checkbox" id="wsHasParent" />' +
              '<span><b>มาพร้อมผู้ปกครอง 1 ท่าน (+' + priceParent + ' บาท)</b></span>' +
            '</label>' +
            '<div id="wsParentFields" style="display:none;margin-top:6px;">' +
              '<div class="form-grid-2">' +
                '<div class="field">' +
                  '<label for="wsParentPrefix">คำนำหน้าผู้ปกครอง</label>' +
                  '<select class="select" id="wsParentPrefix">' +
                    '<option value="นาย">นาย</option>' +
                    '<option value="นางสาว">นางสาว</option>' +
                    '<option value="นาง">นาง</option>' +
                  '</select>' +
                '</div>' +
                '<div class="field">' +
                  '<label for="wsParentName">ชื่อ - นามสกุล ผู้ปกครอง</label>' +
                  '<input class="input" id="wsParentName" type="text" placeholder="ชื่อ-นามสกุล ผู้ปกครอง" />' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="walkin-summary-box">' +
            '<div>' +
              '<div style="font-size:12px;color:var(--text-3);" id="wsSummaryDesc">บัตรนักเรียน 1 ท่าน</div>' +
              '<div style="font-size:11px;color:var(--text-3);">(ชำระเงินที่โต๊ะสตาฟ)</div>' +
            '</div>' +
            '<div class="walkin-summary-total">฿<span id="wsSummaryTotal">' + priceStudent + '</span></div>' +
          '</div>' +
        '</div>' +

        '<div style="margin-top:16px;display:flex;gap:10px;">' +
          '<button type="button" class="btn btn-secondary" data-modal-close>ยกเลิก</button>' +
          '<button type="submit" class="btn btn-primary btn-block" id="wsSubmitBtn">' +
            icon("check") + 'ส่งข้อมูลรับรหัสคิว' +
          '</button>' +
        '</div>' +
      '</form>' +
    '</div>';

  const modalHandle = openModal(modalHtml, { label: "ลงทะเบียน Walk-in" });
  setupSchoolAutocomplete(modalHandle.el);

  const hasParentCb = modalHandle.el.querySelector("#wsHasParent");
  const parentFields = modalHandle.el.querySelector("#wsParentFields");
  const summaryDesc = modalHandle.el.querySelector("#wsSummaryDesc");
  const summaryTotal = modalHandle.el.querySelector("#wsSummaryTotal");

  hasParentCb.addEventListener("change", () => {
    const checked = hasParentCb.checked;
    parentFields.style.display = checked ? "block" : "none";
    if (checked) {
      summaryDesc.textContent = "บัตรคู่: นักเรียน + ผู้ปกครอง 1 ท่าน";
      summaryTotal.textContent = pricePackage;
    } else {
      summaryDesc.textContent = "บัตรนักเรียน 1 ท่าน";
      summaryTotal.textContent = priceStudent;
    }
  });

  const form = modalHandle.el.querySelector("#walkinSelfForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    handleWalkinSelfSubmit(form, modalHandle);
  });
}

function handleWalkinSelfSubmit(form, modalHandle) {
  const prefix = form.querySelector("#wsPrefix").value;
  const fullName = form.querySelector("#wsFullName").value.trim();
  const phone = normalizePhone(form.querySelector("#wsPhone").value.trim());
  const grade = form.querySelector("#wsGrade").value;
  const school = normalizeSchoolName(form.querySelector("#wsSchool").value) || "-";
  const channel = form.querySelector("#wsChannel").value;
  const roundChoice = form.querySelector('input[name="wsRound"]:checked')?.value || "เช้า";
  const hasParent = form.querySelector("#wsHasParent").checked;
  const parentPrefix = form.querySelector("#wsParentPrefix")?.value || "นาย";
  const parentName = form.querySelector("#wsParentName")?.value.trim() || "";

  if (!fullName) {
    showToast("กรุณากรอกชื่อ-นามสกุล", "error");
    form.querySelector("#wsFullName").focus();
    return;
  }
  if (!phone || phone.length < 9) {
    showToast("กรุณากรอกเบอร์โทรศัพท์ 10 หลักให้ถูกต้อง", "error");
    form.querySelector("#wsPhone").focus();
    return;
  }
  if (hasParent && !parentName) {
    showToast("กรุณากรอกชื่อ-นามสกุลของผู้ปกครอง", "error");
    form.querySelector("#wsParentName").focus();
    return;
  }

  const cache = JSON.parse(localStorage.getItem("smst_attendees_cache") || "[]");

  // ตรวจสอบเบอร์โทรซ้ำที่มีคิวค้างอยู่ (Duplicate Phone Check)
  const existingPending = cache.find((r) => {
    const isWi = getRoundKey(r.ticket_type) === "walkin";
    const samePhone = normalizePhone(r.phone) === phone;
    const isPending = r.booking_status === "รอชำระเงินหน้างาน" || r.payment_status === "รอชำระเงิน";
    return isWi && samePhone && isPending && !isCancelledRow(r);
  });

  if (existingPending) {
    modalHandle.close();
    showToast("พบข้อมูลการลงทะเบียน Walk-in ของเบอร์นี้แล้ว กำลังเปิดรหัสคิวเดิม...", "info");
    const codeToShow = existingPending.walkin_temp_code || existingPending.booking_code;
    showWalkinQueueModal(codeToShow);
    return;
  }

  // รันรหัสคิว W-001, W-002...
  let maxW = 0;
  cache.forEach((r) => {
    const code = String(r.walkin_temp_code || r.booking_code || "");
    const m = /^W-(\d+)$/i.exec(code);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > maxW) maxW = n;
    }
  });
  const tempCode = "W-" + String(maxW + 1).padStart(3, "0");

  const thaiDateNowStr =
    new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    thaiTimeNow().replace(" น.", "");
  const nowIso = localDateISO();
  const ticketTypeStr = "รอบ Walk-in · " + roundChoice;

  const wiSettings = getWalkInSettings();
  const cfg = (CONFIG.rounds && CONFIG.rounds.walkin) || {};
  const currentPriceStudent = typeof wiSettings.priceStudent === "number" ? wiSettings.priceStudent : ((cfg.price && cfg.price.student) || 529);
  const currentPriceParent = typeof wiSettings.priceParent === "number" ? wiSettings.priceParent : ((cfg.price && cfg.price.parent) || 259);

  const totalPeople = hasParent ? 2 : 1;
  const studentRow = {
    id: Date.now() + Math.floor(Math.random() * 500),
    booking_code: tempCode,
    walkin_temp_code: tempCode,
    person_order: "1/" + totalPeople,
    ticket_type_category: "นักเรียน",
    ticket_code: tempCode,
    qr_code: tempCode,
    title_prefix: prefix,
    full_name: prefix + " " + fullName,
    grade_level: grade,
    school: school,
    phone: phone,
    contact_name: prefix + " " + fullName,
    contact_phone: phone,
    channel: channel,
    ticket_type: ticketTypeStr,
    amount: currentPriceStudent,
    payment_method: "pending",
    slip_ref: "",
    booking_status: "รอชำระเงินหน้างาน",
    payment_status: "รอชำระเงิน",
    created_by_staff: "Self-Service",
    approved_by_staff: null,
    booking_date: thaiDateNowStr,
    booking_date_iso: nowIso + " " + thaiTimeNow().replace(" น.", ""),
    is_checked_in: false,
    checked_in_at: null,
    checked_in_by: null,
    marketing_discount_used: false,
  };

  const newRows = [studentRow];

  if (hasParent) {
    const parentRow = {
      id: Date.now() + 500 + Math.floor(Math.random() * 500),
      booking_code: tempCode,
      walkin_temp_code: tempCode,
      person_order: "2/" + totalPeople,
      ticket_type_category: "ผู้ปกครอง",
      ticket_code: tempCode + "-P",
      qr_code: tempCode + "-P",
      title_prefix: parentPrefix,
      full_name: parentPrefix + " " + parentName,
      grade_level: "-",
      school: "-",
      phone: phone,
      contact_name: prefix + " " + fullName,
      contact_phone: phone,
      channel: channel,
      ticket_type: ticketTypeStr,
      amount: currentPriceParent,
      payment_method: "pending",
      slip_ref: "",
      booking_status: "รอชำระเงินหน้างาน",
      payment_status: "รอชำระเงิน",
      created_by_staff: "Self-Service",
      approved_by_staff: null,
      booking_date: thaiDateNowStr,
      booking_date_iso: nowIso + " " + thaiTimeNow().replace(" น.", ""),
      is_checked_in: false,
      checked_in_at: null,
      checked_in_by: null,
      marketing_discount_used: false,
    };
    newRows.push(parentRow);
  }

  newRows.forEach((r) => cache.unshift(r));
  localStorage.setItem("smst_attendees_cache", JSON.stringify(cache));
  window.dispatchEvent(new CustomEvent("smst:attendeescachechange", { detail: cache }));

  // ส่งขึ้น Supabase ถ้าออนไลน์ (ใช้ toSupabaseAttendeePayload เพื่อไม่ให้ติด column error)
  if (supabaseClient && navigator.onLine) {
    try {
      const payloads = newRows.map(toSupabaseAttendeePayload);
      supabaseClient.from("attendees").insert(payloads).select().then(({ data, error }) => {
        if (error) {
          console.warn("Supabase walk-in insert error:", error);
        } else if (data && data.length) {
          const updatedCache = JSON.parse(localStorage.getItem("smst_attendees_cache") || "[]");
          data.forEach((serverRow) => {
            const localMatch = updatedCache.find((c) => (c.ticket_code === serverRow.ticket_code || c.booking_code === serverRow.booking_code));
            if (localMatch) {
              localMatch.id = serverRow.id;
            }
          });
          localStorage.setItem("smst_attendees_cache", JSON.stringify(updatedCache));
          window.dispatchEvent(new CustomEvent("smst:attendeescachechange", { detail: updatedCache }));
        }
      });
    } catch (e) {}
  }

  modalHandle.close();
  showToast("ลงทะเบียนสำเร็จ รหัสคิวของคุณคือ " + tempCode, "success");
  showWalkinQueueModal(tempCode);
}

function showWalkinQueueModal(tempCode) {
  if (walkinSyncInterval) clearInterval(walkinSyncInterval);

  function getLatestData() {
    const cache = JSON.parse(localStorage.getItem("smst_attendees_cache") || "[]");
    return cache.filter((r) => r.walkin_temp_code === tempCode || r.booking_code === tempCode);
  }

  let rows = getLatestData();
  if (!rows.length) {
    showToast("ไม่พบข้อมูลรหัสคิว " + tempCode, "error");
    return;
  }

  const main = rows[0];
  const isApproved = main.payment_status === "ชำระเงินแล้ว" || main.booking_status === "อนุมัติแล้ว";

  function renderModalBody(currentRows) {
    const m = currentRows[0];
    const totalAmount = currentRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const approved = m.payment_status === "ชำระเงินแล้ว" || m.booking_status === "อนุมัติแล้ว";

    if (approved) {
      // หน้าจอเมื่อสตาฟอนุมัติแล้ว (Official Admission Pass)
      const qrs = currentRows.map((r) => {
        const code = r.ticket_code || r.booking_code;
        return (
          '<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:10px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
              '<span class="chip chip-mint"><span class="dot"></span>' + esc(r.ticket_type) + '</span>' +
              '<span class="chip chip-teal">' + icon("check-circle") + 'เข้างานแล้ว</span>' +
            '</div>' +
            '<div style="background:#fff;border-radius:10px;padding:8px;display:inline-block;margin:6px 0;">' +
              qrSvg(code, { ecc: "M", margin: 1 }) +
            '</div>' +
            '<div class="mono" style="font-weight:700;font-size:16px;color:var(--text);">' + esc(code) + '</div>' +
            '<div style="font-weight:600;font-size:14px;margin-top:2px;">' + esc(r.full_name) + ' (' + esc(r.ticket_type_category) + ')</div>' +
          '</div>'
        );
      }).join("");

      return (
        '<div class="walkin-pending-slip">' +
          '<div style="color:var(--teal);margin-bottom:8px;">' +
            '<svg class="icon" style="width:40px;height:40px;"><use href="#i-check-circle"></use></svg>' +
          '</div>' +
          '<h2 style="font-size:20px;font-weight:700;color:var(--teal);">ชำระเงินเรียบร้อยแล้ว!</h2>' +
          '<p style="font-size:13px;color:var(--text-2);margin-bottom:16px;">แสดง QR Code ด้านล่างนี้เพื่อผ่านเข้างานและร่วมกิจกรรมในฐานต่าง ๆ</p>' +
          qrs +
          '<div style="font-size:12px;color:var(--text-3);margin-top:12px;">ผู้อนุมัติสิทธิ์: ' + esc(m.approved_by_staff || "สตาฟฝ่ายทะเบียน") + '</div>' +
          '<button type="button" class="btn btn-secondary btn-block" style="margin-top:14px;" data-modal-close>ปิดหน้าต่าง</button>' +
        '</div>'
      );
    }

    // หน้าจอรอชำระเงินหน้างาน (In-Queue Pass)
    const code = m.walkin_temp_code || m.booking_code;
    return (
      '<div class="walkin-pending-slip">' +
        '<p class="kicker" style="justify-content:center;">' + icon("ticket") + 'รหัสคิวสำหรับชำระเงินหน้างาน</p>' +
        '<div class="walkin-temp-code-badge" style="font-size:38px;padding:14px 24px;margin:10px 0;">' + esc(code) + '</div>' +
        '<div style="margin:10px 0;">' +
          '<span class="chip chip-amber"><span class="pulse-dot"></span>รอชำระเงินหน้างาน</span>' +
          '<span class="chip chip-mint" style="margin-left:6px;">' + esc(m.ticket_type) + '</span>' +
        '</div>' +
        '<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0;text-align:left;">' +
          '<div style="font-weight:700;font-size:15px;">' + esc(m.full_name) + '</div>' +
          (m.school && m.school !== "-" ? '<div style="font-size:12.5px;color:var(--text-3);">' + esc(m.school) + '</div>' : '') +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);">' +
            '<span style="font-size:13px;color:var(--text-2);">ยอดที่ต้องชำระ:</span>' +
            '<span class="mono" style="font-size:18px;font-weight:800;color:var(--gold);">฿' + totalAmount.toLocaleString("th-TH") + ' บาท</span>' +
          '</div>' +
        '</div>' +
        '<p style="font-size:13px;color:var(--text-2);line-height:1.5;">' +
          'กรุณายื่นหน้าจอนี้ให้ <b>พี่สตาฟที่โต๊ะลงทะเบียน Walk-in</b> เพื่อชำระเงินและรับสิทธิ์เข้างาน' +
        '</p>' +
        '<div class="walkin-sync-indicator">' +
          '<span class="pulse-dot"></span>' +
          '<span>ระบบตรวจจับการชำระเงินสดแบบ Real-time</span>' +
        '</div>' +
        '<div style="margin-top:16px;">' +
          '<button type="button" class="btn btn-secondary btn-block" data-modal-close>ปิดหน้าต่าง (รหัสไม่หาย)</button>' +
        '</div>' +
      '</div>'
    );
  }

  let onStorageChange = null;
  const handle = openModal(renderModalBody(rows), {
    label: "คิว Walk-in " + tempCode,
    onClose: () => {
      if (walkinSyncInterval) clearInterval(walkinSyncInterval);
      if (onStorageChange) window.removeEventListener("storage", onStorageChange);
    },
  });

  // Real-time listener via storage & polling
  if (!isApproved) {
    onStorageChange = (e) => {
      if (e.key === "smst_attendees_cache") {
        const updated = getLatestData();
        if (!updated.length) return;
        const m = updated[0];
        if (m.payment_status === "ชำระเงินแล้ว" || m.booking_status === "อนุมัติแล้ว") {
          clearInterval(walkinSyncInterval);
          if (onStorageChange) window.removeEventListener("storage", onStorageChange);
          feedback("success");
          handle.el.innerHTML = renderModalBody(updated);
        }
      }
    };
    window.addEventListener("storage", onStorageChange);

    walkinSyncInterval = setInterval(() => {
      const updated = getLatestData();
      if (!updated.length) return;
      const m = updated[0];
      if (m.payment_status === "ชำระเงินแล้ว" || m.booking_status === "อนุมัติแล้ว") {
        clearInterval(walkinSyncInterval);
        if (onStorageChange) window.removeEventListener("storage", onStorageChange);
        feedback("success");
        handle.el.innerHTML = renderModalBody(updated);
      }
    }, 2000);
  }
}

function openLookupWalkinQueueModal() {
  const modalHtml =
    '<div class="modal-confirm">' +
      '<div class="modal-icon tone-teal">' + icon("search") + '</div>' +
      '<h2 class="modal-title">ดูรหัสคิว / บัตร Walk-in ของฉัน</h2>' +
      '<p class="modal-text">กรอกเบอร์โทรศัพท์ที่ใช้ลงทะเบียน หรือรหัสชั่วคราว (เช่น W-001)</p>' +
      '<div class="field" style="text-align:left;margin-top:12px;">' +
        '<input class="input" id="wiQueueFindInput" type="text" placeholder="เบอร์โทร 10 หลัก หรือ W-XXX" autofocus />' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button type="button" class="btn btn-secondary" data-modal-close>ยกเลิก</button>' +
        '<button type="button" class="btn btn-primary" id="wiQueueFindBtn">ค้นหา</button>' +
      '</div>' +
    '</div>';

  const handle = openModal(modalHtml, { label: "ค้นหารหัสคิว" });
  const input = handle.el.querySelector("#wiQueueFindInput");
  const findBtn = handle.el.querySelector("#wiQueueFindBtn");

  const doFind = () => {
    const val = input.value.trim();
    if (!val) return;
    const cache = JSON.parse(localStorage.getItem("smst_attendees_cache") || "[]");
    const normPhone = normalizePhone(val);
    const upperCode = val.toUpperCase();

    const matched = cache.find((r) => {
      const phoneMatch = normalizePhone(r.phone) === normPhone;
      const codeMatch = String(r.walkin_temp_code || "").toUpperCase() === upperCode ||
                        String(r.booking_code || "").toUpperCase() === upperCode ||
                        String(r.ticket_code || "").toUpperCase() === upperCode;
      return (phoneMatch || codeMatch) && getRoundKey(r.ticket_type) === "walkin";
    });

    if (matched) {
      handle.close();
      showWalkinQueueModal(matched.walkin_temp_code || matched.booking_code);
    } else {
      showToast("ไม่พบข้อมูลคิว Walk-in จากเบอร์หรือรหัสนี้", "error");
    }
  };

  findBtn.addEventListener("click", doFind);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doFind();
  });
}
