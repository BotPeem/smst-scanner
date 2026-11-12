// =====================================================================
//  SMST Open House 2026 — ข้อมูลงานที่ทีมแก้ได้เอง (ไฟล์นี้ไฟล์เดียว)
//  • ค่าที่เป็น null จะแสดงเป็น "รอประกาศ" บนหน้าเว็บ (ไม่ต้องลบทิ้ง)
//  • เวลาใช้รูปแบบ "HH:MM" แบบ 24 ชม. เช่น "08:30"
//  • วันที่ใช้รูปแบบ "YYYY-MM-DD" (ค.ศ.) เช่น "2026-11-28"
// =====================================================================
window.SMST_CONFIG = {
  event: {
    name: "SMST Open House 2026",
    organizer: "สหพันธ์นิสิตนักศึกษาแพทย์แห่งประเทศไทย (สพท.)",
    date: "2026-11-28",      // วันงาน: 28 พ.ย. 2569
    venue: "สถานีกลางกรุงเทพอภิวัฒน์ ชั้น M", // ชื่อสถานที่
    mapUrl: "https://www.google.com/maps/place/Krung+Thep+Aphiwat+Central+Station/@13.8039601,100.5412343,17.75z/data=!4m6!3m5!1s0x30e29de8f7a73e4d:0x4f6950293cc41764!8m2!3d13.8030173!4d100.5425595!16s%2Fg%2F11khbnn96b?entry=tts&g_ep=EgoyMDI2MTAwNy4wIPu8ASoASAFQAw%3D%3D&skid=6df5ed2b-e63c-446e-912d-15ef23667e31",    // ลิงก์ Google Maps
  },

  // ---------------------------------------------------------------------
  //  เวลาแต่ละรอบ (หน้า landing ให้น้อง ๆ เช็กว่าต้องมากี่โมง)
  //    arrive        = เวลาที่ควรมาถึง / เปิดลงทะเบียน
  //    start, end    = ช่วงเวลากิจกรรมของรอบ
  //    checkInFrom / checkInUntil = ช่วงเวลาที่รับเช็กอิน
  //                    (ถ้าใส่ไว้ หน้าสตาฟจะเตือนเมื่อมีคนมาผิดเวลา แต่ยังกดเช็กอินได้)
  //    note          = ข้อความเพิ่มเติมสั้น ๆ
  //    showOnLanding = แสดงรอบนี้ในตาราง "รอบการเข้างาน" บนหน้า landing หรือไม่
  // ---------------------------------------------------------------------
  rounds: {
    early: {
      label: "รอบ Early Bird",
      arrive: "07:00", start: null, end: null,
      checkInFrom: null, checkInUntil: null,
      note: "",
      showOnLanding: true,
    },
    morning: {
      label: "รอบทั่วไป · เช้า",
      arrive: "07:00", start: null, end: null,
      checkInFrom: null, checkInUntil: null,
      note: "",
      showOnLanding: true,
    },
    afternoon: {
      label: "รอบทั่วไป · บ่าย",
      arrive: "13:00", start: null, end: null,
      checkInFrom: null, checkInUntil: null,
      note: "",
      showOnLanding: true,
    },
    walkin: {
      label: "รอบ Walk-in",
      arrive: "07:00 / 13:00",
       arriveMorning: "07:00",
       arriveAfternoon: "13:00",
       slots: [
         { label: "รอบเช้า", arrive: "07:00" },
         { label: "รอบบ่าย", arrive: "13:00" },
       ],
       start: null, end: null,
      checkInFrom: null, checkInUntil: null,
      note: "",
      showOnLanding: true, // เปิดเป็น true เมื่อยืนยันว่ามีรอบ Walk-in
    },
  },

  // ---------------------------------------------------------------------
  //  Voucher ส่วนลดซื้อของหน้างาน (ฝ่าย Marketing)
  //    enabled       = ปิดเป็น false เพื่อซ่อนฟีเจอร์ Voucher ทั้งระบบ
  //    showOnLanding = ให้น้อง ๆ เห็น Voucher ของตัวเองบนหน้า landing
  // ---------------------------------------------------------------------
  voucher: {
    enabled: true,
    showOnLanding: true,
    earlyBirdPercent: 10,
    generalPercent: 7,
    title: "Voucher ส่วนลดซื้อของหน้างาน",
    terms: [
      "ใช้ได้ 1 ครั้ง ต่อ 1 คน",
      "สำหรับการสมัครแบบกลุ่ม 2 คนขึ้นไป หรือแพ็กที่มีบัตรผู้ปกครอง",
      "แสดง QR ให้สตาฟฝ่าย Marketing สแกนก่อนชำระเงิน",
    ],
  },

  // ช่องทางติดต่อ (ใส่ลิงก์เต็ม) — ช่องไหนเป็น null จะไม่แสดง
  contact: {
    facebook: null,
    instagram: null,
    line: null,
  },
};
