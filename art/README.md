# งานศิลป์: ตัวละคร voxel แบบ Voxel Realm

ตัวละครของเกมสร้างด้วยวิธีเดียวกับ Voxel Realm (โปรเจกต์ก่อนหน้าของ Phupha) ทุกอย่าง โค้ดตัวละครของ Voxel Realm ถูกแปลงจาก GDScript มาเป็น JavaScript ล้วนใน `voxel/` ไม่ต้องใช้ Godot และไม่ต้องติดตั้งอะไรเพิ่ม

- **ร่าง** ปั้นจากรูปทรง (SDF) ตามเพศ เผ่า และสัดส่วน แล้วตัดเป็นชิ้นตามข้อต่อ voxel ของตัวขนาด 1/16 ม.
- **ชุด** เป็นชิ้น voxel ที่ทาลงบนร่างทีละชิ้นตามช่อง (ขา เท้า ตัว เสื้อนอก เอว ไหล่ แขน มือ หลัง คอ) เปลี่ยนชิ้นไหนก็ทาใหม่แค่ชิ้นนั้น ไม่มีการวาดตัวละครทั้งตัวใหม่
- **หัว** voxel ขนาด 1/32 ม. หน้า 17 อารมณ์ ผม 21 ทรง เขา หาง และของบนหัว
- **ภาพ** ถ่ายหน้าตรงแบบ orthographic ด้วยแสงและ shader เดียวกับห้องถ่ายภาพของ Voxel Realm 1 พิกเซลต่อ voxel ของหัว (voxel ของตัวเป็น 2×2 พิกเซล) แล้วตีขอบเข้ม 1 พิกเซล

ภาพเต็มตัวใช้ canvas 64×96 ตามข้อ A2 เท้าอยู่แถวเดียวกันทุกตัว หน้าอยู่พิกเซลเดียวกับภาพ portrait

![ตัวเปล่าชายหญิง](preview/voxel/bare.png)

ชุดเริ่มต้นของทั้ง 6 class บนร่างชายและหญิง

![6 class](preview/voxel/classes.png)

ชุดนักรบใส่ทีละชิ้น จากตัวเปล่าถึงครบชุด

![นักรบทีละชิ้น](preview/voxel/steps_warrior.png)

17 อารมณ์ เรียงตามลำดับของ Voxel Realm: ปกติ ยิ้ม ดีใจ หัวเราะ เศร้า ร้องไห้ โกรธ ตกใจ เขิน ยิ้มเยาะ เจ็บ ง่วง หลับ ขยิบตา สลบ กิน จดจ่อ

![17 อารมณ์](preview/voxel/expressions_f.png)

## ร่างแบบ VisualNovel: หัวใหญ่ขึ้น อวัยวะแก้ใหม่

Phupha ขอแบบ Voxel Realm แต่หัวใหญ่ขึ้นและอวัยวะถูกต้อง `voxel/vn.mjs` จึงเป็นร่างอีกแบบที่ใช้โค้ดปั้น แต่งตัว และวาดภาพชุดเดียวกัน ต่างแค่สัดส่วนกับรูปทรง

- หัว หน้า ผม และ 17 อารมณ์ เหมือน Voxel Realm ทุกพิกเซล ร่างเตี้ยลงจนทั้งตัวสูง 3.25, 3 หรือ 2.5 หัว (ของเดิมราว 3.75 หัว)
- ร่างละเอียด 1/32 ม. เท่ากับหัว ไม่ย่อเป็น voxel 2×2 จึงมีข้อมือ มือ ข้อเท้า เท้า และซ้ายขวาเท่ากันทุกพิกเซล
- คอโผล่ บ่าลาดลงหาหัวไหล่ ไม่มีไหล่โป่งเหมือนใส่บ่าเสริม แขนห่างลำตัว 1 พิกเซล มือกว้างกว่าข้อมือ เท้ากว้างกว่าข้อเท้าและปลายเท้าหันออกเล็กน้อย
- ชุดทุกชิ้นใส่ได้เลย ระยะในโค้ดชุดย่อตามร่าง ส่วนบนร่าง Voxel Realm ค่าย่อเป็น 1 ทั้งหมด ภาพจึงเหมือนเดิมทุกพิกเซล

กลุ่มซ้ายสุดคือร่าง Voxel Realm แล้วตามด้วย 3.25, 3 และ 2.5 หัว แต่ละกลุ่มขยายให้สูงพอ ๆ กัน แบบที่จะเห็นบนจอเกม

![สัดส่วนหัว](preview/voxel/vn_proportions.png)

ชุดเริ่มต้นทั้ง 6 class บนร่าง 3 หัว (มีภาพของ 3.25 และ 2.5 หัวใน `preview/voxel/` ด้วย)

![6 class บนร่าง 3 หัว](preview/voxel/vn_classes_3.png)

## ตรงกับ Voxel Realm แค่ไหน

`tools/voxel-verify.mjs` วาด sprite ชุดเดียวกับที่ Voxel Realm bake ไว้ใน `client/assets/ui/creator` แล้วเทียบทีละพิกเซล: portrait เผ่ามนุษย์ชายหญิง หน้า 17 อารมณ์ และ portrait ของ origin 19 แบบที่ใช้ชุดในตัว รวม 38 ภาพ 25,568 พิกเซล รูปทรงตรงทุกพิกเซล สีตรงเป๊ะ 95.9% ที่เหลือต่างกัน 1 ถึง 2 ระดับสี เพราะ GPU ปัดเศษแสงบิตสุดท้ายต่างกัน มองด้วยตาไม่เห็น

แถวบนคือ sprite ของ Voxel Realm แถวล่างคือที่วาดใหม่

![เทียบกับของเดิม](preview/voxel/match.png)

## ใช้งาน

```sh
# sprite ตัวเดียว: full (เต็มตัว 64×96) portrait (32×32) หรือ face (20×20)
node art/tools/voxel-render.mjs full '{"race":"human","body":1,"hs":4,"cls":"warrior"}' --expr smile --scale 4 --out warrior.png

# ภาพทั้งหมดใน preview/voxel/ (ใส่โฟลเดอร์ของ Voxel Realm ด้วยถ้าจะสร้าง match.png)
node art/tools/voxel-preview.mjs [voxel/client/assets/ui/creator]

# เทียบกับ sprite ของ Voxel Realm หลังแก้โค้ดใน voxel/ ทุกครั้ง
node art/tools/voxel-verify.mjs <voxel/client/assets/ui/creator>

# ร่างแบบ VisualNovel: --vn ตามด้วยความสูงเป็นจำนวนหัว
node art/tools/voxel-render.mjs full '{"race":"human","body":1,"hs":4,"cls":"cleric"}' --vn 3 --out cleric.png
```

ในโค้ดใช้ `fullBody(look, { style: vnStyle(3) })` ส่วน `portrait` และ `faceIcon` รับ `style` แบบเดียวกัน

ค่าของตัวละครใช้ชื่อเดียวกับ `CharAppearance.to_dict()` ของ Voxel Realm: `race` `body` (0 ชาย 1 หญิง) `skin` `hs` (ทรงผม) `hc` (สีผม) `eye` `om` `ot` (สีชุดหลักและรอง) `cls` `acc` (ของบนหัว) `outfit` ส่วน `outfit` ใช้เปลี่ยนชิ้นตามช่อง เช่น `{"body": "coat"}` ใส่เสื้อโค้ตแทนชิ้นเดิม `{"over": ""}` ถอดเสื้อนอก `{"bare": true}` เหลือแค่ชุดชั้นใน ใช้เวลาวาดราว 12 ms ต่อตัว จึงวาดสดในเกมได้

## ไฟล์ใน `voxel/`

| ไฟล์ | มาจาก (Voxel Realm) | หน้าที่ |
| --- | --- | --- |
| `gd.mjs` | | เลียนแบบคณิตของ Godot: float32, ปัดเศษ, smoothstep, สุ่ม PCG32 |
| `appearance.mjs` | `char_appearance.gd` `char_races.gd` | ค่าของตัวละคร สีผิว ผม ตา ชุด เผ่า |
| `pal.mjs` | `char_models.gd` `palette.gd` | palette ของตัวละคร |
| `grid.mjs` | `voxel_data.gd` `models.gd` | กริด voxel และเครื่องมือวาด |
| `body.mjs` | `char_body.gd` | ปั้นร่าง ผิว ชุดชั้นใน ตัดชิ้นตามข้อต่อ |
| `outfits.mjs` | `char_outfits.gd` | ชิ้นชุดในตัวทั้งหมด และชุดเริ่มต้นของแต่ละ class |
| `head.mjs` | `char_models.gd` | หัว หน้า อารมณ์ ผม เขา หาง ของบนหัว |
| `rig.mjs` | `char_rig.gd` | ประกอบชิ้นตามข้อต่อในท่ายืน |
| `render.mjs` | `mesher.gd` `voxel.gdshader` `char_portrait.gd` | mesh ด้านหน้า แสง เงา AO ขอบเส้น crop |
| `sprite.mjs` | `char_portrait.gd` `creator_icon_bake.gd` | portrait, face icon และภาพเต็มตัว |
| `vn.mjs` | | ร่างแบบ VisualNovel: สัดส่วนหัวใหญ่ขึ้นและรูปทรงอวัยวะที่แก้ใหม่ |
| `sheet.mjs` `png.mjs` | | เรียงภาพ อ่านเขียน PNG |

## ยังไม่ได้แปลง

ชุดจากระบบ Equipment ของ Voxel Realm (`gear_*.gd`: ชิ้น `g_*` หมวก `h_*`) อาวุธ และท่าทางจากแอนิเมชัน ชิ้นชุดใหม่ของโลกเถ้ากับดาวจะเขียนเพิ่มใน `outfits.mjs` แบบเดียวกับชิ้นเดิม หลัง Phupha อนุมัติแบบ
