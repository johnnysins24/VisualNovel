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
 * ทุกเผ่าเดินหนึ่งปีต่อหนึ่งเหตุการณ์จนถึงอายุนี้ (L15, Phupha 7 พ.ย. 2026) หลังจากนั้นเอลฟ์และคนแคระจึงยืดตาม ageScale
 * เพื่อให้วัยผู้ใหญ่ 18 ถึง 40 ของทุกเผ่าอยู่ในยุคแสงดาว ไม่วิ่งเลยปี 340
 */
export const EVEN_AGING_UNTIL = 40;
/** HP ที่ฟื้นต่อหนึ่งเหตุการณ์ตั้งแต่อายุ ADULT_AGE (ผู้ใหญ่พักแผลได้ เด็กกับวัยรุ่นไม่ฟื้น) ไม่เกิน HP สูงสุด */
export const ADULT_HP_REGEN = 3;
/** ตัวละครของผู้เล่นตายไม่ได้ก่อนอายุนี้ (HP ไม่ต่ำกว่า 1 และ effect die ไม่มีผล) คนรอบตัวตายได้ตามเนื้อเรื่อง */
export const PROTECTED_AGE = 12;

export const RACES = {
  /** ageScale = จำนวนปีจริงต่อหนึ่งปีของชีวิตมนุษย์ หลังอายุ EVEN_AGING_UNTIL (อายุขัย ÷ 70) */
  human: { th: 'มนุษย์', bonus: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 }, traits: [] as string[], ageScale: 1 },
  elf: { th: 'เอลฟ์', bonus: { DEX: 2 }, traits: [] as string[], ageScale: 10 },
  dwarf: { th: 'คนแคระ', bonus: { CON: 2 }, traits: [] as string[], ageScale: 5 },
  /** ทีฟลิ่งเกิดมาพร้อมรอยจอมมาร (ดู DEMON_MARK) อายุขัยราว 80 ปี ใกล้มนุษย์จึงใช้ 1 */
  tiefling: { th: 'ทีฟลิ่ง', bonus: { CHA: 2, INT: 1 }, traits: ['demon_mark'], ageScale: 1 },
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
export const DEMON_MARK_TRAIT = 'demon_mark';
/** โบนัสทอยตอนสู้หรือหลบสิ่งมีชีวิตฝั่งนั้น (ศัตรูลังเล หรือมองไม่เห็น) ไม่แสดงให้ผู้เล่นเห็นที่มา */
export const DEMON_MARK_BONUS = { demon: 3, star: 5 } as const;
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
