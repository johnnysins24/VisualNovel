# ของฟรีจากที่อื่น (third-party)

ไฟล์ต้นฉบับจากชุดภาพฟรี เก็บไว้ตามที่ดาวน์โหลดมา ห้ามแก้ไฟล์ในนี้ ให้ดัดแปลงผ่าน `art/adopted.yaml` แล้วรัน `node art/kit/adopt.mjs` (ต้องมี Chromium ของ Playwright ถ้า Playwright หา browser ไม่เจอ ให้ตั้ง `CHROMIUM_PATH`)
Licence และเครดิตของทุกชุดอยู่ใน [CREDITS.md](../../CREDITS.md) และในเกม (`src/ui/credits.ts`) ทุกชุดมี `SOURCE.md` บอกที่มา

กติกา (Phupha เลือกเมื่อ 10 พ.ย. 2026: CC0 และ CC BY)
- รับเฉพาะ CC0 หรือ CC BY ห้าม CC BY-SA, GPL, ห้ามใช้เพื่อการค้า, ห้ามแก้ไข หรือ licence ที่ห้ามแจกต่อ (repo นี้เปิดสาธารณะ)
- ชุดใหม่ต้องเพิ่มใน CREDITS.md และ `src/ui/credits.ts` ใช้ไอคอน game-icons.net ตัวใหม่ต้องใส่ชื่อผู้วาดในตารางของ CREDITS.md
- เก็บแค่ไฟล์ภาพ (png, svg) และไฟล์ข้อความ licence ไม่เก็บโค้ดหรือโปรแกรมจากชุดภาพ
- ภาพที่ใช้ในเกมต้องผ่าน `adopt.mjs` หรือ `npm run draw -- import` ของห้องวาด (ดู art/README.md หัวข้อห้องวาด) ก่อน เพื่อให้สีอยู่ใน palette และเส้นขอบเป็น #2b2840 แบบตัวละคร
