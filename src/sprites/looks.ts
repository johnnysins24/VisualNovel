import { fitsBody, type Look } from '../../art/kit/core.mjs';
import { npcLook, rng, UNDER } from '../../art/kit/npc.mjs';
import type { ItemIndex } from '../engine/items';
import { humanAge, type LifeState, type Person } from '../engine/state';
import { kit } from './kit';

/**
 * ช่วงวัยของรูปร่าง ตามอายุเทียบมนุษย์ (humanAge: เอลฟ์กับคนแคระหลัง 40 นับช้ากว่าอายุจริง)
 * แรกเกิด 0 ห่อผ้าในตะกร้า, ทารก 1 นั่งในชุดหมี, เด็กเล็ก 2–4, เด็ก 5–11, วัยรุ่น 12–15, ผู้ใหญ่ 16 ขึ้นไป
 */
export type Stage = 'newborn' | 'baby' | 'toddler' | 'child' | 'teen' | 'adult';
export const STAGE_FROM: [Stage, number][] = [['adult', 16], ['teen', 12], ['child', 5], ['toddler', 2], ['baby', 1], ['newborn', 0]];
export const stageOf = (age: number): Stage => STAGE_FROM.find(([, from]) => age >= from)?.[0] ?? 'newborn';
/** ร่างใน art/bodies.yaml ของแต่ละช่วงวัย ต่อท้ายด้วยเพศ */
const STAGE_BODY: Record<Stage, string> = { newborn: 'b', baby: 'b', toddler: 't', child: 'c', teen: 'y', adult: '' };
export const bodyFor = (stage: Stage, sex: 'm' | 'f') => `${STAGE_BODY[stage]}${sex}`;
const SMALL = new Set<Stage>(['newborn', 'baby', 'toddler', 'child']);
/** อายุ (เทียบมนุษย์) ที่เริ่มมีริ้วรอย และที่ผมเริ่มขาว */
const OLD_FROM = 55;
const GREY_FROM = 50;
/** ทรงผมที่เด็กเล็กไว้ได้ (ทรงอื่นยาวหรือเป็นผู้ใหญ่เกินไปสำหรับเด็กสองสามขวบ) */
const TODDLER_HAIR: Record<'m' | 'f', string[]> = { m: ['short', 'messy'], f: ['bob', 'pixie', 'ponytail', 'twin_braids'] };
/** ผมสีเงินเป็นของเอลฟ์และคนแก่ (A13) คนเผ่าอื่นสุ่มได้แต่สีอื่น */
const youngHair = (race: string) => Object.keys(kit.pal.choices.hair!).filter((h) => race === 'elf' || h !== 'silver');

/** ชิ้นของทารก: ผมบาง ห่อผ้าในตะกร้าตอนแรกเกิด ชุดหมีตอนขวบหนึ่ง (ชิ้นเผ่าเติมเอง) */
const babyPieces = (stage: Stage) => ['face/basic', 'under/briefs', 'hair/wisp', ...(stage === 'newborn' ? ['body/swaddle', 'acc/basket'] : ['body/baby_romper'])];

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
  const out: string[] = [];
  for (const id of Object.values(l.equipped)) {
    if (!id) continue;
    const mapped = (kit.data.items as Record<string, string[]>)[id];
    const sprite = items.get(id)?.sprite;
    out.push(...(mapped ?? (sprite ? [sprite] : [])));
  }
  return out;
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
  const age = humanAge(l);
  const stage = stageOf(age);
  const child = SMALL.has(stage);
  const body = bodyFor(stage, sex);
  const race = raceOf(l);
  const origin = originOf(l);
  const rc = kit.data.races[race] as Record<string, any>;

  // ทุกอย่างที่สุ่มสุ่มก่อนตามลำดับเดิมเสมอ ผลจึงไม่เปลี่ยนเมื่อโตขึ้น
  const hairStyle = one(Object.keys(kit.data.hair[sex]).filter((h) => h !== 'bald'));
  const choices: Record<string, string> = {
    skin: one(Object.keys(kit.pal.choices.skin!)),
    hair: one(youngHair(race)),
    eyes: one(Object.keys(kit.pal.choices.eyes!)),
  };
  if (race === 'tiefling') choices.eyes = 'amber';
  const horns = one(Object.keys(rc.horns ?? { _: 0 }));
  const beard = one(Object.keys(rc.beard ?? { _: 0 }));
  const wantsMoustache = r() < 0.35;
  const childDye = one(DYES);

  if (age >= GREY_FROM) choices.hair = 'silver';
  // เด็กเล็กไว้ผมสั้นกว่า: ทรงที่ยาวเกินไปเปลี่ยนเป็นทรงเด็กแบบคงที่ตามทรงเดิม
  const kidStyles = TODDLER_HAIR[sex];
  const style = stage === 'toddler' && !kidStyles.includes(hairStyle) ? kidStyles[hairStyle.length % kidStyles.length]! : hairStyle;
  const baby = stage === 'newborn' || stage === 'baby';
  const pieces = baby ? [...babyPieces(stage), ...(rc.always ?? [])] : ['face/basic', ...UNDER[body]!, `hair/${sex}/${style}`, ...(rc.always ?? [])];
  if (rc.horns) pieces.push(child ? 'horns/stumps' : horns);
  // หนวดเครา: ผู้ชายโตแล้วเท่านั้น (ชิ้น grown ไม่เข้ากับร่างวัยรุ่น) คนแคระไว้เคราทุกคน เผ่าอื่นบางคนไว้หนวดตั้งแต่ 20
  if (sex === 'm' && stage === 'adult' && rc.beard && (race === 'dwarf' || (wantsMoustache && age >= 20))) pieces.push(beard);
  if (age >= OLD_FROM) pieces.push('mark/wrinkles');

  const colors: Record<string, string> = {};
  const held = itemPieces(l, items);
  const cls = !child && l.classId ? CLASS_WEAR[l.classId] : undefined;
  if (baby) {
    colors.cloth = childDye;
  } else if (child) {
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

/**
 * อายุ (เทียบมนุษย์) ของคนรอบตัวตอนนี้ หรือตอนตายถ้าตายแล้ว เกมไม่ได้เก็บอายุของ NPC จึงประมาณจากบทบาท
 * แบบสุ่มคงที่ต่อคน: พ่อแม่แก่กว่าผู้เล่น 20–34 ปี ปู่ย่าตายายแก่กว่าอีก 20–29 ปี พี่ 2–6 ปี น้องและลูกนับจากตอนที่เกิด
 * (metAge) คนรักรุ่นราวคราวเดียวกัน ครูแก่กว่า 20–34 ปี
 */
/** ส่วนของ Person ที่ใช้วาดรูป (alive, metAge ไม่ส่ง = ยังมีชีวิต รู้จักตั้งแต่เกิด) */
export type PersonLike = Pick<Person, 'id'> & Partial<Pick<Person, 'gender' | 'kin' | 'bond' | 'metAge' | 'alive' | 'diedAge'>>;

export function personAge(p: PersonLike, l: LifeState): number {
  const r = rng(`age:${l.seed}:${p.id}`);
  const span = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const at = p.alive === false && p.diedAge !== undefined ? p.diedAge : l.age;
  const me = humanAge({ age: at, raceApplied: l.raceApplied });
  const metMe = humanAge({ age: p.metAge ?? 0, raceApplied: l.raceApplied });
  const kin = p.kin ?? '';
  if (kin === 'father' || kin === 'mother') return me + span(20, 34);
  if (ELDER.has(kin)) return me + span(20, 34) + span(20, 29);
  if (kin === 'sibling_older') return me + span(2, 6);
  // น้องและลูกที่เข้ามาในชีวิตหลังผู้เล่นเกิดคือเกิดตอนนั้น
  if (kin === 'sibling_younger') return (p.metAge ?? 0) > 0 ? me - metMe : Math.max(0, me - span(1, 4));
  if (kin === 'child') return Math.max(0, me - metMe);
  if (p.bond === 'mentor') return me + span(20, 34);
  if (kin === 'spouse' || p.bond === 'love' || p.bond === 'friend' || p.bond === 'rival') return Math.max(0, me + span(-3, 3));
  return Math.max(16, me + span(-5, 15));
}

/** NPC ที่มีชื่อ (npcs.yaml named) ใช้รูปที่กำหนดไว้ */
export function namedLook(id: string, face = 'neutral'): Look | null {
  const n = kit.data.npcs.named?.[id];
  return n ? { ...n.look, face } : null;
}

/**
 * รูปของคนรอบตัว: คนที่มีชื่อในงานศิลป์ใช้รูปที่กำหนด คนอื่นสุ่มคงที่จากสูตรกลุ่มตามถิ่นกำเนิดของผู้เล่น
 * ร่างตามวัยจาก personAge (น้องที่เพิ่งเกิดเป็นทารก ลูกโตตามผู้เล่น พ่อแม่แก่ลงจนมีริ้วรอยและผมขาว)
 * ญาติสายเลือดเป็นเผ่าเดียวกับผู้เล่น
 */
export function personLook(p: PersonLike, l: LifeState): Look {
  const named = namedLook(p.id);
  if (named) return named;
  const age = personAge(p, l);
  const stage = stageOf(age);
  const small = SMALL.has(stage);
  const group = small ? 'child' : HOME_GROUP[originOf(l)] ?? 'worker';
  const sex = p.gender ?? (/mother|grandmother|sister/.test(p.kin ?? '') ? 'f' : /father|brother/.test(p.kin ?? '') ? 'm' : undefined);
  const race = p.kin && BLOOD.has(p.kin) ? raceOf(l) : undefined;
  const seed = `${l.seed}:${p.id}`;
  // ร่างตามวัย เพศสุ่มคงที่ถ้าไม่รู้
  const s = sex ?? (rng(`sex:${seed}`)() < 0.5 ? 'm' : 'f');
  const look = npcLook(kit, group, seed, { body: bodyFor(stage === 'newborn' || stage === 'baby' ? 'child' : stage, s), race });
  // หน้าตาเดิมทุกวัย: สีผิว ผม ตา และทรงผมสุ่มคงที่ต่อคน ไม่ขึ้นกับกลุ่มหรือร่างของวัยนั้น
  const id = rng(`look:${seed}`);
  const pick = <T,>(a: T[]): T => a[Math.floor(id() * a.length)]!;
  const lookRace = look.race ?? race ?? 'human';
  look.choices = {
    skin: pick(Object.keys(kit.pal.choices.skin!)),
    hair: pick(youngHair(lookRace)),
    eyes: lookRace === 'tiefling' ? 'amber' : pick(Object.keys(kit.pal.choices.eyes!)),
  };
  const ownStyle = pick(Object.keys(kit.data.hair[s]).filter((h) => h !== 'bald'));
  look.pieces = look.pieces!.map((x) => (/^hair\/[mf]\//.test(x) ? `hair/${s}/${ownStyle}` : x));
  const strip = (ids: string[]) => { look.pieces = look.pieces!.filter((x) => !ids.some((id) => x.startsWith(id))); };
  if (stage === 'newborn' || stage === 'baby') {
    // ทารก: เก็บไว้แค่ชิ้นเผ่า (หู หาง ตอเขา) และสี แล้วแต่งแบบทารก
    const keep = look.pieces!.filter((x) => /^(ears|tail|horns)\//.test(x));
    look.body = bodyFor(stage, s);
    look.pieces = [...babyPieces(stage), ...keep];
    look.colors = { cloth: look.colors?.cloth ?? 'dye_sky' };
  }
  if (stage !== 'adult') strip(['beard/', 'mark/wrinkles']);
  // เด็กเล็กไว้ผมสั้น ทรงที่ยาวเกินไปเปลี่ยนเป็นทรงเด็กแบบคงที่
  const h = stage === 'toddler' ? look.pieces!.find((x) => x.startsWith('hair/')) : undefined;
  const style = h?.split('/').pop();
  if (h && style && !TODDLER_HAIR[s].includes(style)) {
    const kid = TODDLER_HAIR[s];
    look.pieces = look.pieces!.map((x) => (x === h ? `hair/${s}/${kid[style.length % kid.length]}` : x));
  }
  if (age >= GREY_FROM) look.choices = { ...look.choices, hair: 'silver' };
  // พ่อที่กลับจากสงครามถ่านพร้อมขอเหล็กแทนแขน (father_iron_arm) ใส่แขนนั้นทุกรูป
  if (p.kin === 'father' && l.flags.includes('father_iron_arm') && fits('arm/hook', look.body)) look.pieces!.push('arm/hook');
  if (age >= OLD_FROM) {
    if (fits('mark/wrinkles', look.body) && !look.pieces!.includes('mark/wrinkles')) look.pieces!.push('mark/wrinkles');
  } else strip(['mark/wrinkles']);
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
