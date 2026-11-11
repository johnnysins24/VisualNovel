import { buildPiece, compose, H, renderLook, W, type Look } from '../../art/kit/core.mjs';
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

const icons = new Map<string, string | null>();

/**
 * รูปของชิ้นของ (เช่น ดาบ โล่) ตัดเฉพาะส่วนที่มีภาพ วางกลางช่องสี่เหลี่ยม ใช้ในช่องสวมใส่
 * วาดบนร่างชายเพื่อหาตำแหน่ง แต่ไม่วาดตัวร่าง คืน null ถ้าไม่มีชิ้นที่วาดได้
 */
export function itemIconUrl(pieceIds: string[]): string | null {
  const key = pieceIds.join(',');
  if (icons.has(key)) return icons.get(key)!;
  let url: string | null = null;
  const ids = pieceIds.filter((id) => kit.pieces[id]);
  if (ids.length) {
    const built = ids.map((id) => buildPiece(kit, id, 'm'));
    const { rgba } = compose(kit, built);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rgba[(y * W + x) * 4 + 3]) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (x1 >= 0) {
      const w = x1 - x0 + 1, h = y1 - y0 + 1, side = Math.max(w, h) + 2;
      const src = document.createElement('canvas');
      src.width = W; src.height = H;
      src.getContext('2d')!.putImageData(new ImageData(rgba as unknown as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0);
      const c = document.createElement('canvas');
      c.width = side; c.height = side;
      c.getContext('2d')!.drawImage(src, x0, y0, w, h, Math.floor((side - w) / 2), Math.floor((side - h) / 2), w, h);
      url = c.toDataURL();
    }
  }
  icons.set(key, url);
  return url;
}

const portraits = new Map<string, { url: string; w: number; h: number }>();

/** ภาพตัวละครตัดเฉพาะส่วนที่มีภาพ (ผ้าใบ 64×96 มีที่ว่างรอบตัวมาก) ใช้เป็นภาพเหมือนในหน้าชีวประวัติ คืนขนาดเป็นพิกเซลของภาพ */
export function portraitUrl(look: Look): { url: string; w: number; h: number } {
  const key = lookKey(look);
  const hit = portraits.get(key);
  if (hit) return hit;
  const img = lookImage(look);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (img.data[(y * W + x) * 4 + 3]) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  let out = { url: '', w: 1, h: 1 };
  if (x1 >= 0) {
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const src = document.createElement('canvas');
    src.width = W; src.height = H;
    src.getContext('2d')!.putImageData(img, 0, 0);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(src, x0, y0, w, h, 0, 0, w, h);
    out = { url: c.toDataURL(), w, h };
  }
  if (portraits.size > 50) portraits.clear();
  portraits.set(key, out);
  return out;
}
