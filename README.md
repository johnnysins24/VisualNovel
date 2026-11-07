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
npm test          # Vitest
npm run shots     # Playwright ถ่ายจอ 3 ขนาดลงโฟลเดอร์ shots/
```

## โครงสร้าง

| โฟลเดอร์ | หน้าที่ |
| --- | --- |
| `src/engine/` | schema (Zod), seed RNG, d20, เลือกเหตุการณ์, equipment + passive, เซฟ IndexedDB, ตัวตรวจเนื้อเรื่อง |
| `src/sprites/` | ประกอบชั้น sprite ตาม z, เปลี่ยนสีด้วย palette role, แคช (ตอนนี้เป็นบล็อกสีชั่วคราว) |
| `src/ui/` | Preact + Signals หน้าจอเดียว ปรับ layout 3 แบบด้วย CSS grid |
| `content/` | เหตุการณ์ ของ และกลุ่มชื่อเป็น YAML (เนื้อหาทดสอบอยู่ใน `tests/fixtures/content`) |
| `scripts/` | build/validate เนื้อหา |

ตัดสินใจแล้ว: canvas 64×96 และร่างฐาน 1 ร่าง (A2, A3) ยังเป็นค่าชั่วคราว: ธีม/ฟอนต์ใน `src/ui/styles.css` (A8, A9) ตรวจกับ docs/PLAN.md

## Deploy (Cloudflare Pages)

ผูก repo กับ Cloudflare Pages ด้วยตัวเอง: build command `npm run build`, output `dist`, Node 22
Pages จะสร้างลิงก์ทดลองให้ทุก PR เอง (ต้องใช้บัญชี Cloudflare ของ Phupha ผมไม่ได้ผูกให้)
