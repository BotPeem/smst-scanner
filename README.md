# smst-scanner

ระบบเว็บของ **SMST Open House 2026** — หน้าให้น้อง ๆ เช็กรอบ/เวลาเข้างาน และระบบสตาฟสำหรับเช็กอินและ Voucher
ดีไซน์ตามอัตลักษณ์ SMST CC Starter Kit (สีหลัก `#273990` · `#00B3BE` · `#FBC80E`, ฟอนต์ Prompt) และธีมโปสเตอร์ Open House 2026

| หน้า | URL | สำหรับ |
| --- | --- | --- |
| Landing | `/` | น้อง ๆ / ผู้ปกครอง — กรอกเบอร์โทรหรือรหัสการจอง เพื่อดูว่าสมัครรอบไหน ต้องมากี่โมง สถานะเช็กอิน QR สำหรับเข้างาน และ Voucher |
| Staff | `/staff` | สตาฟ — สแกน QR เช็กอิน (ฝ่ายทะเบียน), ใช้ Voucher (ฝ่าย Marketing), Dashboard / จัดการสตาฟ / นำเข้า CSV (Admin) |

## ตั้งค่าข้อมูลงาน (แก้ไฟล์เดียว)

แก้ที่ [`assets/js/config.js`](assets/js/config.js) — ค่าที่ยังเป็น `null` จะแสดงเป็น "รอประกาศ"

- `event.date` / `event.venue` / `event.mapUrl` — วันงาน สถานที่ ลิงก์แผนที่
- `rounds.<รอบ>.arrive` — เวลาที่น้อง ๆ ควรมาถึง (แสดงตัวใหญ่บนหน้า landing)
- `rounds.<รอบ>.start` / `end` — ช่วงเวลากิจกรรมของรอบ
- `rounds.<รอบ>.checkInFrom` / `checkInUntil` — ถ้าใส่ไว้ หน้าสตาฟจะเตือนเมื่อมีคนมาผิดเวลา (ในวันงาน) แต่ยังกดเช็กอินได้
- `rounds.walkin.showOnLanding` — เปิดเป็น `true` เมื่อมีรอบ Walk-in
- `voucher` — เปิด/ปิด Voucher, เปอร์เซ็นต์ส่วนลด (Early Bird / รอบทั่วไป), ข้อความเงื่อนไข และการแสดงบนหน้า landing
- `contact` — ลิงก์ Facebook / Instagram / LINE ที่ท้ายหน้า landing

## สิทธิ์ของสตาฟ

| Role | ทำอะไรได้ |
| --- | --- |
| ฝ่ายทะเบียน (`registration`) | สแกน / ค้นหา และกดเช็กอินเข้างาน (มีโหมดเช็กอินอัตโนมัติเมื่อสแกน) |
| ฝ่าย Marketing (`marketing`) | สแกน / ค้นหา และกดใช้ Voucher ส่วนลด (1 คน / 1 สิทธิ์) |
| Admin (`admin`) | ทุกอย่าง + Dashboard + จัดการสตาฟ + นำเข้า CSV + รีเซ็ต |

## ใช้งานบน iPad / laptop

- รองรับมือถือ, iPad แนวตั้ง (แถบเมนูด้านล่าง), iPad แนวนอนและ laptop (เมนูด้านข้าง)
- iPad: เปิด `/staff` ใน Safari → แชร์ → **เพิ่มไปยังหน้าจอโฮม** จะเปิดแบบเต็มจอเหมือนแอป
- ปุ่ม **สลับกล้อง** ใช้กล้องหน้าได้ (ให้น้องยื่น QR ใส่หน้าจอ iPad ที่โต๊ะลงทะเบียน)
- ใช้เครื่องสแกนบาร์โค้ด USB / Bluetooth ได้ — สแกนได้เลยโดยไม่ต้องแตะช่องค้นหา
- ถ้าเน็ตหลุด การเช็กอิน / Voucher จะบันทึกไว้ในเครื่องและซิงก์ให้อัตโนมัติเมื่อกลับมาออนไลน์

## โครงสร้างไฟล์

```
index.html              หน้า landing (น้อง ๆ)
staff.html              หน้าระบบสตาฟ
staff.webmanifest       ตั้งค่า "เพิ่มไปยังหน้าจอโฮม"
vercel.json             cleanUrls (/staff)
assets/
  css/theme.css         design tokens (ธีมกลางคืน / ธีมฟ้าลาเวนเดอร์) + components
  css/landing.css       หน้า landing
  css/staff.css         หน้าสตาฟ
  js/config.js          ข้อมูลงาน / เวลาแต่ละรอบ / Voucher  ← แก้ไฟล์นี้
  js/icons.js           ไอคอน SVG
  js/common.js          Supabase, กฎรอบบัตร / Voucher, ธีม, toast, dialog
  js/landing.js         ค้นหาการสมัคร + QR
  js/staff.js           สแกน, เช็กอิน, Voucher, รายชื่อ, Dashboard, สตาฟ, CSV
  img/                  โลโก้ SMST / Open House, ไอคอน, ภาพแชร์ (og)
```

เป็นเว็บ static ไม่มีขั้นตอน build — deploy บน Vercel จาก branch `main` ได้ทันที
ทดสอบในเครื่อง: `python3 -m http.server` แล้วเปิด `http://localhost:8000` (หน้าสตาฟคือ `/staff.html`)
