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
    AUDIT: "Scan_Audit_Log"
  },
  THEME: {
    NAVY_DARK: "#140B33",      // Header background & brand primary
    NAVY_CARD: "#1E1548",      // Secondary header & card background
    GOLD_ACCENT: "#FBC80E",    // Brand highlight & search borders
    GOLD_LIGHT: "#FFFBEB",     // Input field background
    MINT_GREEN: "#4FD1A5",     // Check-in accent
    MINT_LIGHT: "#D1FAE5",     // Checked state highlight
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
    .addItem("📊 อัปเดตและดูสถิติ (View Statistics)", "showStatsDialog")
    .addToUi();
}

/**
 * 1. setupSheets(): Automated Sheet Architect
 * Sets up and formats all 4 sheets with full SMST theme styling, borders, and validation.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Create or get sheets
  const searchSheet = getOrCreateSheet(ss, CONFIG.SHEETS.SEARCH);
  const masterSheet = getOrCreateSheet(ss, CONFIG.SHEETS.MASTER);
  const walkinSheet = getOrCreateSheet(ss, CONFIG.SHEETS.WALKIN);
  const auditSheet = getOrCreateSheet(ss, CONFIG.SHEETS.AUDIT);

  // Set Sheet order
  ss.setActiveSheet(searchSheet);
  ss.moveActiveSheet(1);
  ss.setActiveSheet(masterSheet);
  ss.moveActiveSheet(2);
  ss.setActiveSheet(walkinSheet);
  ss.moveActiveSheet(3);
  ss.setActiveSheet(auditSheet);
  ss.moveActiveSheet(4);

  // Configure each sheet
  buildSearchSheet(searchSheet);
  buildMasterSheet(masterSheet);
  buildWalkinSheet(walkinSheet);
  buildAuditSheet(auditSheet);

  ss.setActiveSheet(searchSheet);
  ss.toast("🎉 ติดตั้งระบบ SMST Backup เรียบร้อยทั้ง 4 ชีทแล้ว!", "✅ ติดตั้งสำเร็จ", 10);
  Logger.log("==================================================");
  Logger.log("🎉 ติดตั้งระบบ SMST Backup สำเร็จเรียบร้อยแล้ว!");
  Logger.log("สร้างครบทั้ง 4 ชีทตามธีม SMST เรียบร้อย:");
  Logger.log("1. 🔍 Search_Checkin (หน้าค้นหา & เช็คอินฉุกเฉิน)");
  Logger.log("2. Master_Attendees (ฐานข้อมูลผู้ลงทะเบียนล่วงหน้า)");
  Logger.log("3. WalkIn_Records (บันทึก Walk-in & การเงิน)");
  Logger.log("4. Scan_Audit_Log (ประวัติการทำรายการย้อนหลัง)");
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
        appendAuditLog("FULL_SYNC", "ALL", "Full Database Sync", "SUCCESS", payload.staff_name || "Admin", { attendees: attendees.length, walkins: walkins.length });
        return createJsonResponse({ ok: true, message: "Full sync completed", attendees_synced: attResult });
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
      r.phone || "",
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
    payload.phone || "-",
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
