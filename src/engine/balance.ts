/**
 * ตัวเลขสมดุลเกมทั้งหมดอยู่ที่ไฟล์นี้ไฟล์เดียว ปรับที่นี่แล้วเทสจะบอกว่าอะไรพัง
 * (ชื่อ id เป็นอังกฤษเพื่อใช้ใน YAML ชื่อไทยใช้แสดงผลเท่านั้น)
 */
import type { Stat } from './schema';

export const STAT_TH: Record<Stat, string> = {
  STR: 'กำลัง',
  DEX: 'ว่องไว',
  CON: 'อึด',
  INT: 'ปัญญา',
  WIS: 'ญาณ',
  CHA: 'เสน่ห์',
};

/** ปีเกิดสุ่มในช่วงนี้ (ยุคแสงดาว) */
export const BIRTH_YEAR = { min: 270, max: 300 } as const;

/**
 * ค่าสเตตสูงสุดที่เหตุการณ์เพิ่มให้ได้ (SRD 5.1: ค่าความสามารถของตัวละครไม่เกิน 20)
 * ของสวมใส่ โบนัสนักบวช และโบนัสสถานการณ์บวกเกินจากนี้ได้ตอนทอย
 */
export const STAT_CAP = 20;

// ---------- เผ่า: โบนัสตาม SRD 5.1 ตั้งเมื่อ flag race_<id> ถูกตั้งครั้งแรก ----------
/** อายุที่เริ่มเป็นผู้ใหญ่ ก่อนหน้านี้ทุกเผ่าโตเท่ามนุษย์ */
export const ADULT_AGE = 18;
/**
 * ทุกเผ่าโตเท่ามนุษย์จนถึงอายุนี้ หลังจากนั้นร่างกายของเอลฟ์และคนแคระแก่ช้าลงตาม ageScale
 * เวลาของโลกเดินเท่ากันทุกเผ่า คือปีละหนึ่งเหตุการณ์ตลอดชีวิต (แผนชีวิต 100 ปี ข้อ D3 แก้ L15 เดิมที่ให้เผ่าอายุยืนข้ามทีละหลายปี)
 */
export const EVEN_AGING_UNTIL = 40;
/**
 * พลังชีวิตที่ฟื้นต่อปี ตามอายุเทียบมนุษย์ [ตั้งแต่อายุ, ฟื้นปีละ] แผลหายช้าลงตามวัย หลัง 80 ไม่ฟื้นเอง ต้องพึ่งหมอ วิหาร หรือคนดูแล
 * เด็กกับวัยรุ่น (ก่อน ADULT_AGE) ไม่ฟื้นเอง แผลถาวรให้เนื้อหาตั้งเป็นสิ่งติดตัวชนิดแผล
 */
export const HP_REGEN: readonly (readonly [number, number])[] = [[80, 0], [65, 1], [50, 2], [ADULT_AGE, 3]];
/**
 * ร่างกายโรย: ตั้งแต่อายุ from (เทียบมนุษย์) ค่าใน stats แต่ละตัวมีโอกาสลด 1 ทุกปี โอกาส = base + perYear ต่อปีที่เลย from ไม่เกิน max
 * ค่าไม่ลดต่ำกว่า floor ปัญญา ญาณ และเสน่ห์ไม่ลดเอง
 */
export const DECLINE = { from: 50, stats: ['STR', 'DEX'] as readonly Stat[], base: 0.04, perYear: 0.008, max: 0.4, floor: 3 } as const;
/**
 * เช็คฤดูหนาว: ตั้งแต่อายุ from (ทีฟลิ่งช้ากว่า 5 ปี) ทอยอึดปีละครั้ง ความยากเริ่มที่ dc แล้วเพิ่มทีละ 1 ตามจังหวะใน pace
 * pace = [ผ่านมากี่ปีนับจาก from, เพิ่ม 1 ทุกกี่ปี] สามช่วงของวัยชรา (อายุของมนุษย์):
 *   65 ถึง 83 เพิ่มทุก 3 ปี (ความยาก 7 ถึง 13) · 83 ถึง 100 เพิ่มทุก 8 ปี คนที่ผ่านมาถึงตรงนี้คือคนที่ทนจริง · 100 ขึ้นไปเพิ่มทุก 2 ปี เป็นเวลาที่ยืมมา
 * พลาดแล้วพลังชีวิตสูงสุดลดถาวร loss พลังชีวิตสูงสุดหมดเมื่อไรคือสิ้นอายุขัย
 * care = แต้มที่ได้เพิ่มเมื่อมีคู่ครองหรือลูกที่ยังอยู่และสนิทตั้งแต่ careCloseness ขึ้นไป (มีคนดูแล)
 * เป้าตามแผนชีวิต 100 ปี ข้อ D2: มนุษย์ส่วนใหญ่สิ้นอายุขัยช่วง 80 ถึง 90 และคนแก่ราวหนึ่งในหกอยู่ถึง 100 (tests/slow/audit.test.ts คุมเลขนี้)
 */
export const WINTER = {
  from: 65,
  fromByRace: { tiefling: 70 } as Record<string, number>,
  dc: 7,
  pace: [[0, 3], [18, 8], [35, 2]] as readonly (readonly [number, number])[],
  loss: 2,
  care: 2,
  careCloseness: 2,
} as const;
/**
 * คนรอบตัวก็แก่: ตั้งแต่อายุ from (เทียบมนุษย์) มีโอกาสจากไปปีละ perYear ต่อปีที่เลย from และเพิ่มอีกปีละ latePerYear ต่อปีที่เลย lateFrom รวมไม่เกิน max
 * ข่าวมาเป็นบรรทัดสั้นในบันทึก เลขนี้ให้คนรอบตัวอายุยืนใกล้กับตัวละคร (ครึ่งหนึ่งอยู่ถึงราว 81 หนึ่งในสี่ถึง 90 น้อยคนถึง 100)
 * เพื่อนรุ่นเดียวกันจึงมีโอกาสอยู่ถึงวันที่ตัวละครจากไป
 * คนสำคัญ (พ่อ แม่ คนที่สนิทตั้งแต่ closeBond) รอฉากลาของตัวเองก่อน ระบบเอาไปเองเมื่ออายุถึง closeFrom แล้วยังไม่มีฉากออก
 * คู่ครองรอนานกว่านั้น: ก่อนอายุ partnerFrom จากไปได้ด้วยฉากที่เขียนไว้เท่านั้น
 */
export const NPC_DEATH = { from: 60, perYear: 0.003, lateFrom: 90, latePerYear: 0.02, max: 0.5, closeBond: 3, closeFrom: 88, partnerFrom: 100 } as const;
/**
 * นิสัยกลายเป็นลักษณะติดตัวเมื่อเลือกทางนั้นครบ HABIT_COUNT ครั้ง และเลือกไม่น้อยกว่า HABIT_SHARE ของครั้งที่ทางนั้นมีให้เลือก
 * (คนที่เลือกทางดื้อสามครั้งในร้อยปีไม่ใช่คนหัวแข็ง) นับเฉพาะครั้งแรกที่เจอแต่ละเหตุการณ์ ชีวิตหนึ่งมีลักษณะจากนิสัยได้ไม่เกิน HABIT_TRAITS_MAX
 */
export const HABIT_COUNT = 3;
export const HABIT_SHARE = 0.5;
export const HABIT_TRAITS_MAX = 3;
/** พรหรือคำสาปใหญ่ถือพร้อมกันได้ไม่เกินเท่านี้ */
export const BIG_TRAITS_MAX = 2;
/** เหตุการณ์สำรอง (fallback) ออกเฉพาะปีที่เหตุการณ์ปกติที่ออกได้มีน้อยกว่าเท่านี้ */
export const THIN_POOL = 3;
/** ลูกเริ่มที่ความสนิทเท่านี้ */
export const CHILD_CLOSENESS = 3;
/** ปีสุดท้ายของโลกที่มีเนื้อเรื่องเขียนไว้ พ้นจากนี้ไม่มีเหตุการณ์ออกอีก ชีวิตที่ยังไม่ตายจบแบบ "เรื่องยังไม่จบ" */
export const STORY_END_YEAR = 410;
/** ตัวละครของผู้เล่นตายไม่ได้ก่อนอายุนี้ (HP ไม่ต่ำกว่า 1 และ effect die ไม่มีผล) คนรอบตัวตายได้ตามเนื้อเรื่อง */
export const PROTECTED_AGE = 12;
/** เหตุการณ์ที่เกิดซ้ำได้ (once: false) จะไม่ออกซ้ำภายในจำนวนเหตุการณ์เท่านี้ ยกเว้นไม่มีเรื่องอื่นให้ออก */
export const REPEAT_GAP = 5;

export const RACES = {
  /** ageScale = จำนวนปีจริงต่อหนึ่งปีของร่างกายแบบมนุษย์ หลังอายุ EVEN_AGING_UNTIL (อายุขัย ÷ 70) */
  human: { th: 'มนุษย์', bonus: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 }, traits: [] as string[], ageScale: 1 },
  elf: { th: 'เอลฟ์', bonus: { DEX: 2 }, traits: [] as string[], ageScale: 10 },
  dwarf: { th: 'คนแคระ', bonus: { CON: 2 }, traits: [] as string[], ageScale: 5 },
  /** ทีฟลิ่งเกิดมาพร้อมตราร้อน คือรอยจอมมาร (ดู DEMON_MARK_TRAIT) อายุขัยยืนกว่ามนุษย์ราว 5 ปี จึงใช้ 1 */
  tiefling: { th: 'ทีฟลิ่ง', bonus: { CHA: 2, INT: 1 }, traits: ['curse_brand'], ageScale: 1 },
} as const satisfies Record<string, { th: string; bonus: Partial<Record<Stat, number>>; traits: string[]; ageScale: number }>;
export type RaceId = keyof typeof RACES;
export const RACE_IDS = Object.keys(RACES) as RaceId[];

// ---------- อาชีพ: ได้จากพิธีเลือกทาง (effect `class: <id>`) ----------
export interface ClassDef {
  th: string;
  primary: Stat;
  secondary: Stat;
  /** โบนัสสเตตตอนรับ: ค่าหลัก +2 ค่ารอง +1 */
  hp: number;
}
export const CLASS_PRIMARY_BONUS = 2;
export const CLASS_SECONDARY_BONUS = 1;
export const CLASSES = {
  warrior: { th: 'นักรบ', primary: 'STR', secondary: 'CON', hp: 4 },
  rogue: { th: 'นักย่อง', primary: 'DEX', secondary: 'CHA', hp: 1 },
  wizard: { th: 'นักเวท', primary: 'INT', secondary: 'CON', hp: 0 },
  cleric: { th: 'นักบวช', primary: 'WIS', secondary: 'CHA', hp: 2 },
  ranger: { th: 'พราน', primary: 'DEX', secondary: 'WIS', hp: 2 },
  bard: { th: 'กวีเร่', primary: 'CHA', secondary: 'DEX', hp: 1 },
} as const satisfies Record<string, ClassDef>;
export type ClassId = keyof typeof CLASSES;
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

/** โบนัสทอยติดตัวของอาชีพ (ใช้กับ check ของ stat นั้น) */
export const CLASS_CHECK_BONUS: Partial<Record<ClassId, { stat: Stat; amount: number }>> = {
  rogue: { stat: 'DEX', amount: 1 },
  wizard: { stat: 'INT', amount: 1 },
  bard: { stat: 'CHA', amount: 1 },
};
export const WARRIOR_MAX_HP_BONUS = 2;

/** นักบวช: ได้โบนัส ญาณ ตอนแนวทางยังอยู่ใกล้เทพ เสียไปตอน drift */
export const CLERIC_WIS_BONUS = 2;

/** พราน: แรงขึ้นในถิ่นเกิด อ่อนลงเมื่ออยู่ไกลบ้าน (ใช้กับ check ว่องไวและญาณ) */
export const RANGER_HOME_BONUS = 2;
export const RANGER_AWAY_PENALTY = 1;

// ---------- เทพและแนวทาง ----------
/** แกนกฎ: +1 ระเบียบ, 0 กลาง, −1 อิสระ · แกนคุณธรรม: +1 ดี, 0 กลาง, −1 ชั่ว */
export interface GodDef {
  th: string;
  law: -1 | 0 | 1;
  moral: -1 | 0 | 1;
}
export const GODS = {
  verus: { th: 'เวรัส', law: 1, moral: 1 },
  isel: { th: 'อีเซล', law: 0, moral: 1 },
  talis: { th: 'ทาลิส', law: -1, moral: 1 },
  ossa: { th: 'ออสซา', law: 1, moral: 0 },
  ulwen: { th: 'อุลเวน', law: 0, moral: 0 },
  belek: { th: 'เบเลค', law: 1, moral: -1 },
  /** เทพที่สิ้นแล้ว: เข้าถึงได้ทางเหตุการณ์เท่านั้น */
  astel: { th: 'อัสเทล', law: 0, moral: 0 },
} as const satisfies Record<string, GodDef>;
export type GodId = keyof typeof GODS;
export const GOD_IDS = Object.keys(GODS) as GodId[];

/** คะแนนแนวทางสะสม −ALIGN_CAP..+ALIGN_CAP แล้วแบ่งเป็น 3 ช่อง ถึง ±ALIGN_THRESHOLD คือเอียงไปด้านนั้น */
export const ALIGN_CAP = 10;
export const ALIGN_THRESHOLD = 3;
/** นักบวชเสียพลังเมื่อระยะห่างบนตาราง 3×3 มากกว่านี้ */
export const CLERIC_MAX_DRIFT = 1;
/** flag ที่ระบบตั้งให้เองตอนนักบวชหลุดแนวทาง ให้เหตุการณ์ใช้ใน when.flags */
export const CLERIC_DRIFT_FLAG = 'cleric_drift';

// ---------- คะแนนโลกลับ ----------
export const WORLD_KEYS = ['gods', 'demon', 'star'] as const;
export type WorldKey = (typeof WORLD_KEYS)[number];
export const WORLD_CAP = 20;

// ---------- รอยจอมมาร ----------
/** รหัสในทะเบียนสิ่งติดตัว (ตราร้อน) โบนัสทอยกับฝ่ายจอมมารและฝ่ายดาวเขียนไว้ในทะเบียน content/traits.yaml */
export const DEMON_MARK_TRAIT = 'curse_brand';
/** รหัสสิ่งติดตัวในเซฟและเนื้อหาเก่า → รหัสในทะเบียน */
export const TRAIT_RENAMES: Record<string, string> = { demon_mark: 'curse_brand', born_empty_day: 'empty_day' };
export const FOE_SIDES = ['demon', 'star', 'machine', 'nature', 'human'] as const;
export type FoeSide = (typeof FOE_SIDES)[number];

// ---------- ชื่อเสียงข้ามชีวิต ----------
export const FACTIONS = [
  'crown', // ราชสำนักอาร์เวล
  'lamp_church', // ศาสนจักรตะเกียง
  'belek_bank', // ธนาคารเบเลค
  'royal_institute', // สถาบันเวทหลวง
  'distillers', // สมาคมโรงกลั่น
  'dwarf_council', // สภาตระกูลคนแคระ
  'star_hall', // หอนับดาว
  'wardens', // ภาคีผู้เฝ้าผนึก
  'dock_rats', // หนูท่า
  'ash_cult', // ลัทธิเถ้า
  'star_listeners', // ผู้ฟังดาว
] as const;
export type FactionId = (typeof FACTIONS)[number];
export const REPUTATION_CAP = 10;
/** ส่วนที่ติดไปชีวิตถัดไป (1 = จำครบ) */
export const REPUTATION_CARRY = 1;
