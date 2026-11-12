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
  });

  const header = document.getElementById("siteHeader");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ลิงก์ตรง เช่น /?code=SMST-XXXXXXXX (รับเฉพาะรหัส ไม่รับเบอร์โทรใน URL)
  const codeParam = new URLSearchParams(location.search).get("code");
  if (codeParam && /^[A-Za-z0-9-]{4,32}$/.test(codeParam)) {
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
    let timeHtml = "";
    if (sched.slots && sched.slots.length) {
      timeHtml =
        '<div class="round-card-slots">' +
        sched.slots
          .map(
            (s) =>
              '<div class="round-slot">' +
                '<span class="round-slot-label">' + esc(s.label) + "</span>" +
                (s.arrive
                  ? '<span class="round-slot-time">' + esc(s.arrive) + "<small>น.</small></span>"
                  : '<span class="round-slot-time is-tba">รอประกาศ</span>') +
              "</div>"
          )
          .join("") +
        "</div>";
    } else if (sched.arrive) {
      timeHtml = '<p class="round-card-time">' + esc(sched.arrive) + "<small>น.</small></p>";
    } else {
      timeHtml = '<p class="round-card-time is-tba">รอประกาศ</p>';
    }
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
  if (!supabaseClient) {
    setLookupError("โหลดระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้าอีกครั้ง");
    return;
  }

  btn.disabled = true;
  resultsEl.innerHTML = '<div class="card results-loading"><span class="spinner"></span>กำลังค้นหาการสมัคร...</div>';
  scrollToResults();

  try {
    const { data: matches, error } = await findMatches(query);
    if (error) throw error;

    if (!matches || matches.length === 0) {
      renderNotFound(query);
      return;
    }

    const codes = Array.from(new Set(matches.map((m) => m.booking_code))).slice(0, 10);
    const { data: rows, error: groupError } = await supabaseClient
      .from("attendees")
      .select(PUBLIC_FIELDS)
      .in("booking_code", codes);
    if (groupError) throw groupError;

    renderResults(rows || [], new Set(matches.map((m) => m.id)));
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
