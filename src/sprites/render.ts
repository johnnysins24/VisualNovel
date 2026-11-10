import { H, renderLook, W, type Look } from '../../art/kit/core.mjs';
import { kit } from './kit';

export const CANVAS = { w: W, h: H } as const;

const lookKey = (look: Look) => JSON.stringify([look.body, look.pieces, look.face, look.choices, look.colors]);

const pixels = new Map<string, ImageData>();

/** ภาพ RGBA ของรูปร่างหนึ่ง (เก็บไว้ใช้ซ้ำ รูปเดิมไม่วาดใหม่) */
export function lookImage(look: Look): ImageData {
  const key = lookKey(look);
  let img = pixels.get(key);
  if (!img) {
    const { w, h, rgba } = renderLook(kit, look);
    img = new ImageData(rgba as unknown as Uint8ClampedArray<ArrayBuffer>, w, h);
    if (pixels.size > 200) pixels.clear();
    pixels.set(key, img);
  }
  return img;
}

/** วาดรูปร่างลง canvas ขนาด 64×96 */
export function drawLook(ctx: CanvasRenderingContext2D, look: Look) {
  ctx.clearRect(0, 0, W, H);
  ctx.putImageData(lookImage(look), 0, 0);
}

const faces = new Map<string, string>();
/** ด้านบนของกรอบหน้า: แถวหัวของร่างลบ 6 (เผื่อผม หมวก เขา) */
const FACE = 24;

/** รูปหน้าครึ่งบน (ใช้ในวงกลมของผังคน) เป็น data URL */
export function faceUrl(look: Look): string {
  const key = lookKey(look);
  const hit = faces.get(key);
  if (hit) return hit;
  const top = Math.max(0, kit.bodies[look.body]!.marks.head! - 6);
  const c = document.createElement('canvas');
  c.width = FACE;
  c.height = FACE;
  const tmp = document.createElement('canvas');
  tmp.width = W;
  tmp.height = H;
  tmp.getContext('2d')!.putImageData(lookImage(look), 0, 0);
  c.getContext('2d')!.drawImage(tmp, 31 - FACE / 2 + 1, top, FACE, FACE, 0, 0, FACE, FACE);
  const url = c.toDataURL();
  if (faces.size > 200) faces.clear();
  faces.set(key, url);
  return url;
}
