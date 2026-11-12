import YAML from 'yaml';
import { makeKit, type Kit } from '../../art/kit/core.mjs';

/**
 * ชุด sprite ของเกม (art/) โหลดเข้าเบราว์เซอร์: YAML ทุกไฟล์ถูกรวมเข้า bundle ตอน build
 * แล้วใช้โค้ดเดียวกับเครื่องมือศิลป์ (art/kit/core.mjs) ภาพในเกมจึงตรงกับภาพตัวอย่างทุกพิกเซล
 */
const raw = import.meta.glob(['../../art/*.yaml', '../../art/pieces/**/*.yaml'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const file = (rel: string) => {
  const s = raw[`../../art/${rel}`];
  if (s === undefined) throw new Error(`ไม่มีไฟล์ art/${rel}`);
  return YAML.parse(s);
};

const pieces: Record<string, unknown> = {};
for (const [path, text] of Object.entries(raw)) {
  const m = /^\.\.\/\.\.\/art\/pieces\/(.+)\.yaml$/.exec(path);
  if (m) pieces[m[1]!] = YAML.parse(text);
}

export const kit: Kit = makeKit({
  palette: file('palette.yaml'),
  bodies: file('bodies.yaml'),
  pieces,
  npcs: file('npcs.yaml'),
  races: file('races.yaml'),
  hair: file('hair.yaml'),
  outfits: file('outfits.yaml'),
  items: file('items.yaml'),
});
