/**
 * ============================================================================
 * 🎯 SMST Open House 2026 — Google Sheet Central Backup & Contingency Engine
 * ============================================================================
 * 
 * Features:
 *  1. setupSheets(): Automatically generates and formats 4 sheets matching the
 *     SMST brand theme (Deep Navy #140B33, Gold #FBC80E, Mint Teal #4FD1A5):
 *       - 🔍 Search_Checkin (Desk search & emergency check-in interface)
 *       - Master_Attendees  (Pre-registered attendees with sync & preservation)
 *       - WalkIn_Records    (On-site registrations & payments)
 *       - Scan_Audit_Log    (Append-only chronological audit trail)
 *  2. doPost(e): Web App API handling non-blocking events from the scanner web app:
 *       - SYNC_BATCH (CSV upsert with check-in status preservation)
 *       - CHECK_IN   (Live check-in / undo)
 *       - VOUCHER    (Live 10% voucher redemption)
 *       - WALK_IN    (On-site walk-in registration)
 *       - FULL_SYNC  (Full database backup)
 *  3. doGet(e): Recovery export endpoint (?action=export_recovery) to pull
 *     offline timestamps and walk-in records back into Supabase.
 *  4. onEdit(e): Direct sheet edit triggers for auto-timestamping & cross-sheet sync.
 *  5. Custom Menu: "🎯 SMST 2026" for one-click setup, search, and clearing.
 */

// --- Global Configuration & Theme Palette ---
const CONFIG = {
  TIMEZONE: "Asia/Bangkok",
  TIME_FORMAT: "yyyy-MM-dd HH:mm:ss น.",
  SHEETS: {
    SEARCH: "🔍 Search_Checkin",
    MASTER: "Master_Attendees",
    WALKIN: "WalkIn_Records",
    AUDIT: "Scan_Audit_Log",
    EVALUATION: "Form_Evaluation",
    CERT_VERIFY: "🎓 Cert_Verification",
    FINAL_CERT: "🏆 Final_Cert_List"
  },
  THEME: {
    NAVY_DARK: "#140B33",      // Header background & brand primary
    NAVY_CARD: "#1E1548",      // Secondary header & card background
    GOLD_ACCENT: "#FBC80E",    // Brand highlight & search borders
    GOLD_LIGHT: "#FFFBEB",     // Input field background
    MINT_GREEN: "#4FD1A5",     // Check-in accent
    MINT_LIGHT: "#D1FAE5",     // Checked state highlight
    AMBER_LIGHT: "#FEF3C7",    // Evaluation pending highlight
    PURPLE_ACCENT: "#7C3AED",  // Voucher accent
    PURPLE_LIGHT: "#EDE9FE",   // Voucher used highlight
    WHITE: "#FFFFFF",
    TEXT_DARK: "#0F172A",
    TEXT_MUTED: "#64748B",
    BORDER_LIGHT: "#E2E8F0",
    ROW_ZEBRA: "#F8FAFC"
  }
};

/**
 * Custom Menu on Spreadsheet Open
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("🎯 SMST 2026")
    .addItem("🚀 ติดตั้งและสร้างชีทอัตโนมัติ (Setup Sheets)", "setupSheets")
    .addSeparator()
    .addItem("🔎 ค้นหาผู้เข้าร่วม (Search Attendees)", "searchAttendees")
    .addItem("🧹 ล้างผลการค้นหา (Clear Search)", "clearSearch")
    .addSeparator()
    .addItem("🎓 ประมวลผลรายชื่อเกียรติบัตร (Process Cert List)", "processCertificateVerification")
    .addItem("📊 สรุปยอดและสถิติเกียรติบัตร (Cert Statistics)", "showCertStats")
    .addSeparator()
    .addItem("📈 สรุปยอดระบบเช็คอิน (Check-in Statistics)", "showStatsDialog")
    .addToUi();
}

/**
 * 1. setupSheets(): Automated Sheet Architect
 * Sets up and formats all 7 sheets with full SMST theme styling, borders, and validation.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Create or get sheets
  const searchSheet = getOrCreateSheet(ss, CONFIG.SHEETS.SEARCH);
  const masterSheet = getOrCreateSheet(ss, CONFIG.SHEETS.MASTER);
  const walkinSheet = getOrCreateSheet(ss, CONFIG.SHEETS.WALKIN);
  const auditSheet = getOrCreateSheet(ss, CONFIG.SHEETS.AUDIT);
  const evalSheet = getOrCreateSheet(ss, CONFIG.SHEETS.EVALUATION);
  const certVerifySheet = getOrCreateSheet(ss, CONFIG.SHEETS.CERT_VERIFY);
  const finalCertSheet = getOrCreateSheet(ss, CONFIG.SHEETS.FINAL_CERT);

  // Set Sheet order (1 to 7)
  ss.setActiveSheet(searchSheet);
  ss.moveActiveSheet(1);
  ss.setActiveSheet(masterSheet);
  ss.moveActiveSheet(2);
  ss.setActiveSheet(walkinSheet);
  ss.moveActiveSheet(3);
  ss.setActiveSheet(auditSheet);
  ss.moveActiveSheet(4);
  ss.setActiveSheet(evalSheet);
  ss.moveActiveSheet(5);
  ss.setActiveSheet(certVerifySheet);
  ss.moveActiveSheet(6);
  ss.setActiveSheet(finalCertSheet);
  ss.moveActiveSheet(7);

  // Configure each sheet
  buildSearchSheet(searchSheet);
  buildMasterSheet(masterSheet);
  buildWalkinSheet(walkinSheet);
  buildAuditSheet(auditSheet);
  buildFormEvaluationSheet(evalSheet);
  buildCertVerificationSheet(certVerifySheet);
  buildFinalCertListSheet(finalCertSheet);

  ss.setActiveSheet(searchSheet);
  ss.toast("🎉 ติดตั้งระบบ SMST Backup & Certificate ตรวจสอบสิทธิ์ครบทั้ง 7 ชีทแล้ว!", "✅ ติดตั้งสำเร็จ", 10);
  Logger.log("==================================================");
  Logger.log("🎉 ติดตั้งระบบ SMST Backup & Certificate ตรวจสอบสิทธิ์สำเร็จเรียบร้อย!");
  Logger.log("สร้างครบทั้ง 7 ชีทตามธีม SMST เรียบร้อย:");
  Logger.log("1. 🔍 Search_Checkin (หน้าค้นหา & เช็คอินฉุกเฉิน)");
  Logger.log("2. Master_Attendees (ฐานข้อมูลผู้ลงทะเบียนล่วงหน้า)");
  Logger.log("3. WalkIn_Records (บันทึก Walk-in & การเงิน)");
  Logger.log("4. Scan_Audit_Log (ประวัติการทำรายการย้อนหลัง)");
  Logger.log("5. Form_Evaluation (แท็บรับข้อมูลจาก Google Form แบบประเมิน)");
  Logger.log("6. 🎓 Cert_Verification (หน้าตรวจสิทธิ์, แมตช์เบอร์ & เคลียร์เคสตกหล่น)");
  Logger.log("7. 🏆 Final_Cert_List (รายชื่อฉบับสมบูรณ์สำหรับฝ่ายออกเกียรติบัตร)");
  Logger.log("ขั้นตอนต่อไป: กด Deploy > New deployment > Web app");
  Logger.log("==================================================");
}

/**
 * Helper to get existing sheet or create a new one
 */
function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

/**
 * Build and Style Sheet 1: 🔍 Search_Checkin
 */
function buildSearchSheet(sheet) {
  sheet.clear();

  // Set column widths
  sheet.setColumnWidth(1, 45);   // A: ลำดับ
  sheet.setColumnWidth(2, 130);  // B: รหัสจอง
  sheet.setColumnWidth(3, 70);   // C: ลำดับ
  sheet.setColumnWidth(4, 150);  // D: รหัสตั๋ว
  sheet.setColumnWidth(5, 180);  // E: ชื่อ-นามสกุล
  sheet.setColumnWidth(6, 110);  // F: ประเภท
  sheet.setColumnWidth(7, 180);  // G: โรงเรียน
  sheet.setColumnWidth(8, 120);  // H: เบอร์โทร
  sheet.setColumnWidth(9, 100);  // I: สถานะเช็คอิน
  sheet.setColumnWidth(10, 150); // J: เวลาเช็คอิน
  sheet.setColumnWidth(11, 120); // K: เช็คอินโดย
  sheet.setColumnWidth(12, 100); // L: ใช้ Voucher
  sheet.setColumnWidth(13, 150); // M: เวลาใช้ Voucher
  sheet.setColumnWidth(14, 140); // N: หมายเหตุ / แหล่งที่มา

  // Row 1: Brand Banner
  const titleRange = sheet.getRange("A1:N1");
  titleRange.merge();
  titleRange.setValue("🎯 SMST OPEN HOUSE 2026 — โต๊ะค้นหา & เช็คอินฉุกเฉิน (Search & Check-in Desk)");
  titleRange.setBackground(CONFIG.THEME.NAVY_DARK);
  titleRange.setFontColor(CONFIG.THEME.WHITE);
  titleRange.setFontSize(13);
  titleRange.setFontWeight("bold");
  titleRange.setHorizontalAlignment("center");
  titleRange.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 42);

  // Row 2: Staff Name Selector
  sheet.getRange("A2").setValue("👤 สตาฟผู้ปฏิบัติหน้าที่:");
  sheet.getRange("A2").setFontWeight("bold").setHorizontalAlignment("right").setBackground("#F1F5F9");
  
  const staffCell = sheet.getRange("B2");
  staffCell.setValue("Staff-FrontDesk");
  staffCell.setBackground(CONFIG.THEME.GOLD_LIGHT);
  staffCell.setFontWeight("bold");
  staffCell.setHorizontalAlignment("center");
  staffCell.setBorder(true, true, true, true, false, false, CONFIG.THEME.GOLD_ACCENT, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  const staffRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Staff-FrontDesk", "Staff-1", "Staff-2", "Staff-3", "Staff-Admin", "Staff-WalkIn"], true)
    .setAllowInvalid(true)
    .build();
  staffCell.setDataValidation(staffRule);

  const staffNoteRange = sheet.getRange("C2:F2");
  staffNoteRange.merge();
  staffNoteRange.setValue("👈 เลือกหรือพิมพ์ชื่อสตาฟของคุณในช่อง B2 (จะใช้บันทึกเวลาที่กดเช็คอินจากหน้านี้)");
  staffNoteRange.setFontColor(CONFIG.THEME.TEXT_MUTED).setFontSize(9).setVerticalAlignment("middle");
  sheet.setRowHeight(2, 28);

  // Row 3: Blank separator
  sheet.setRowHeight(3, 10);

  // Row 4: Search Box Input
  sheet.getRange("A4").setValue("🔎 ค้นหาข้อมูล:");
  sheet.getRange("A4").setBackground(CONFIG.THEME.NAVY_CARD).setFontColor(CONFIG.THEME.GOLD_ACCENT).setFontWeight("bold").setHorizontalAlignment("right").setVerticalAlignment("middle");

  const searchCell = sheet.getRange("B4");
  searchCell.setValue("");
  searchCell.setBackground(CONFIG.THEME.GOLD_LIGHT);
  searchCell.setFontSize(12);
  searchCell.setFontWeight("bold");
  searchCell.setHorizontalAlignment("center");
  searchCell.setVerticalAlignment("middle");
  searchCell.setBorder(true, true, true, true, false, false, CONFIG.THEME.GOLD_ACCENT, SpreadsheetApp.BorderStyle.SOLID_THICK);

  const searchNoteRange = sheet.getRange("C4:N4");
  searchNoteRange.merge();
  searchNoteRange.setValue("💡 พิมพ์ ชื่อ / รหัสการจอง / เบอร์โทร ในช่อง B4 แล้วกด Enter (หรือแตะเมนู '🎯 SMST 2026' > '🔎 ค้นหา')");
  searchNoteRange.setFontColor(CONFIG.THEME.NAVY_DARK).setFontWeight("bold").setFontSize(10).setVerticalAlignment("middle").setBackground("#FEF9C3");
  sheet.setRowHeight(4, 34);

  // Row 5: Operational Guidelines
  const guideRange = sheet.getRange("A5:N5");
  guideRange.merge();
  guideRange.setValue("📋 เมื่อพบผลการค้นหาด้านล่าง: สามารถติ๊ก [✓] ในช่อง 'สถานะเช็คอิน' หรือ 'ใช้ Voucher' ได้ทันที ระบบจะบันทึกเวลาและซิงค์กลับไปยัง Master Sheet ให้อัตโนมัติ");
  guideRange.setBackground(CONFIG.THEME.NAVY_DARK).setFontColor(CONFIG.THEME.WHITE).setFontSize(9).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(5, 24);

  // Row 6: Blank separator
  sheet.setRowHeight(6, 12);

  // Row 7: Search Results Header
  const headers = [
    "ลำดับ", "รหัสจอง", "คน", "รหัสตั๋ว", "ชื่อ-นามสกุล", "ประเภท", "โรงเรียน",
    "เบอร์โทร", "สถานะเช็คอิน", "เวลาเช็คอิน", "เช็คอินโดย", "ใช้ Voucher", "เวลาใช้ Voucher", "แหล่งที่มา / หมายเหตุ"
  ];
  const headerRange = sheet.getRange(7, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setBackground(CONFIG.THEME.NAVY_DARK);
  headerRange.setFontColor(CONFIG.THEME.WHITE);
  headerRange.setFontWeight("bold");
  headerRange.setFontSize(10);
  headerRange.setHorizontalAlignment("center");
  headerRange.setVerticalAlignment("middle");
  sheet.setRowHeight(7, 32);

  // Freeze top 7 rows
  sheet.setFrozenRows(7);

  // Prepare result rows (8 to 57 = 50 rows)
  const numResultRows = 50;
  const resultRange = sheet.getRange(8, 1, numResultRows, headers.length);
  resultRange.clearContent();
  resultRange.clearFormat();
  resultRange.setFontSize(9.5).setVerticalAlignment("middle");
  resultRange.setBorder(true, true, true, true, true, true, CONFIG.THEME.BORDER_LIGHT, SpreadsheetApp.BorderStyle.SOLID);
  sheet.setRowHeights(8, numResultRows, 26);

  const zebraColors = [];
  for (let r = 0; r < numResultRows; r++) {
    const rowColor = (r % 2 === 1) ? CONFIG.THEME.ROW_ZEBRA : CONFIG.THEME.WHITE;
    zebraColors.push(new Array(headers.length).fill(rowColor));
  }
  resultRange.setBackgrounds(zebraColors);

  // Checkboxes in Column I (Check-in) and Column L (Voucher)
  const checkinCheckboxes = sheet.getRange(8, 9, numResultRows, 1);
  checkinCheckboxes.insertCheckboxes();
  checkinCheckboxes.setHorizontalAlignment("center");

  const voucherCheckboxes = sheet.getRange(8, 12, numResultRows, 1);
  voucherCheckboxes.insertCheckboxes();
  voucherCheckboxes.setHorizontalAlignment("center");

  // Force plain text format for phone numbers (Col H)
  sheet.getRange(8, 8, numResultRows, 1).setNumberFormat("@");
}

/**
 * Build and Style Sheet 2: Master_Attendees
 */
function buildMasterSheet(sheet) {
  sheet.clear();

  const headers = [
    "booking_code", "person_order", "name", "user_type", "school",
    "phone", "line_id", "emergency_contact", "dream_uni", "know_from",
    "grade", "is_checked_in", "checked_in_at", "checked_in_by",
    "voucher_used", "voucher_used_at", "voucher_used_by", "ticket_code", "updated_at"
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground(CONFIG.THEME.NAVY_DARK);
  headerRange.setFontColor(CONFIG.THEME.WHITE);
  headerRange.setFontWeight("bold");
  headerRange.setFontSize(10);
  headerRange.setHorizontalAlignment("center");
  headerRange.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 34);
  sheet.setFrozenRows(1);

  // Set widths
  const widths = [130, 60, 180, 100, 180, 120, 120, 140, 160, 140, 90, 100, 160, 120, 100, 160, 120, 150, 160];
  widths.forEach((w, idx) => sheet.setColumnWidth(idx + 1, w));

  // Plain text format for phone column (Col F)
  sheet.getRange("F:F").setNumberFormat("@");

  // Conditional formatting for checked-in (Col 12) & voucher (Col 15)
  const maxR = sheet.getMaxRows();
  const isCheckedInRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$L2=TRUE')
    .setBackground(CONFIG.THEME.MINT_LIGHT)
    .setFontColor("#065F46")
    .setRanges([sheet.getRange("A2:S" + maxR)])
    .build();

  const isVoucherRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$O2=TRUE')
    .setBackground(CONFIG.THEME.PURPLE_LIGHT)
    .setFontColor("#4C1D95")
    .setRanges([sheet.getRange("O2:Q" + maxR)])
    .build();

  sheet.setConditionalFormatRules([isCheckedInRule, isVoucherRule]);
}

/**
 * Build and Style Sheet 3: WalkIn_Records
 */
function buildWalkinSheet(sheet) {
  sheet.clear();

  const headers = [
    "ticket_code", "name", "user_type", "school", "phone",
    "package_title", "amount", "payment_method", "transfer_ref4",
    "cash_received", "cash_change", "is_checked_in", "registered_at",
    "staff_name", "notes"
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground(CONFIG.THEME.NAVY_DARK);
  headerRange.setFontColor(CONFIG.THEME.WHITE);
  headerRange.setFontWeight("bold");
  headerRange.setFontSize(10);
  headerRange.setHorizontalAlignment("center");
  headerRange.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 34);
  sheet.setFrozenRows(1);

  // Set widths
  const widths = [120, 180, 100, 180, 120, 140, 100, 140, 110, 100, 100, 100, 160, 130, 180];
  widths.forEach((w, idx) => sheet.setColumnWidth(idx + 1, w));

  // Plain text format for phone column (Col E)
  sheet.getRange("E:E").setNumberFormat("@");
}

/**
 * Build and Style Sheet 4: Scan_Audit_Log
 */
function buildAuditSheet(sheet) {
  sheet.clear();

  const headers = [
    "timestamp", "action", "target_code", "target_name", "status_result", "staff_name", "details"
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground(CONFIG.THEME.NAVY_DARK);
  headerRange.setFontColor(CONFIG.THEME.WHITE);
  headerRange.setFontWeight("bold");
  headerRange.setFontSize(10);
  headerRange.setHorizontalAlignment("center");
  headerRange.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 34);
  sheet.setFrozenRows(1);

  // Set widths
  const widths = [160, 120, 150, 180, 110, 130, 320];
  widths.forEach((w, idx) => sheet.setColumnWidth(idx + 1, w));
}

/**
 * Build and Style Sheet 5: Form_Evaluation
 * Destination sheet for Google Form evaluation responses.
 */
function buildFormEvaluationSheet(sheet) {
  const lastRow = sheet.getLastRow();
  const headers = [
    "timestamp",
    "phone",
    "ticket_code",
    "prefix",
    "full_name_cert",
    "email",
    "satisfaction_score",
    "feedback_notes"
  ];

  if (lastRow <= 1) {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground(CONFIG.THEME.NAVY_DARK);
    headerRange.setFontColor(CONFIG.THEME.WHITE);
    headerRange.setFontWeight("bold");
    headerRange.setFontSize(10);
    headerRange.setHorizontalAlignment("center");
    headerRange.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 34);
    sheet.setFrozenRows(1);

    // Set widths
    const widths = [160, 140, 140, 90, 200, 200, 120, 250];
    widths.forEach((w, idx) => sheet.setColumnWidth(idx + 1, w));
    sheet.getRange("B:B").setNumberFormat("@");

    // Sample data rows (2 demo rows)
    const sampleRows = [
      ["2026-11-28 16:00:00", "0811111111", "SMST-001-1", "นาย", "กิตติศักดิ์ สมัครดี", "kittisak@example.com", 5, "กิจกรรมจัดได้ยอดเยี่ยมมาก ได้รับแรงบันดาลใจเต็มที่"],
      ["2026-11-28 16:05:00", "0833333333", "WI-26001", "นาย", "สมชาย วอล์กอิน", "somchai@example.com", 5, "ฐาน Workshop สนุกและได้ลงมือทำจริง"]
    ];
    sheet.getRange(2, 1, sampleRows.length, headers.length).setValues(sampleRows);
  } else {
    // If responses already exist, ensure phone column B is plain text
    sheet.getRange("B:B").setNumberFormat("@");
  }
}

/**
 * Build and Style Sheet 6: 🎓 Cert_Verification
 * Comprehensive verification, matching & manual override table.
 */
function buildCertVerificationSheet(sheet) {
  sheet.clear();

  // Column widths
  sheet.setColumnWidth(1, 50);   // A: ลำดับ
  sheet.setColumnWidth(2, 130);  // B: รหัสตั๋ว
  sheet.setColumnWidth(3, 120);  // C: เบอร์โทรศัพท์ (@)
  sheet.setColumnWidth(4, 180);  // D: ชื่อ-นามสกุล (สมัคร)
  sheet.setColumnWidth(5, 190);  // E: ชื่อ-นามสกุล (เกียรติบัตร)
  sheet.setColumnWidth(6, 110);  // F: ประเภท
  sheet.setColumnWidth(7, 180);  // G: โรงเรียน / สถาบัน
  sheet.setColumnWidth(8, 200);  // H: อีเมลรับเกียรติบัตร
  sheet.setColumnWidth(9, 100);  // I: เช็คอินเข้างาน (Checkbox)
  sheet.setColumnWidth(10, 100); // J: ทำแบบประเมิน (Checkbox)
  sheet.setColumnWidth(11, 160); // K: ผลการตรวจสิทธิ์
  sheet.setColumnWidth(12, 150); // L: อนุมัติพิเศษ (Checkbox)
  sheet.setColumnWidth(13, 220); // M: หมายเหตุ / แหล่งแมตช์

  // Row 1: Title Banner
  const titleRange = sheet.getRange("A1:M1");
  titleRange.merge();
  titleRange.setValue("🎓 SMST OPEN HOUSE 2026 — ตรวจสอบสิทธิ์เกียรติบัตร & เคลียร์เคสตกหล่น (Certificate Verification)");
  titleRange.setBackground(CONFIG.THEME.NAVY_DARK);
  titleRange.setFontColor(CONFIG.THEME.WHITE);
  titleRange.setFontSize(13);
  titleRange.setFontWeight("bold");
  titleRange.setHorizontalAlignment("center");
  titleRange.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 38);

  // Row 2-4: 4 Metric Cards (Summary KPI Boxes)
  // Card 1: เช็คอินเข้างาน (B2:C4)
  sheet.getRange("B2:C2").merge().setValue("👥 ผู้เช็คอินเข้างานจริง")
    .setBackground(CONFIG.THEME.NAVY_CARD).setFontColor(CONFIG.THEME.WHITE)
    .setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center");
  sheet.getRange("B3:C4").merge().setFormula('=IFERROR(COUNTA(B7:B), 0)')
    .setBackground("#F8FAFC").setFontColor(CONFIG.THEME.NAVY_DARK)
    .setFontWeight("bold").setFontSize(16).setHorizontalAlignment("center").setVerticalAlignment("middle");

  // Card 2: ทำแบบประเมินแล้ว (E2:F4)
  sheet.getRange("E2:F2").merge().setValue("📝 ทำแบบประเมินแล้ว")
    .setBackground(CONFIG.THEME.NAVY_CARD).setFontColor(CONFIG.THEME.WHITE)
    .setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center");
  sheet.getRange("E3:F4").merge().setFormula('=IFERROR(COUNTIF(J7:J, TRUE), 0)')
    .setBackground("#F8FAFC").setFontColor("#059669")
    .setFontWeight("bold").setFontSize(16).setHorizontalAlignment("center").setVerticalAlignment("middle");

  // Card 3: อนุมัติพิเศษ (H2:I4)
  sheet.getRange("H2:I2").merge().setValue("🛡️ อนุมัติพิเศษ (Override)")
    .setBackground(CONFIG.THEME.NAVY_CARD).setFontColor(CONFIG.THEME.WHITE)
    .setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center");
  sheet.getRange("H3:I4").merge().setFormula('=IFERROR(COUNTIF(L7:L, TRUE), 0)')
    .setBackground("#F8FAFC").setFontColor("#7C3AED")
    .setFontWeight("bold").setFontSize(16).setHorizontalAlignment("center").setVerticalAlignment("middle");

  // Card 4: ผู้มีสิทธิ์รับเกียรติบัตร (K2:M4)
  sheet.getRange("K2:M2").merge().setValue("🏆 ผ่านเกณฑ์รับเกียรติบัตรทั้งหมด")
    .setBackground(CONFIG.THEME.GOLD_ACCENT).setFontColor(CONFIG.THEME.NAVY_DARK)
    .setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center");
  sheet.getRange("K3:M4").merge().setFormula('=IFERROR(COUNTIF(K7:K, "*ผ่านเกณฑ์*"), 0)')
    .setBackground(CONFIG.THEME.GOLD_LIGHT).setFontColor(CONFIG.THEME.NAVY_DARK)
    .setFontWeight("bold").setFontSize(18).setHorizontalAlignment("center").setVerticalAlignment("middle");

  sheet.setRowHeight(2, 22);
  sheet.setRowHeight(3, 22);
  sheet.setRowHeight(4, 22);

  // Row 5: Instructions
  const instructRange = sheet.getRange("A5:M5");
  instructRange.merge();
  instructRange.setValue("💡 คำแนะนำ: กดเมนู '🎯 SMST 2026 > 🎓 ประมวลผลรายชื่อเกียรติบัตร' เพื่อดึงข้อมูลมาประมวลผล | ติ๊กถูกช่อง 'อนุมัติพิเศษ' หากผู้เข้าร่วมมางานจริงแต่กรอกเบอร์ไม่ตรง");
  instructRange.setBackground("#FFFBEB");
  instructRange.setFontColor("#92400E");
  instructRange.setFontSize(10);
  instructRange.setFontStyle("italic");
  instructRange.setHorizontalAlignment("center");
  instructRange.setVerticalAlignment("middle");
  sheet.setRowHeight(5, 26);

  // Row 6: Table Headers
  const headers = [
    "ลำดับ", "รหัสตั๋ว", "เบอร์โทรศัพท์", "ชื่อ-นามสกุล (สมัคร)", "ชื่อบนเกียรติบัตร (แบบประเมิน)",
    "ประเภท", "โรงเรียน / สถาบัน", "อีเมลรับเกียรติบัตร", "เช็คอินเข้างาน", "ทำแบบประเมิน",
    "ผลการตรวจสิทธิ์", "อนุมัติพิเศษ", "หมายเหตุ / แหล่งแมตช์"
  ];
  sheet.getRange(6, 1, 1, headers.length).setValues([headers]);
  const headerRange = sheet.getRange(6, 1, 1, headers.length);
  headerRange.setBackground(CONFIG.THEME.NAVY_CARD);
  headerRange.setFontColor(CONFIG.THEME.WHITE);
  headerRange.setFontWeight("bold");
  headerRange.setFontSize(10);
  headerRange.setHorizontalAlignment("center");
  headerRange.setVerticalAlignment("middle");
  sheet.setRowHeight(6, 34);

  sheet.setFrozenRows(6);
  sheet.getRange("C:C").setNumberFormat("@");

  // Conditional formatting:
  const maxR = sheet.getMaxRows();
  const rulePass = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$K7="🟢 ผ่านเกณฑ์ครบถ้วน"')
    .setBackground(CONFIG.THEME.MINT_LIGHT)
    .setFontColor("#065F46")
    .setRanges([sheet.getRange("A7:M" + maxR)])
    .build();

  const ruleSpecial = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$K7="🟢 ผ่านเกณฑ์ (อนุมัติพิเศษ)"')
    .setBackground("#EDE9FE")
    .setFontColor("#4C1D95")
    .setRanges([sheet.getRange("A7:M" + maxR)])
    .build();

  const rulePending = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$K7="⏳ มางานแต่ยังไม่ประเมิน"')
    .setBackground(CONFIG.THEME.AMBER_LIGHT)
    .setFontColor("#92400E")
    .setRanges([sheet.getRange("A7:M" + maxR)])
    .build();

  const ruleUnmatched = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$K7="⚠️ ทำประเมินแล้วแต่ไม่พบข้อมูลเช็คอิน"')
    .setBackground("#FEE2E2")
    .setFontColor("#991B1B")
    .setRanges([sheet.getRange("A7:M" + maxR)])
    .build();

  sheet.setConditionalFormatRules([rulePass, ruleSpecial, rulePending, ruleUnmatched]);
}

/**
 * Build and Style Sheet 7: 🏆 Final_Cert_List
 * Clean certificate roster ready for certificate generation team.
 */
function buildFinalCertListSheet(sheet) {
  sheet.clear();

  // Column widths
  sheet.setColumnWidth(1, 60);   // A: ลำดับ
  sheet.setColumnWidth(2, 90);   // B: คำนำหน้า
  sheet.setColumnWidth(3, 210);  // C: ชื่อ-นามสกุล สำหรับเกียรติบัตร
  sheet.setColumnWidth(4, 110);  // D: ประเภทผู้เข้าร่วม
  sheet.setColumnWidth(5, 190);  // E: โรงเรียน / สถาบัน
  sheet.setColumnWidth(6, 210);  // F: อีเมลสำหรับจัดส่ง
  sheet.setColumnWidth(7, 130);  // G: เบอร์โทรศัพท์ (@)
  sheet.setColumnWidth(8, 130);  // H: รหัสตั๋ว
  sheet.setColumnWidth(9, 160);  // I: รอบการเข้าร่วม
  sheet.setColumnWidth(10, 200); // J: วิธีผ่านการตรวจสอบ

  // Row 1: Title Banner
  const titleRange = sheet.getRange("A1:J1");
  titleRange.merge();
  titleRange.setValue("🏆 SMST OPEN HOUSE 2026 — รายชื่อผู้มีสิทธิ์รับเกียรติบัตรฉบับสมบูรณ์ (Final Certificate Roster)");
  titleRange.setBackground(CONFIG.THEME.NAVY_DARK);
  titleRange.setFontColor(CONFIG.THEME.WHITE);
  titleRange.setFontSize(13);
  titleRange.setFontWeight("bold");
  titleRange.setHorizontalAlignment("center");
  titleRange.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 38);

  // Row 2: Subtitle
  const subRange = sheet.getRange("A2:J2");
  subRange.merge();
  subRange.setValue("ฐานข้อมูลรายชื่อผู้ผ่านเกณฑ์ครบถ้วน พร้อมส่งต่อให้ฝ่ายจัดทำเกียรติบัตร (PDF & E-Certificate) ได้ทันที");
  subRange.setBackground(CONFIG.THEME.NAVY_CARD);
  subRange.setFontColor(CONFIG.THEME.GOLD_ACCENT);
  subRange.setFontSize(10);
  subRange.setHorizontalAlignment("center");
  subRange.setVerticalAlignment("middle");
  sheet.setRowHeight(2, 24);

  // Row 3: Stat & timestamp line
  const statRange = sheet.getRange("A3:J3");
  statRange.merge();
  statRange.setFormula('="📊 ยอดผู้มีสิทธิ์รับเกียรติบัตรขณะนี้: " & IFERROR(COUNTA(A5:A), 0) & " คน  |  อัปเดตล่าสุด: " & TEXT(NOW(), "yyyy-MM-dd HH:mm:ss")');
  statRange.setBackground("#F8FAFC");
  statRange.setFontColor(CONFIG.THEME.TEXT_MUTED);
  statRange.setFontSize(10);
  statRange.setFontWeight("bold");
  statRange.setHorizontalAlignment("center");
  statRange.setVerticalAlignment("middle");
  sheet.setRowHeight(3, 24);

  // Row 4: Table Headers
  const headers = [
    "ลำดับ (No.)",
    "คำนำหน้า (Prefix)",
    "ชื่อ-นามสกุล บนเกียรติบัตร (Certificate Name)",
    "ประเภท (User Type)",
    "โรงเรียน / สถาบัน (School / Institution)",
    "อีเมลจัดส่ง (Email for Delivery)",
    "เบอร์โทรศัพท์ (Phone)",
    "รหัสตั๋ว (Ticket Code)",
    "รอบการเข้าร่วม (Round / Package)",
    "วิธีผ่านการตรวจสอบ (Verified Method)"
  ];
  sheet.getRange(4, 1, 1, headers.length).setValues([headers]);
  const headerRange = sheet.getRange(4, 1, 1, headers.length);
  headerRange.setBackground(CONFIG.THEME.NAVY_DARK);
  headerRange.setFontColor(CONFIG.THEME.GOLD_ACCENT);
  headerRange.setFontWeight("bold");
  headerRange.setFontSize(10);
  headerRange.setHorizontalAlignment("center");
  headerRange.setVerticalAlignment("middle");
  sheet.setRowHeight(4, 34);

  sheet.setFrozenRows(4);
  sheet.getRange("G:G").setNumberFormat("@");
}

/**
 * Helper to get current Bangkok formatted timestamp
 */
function getBangkokTimestamp() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, CONFIG.TIME_FORMAT);
}

/**
 * Append entry to Scan_Audit_Log
 */
function appendAuditLog(action, targetCode, targetName, statusResult, staffName, details) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.AUDIT);
    if (!sheet) return;
    const detailsStr = typeof details === "object" ? JSON.stringify(details) : String(details || "");
    sheet.appendRow([
      getBangkokTimestamp(),
      action,
      targetCode || "-",
      targetName || "-",
      statusResult || "OK",
      staffName || "System",
      detailsStr
    ]);
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

/**
 * 2. doPost(e): Web App API Endpoint
 * Handles non-blocking background sync calls from scanner web application.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // Wait for lock to prevent race conditions during concurrent check-ins
    lock.waitLock(10000);

    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (action) {
      case "SYNC_BATCH": {
        const rows = payload.rows || [];
        const result = handleSyncBatch(ss, rows);
        appendAuditLog("SYNC_BATCH", "ALL", "Batch CSV Sync", "SUCCESS", payload.staff_name || "Admin", { count: rows.length, inserted: result.inserted, updated: result.updated });
        return createJsonResponse({ ok: true, message: "Batch synced successfully", ...result });
      }

      case "CHECK_IN": {
        const result = handleCheckIn(ss, payload);
        appendAuditLog("CHECK_IN", payload.ticket_code, result.name || "-", payload.is_checked_in ? "CHECKED_IN" : "UNCHECKED", payload.staff_name, payload);
        return createJsonResponse({ ok: true, message: "Check-in recorded", ...result });
      }

      case "VOUCHER": {
        const result = handleVoucher(ss, payload);
        appendAuditLog("VOUCHER", payload.ticket_code, result.name || "-", payload.voucher_used ? "VOUCHER_USED" : "VOUCHER_CANCELLED", payload.staff_name, payload);
        return createJsonResponse({ ok: true, message: "Voucher recorded", ...result });
      }

      case "WALK_IN": {
        const result = handleWalkIn(ss, payload);
        appendAuditLog("WALK_IN", payload.ticket_code, payload.name, "REGISTERED", payload.staff_name, payload);
        return createJsonResponse({ ok: true, message: "Walk-in recorded", ...result });
      }

      case "FULL_SYNC": {
        const attendees = payload.attendees || [];
        const walkins = payload.walkins || [];
        const attResult = handleSyncBatch(ss, attendees);
        const walkinResult = handleWalkInBatch(ss, walkins);
        appendAuditLog("FULL_SYNC", "ALL", "Full Database Sync", "SUCCESS", payload.staff_name || "Admin", { attendees: attendees.length, walkins: walkins.length });
        return createJsonResponse({ ok: true, message: "Full sync completed", attendees_synced: attResult, walkins_synced: walkinResult });
      }

      default: {
        return createJsonResponse({ ok: false, error: "Unknown action: " + action });
      }
    }
  } catch (err) {
    console.error("doPost error:", err);
    appendAuditLog("ERROR", "-", "-", "FAILED", "System", err.message);
    return createJsonResponse({ ok: false, error: err.message });
  } finally {
    try {
      if (lock && typeof lock.hasLock === "function" && lock.hasLock()) {
        lock.releaseLock();
      }
    } catch (lockErr) {}
  }
}

/**
 * 3. doGet(e): Web App API Endpoint
 * Handles recovery export and ping checks.
 */
function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : "ping";
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === "export_recovery") {
      const data = handleExportRecovery(ss);
      return createJsonResponse({
        ok: true,
        attendees: data.attendees,
        walkins: data.walkins,
        count_attendees: data.attendees.length,
        count_walkins: data.walkins.length,
        exported_at: getBangkokTimestamp()
      });
    }

    // Default ping response
    return createJsonResponse({
      ok: true,
      message: "SMST Central Sheet Engine Online",
      version: "2026.1",
      timestamp: getBangkokTimestamp()
    });
  } catch (err) {
    console.error("doGet error:", err);
    return createJsonResponse({ ok: false, error: err.message });
  }
}

/**
 * Handle SYNC_BATCH (CSV upsert with check-in status preservation)
 * Optimized with in-memory bulk 2D array updates to prevent execution timeouts
 */
function handleSyncBatch(ss, rows) {
  const masterSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER);
  if (!masterSheet) throw new Error("Sheet Master_Attendees not found");

  const lastRow = masterSheet.getLastRow();
  const existingMap = new Map();
  let data = [];

  // Read existing master rows into map by ticket_code or booking_code-person_order
  if (lastRow > 1) {
    data = masterSheet.getRange(2, 1, lastRow - 1, 19).getValues();
    data.forEach((r, idx) => {
      const bCode = String(r[0] || "").trim();
      const pOrder = String(r[1] || "").trim();
      const tCode = String(r[17] || "").trim() || (bCode + "-" + pOrder);
      existingMap.set(tCode, {
        dataIndex: idx,
        is_checked_in: r[11] === true || r[11] === "TRUE",
        checked_in_at: r[12],
        checked_in_by: r[13],
        voucher_used: r[14] === true || r[14] === "TRUE",
        voucher_used_at: r[15],
        voucher_used_by: r[16]
      });
    });
  }

  const toAppend = [];
  let inserted = 0;
  let updated = 0;
  const now = getBangkokTimestamp();

  rows.forEach(r => {
    const bCode = String(r.booking_code || "").trim();
    const pOrder = String(r.person_order || 1).trim();
    const tCode = String(r.ticket_code || (bCode + "-" + pOrder)).trim();

    const existing = existingMap.get(tCode);

    // CRITICAL: Preserve check-in and voucher states if already recorded on sheet
    const isCheckedIn = existing ? (existing.is_checked_in || r.is_checked_in === true) : (r.is_checked_in === true);
    const checkedInAt = existing ? (existing.checked_in_at || r.checked_in_at || "") : (r.checked_in_at || "");
    const checkedInBy = existing ? (existing.checked_in_by || r.checked_in_by || "") : (r.checked_in_by || "");

    const voucherUsed = existing ? (existing.voucher_used || r.voucher_used === true || r.marketing_discount_used === true) : (r.voucher_used === true || r.marketing_discount_used === true);
    const voucherUsedAt = existing ? (existing.voucher_used_at || r.voucher_used_at || r.marketing_discount_used_at || "") : (r.voucher_used_at || r.marketing_discount_used_at || "");
    const voucherUsedBy = existing ? (existing.voucher_used_by || r.voucher_used_by || r.marketing_discount_used_by || "") : (r.voucher_used_by || r.marketing_discount_used_by || "");

    const rowArray = [
      bCode,
      pOrder,
      r.name || "",
      r.user_type || "นักเรียน",
      r.school || "",
      normalizePhone(r.phone),
      r.line_id || "",
      r.emergency_contact || "",
      r.dream_uni || "",
      r.know_from || "",
      r.grade || "",
      isCheckedIn,
      checkedInAt,
      checkedInBy,
      voucherUsed,
      voucherUsedAt,
      voucherUsedBy,
      tCode,
      now
    ];

    if (existing) {
      // Update in memory array for single bulk write
      data[existing.dataIndex] = rowArray;
      updated++;
    } else {
      toAppend.push(rowArray);
      inserted++;
    }
  });

  // Write updated existing rows in a SINGLE bulk RPC call
  if (updated > 0 && data.length > 0) {
    masterSheet.getRange(2, 1, data.length, 19).setValues(data);
  }

  // Append new rows in bulk
  if (toAppend.length > 0) {
    const startRow = masterSheet.getLastRow() + 1;
    masterSheet.getRange(startRow, 1, toAppend.length, 19).setValues(toAppend);
    masterSheet.getRange(startRow, 12, toAppend.length, 1).insertCheckboxes();
    masterSheet.getRange(startRow, 15, toAppend.length, 1).insertCheckboxes();
  }

  return { inserted, updated };
}

/**
 * Handle Batch Walk-in Sync (for FULL_SYNC backup)
 */
function handleWalkInBatch(ss, walkins) {
  if (!walkins || !walkins.length) return { inserted: 0, updated: 0 };
  const walkinSheet = ss.getSheetByName(CONFIG.SHEETS.WALKIN);
  if (!walkinSheet) return { inserted: 0, updated: 0 };

  const lastRow = walkinSheet.getLastRow();
  const existingMap = new Map();

  if (lastRow > 1) {
    const existing = walkinSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    existing.forEach((r, idx) => {
      const code = String(r[0] || "").trim().toUpperCase();
      if (code) existingMap.set(code, idx + 2);
    });
  }

  let inserted = 0;
  let updated = 0;
  const toAppend = [];

  walkins.forEach(w => {
    const ticketCode = String(w.ticket_code || "").trim();
    if (!ticketCode) return;

    const rowNum = existingMap.get(ticketCode.toUpperCase());
    if (rowNum) {
      if (w.is_checked_in !== undefined) {
        walkinSheet.getRange(rowNum, 12).setValue(w.is_checked_in === true || w.is_checked_in === "true");
        updated++;
      }
    } else {
      toAppend.push([
        ticketCode,
        w.name || "-",
        w.user_type || "นักเรียน",
        w.school || "-",
        normalizePhone(w.phone) || "-",
        w.package_title || "Walk-In",
        Number(w.amount || 0),
        w.payment_method || "-",
        w.transfer_ref4 || "",
        Number(w.cash_received || 0),
        Number(w.cash_change || 0),
        w.is_checked_in === true || w.is_checked_in === "true",
        w.registered_at || getBangkokTimestamp(),
        w.staff_name || "Staff-WalkIn",
        w.notes || ""
      ]);
      inserted++;
    }
  });

  if (toAppend.length > 0) {
    const startRow = walkinSheet.getLastRow() + 1;
    walkinSheet.getRange(startRow, 1, toAppend.length, 15).setValues(toAppend);
    walkinSheet.getRange(startRow, 12, toAppend.length, 1).insertCheckboxes();
  }

  return { inserted, updated };
}

/**
 * Handle Live CHECK_IN
 */
function handleCheckIn(ss, payload) {
  const masterSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER);
  if (!masterSheet) throw new Error("Sheet Master_Attendees not found");

  const ticketCode = String(payload.ticket_code || (payload.booking_code + "-" + payload.person_order)).trim();
  const isCheckedIn = payload.is_checked_in === true || payload.is_checked_in === "true";
  const timestamp = payload.timestamp || getBangkokTimestamp();
  const staffName = payload.staff_name || "Staff";

  const lastRow = masterSheet.getLastRow();
  let found = false;
  let attendeeName = "";

  if (lastRow > 1) {
    const data = masterSheet.getRange(2, 1, lastRow - 1, 18).getValues();
    for (let i = 0; i < data.length; i++) {
      const bCode = String(data[i][0]).trim();
      const pOrder = String(data[i][1]).trim();
      const tCode = String(data[i][17]).trim() || (bCode + "-" + pOrder);

      if (tCode === ticketCode || (bCode === payload.booking_code && pOrder === String(payload.person_order))) {
        const rowNum = i + 2;
        attendeeName = data[i][2];
        masterSheet.getRange(rowNum, 12).setValue(isCheckedIn);
        masterSheet.getRange(rowNum, 13).setValue(isCheckedIn ? timestamp : "");
        masterSheet.getRange(rowNum, 14).setValue(isCheckedIn ? staffName : "");
        masterSheet.getRange(rowNum, 19).setValue(getBangkokTimestamp());
        found = true;
        break;
      }
    }
  }

  // Also check WalkIn_Records if not found in Master
  if (!found) {
    const walkinSheet = ss.getSheetByName(CONFIG.SHEETS.WALKIN);
    if (walkinSheet && walkinSheet.getLastRow() > 1) {
      const wData = walkinSheet.getRange(2, 1, walkinSheet.getLastRow() - 1, 12).getValues();
      for (let j = 0; j < wData.length; j++) {
        const wTicket = String(wData[j][0]).trim();
        if (wTicket === ticketCode) {
          const rowNum = j + 2;
          attendeeName = wData[j][1];
          walkinSheet.getRange(rowNum, 12).setValue(isCheckedIn);
          found = true;
          break;
        }
      }
    }
  }

  // Sync back to Search sheet if visible
  syncCheckinToSearchSheet(ss, ticketCode, isCheckedIn, timestamp, staffName);

  return { found, ticket_code: ticketCode, name: attendeeName, is_checked_in: isCheckedIn };
}

/**
 * Handle Live VOUCHER
 */
function handleVoucher(ss, payload) {
  const masterSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER);
  if (!masterSheet) throw new Error("Sheet Master_Attendees not found");

  const ticketCode = String(payload.ticket_code || (payload.booking_code + "-" + payload.person_order)).trim();
  const voucherUsed = payload.voucher_used === true || payload.voucher_used === "true";
  const timestamp = payload.timestamp || getBangkokTimestamp();
  const staffName = payload.staff_name || "Staff";

  const lastRow = masterSheet.getLastRow();
  let found = false;
  let attendeeName = "";

  if (lastRow > 1) {
    const data = masterSheet.getRange(2, 1, lastRow - 1, 18).getValues();
    for (let i = 0; i < data.length; i++) {
      const bCode = String(data[i][0]).trim();
      const pOrder = String(data[i][1]).trim();
      const tCode = String(data[i][17]).trim() || (bCode + "-" + pOrder);

      if (tCode === ticketCode || (bCode === payload.booking_code && pOrder === String(payload.person_order))) {
        const rowNum = i + 2;
        attendeeName = data[i][2];
        masterSheet.getRange(rowNum, 15).setValue(voucherUsed);
        masterSheet.getRange(rowNum, 16).setValue(voucherUsed ? timestamp : "");
        masterSheet.getRange(rowNum, 17).setValue(voucherUsed ? staffName : "");
        masterSheet.getRange(rowNum, 19).setValue(getBangkokTimestamp());
        found = true;
        break;
      }
    }
  }

  syncVoucherToSearchSheet(ss, ticketCode, voucherUsed, timestamp, staffName);

  return { found, ticket_code: ticketCode, name: attendeeName, voucher_used: voucherUsed };
}

/**
 * Handle Live WALK_IN
 */
function handleWalkIn(ss, payload) {
  const walkinSheet = ss.getSheetByName(CONFIG.SHEETS.WALKIN);
  if (!walkinSheet) throw new Error("Sheet WalkIn_Records not found");

  const newRow = [
    payload.ticket_code || "-",
    payload.name || "-",
    payload.user_type || "นักเรียน",
    payload.school || "-",
    normalizePhone(payload.phone) || "-",
    payload.package_title || "Walk-In",
    Number(payload.amount || 0),
    payload.payment_method || "-",
    payload.transfer_ref4 || "",
    Number(payload.cash_received || 0),
    Number(payload.cash_change || 0),
    payload.is_checked_in === true || payload.is_checked_in === "true",
    payload.registered_at || getBangkokTimestamp(),
    payload.staff_name || "Staff-WalkIn",
    payload.notes || ""
  ];

  walkinSheet.appendRow(newRow);
  const newRowNum = walkinSheet.getLastRow();
  walkinSheet.getRange(newRowNum, 12).insertCheckboxes();

  return { ticket_code: payload.ticket_code, name: payload.name };
}

/**
 * Export for Recovery Sync (pull offline changes back to Supabase)
 */
function handleExportRecovery(ss) {
  const masterSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER);
  const walkinSheet = ss.getSheetByName(CONFIG.SHEETS.WALKIN);

  const checkedAttendees = [];
  if (masterSheet && masterSheet.getLastRow() > 1) {
    const data = masterSheet.getRange(2, 1, masterSheet.getLastRow() - 1, 19).getValues();
    data.forEach(r => {
      const isCheckedIn = r[11] === true || r[11] === "TRUE";
      const voucherUsed = r[14] === true || r[14] === "TRUE";
      if (isCheckedIn || voucherUsed) {
        checkedAttendees.push({
          booking_code: String(r[0]),
          person_order: String(r[1] || "1").trim(),
          ticket_code: String(r[17]),
          name: String(r[2]),
          is_checked_in: isCheckedIn,
          checked_in_at: r[12] ? String(r[12]) : null,
          checked_in_by: r[13] ? String(r[13]) : null,
          voucher_used: voucherUsed,
          voucher_used_at: r[15] ? String(r[15]) : null,
          voucher_used_by: r[16] ? String(r[16]) : null
        });
      }
    });
  }

  const walkinRecords = [];
  if (walkinSheet && walkinSheet.getLastRow() > 1) {
    const wData = walkinSheet.getRange(2, 1, walkinSheet.getLastRow() - 1, 15).getValues();
    wData.forEach(r => {
      walkinRecords.push({
        ticket_code: String(r[0]),
        name: String(r[1]),
        user_type: String(r[2]),
        school: String(r[3]),
        phone: String(r[4]),
        package_title: String(r[5]),
        amount: Number(r[6]),
        payment_method: String(r[7]),
        transfer_ref4: String(r[8]),
        cash_received: Number(r[9]),
        cash_change: Number(r[10]),
        is_checked_in: r[11] === true || r[11] === "TRUE",
        registered_at: String(r[12]),
        staff_name: String(r[13]),
        notes: String(r[14])
      });
    });
  }

  return { attendees: checkedAttendees, walkins: walkinRecords };
}

/**
 * 4. onEdit(e): Direct Spreadsheet Edit Trigger
 * Handles direct user checkboxes and search box typing.
 */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  const row = e.range.getRow();
  const col = e.range.getColumn();
  const val = e.value;

  // Case A: Edited Search Box B4 on Search sheet
  if (sheetName === CONFIG.SHEETS.SEARCH && row === 4 && col === 2) {
    searchAttendees();
    return;
  }

  // Case B: Edited Master_Attendees Checkboxes
  if (sheetName === CONFIG.SHEETS.MASTER && row > 1) {
    const ticketCode = String(sheet.getRange(row, 18).getValue() || (sheet.getRange(row, 1).getValue() + "-" + sheet.getRange(row, 2).getValue()));
    const name = String(sheet.getRange(row, 3).getValue());

    // Check-in (Col 12)
    if (col === 12) {
      const isChecked = val === "TRUE" || val === true;
      const timestamp = isChecked ? getBangkokTimestamp() : "";
      const staff = isChecked ? "Direct Sheet Edit" : "";
      sheet.getRange(row, 13).setValue(timestamp);
      sheet.getRange(row, 14).setValue(staff);
      sheet.getRange(row, 19).setValue(getBangkokTimestamp());
      appendAuditLog("MANUAL_SHEET_EDIT", ticketCode, name, isChecked ? "CHECKED_IN" : "UNCHECKED", staff, "Master_Attendees Direct Edit");
      syncCheckinToSearchSheet(SpreadsheetApp.getActiveSpreadsheet(), ticketCode, isChecked, timestamp, staff);
    }

    // Voucher (Col 15)
    if (col === 15) {
      const isUsed = val === "TRUE" || val === true;
      const timestamp = isUsed ? getBangkokTimestamp() : "";
      const staff = isUsed ? "Direct Sheet Edit" : "";
      sheet.getRange(row, 16).setValue(timestamp);
      sheet.getRange(row, 17).setValue(staff);
      sheet.getRange(row, 19).setValue(getBangkokTimestamp());
      appendAuditLog("MANUAL_SHEET_EDIT", ticketCode, name, isUsed ? "VOUCHER_USED" : "VOUCHER_CANCELLED", staff, "Master_Attendees Direct Edit");
      syncVoucherToSearchSheet(SpreadsheetApp.getActiveSpreadsheet(), ticketCode, isUsed, timestamp, staff);
    }
  }

  // Case C: Checkbox clicked directly in Search Sheet results
  if (sheetName === CONFIG.SHEETS.SEARCH && row >= 8 && row <= 57) {
    const ticketCode = String(sheet.getRange(row, 4).getValue()).trim();
    if (!ticketCode) return;

    const staffName = String(sheet.getRange("B2").getValue() || "Staff-Desk").trim();
    const isMaster = String(sheet.getRange(row, 14).getValue()).includes("Master");

    // Col I (9): Check-in
    if (col === 9) {
      const isChecked = val === "TRUE" || val === true;
      const timestamp = isChecked ? getBangkokTimestamp() : "";
      sheet.getRange(row, 10).setValue(timestamp);
      sheet.getRange(row, 11).setValue(isChecked ? staffName : "");

      // Sync to Master or Walkin
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      handleCheckIn(ss, {
        ticket_code: ticketCode,
        is_checked_in: isChecked,
        timestamp: timestamp,
        staff_name: staffName
      });
    }

    // Col L (12): Voucher
    if (col === 12 && isMaster) {
      const isUsed = val === "TRUE" || val === true;
      const timestamp = isUsed ? getBangkokTimestamp() : "";
      sheet.getRange(row, 13).setValue(timestamp);

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      handleVoucher(ss, {
        ticket_code: ticketCode,
        voucher_used: isUsed,
        timestamp: timestamp,
        staff_name: staffName
      });
    }
  }

  // Case D: Edited 🎓 Cert_Verification Manual Override Checkbox (Col 12)
  if (sheetName === CONFIG.SHEETS.CERT_VERIFY && row >= 7 && col === 12) {
    const isOverride = val === "TRUE" || val === true;
    const hasEval = sheet.getRange(row, 10).getValue() === true;
    const ticketCode = String(sheet.getRange(row, 2).getValue());
    
    if (isOverride) {
      sheet.getRange(row, 11).setValue("🟢 ผ่านเกณฑ์ (อนุมัติพิเศษ)");
      sheet.getRange(row, 13).setValue("อนุมัติพิเศษโดยสตาฟ (" + getBangkokTimestamp() + ")");
      SpreadsheetApp.getActiveSpreadsheet().toast(
        "บันทึกอนุมัติพิเศษสำหรับ " + ticketCode + " แล้ว (กด 'ประมวลผลรายชื่อเกียรติบัตร' เพื่ออัปเดต Final List)",
        "🛡️ อนุมัติพิเศษ",
        4
      );
    } else {
      if (hasEval) {
        sheet.getRange(row, 11).setValue("🟢 ผ่านเกณฑ์ครบถ้วน");
        sheet.getRange(row, 13).setValue("แมตช์ด้วยแบบประเมิน");
      } else {
        sheet.getRange(row, 11).setValue("⏳ มางานแต่ยังไม่ประเมิน");
        sheet.getRange(row, 13).setValue("รอผู้เข้าร่วมส่งแบบประเมิน");
      }
    }
  }
}

/**
 * 5. Interactive Search: searchAttendees()
 * Reads query from B4 and populates Rows 8..57 in Search_Checkin
 */
function searchAttendees() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const searchSheet = ss.getSheetByName(CONFIG.SHEETS.SEARCH);
  if (!searchSheet) return;

  const query = String(searchSheet.getRange("B4").getValue() || "").trim().toLowerCase();
  clearSearchResults(searchSheet);

  if (!query) {
    SpreadsheetApp.getActiveSpreadsheet().toast("กรุณาพิมพ์คำค้นหาในช่อง B4 ก่อนกดค้นหา", "⚠️ ไม่มีคำค้นหา", 3);
    return;
  }

  const results = [];
  const masterSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER);
  if (masterSheet && masterSheet.getLastRow() > 1) {
    const data = masterSheet.getRange(2, 1, masterSheet.getLastRow() - 1, 19).getValues();
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const bCode = String(r[0] || "");
      const pOrder = String(r[1] || "");
      const name = String(r[2] || "");
      const uType = String(r[3] || "");
      const school = String(r[4] || "");
      const phone = String(r[5] || "");
      const tCode = String(r[17] || (bCode + "-" + pOrder));

      const matchStr = (bCode + " " + tCode + " " + name + " " + phone + " " + school).toLowerCase();
      if (matchStr.includes(query)) {
        results.push({
          bCode,
          pOrder,
          tCode,
          name,
          uType,
          school,
          phone,
          isCheckedIn: r[11] === true || r[11] === "TRUE",
          checkedInAt: r[12] || "",
          checkedInBy: r[13] || "",
          voucherUsed: r[14] === true || r[14] === "TRUE",
          voucherUsedAt: r[15] || "",
          source: "Master_Attendees"
        });
      }
      if (results.length >= 50) break;
    }
  }

  // Also search WalkIn_Records if fewer than 50 results
  if (results.length < 50) {
    const walkinSheet = ss.getSheetByName(CONFIG.SHEETS.WALKIN);
    if (walkinSheet && walkinSheet.getLastRow() > 1) {
      const wData = walkinSheet.getRange(2, 1, walkinSheet.getLastRow() - 1, 15).getValues();
      for (let j = 0; j < wData.length; j++) {
        const wr = wData[j];
        const tCode = String(wr[0] || "");
        const name = String(wr[1] || "");
        const uType = String(wr[2] || "");
        const school = String(wr[3] || "");
        const phone = String(wr[4] || "");
        const matchStr = (tCode + " " + name + " " + phone + " " + school).toLowerCase();
        if (matchStr.includes(query)) {
          results.push({
            bCode: "-",
            pOrder: "-",
            tCode,
            name,
            uType,
            school,
            phone,
            isCheckedIn: wr[11] === true || wr[11] === "TRUE",
            checkedInAt: wr[12] || "",
            checkedInBy: wr[13] || "",
            voucherUsed: false,
            voucherUsedAt: "-",
            source: "WalkIn_Records (" + (wr[5] || "Walk-In") + ")"
          });
        }
        if (results.length >= 50) break;
      }
    }
  }

  if (results.length === 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast("ไม่พบข้อมูลผู้เข้าร่วมที่ตรงกับ: '" + query + "'", "🔍 ค้นหาไม่พบ", 4);
    return;
  }

  // Populate search rows in a single bulk 2D array write
  const bulkRows = results.map((res, i) => [
    i + 1,
    res.bCode,
    res.pOrder,
    res.tCode,
    res.name,
    res.uType,
    res.school,
    res.phone,
    res.isCheckedIn,
    res.checkedInAt,
    res.checkedInBy,
    res.voucherUsed,
    res.voucherUsedAt,
    res.source
  ]);

  searchSheet.getRange(8, 1, bulkRows.length, 14).setValues(bulkRows);

  SpreadsheetApp.getActiveSpreadsheet().toast("พบข้อมูล " + results.length + " รายการ", "✅ ค้นหาสำเร็จ", 3);
}

/**
 * Clear search results
 */
function clearSearch() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const searchSheet = ss.getSheetByName(CONFIG.SHEETS.SEARCH);
  if (!searchSheet) return;
  searchSheet.getRange("B4").setValue("");
  clearSearchResults(searchSheet);
  SpreadsheetApp.getActiveSpreadsheet().toast("ล้างคำค้นหาและตารางผลลัพธ์เรียบร้อย", "🧹 ล้างข้อมูล", 2);
}

/**
 * Fast bulk clear of search rows
 */
function clearSearchResults(searchSheet) {
  // Clear columns A-H (text)
  searchSheet.getRange(8, 1, 50, 8).clearContent();
  // Reset check-in checkbox column I
  searchSheet.getRange(8, 9, 50, 1).setValue(false);
  // Clear columns J-K (timestamps and staff)
  searchSheet.getRange(8, 10, 50, 2).clearContent();
  // Reset voucher checkbox column L
  searchSheet.getRange(8, 12, 50, 1).setValue(false);
  // Clear columns M-N (voucher timestamp and source)
  searchSheet.getRange(8, 13, 50, 2).clearContent();
}

/**
 * Sync check-in state to search sheet if visible
 */
function syncCheckinToSearchSheet(ss, ticketCode, isCheckedIn, timestamp, staffName) {
  const searchSheet = ss.getSheetByName(CONFIG.SHEETS.SEARCH);
  if (!searchSheet) return;
  for (let r = 8; r <= 57; r++) {
    const curCode = String(searchSheet.getRange(r, 4).getValue()).trim();
    if (curCode && curCode === ticketCode) {
      searchSheet.getRange(r, 9).setValue(isCheckedIn);
      searchSheet.getRange(r, 10).setValue(isCheckedIn ? timestamp : "");
      searchSheet.getRange(r, 11).setValue(isCheckedIn ? staffName : "");
      break;
    }
  }
}

/**
 * Sync voucher state to search sheet if visible
 */
function syncVoucherToSearchSheet(ss, ticketCode, voucherUsed, timestamp, staffName) {
  const searchSheet = ss.getSheetByName(CONFIG.SHEETS.SEARCH);
  if (!searchSheet) return;
  for (let r = 8; r <= 57; r++) {
    const curCode = String(searchSheet.getRange(r, 4).getValue()).trim();
    if (curCode && curCode === ticketCode) {
      searchSheet.getRange(r, 12).setValue(voucherUsed);
      searchSheet.getRange(r, 13).setValue(voucherUsed ? timestamp : "");
      break;
    }
  }
}

/**
 * Show summary statistics dialog
 */
function showStatsDialog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER);
  const walkinSheet = ss.getSheetByName(CONFIG.SHEETS.WALKIN);

  let totalMaster = 0;
  let checkedInMaster = 0;
  let voucherUsedMaster = 0;

  if (masterSheet && masterSheet.getLastRow() > 1) {
    const data = masterSheet.getRange(2, 1, masterSheet.getLastRow() - 1, 15).getValues();
    totalMaster = data.length;
    data.forEach(r => {
      if (r[11] === true || r[11] === "TRUE") checkedInMaster++;
      if (r[14] === true || r[14] === "TRUE") voucherUsedMaster++;
    });
  }

  let totalWalkin = 0;
  let checkedInWalkin = 0;
  let totalWalkinRevenue = 0;

  if (walkinSheet && walkinSheet.getLastRow() > 1) {
    const wData = walkinSheet.getRange(2, 1, walkinSheet.getLastRow() - 1, 12).getValues();
    totalWalkin = wData.length;
    wData.forEach(r => {
      totalWalkinRevenue += Number(r[6] || 0);
      if (r[11] === true || r[11] === "TRUE") checkedInWalkin++;
    });
  }

  const msg = 
    "📊 สรุปยอดข้อมูลล่าสุด SMST Open House 2026\n\n" +
    "👥 ผู้ลงทะเบียนล่วงหน้า (Master):\n" +
    " • ทั้งหมด: " + totalMaster + " คน\n" +
    " • เช็คอินเข้างานแล้ว: " + checkedInMaster + " คน (" + (totalMaster ? Math.round((checkedInMaster / totalMaster) * 100) : 0) + "%)\n" +
    " • ใช้ Voucher 10% แล้ว: " + voucherUsedMaster + " สิทธิ์\n\n" +
    "🚶‍♂️ ผู้ลงทะเบียน Walk-in:\n" +
    " • ทั้งหมด: " + totalWalkin + " คน\n" +
    " • เช็คอินเข้างานแล้ว: " + checkedInWalkin + " คน\n" +
    " • ยอดเงินชำระ Walk-in: ฿" + totalWalkinRevenue.toLocaleString() + " บาท\n\n" +
    "🎯 รวมยอดผู้เข้างานจริงขณะนี้: " + (checkedInMaster + checkedInWalkin) + " คน";

  SpreadsheetApp.getUi().alert(msg);
}

/**
 * Helper to return JSON HTTP response with CORS headers
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ============================================================================
 * 🎓 CERTIFICATE ELIGIBILITY VERIFICATION ENGINE
 * ============================================================================
 */

/**
 * Helper to normalize phone numbers into clean 10-digit format (0XXXXXXXXX)
 */
function normalizePhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.startsWith("66") && d.length === 11) d = "0" + d.slice(2);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  return d;
}

/**
 * 🎓 processCertificateVerification(): Certificate Eligibility Engine
 * Fast in-memory 2-layer matching (Phone Primary + Ticket Code Fallback)
 * Reads check-in data from Master_Attendees and WalkIn_Records, matches with Form_Evaluation,
 * preserves existing manual overrides, and populates 🎓 Cert_Verification & 🏆 Final_Cert_List.
 */
function processCertificateVerification() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER);
  const walkinSheet = ss.getSheetByName(CONFIG.SHEETS.WALKIN);
  const evalSheet = ss.getSheetByName(CONFIG.SHEETS.EVALUATION);
  const verifySheet = ss.getSheetByName(CONFIG.SHEETS.CERT_VERIFY);
  const finalSheet = ss.getSheetByName(CONFIG.SHEETS.FINAL_CERT);

  if (!masterSheet || !walkinSheet || !evalSheet || !verifySheet || !finalSheet) {
    setupSheets();
    return processCertificateVerification();
  }

  // 1. Gather all checked-in attendees from Master_Attendees
  const checkedInAttendees = [];
  const checkedInTicketCodes = new Set();
  const checkedInPhones = new Set();

  if (masterSheet.getLastRow() > 1) {
    const mData = masterSheet.getRange(2, 1, masterSheet.getLastRow() - 1, 19).getValues();
    mData.forEach(r => {
      const isCheckedIn = r[11] === true || r[11] === "TRUE";
      if (isCheckedIn) {
        const bCode = String(r[0] || "").trim();
        const pOrder = String(r[1] || "").trim();
        const tCode = String(r[17] || (bCode + "-" + pOrder)).trim();
        const phone = normalizePhone(r[5]);

        let round = "รอบลงทะเบียนล่วงหน้า";
        if (bCode.startsWith("EB")) round = "รอบ Early Bird";
        else if (bCode.startsWith("R1") || bCode.startsWith("MORN")) round = "รอบทั่วไป (เช้า)";
        else if (bCode.startsWith("R2") || bCode.startsWith("AFT")) round = "รอบทั่วไป (บ่าย)";

        const att = {
          ticket_code: tCode,
          booking_code: bCode,
          name: String(r[2] || "").trim(),
          user_type: String(r[3] || "นักเรียน").trim(),
          school: String(r[4] || "-").trim(),
          phone: phone,
          round: round,
          source: "Master_Attendees"
        };
        checkedInAttendees.push(att);
        if (tCode) checkedInTicketCodes.add(tCode.toUpperCase());
        if (phone) checkedInPhones.add(phone);
      }
    });
  }

  // 2. Gather all checked-in attendees from WalkIn_Records
  if (walkinSheet.getLastRow() > 1) {
    const wData = walkinSheet.getRange(2, 1, walkinSheet.getLastRow() - 1, 15).getValues();
    wData.forEach(wr => {
      const isCheckedIn = wr[11] === true || wr[11] === "TRUE";
      if (isCheckedIn) {
        const tCode = String(wr[0] || "").trim();
        const phone = normalizePhone(wr[4]);
        const att = {
          ticket_code: tCode,
          booking_code: tCode,
          name: String(wr[1] || "").trim(),
          user_type: String(wr[2] || "นักเรียน").trim(),
          school: String(wr[3] || "-").trim(),
          phone: phone,
          round: String(wr[5] || "รอบ Walk-in").trim(),
          source: "WalkIn_Records"
        };
        checkedInAttendees.push(att);
        if (tCode) checkedInTicketCodes.add(tCode.toUpperCase());
        if (phone) checkedInPhones.add(phone);
      }
    });
  }

  // 3. Preserve existing Manual Overrides from 🎓 Cert_Verification
  const manualOverrides = new Map();
  if (verifySheet.getLastRow() >= 7) {
    const existingVerify = verifySheet.getRange(7, 1, verifySheet.getLastRow() - 6, 13).getValues();
    existingVerify.forEach(r => {
      const tCode = String(r[1] || "").trim().toUpperCase();
      const isOverride = r[11] === true || r[11] === "TRUE";
      if (tCode && isOverride) {
        manualOverrides.set(tCode, true);
      }
    });
  }

  // 4. Index Form_Evaluation responses
  const formByPhone = new Map();
  const formByTicket = new Map();
  const allFormSubmissions = [];

  if (evalSheet.getLastRow() > 1) {
    const evalData = evalSheet.getRange(2, 1, evalSheet.getLastRow() - 1, 8).getValues();
    evalData.forEach((er, idx) => {
      const timestamp = String(er[0] || "");
      const rawPhone = String(er[1] || "");
      const phone = normalizePhone(rawPhone);
      const ticketCode = String(er[2] || "").trim().toUpperCase();
      const prefix = String(er[3] || "").trim();
      const fullNameCert = String(er[4] || "").trim();
      const email = String(er[5] || "").trim();
      const satisfaction = er[6];
      const notes = String(er[7] || "");

      const submission = {
        rowIdx: idx + 2,
        timestamp,
        phone,
        ticketCode,
        prefix,
        fullNameCert,
        email,
        satisfaction,
        notes
      };
      allFormSubmissions.push(submission);

      // Latest submission overwrites older submission for the same key
      if (phone) {
        formByPhone.set(phone, submission);
      }
      if (ticketCode) {
        formByTicket.set(ticketCode, submission);
      }
    });
  }

  // 5. Match and Build Verification Rows & Final Certificate Rows
  const verifyRows = [];
  const finalRows = [];

  let countPassEval = 0;
  let countPassOverride = 0;
  let countPendingEval = 0;

  const matchedSubmissions = new Set();

  checkedInAttendees.forEach((att, idx) => {
    // 1st Priority: Match by Phone
    let evalMatch = att.phone ? formByPhone.get(att.phone) : null;
    let matchType = "Phone (เบอร์ตรง)";

    // 2nd Priority: Fallback match by Ticket Code
    if (!evalMatch && att.ticket_code) {
      evalMatch = formByTicket.get(att.ticket_code.toUpperCase());
      if (evalMatch) matchType = "TicketCode (รหัสตั๋วตรง)";
    }

    if (evalMatch) {
      matchedSubmissions.add(evalMatch);
    }

    const hasEval = Boolean(evalMatch);
    const isOverride = manualOverrides.get(att.ticket_code.toUpperCase()) === true;

    let status = "";
    let matchNote = "";

    if (hasEval) {
      status = "🟢 ผ่านเกณฑ์ครบถ้วน";
      matchNote = "แมตช์ด้วย " + matchType;
      countPassEval++;
    } else if (isOverride) {
      status = "🟢 ผ่านเกณฑ์ (อนุมัติพิเศษ)";
      matchNote = "อนุมัติพิเศษโดยสตาฟ (Manual Override)";
      countPassOverride++;
    } else {
      status = "⏳ มางานแต่ยังไม่ประเมิน";
      matchNote = "รอผู้เข้าร่วมส่งแบบประเมิน";
      countPendingEval++;
    }

    // Name on certificate (prefer name submitted in evaluation form)
    let prefix = "";
    let certFullName = "";
    let certEmail = "-";

    if (evalMatch && evalMatch.fullNameCert) {
      prefix = evalMatch.prefix || "";
      certFullName = (prefix ? prefix + " " : "") + evalMatch.fullNameCert;
      certEmail = evalMatch.email || "-";
    } else {
      certFullName = att.name;
    }

    const vRow = [
      idx + 1,
      att.ticket_code,
      att.phone,
      att.name,
      certFullName,
      att.user_type,
      att.school,
      certEmail,
      true, // Checked-in (Col 9)
      hasEval, // Evaluation (Col 10)
      status,  // Col 11
      isOverride, // Manual Override (Col 12)
      matchNote  // Col 13
    ];
    verifyRows.push(vRow);

    if (status.startsWith("🟢")) {
      const finalRow = [
        finalRows.length + 1,
        prefix,
        certFullName,
        att.user_type,
        att.school,
        certEmail,
        att.phone,
        att.ticket_code,
        att.round,
        isOverride && !hasEval ? "อนุมัติพิเศษ (Manual Override)" : "แบบประเมิน (" + matchType + ")"
      ];
      finalRows.push(finalRow);
    }
  });

  // 6. Section for Unmatched Evaluations ("ทำประเมินแล้ว แต่หาในฝั่งเช็กอินไม่เจอ")
  let countUnmatchedEval = 0;
  allFormSubmissions.forEach(sub => {
    if (!matchedSubmissions.has(sub)) {
      const phoneInChecked = sub.phone && checkedInPhones.has(sub.phone);
      const ticketInChecked = sub.ticketCode && checkedInTicketCodes.has(sub.ticketCode);
      if (!phoneInChecked && !ticketInChecked) {
        countUnmatchedEval++;
        const isOverride = sub.ticketCode && manualOverrides.get(sub.ticketCode) === true;
        const certFullName = (sub.prefix ? sub.prefix + " " : "") + sub.fullNameCert;
        
        const status = isOverride ? "🟢 ผ่านเกณฑ์ (อนุมัติพิเศษ)" : "⚠️ ทำประเมินแล้วแต่ไม่พบข้อมูลเช็คอิน";
        const matchNote = isOverride ? "อนุมัติพิเศษโดยสตาฟ" : "ไม่พบเบอร์/รหัสตั๋วในระบบเช็คอิน (อาจพิมพ์เบอร์ผิด)";

        verifyRows.push([
          verifyRows.length + 1,
          sub.ticketCode || "-",
          sub.phone,
          "-",
          certFullName,
          "นักเรียน",
          "-",
          sub.email || "-",
          false, // Checked-in
          true,  // Evaluation
          status,
          Boolean(isOverride),
          matchNote
        ]);

        if (isOverride) {
          finalRows.push([
            finalRows.length + 1,
            sub.prefix,
            certFullName,
            "นักเรียน",
            "-",
            sub.email || "-",
            sub.phone,
            sub.ticketCode || "-",
            "รอบทั่วไป",
            "อนุมัติพิเศษ (Manual Override)"
          ]);
        }
      }
    }
  });

  // 7. Write bulk updates to 🎓 Cert_Verification
  const lastVerifyRow = verifySheet.getLastRow();
  if (lastVerifyRow >= 7) {
    verifySheet.getRange(7, 1, lastVerifyRow - 6, 13).clearContent();
    verifySheet.getRange(7, 1, lastVerifyRow - 6, 13).clearDataValidations();
  }

  if (verifyRows.length > 0) {
    verifySheet.getRange(7, 1, verifyRows.length, 13).setValues(verifyRows);

    // Apply Checkboxes for Col 9 (I), Col 10 (J), Col 12 (L)
    const checkValidation = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    verifySheet.getRange(7, 9, verifyRows.length, 1).setDataValidation(checkValidation);
    verifySheet.getRange(7, 10, verifyRows.length, 1).setDataValidation(checkValidation);
    verifySheet.getRange(7, 12, verifyRows.length, 1).setDataValidation(checkValidation);

    // Plain text phone format
    verifySheet.getRange(7, 3, verifyRows.length, 1).setNumberFormat("@");
  }

  // 8. Write bulk updates to 🏆 Final_Cert_List
  const lastFinalRow = finalSheet.getLastRow();
  if (lastFinalRow >= 5) {
    finalSheet.getRange(5, 1, lastFinalRow - 4, 10).clearContent();
  }

  if (finalRows.length > 0) {
    finalSheet.getRange(5, 1, finalRows.length, 10).setValues(finalRows);
    finalSheet.getRange(5, 7, finalRows.length, 1).setNumberFormat("@");
  }

  // 9. Toast notification
  const totalEligible = finalRows.length;
  ss.toast("🎉 ประมวลผลรายชื่อเกียรติบัตรเสร็จสิ้น! ผู้มีสิทธิ์ทั้งหมด: " + totalEligible + " คน", "✅ สำเร็จ", 5);
  Logger.log("==================================================");
  Logger.log("🎓 ประมวลผลรายชื่อเกียรติบัตรสำเร็จ:");
  Logger.log(" • รวมผู้เช็คอินเข้างานจริง: " + checkedInAttendees.length + " คน");
  Logger.log(" • ทำแบบประเมินและผ่านเกณฑ์: " + countPassEval + " คน");
  Logger.log(" • ผ่านเกณฑ์ด้วยอนุมัติพิเศษ (Override): " + countPassOverride + " คน");
  Logger.log(" • เข้างานแต่ยังไม่ทำแบบประเมิน: " + countPendingEval + " คน");
  Logger.log(" • ทำแบบประเมินแต่ไม่พบประวัติเช็คอิน: " + countUnmatchedEval + " รายการ");
  Logger.log(" • ยอดผู้มีสิทธิ์ใน Final_Cert_List: " + totalEligible + " คน");
  Logger.log("==================================================");

  return {
    checked_in: checkedInAttendees.length,
    passed_evaluation: countPassEval,
    manual_override: countPassOverride,
    pending_evaluation: countPendingEval,
    unmatched_evaluation: countUnmatchedEval,
    total_eligible: totalEligible
  };
}

/**
 * Show Certificate Statistics Dialog
 */
function showCertStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const verifySheet = ss.getSheetByName(CONFIG.SHEETS.CERT_VERIFY);
  const finalSheet = ss.getSheetByName(CONFIG.SHEETS.FINAL_CERT);

  if (!verifySheet || !finalSheet) {
    SpreadsheetApp.getUi().alert("⚠️ ยังไม่ได้ติดตั้งชีทเกียรติบัตร กรุณากด 'ติดตั้งและสร้างชีทอัตโนมัติ' ก่อน");
    return;
  }

  let totalChecked = 0;
  let passedEval = 0;
  let overrideCount = 0;
  let pendingCount = 0;
  let unmatchedCount = 0;

  if (verifySheet.getLastRow() >= 7) {
    const vData = verifySheet.getRange(7, 1, verifySheet.getLastRow() - 6, 13).getValues();
    vData.forEach(r => {
      const status = String(r[10] || "");
      if (status === "🟢 ผ่านเกณฑ์ครบถ้วน") passedEval++;
      else if (status === "🟢 ผ่านเกณฑ์ (อนุมัติพิเศษ)") overrideCount++;
      else if (status === "⏳ มางานแต่ยังไม่ประเมิน") pendingCount++;
      else if (status.includes("ไม่พบข้อมูลเช็คอิน")) unmatchedCount++;
      if (r[8] === true || r[8] === "TRUE") totalChecked++;
    });
  }

  const finalCount = finalSheet.getLastRow() >= 5 ? (finalSheet.getLastRow() - 4) : 0;

  const msg = 
    "🎓 สรุปสถานะการตรวจสิทธิ์เกียรติบัตร — SMST Open House 2026\n\n" +
    "👥 ผู้เข้าร่วมที่เช็คอินเข้างานจริง: " + totalChecked + " คน\n" +
    " • ผ่านเกณฑ์ครบถ้วน (เช็คอิน + ประเมิน): " + passedEval + " คน\n" +
    " • ผ่านเกณฑ์ด้วยอนุมัติพิเศษ (Override): " + overrideCount + " คน\n" +
    " • มางานแต่ยังไม่ทำแบบประเมิน: " + pendingCount + " คน\n\n" +
    "⚠️ ผู้ทำประเมินแต่ไม่พบข้อมูลเช็คอิน: " + unmatchedCount + " คน (กรอกเบอร์ไม่ตรง)\n\n" +
    "🏆 รวมผู้มีสิทธิ์ได้รับเกียรติบัตรฉบับสมบูรณ์ (Final List): " + finalCount + " คน\n\n" +
    "💡 กด '🎓 ประมวลผลรายชื่อเกียรติบัตร' ทุกครั้งที่มีการส่งแบบประเมินเพิ่ม";

  SpreadsheetApp.getUi().alert(msg);
}
