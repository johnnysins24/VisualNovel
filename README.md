# เถ้ากับดาว (VisualNovel)

เกมนิยายแฟนตาซีแนว DnD แบบเลือกทาง เล่นบนเว็บ เริ่มตั้งแต่วันเกิดและเลือกไปเรื่อยๆ จนจบชีวิต
ออกแบบสำหรับมือถือแนวตั้ง แนวนอน และเดสก์ท็อป

- แผนเกม: [docs/PLAN.md](docs/PLAN.md)
- ระบบเกมและวิธีเขียนเหตุการณ์: [docs/SYSTEMS.md](docs/SYSTEMS.md)
- กติกาสำหรับ Claude: [CLAUDE.md](CLAUDE.md)
- รูปอ้างอิงสไตล์ภาพ: [docs/ref/](docs/ref/)

สถานะ: โค้ดตั้งต้น (Phase 1) เนื้อเรื่องและภาพเป็นค่าชั่วคราว รอ thread เนื้อเรื่องและศิลป์

## เริ่มใช้

```bash
npm install
npm run content   # YAML -> src/generated/content.json (ตรวจ Zod + ตัวตรวจเนื้อเรื่อง)
npm run dev        # เนื้อหาจริงใน content/
npm run dev:fixture  # ใช้เนื้อหาทดสอบใน tests/fixtures/content
npm run check     # ระหว่างทำงาน: ตรวจเนื้อหา ชนิดข้อมูล และเทสต์ logic (ราว 10 วินาที)
npm test          # ชุดเต็มก่อน push: Vitest ทั้งหมด รวม tests/slow/ (ชีวิตจำลอง 400 ชีวิต และไฟล์ภาพ)
npm run shots     # เมื่อแก้หน้าจอ: Playwright ถ่ายจอ 3 ขนาดลงโฟลเดอร์ shots/ แล้วคืนเนื้อหาจริงให้เอง
npm run audit     # เมื่อแก้สมดุล: จำลอง 2,000 ชีวิตแล้วพิมพ์รายงาน
```

กติกาว่าเมื่อไรรันอะไรอยู่ในหัวข้อ "การทดสอบ" ของ [CLAUDE.md](CLAUDE.md)

## โครงสร้าง

| โฟลเดอร์ | หน้าที่ |
| --- | --- |
| `src/engine/` | schema (Zod), seed RNG, d20, เลือกเหตุการณ์, equipment + passive, เซฟ IndexedDB, ตัวตรวจเนื้อเรื่อง |
| `src/sprites/` | ประกอบชั้น sprite ตาม z, เปลี่ยนสีด้วย palette role, แคช (ตอนนี้เป็นบล็อกสีชั่วคราว) |
| `src/ui/` | Preact + Signals หน้าจอเดียว ปรับ layout 3 แบบด้วย CSS grid |
| `content/` | เหตุการณ์ ของ ร้านค้า ศัตรู และกลุ่มชื่อเป็น YAML (เนื้อหาทดสอบอยู่ใน `tests/fixtures/content`) |
| `scripts/` | build/validate เนื้อหา |

ตัดสินใจแล้ว: canvas 64×96 และร่างฐาน 1 ร่าง (A2, A3) ยังเป็นค่าชั่วคราว: ธีม/ฟอนต์ใน `src/ui/styles.css` (A8, A9) ตรวจกับ docs/PLAN.md

## Deploy (Cloudflare Workers)

เว็บเกมเป็นไฟล์ static เสิร์ฟผ่าน Cloudflare Worker ชื่อ `visualnovel` (ตั้งค่าใน `wrangler.jsonc`)

- deploy เองจากเครื่อง: `npm run build && npx wrangler@4 deploy` (ครั้งแรกรัน `npx wrangler@4 login`)
- อัตโนมัติ: `.github/workflows/deploy.yml` deploy ทุกครั้งที่ push main และทำลิงก์ทดลองให้ทุก PR (คอมเมนต์ลิงก์ไว้ใน PR)
  ต้องมี repo secret `CLOUDFLARE_API_TOKEN` (สร้างจาก template "Edit Cloudflare Workers") ส่วน account id อยู่ใน `wrangler.jsonc` แล้ว
  ถ้ายังไม่มี secret workflow จะข้ามไปโดยไม่ fail
