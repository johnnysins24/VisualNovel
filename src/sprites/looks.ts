import { fitsBody, type Look } from '../../art/kit/core.mjs';
import { npcLook, rng, UNDER } from '../../art/kit/npc.mjs';
import type { ItemIndex } from '../engine/items';
import type { LifeState, Person } from '../engine/state';
import { kit } from './kit';

/** อายุที่เปลี่ยนจากร่างเด็กเป็นร่างผู้ใหญ่ */
export const CHILD_UNTIL = 12;
/** อายุที่เริ่มมีริ้วรอย */
const OLD_FROM = 55;

const fits = (id: string | undefined, body: string): id is string => !!id && !!kit.pieces[id] && fitsBody(kit.pieces[id], body, kit);

const raceOf = (l: Pick<LifeState, 'flags'>) => {
  const r = l.flags.find((f) => f.startsWith('race_'))?.slice(5);
  return r && kit.data.races[r] ? r : 'human';
};
const originOf = (l: Pick<LifeState, 'flags'>) => l.flags.find((f) => f.startsWith('origin_'))?.slice(7) ?? 'farm';

/** ชุดเด็กตามถิ่นกำเนิด */
const CHILD_WEAR: Record<string, string> = {
  farm: 'body/child_farm', refinery: 'body/child_refinery', dwarf_clan: 'body/child_farm', elf_bough: 'body/child_farm',
  marked_hidden: 'body/child_rich', marked_kept: 'body/child_farm', marked_foundling: 'body/child_street', ashland: 'body/child_street',
};
/** ชุดผู้ใหญ่ก่อนมีอาชีพ ตามถิ่นกำเนิด [ชาย, หญิง] */
const GROWN_WEAR: Record<string, [string, string]> = {
  farm: ['body/farmer', 'body/dress'], refinery: ['body/overalls', 'body/overalls'], dwarf_clan: ['body/overalls', 'body/farmer'],
  elf_bough: ['body/elf', 'body/elf'], marked_hidden: ['body/doublet', 'body/dress'], marked_kept: ['body/farmer', 'body/dress'],
  marked_foundling: ['body/farmer', 'body/farmer'], ashland: ['body/farmer', 'body/farmer'],
};
/** ชุดและของประจำอาชีพ (ของที่ถือจริงในช่องเดียวกันมาแทน) */
const CLASS_WEAR: Record<string, { wear: string; extra?: string[]; weapon?: string; offhand?: string; colors?: Record<string, string> }> = {
  warrior: { wear: 'body/leather_armor', weapon: 'weapon/longsword', offhand: 'offhand/shield', colors: { cloth: 'dye_wine' } },
  rogue: { wear: 'body/leather_armor', extra: ['cloak/travel'], offhand: 'offhand/dagger', colors: { cloth: 'dye_grey', trim: 'dye_black', leather: 'leather_black' } },
  wizard: { wear: 'body/mage_robe', weapon: 'weapon/staff', offhand: 'offhand/tome', colors: { cloth: 'dye_purple', trim: 'dye_mustard' } },
  cleric: { wear: 'body/cleric_robe', extra: ['acc/holy_symbol'], weapon: 'weapon/mace', colors: { cloth: 'dye_white' } },
  ranger: { wear: 'body/leather_armor', extra: ['cloak/ranger'], weapon: 'weapon/bow', colors: { cloth: 'dye_moss', trim: 'dye_earth' } },
  bard: { wear: 'body/doublet', extra: ['cloak/cape'], offhand: 'offhand/lute', colors: { cloth: 'dye_sky', trim: 'dye_mustard' } },
};
const DYES = ['dye_earth', 'dye_grey', 'dye_navy', 'dye_wine', 'dye_moss', 'dye_sky', 'dye_mustard'];

const feetFor = (wear: string): string | undefined =>
  Object.values(kit.data.outfits as Record<string, Record<string, { feet?: string }> | null>).map((g) => g?.[wear]?.feet).find(Boolean);

/** ชิ้นของของที่สวมอยู่: art/items.yaml ก่อน แล้วค่อย field sprite ของ item */
function itemPieces(l: LifeState, items: ItemIndex): string[] {
  return Object.values(l.equipped).flatMap((id) => (id ? piecesOfItem(id, items) : []));
}

/** ชิ้นภาพของของหนึ่งชิ้น: art/items.yaml ก่อน แล้วค่อย field sprite ของ item (ไม่มีภาพคืน []) */
export function piecesOfItem(id: string, items: ItemIndex): string[] {
  const mapped = (kit.data.items as Record<string, string[]>)[id];
  const sprite = items.get(id)?.sprite;
  return (mapped ?? (sprite ? [sprite] : [])).filter((p) => kit.pieces[p]);
}

/** สีหน้าจากสถานะ: สลบเมื่อตาย เจ็บเมื่อเลือดเหลือน้อย ยิ้มหรือเศร้าตามผลทอยล่าสุด */
export function faceOf(l: LifeState, maxHp: number): string {
  if (!l.alive && l.endReason === 'death') return 'ko';
  if (l.hp <= Math.max(1, Math.floor(maxHp * 0.3))) return 'hurt';
  const roll = l.log[l.log.length - 1]?.roll;
  if (roll) return roll.success ? 'smile' : 'sad';
  return 'neutral';
}

/**
 * รูปร่างของตัวละครผู้เล่นจากสถานะ: เพศ อายุ (ร่างเด็กก่อน 12) เผ่า ถิ่นกำเนิด อาชีพ เทพ และของที่สวม
 * สีผิว ผม ตา และทรงผมสุ่มคงที่จาก seed ของชีวิต (ยังไม่มีหน้าสร้างตัวละคร) ชีวิตเดิมจึงหน้าตาเดิมเสมอ
 */
export function playerLook(l: LifeState, items: ItemIndex, face = 'neutral'): Look {
  const r = rng(`player:${l.seed}`);
  const one = <T,>(a: T[]): T => a[Math.floor(r() * a.length)]!;
  const sex = l.gender;
  const child = l.age < CHILD_UNTIL;
  const body = child ? `c${sex}` : sex;
  const race = raceOf(l);
  const origin = originOf(l);
  const rc = kit.data.races[race] as Record<string, any>;

  // ทุกอย่างที่สุ่มสุ่มก่อนตามลำดับเดิมเสมอ ผลจึงไม่เปลี่ยนเมื่อโตขึ้น
  const hairStyle = one(Object.keys(kit.data.hair[sex]).filter((h) => h !== 'bald'));
  const choices: Record<string, string> = {
    skin: one(Object.keys(kit.pal.choices.skin!)),
    hair: one(Object.keys(kit.pal.choices.hair!)),
    eyes: one(Object.keys(kit.pal.choices.eyes!)),
  };
  if (race === 'tiefling') choices.eyes = 'amber';
  const horns = one(Object.keys(rc.horns ?? { _: 0 }));
  const beard = one(Object.keys(rc.beard ?? { _: 0 }));
  const wantsMoustache = r() < 0.35;
  const childDye = one(DYES);

  const pieces = ['face/basic', ...UNDER[body]!, `hair/${sex}/${hairStyle}`, ...(rc.always ?? [])];
  if (rc.horns) pieces.push(child ? 'horns/stumps' : horns);
  if (sex === 'm' && !child && rc.beard && (race === 'dwarf' || (wantsMoustache && l.age >= 20))) pieces.push(beard);
  if (l.age >= OLD_FROM) pieces.push('mark/wrinkles');

  const colors: Record<string, string> = {};
  const held = itemPieces(l, items);
  const cls = !child && l.classId ? CLASS_WEAR[l.classId] : undefined;
  if (child) {
    pieces.push(CHILD_WEAR[origin] ?? 'body/child_farm');
    colors.cloth = childDye;
  } else if (cls) {
    pieces.push(cls.wear, ...(cls.extra ?? []));
    Object.assign(colors, cls.colors);
    for (const slot of ['weapon', 'offhand'] as const) {
      const def = cls[slot];
      if (def && !held.some((p) => p.startsWith(`${slot}/`))) pieces.push(def);
    }
    if (l.classId === 'cleric' && l.god) Object.assign(colors, kit.data.npcs.gods[l.god]?.colors);
  } else {
    pieces.push((GROWN_WEAR[origin] ?? GROWN_WEAR.farm!)[sex === 'm' ? 0 : 1]);
  }
  const wear = pieces.find((p) => p.startsWith('body/'));
  const feet = wear && feetFor(wear);
  if (feet) pieces.push(feet);
  // ของที่สวมทับชิ้นเดิมในช่องเดียวกัน (หมวก ผ้าคลุม อาวุธ มือรอง)
  for (const p of held) {
    const slot = p.split('/')[0]!;
    if (['head', 'cloak', 'weapon', 'offhand', 'body'].includes(slot)) {
      const i = pieces.findIndex((q) => q.startsWith(`${slot}/`));
      if (i >= 0) pieces.splice(i, 1);
    }
    pieces.push(p);
  }
  return { body, pieces: dedupe(pieces.filter((p) => fits(p, body))), face, choices, colors };
}

const dedupe = (a: string[]) => [...new Set(a)];

/** กลุ่ม NPC (art/npcs.yaml) ที่คนรอบตัวในถิ่นกำเนิดนั้นมักเป็น */
const HOME_GROUP: Record<string, string> = {
  farm: 'worker', refinery: 'workshop', dwarf_clan: 'workshop', elf_bough: 'elf_villager',
  marked_hidden: 'noble', marked_kept: 'worker', marked_foundling: 'dockrat', ashland: 'worker',
};
const ELDER = new Set(['grandfather_paternal', 'grandmother_paternal', 'grandfather_maternal', 'grandmother_maternal']);
const BLOOD = new Set(['father', 'mother', 'sibling_older', 'sibling_younger', 'child', ...ELDER]);

/** NPC ที่มีชื่อ (npcs.yaml named) ใช้รูปที่กำหนดไว้ */
export function namedLook(id: string, face = 'neutral'): Look | null {
  const n = kit.data.npcs.named?.[id];
  return n ? { ...n.look, face } : null;
}

/**
 * รูปของคนรอบตัว: คนที่มีชื่อในงานศิลป์ใช้รูปที่กำหนด คนอื่นสุ่มคงที่จากสูตรกลุ่มตามถิ่นกำเนิดของผู้เล่น
 * ญาติสายเลือดเป็นเผ่าเดียวกับผู้เล่น ปู่ย่าตายายมีริ้วรอย ลูกใช้ร่างเด็ก
 */
export function personLook(p: Pick<Person, 'id' | 'gender' | 'kin'>, l: LifeState): Look {
  const named = namedLook(p.id);
  if (named) return named;
  const kidKin = p.kin === 'child' || (l.age < CHILD_UNTIL && (p.kin === 'sibling_younger'));
  const group = kidKin ? 'child' : HOME_GROUP[originOf(l)] ?? 'worker';
  const sex = p.gender ?? (/mother|grandmother|sister/.test(p.kin ?? '') ? 'f' : /father|brother/.test(p.kin ?? '') ? 'm' : undefined);
  const body = sex ? (kidKin ? `c${sex}` : sex) : undefined;
  const race = p.kin && BLOOD.has(p.kin) ? raceOf(l) : undefined;
  const look = npcLook(kit, group, `${l.seed}:${p.id}`, { body, race });
  if (p.kin && ELDER.has(p.kin)) {
    look.choices = { ...look.choices, hair: 'silver' };
    if (fits('mark/wrinkles', look.body) && !look.pieces!.includes('mark/wrinkles')) look.pieces!.push('mark/wrinkles');
  }
  return look;
}

/** ชื่อไทยสั้นของ NPC ที่มีชื่อ (ส่วนก่อนวงเล็บใน npcs.yaml) ใช้หาว่าเหตุการณ์พูดถึงใคร */
const NAMED_TH: [string, string][] = Object.entries((kit.data.npcs.named ?? {}) as Record<string, { name: string }>).map(
  ([id, n]) => [id, n.name.split(' (')[0]!.trim()],
);

/** ชื่อไทยของ NPC ที่มีชื่อ */
export const namedName = (id: string) => NAMED_TH.find(([k]) => k === id)?.[1] ?? id;

/** NPC ที่มีชื่อคนแรกที่ข้อความเอ่ยถึง (ไม่มีคืน null) */
export function namedInText(text: string): string | null {
  let best: [string, number] | null = null;
  for (const [id, th] of NAMED_TH) {
    const i = text.indexOf(th);
    if (i >= 0 && (!best || i < best[1])) best = [id, i];
  }
  return best?.[0] ?? null;
}
