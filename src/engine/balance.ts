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
 *   65 ถึง 83 เพิ่มทุก 3 ปี (ความยาก 8 ถึง 14) · 83 ถึง 100 เพิ่มทุก 8 ปี คนที่ผ่านมาถึงตรงนี้คือคนที่ทนจริง · 100 ขึ้นไปเพิ่มทุก 2 ปี เป็นเวลาที่ยืมมา
 * พลาดแล้วพลังชีวิตสูงสุดลดถาวร loss พลังชีวิตสูงสุดหมดเมื่อไรคือสิ้นอายุขัย
 * care = แต้มที่ได้เพิ่มเมื่อมีคู่ครองหรือลูกที่ยังอยู่และสนิทตั้งแต่ careCloseness ขึ้นไป (มีคนดูแล)
 * แต้มของเช็คนี้มาจากอึดของร่างกายเอง (ไม่นับโบนัสจากของที่สวม) สิ่งติดตัว คนดูแล และของกันหนาว (GEAR.winterMax)
 * เป้าตามแผนชีวิต 100 ปี ข้อ D2: มนุษย์ส่วนใหญ่สิ้นอายุขัยช่วง 80 ถึง 90 และคนแก่ราวหนึ่งในหกอยู่ถึง 100 (tests/slow/audit.test.ts คุมเลขนี้)
 * dc ตั้งให้เป้านี้จริงกับชีวิตที่มีของกันหนาวหนึ่งชิ้นปนอยู่กับชีวิตที่ไม่มี: คนไม่มีของกันหนาวอายุขัยกลางราว 89 มีหนึ่งชิ้นราว 93
 */
export const WINTER = {
  from: 65,
  fromByRace: { tiefling: 70 } as Record<string, number>,
  dc: 8,
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
/**
 * gods เทพ · demon จอมมาร · star ดาว · land แผ่นดิน (ชุด 4)
 * สามตัวแรกบอกว่าชีวิตนี้เอนไปทางฝ่ายไหน ส่วนแผ่นดินบอกว่าเจ้าเดิมพลิกตัวแค่ไหน:
 * ขึ้นเมื่อข้อห้ามของแผ่นดินโดนฝืน (เหมือง โรงงาน สงคราม หรือมือของตัวละครเอง) ลงเมื่อมีคนรักษาและทำพิธี
 */
export const WORLD_KEYS = ['gods', 'demon', 'star', 'land'] as const;
export type WorldKey = (typeof WORLD_KEYS)[number];
export const WORLD_CAP = 20;

// ---------- รอยจอมมาร ----------
/** รหัสในทะเบียนสิ่งติดตัว (ตราร้อน) โบนัสทอยกับฝ่ายจอมมารและฝ่ายดาวเขียนไว้ในทะเบียน content/traits.yaml */
export const DEMON_MARK_TRAIT = 'curse_brand';
/** รหัสสิ่งติดตัวในเซฟและเนื้อหาเก่า → รหัสในทะเบียน */
export const TRAIT_RENAMES: Record<string, string> = { demon_mark: 'curse_brand', born_empty_day: 'empty_day' };
export const FOE_SIDES = ['demon', 'star', 'machine', 'nature', 'human'] as const;
export type FoeSide = (typeof FOE_SIDES)[number];

// ---------- การปะทะ ----------
/**
 * การปะทะคือเหตุการณ์ที่ข้างในมี 2 ถึง 4 จังหวะ ทุกจังหวะผู้เล่นเลือกวิธีรับมือหนึ่งวิธีแล้วทอย
 * dc = ความยากตามระดับภัย 1 ถึง 5 ของศัตรู · damage = พลังชีวิตที่เสียเมื่อพลาดตามระดับภัย หักเกราะ แต่ไม่น้อยกว่า minDamage
 *   (ภัยระดับ 4 ยากกว่าระดับ 3 ที่การทอย ไม่ได้เจ็บกว่า: ตัวละครทั่วไปมีพลังชีวิตราว 11 ถ้าเสียทีละ 4 พลาดสามจังหวะก็ล้ม)
 * tell = แต้มของวิธีที่รับสัญญาณของจังหวะนั้น · weak = แต้มของวิธีที่ตรงจุดอ่อน (เมื่อตัวละครรู้จุดอ่อน) · strong = แต้มที่เสียเมื่อชนจุดแข็ง
 * ally = แต้มเมื่อคนในชีวิตเข้ามาช่วย · fleeEase = การหนีง่ายกว่าการสู้เท่านี้ · critPips = ทอยได้ 20 ศัตรูเสียแรงใจเท่านี้ขีด
 * heavy = เสียพลังชีวิตเกินสัดส่วนนี้ของที่มีตอนเริ่ม ได้แผลติดตัวหนึ่งอย่าง
 */
export const ENCOUNTER = {
  dc: [10, 12, 14, 16, 18],
  damage: [1, 2, 3, 3, 4],
  tell: 2,
  weak: 3,
  strong: 3,
  ally: 2,
  fleeEase: 3,
  critPips: 2,
  minDamage: 1,
  armorMax: 2,
  heavy: 0.5,
  /** หลังการปะทะหนึ่งครั้ง เว้นกี่เหตุการณ์ก่อนจะมีครั้งใหม่ได้ สายถืออาวุธ (ARMED_CLASSES) ปะทะถี่กว่าสายอื่น */
  gap: { armed: 2, calm: 8 },
  /** ฉากปะทะที่เกิดซ้ำได้ (once: false) ออกได้ไม่เกินกี่ครั้งในชีวิตเดียว กันผู้เล่นอ่านฉากเดิมวนไป */
  repeatMax: 3,
} as const;

/** อาชีพที่ชีวิตอยู่กับอาวุธ ใช้กำหนดความถี่ของการปะทะ (ENCOUNTER.gap) */
export const ARMED_CLASSES: readonly ClassId[] = ['warrior', 'rogue', 'ranger'];

/** วิธีรับมือเจ็ดแบบ ค่าพลังประจำแบบอยู่ใน MOVE_STAT (อ่านทางกับใช้ของให้ฉากระบุเอง) */
export const MOVE_KINDS = ['attack', 'quick', 'guard', 'read', 'talk', 'item', 'flee'] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];
export const MOVE_STAT: Partial<Record<MoveKind, Stat>> = { attack: 'STR', quick: 'DEX', guard: 'CON', talk: 'CHA', flee: 'DEX' };
export const MOVE_TH: Record<MoveKind, string> = { attack: 'บุก', quick: 'ชิงจังหวะ', guard: 'ตั้งรับ', read: 'อ่านทาง', talk: 'ข่มหรือเจรจา', item: 'ใช้ของ', flee: 'หนี' };

/** ป้ายลักษณะของวิธีรับมือและของที่ใช้ เทียบกับจุดอ่อนและจุดแข็งของศัตรู (ซึ่งระบุเป็นป้ายหรือชนิดของวิธีก็ได้) */
export const FOE_TAGS = ['fire', 'light', 'water', 'smoke', 'noise', 'bait', 'name', 'pierce', 'blunt', 'edge', 'ranged'] as const;
export type FoeTag = (typeof FOE_TAGS)[number];
export const FOE_TAG_TH: Record<FoeTag, string> = {
  fire: 'ไฟ', light: 'แสง', water: 'น้ำ', smoke: 'ควัน', noise: 'เสียงดัง', bait: 'เหยื่อล่อ', name: 'ชื่อ', pierce: 'ของแหลม', blunt: 'ของทื่อ', edge: 'ของมีคม', ranged: 'ระยะไกล',
};

/**
 * ท่าของอาชีพ ใช้ได้ครั้งเดียวต่อการปะทะ คนที่ยังไม่มีอาชีพใช้ท่าของชาวบ้าน (none)
 * reroll  นักรบ: ทอยพลาดครั้งแรกได้ทอยใหม่ (ทำเอง ไม่ต้องกด)
 * ambush  นักย่อง: จังหวะแรกสำเร็จแล้วศัตรูเสียแรงใจเพิ่มอีกหนึ่งขีด (ทำเอง)
 * spell   นักเวท: จังหวะนั้นใช้ปัญญาแทนค่าพลังของวิธี และนับว่าตรงจุดอ่อน
 * ward    นักบวช: จังหวะนั้นพลาดก็ไม่เสียพลังชีวิต ใช้ไม่ได้เมื่อห่างจากเทพของตัวเอง
 * sense   พราน: รู้จุดอ่อนตั้งแต่เริ่ม และในถิ่นเกิดกดใช้ได้แต้มเพิ่มหนึ่งจังหวะ
 * song    กวีเร่: ข่มหรือเจรจาได้แต้มเพิ่มหนึ่งจังหวะ
 * at_hand ชาวบ้าน: หยิบของในฉากมาใช้ ได้แต้มเพิ่มหนึ่งจังหวะ
 */
/** คำบอกวิธีที่การปะทะจบ ใช้ในบันทึกชีวิต */
export const ENCOUNTER_END_TH = { win: 'ชนะ', lose: 'แพ้', flee: 'หนีพ้น', parley: 'เจรจาสำเร็จ', stalemate: 'ยันกันไว้', death: 'ล้มลง' } as const;

/** คำอธิบายท่าของอาชีพ แสดงเมื่อผู้เล่นแตะป้ายท่า ทุกท่าใช้ได้ครั้งเดียวต่อการปะทะ */
export const TECHNIQUE_HELP: Record<string, string> = {
  reroll: 'พลาดครั้งแรกในการปะทะ ทอยใหม่ให้เองหนึ่งครั้ง',
  ambush: 'สำเร็จในจังหวะแรก ศัตรูเสียแรงใจเพิ่มอีกหนึ่งขีด',
  spell: 'แตะก่อนเลือกวิธี จังหวะนั้นทอยด้วยปัญญา นับเป็นโดนจุดอ่อน และจุดแข็งของศัตรูไม่มีผล',
  ward: 'แตะก่อนเลือกวิธี ถ้าจังหวะนั้นพลาดจะไม่เสียพลังชีวิต ใช้ไม่ได้เมื่อห่างจากเทพ',
  sense: 'รู้จุดอ่อนของศัตรูตั้งแต่แรกเห็น ในถิ่นเกิดแตะก่อนเลือกวิธีได้ +2 หนึ่งครั้ง',
  song: 'แตะก่อนเลือกวิธี การข่มหรือเจรจาครั้งนั้นได้ +3',
  at_hand: 'แตะก่อนเลือกวิธี จังหวะนั้นได้ +2 จากของที่คว้าได้ใกล้ตัว',
  hold: 'เผชิญฝ่ายจอมมาร พลาดครั้งแรกทอยใหม่ให้เองหนึ่งครั้ง',
  quarry: 'เผชิญสิ่งที่ไม่ใช่คน สำเร็จครั้งแรกศัตรูเสียแรงใจเพิ่มอีกหนึ่งขีด',
};

export const TECHNIQUES = {
  warrior: { th: 'ฟันซ้ำ', kind: 'reroll', amount: 0 },
  rogue: { th: 'แทงจากเงา', kind: 'ambush', amount: 1 },
  wizard: { th: 'เวทหนึ่งบท', kind: 'spell', amount: 0 },
  cleric: { th: 'ขอพร', kind: 'ward', amount: 0 },
  ranger: { th: 'รู้ทางสัตว์', kind: 'sense', amount: 2 },
  bard: { th: 'เพลงป่วนใจ', kind: 'song', amount: 3 },
  none: { th: 'ของใกล้มือ', kind: 'at_hand', amount: 2 },
  /** ท่าขององค์กร (ดู ORGS) ทำงานเองเหมือนท่าของนักรบกับนักย่อง และใช้ได้เพิ่มจากท่าของอาชีพ */
  wardens: { th: 'ยืนแนว', kind: 'hold', amount: 0 },
  fang_house: { th: 'รู้ทางเขี้ยว', kind: 'quarry', amount: 1 },
} as const satisfies Record<ClassId | 'none' | 'wardens' | 'fang_house', { th: string; kind: string; amount: number }>;
export type TechniqueKind = (typeof TECHNIQUES)[keyof typeof TECHNIQUES]['kind'];

// ---------- ของสวมใส่ ----------
/**
 * ของหนึ่งชิ้น = แบบ (art/gear.yaml กำหนดช่องสวมและภาพ) x วัสดุ (ได้เปรียบหรือเสียเปรียบกับอะไร) x ระดับ (งบค่าพลัง)
 * ชื่อและเรื่องของแต่ละชิ้นเขียนด้วยมือ กติกาอยู่ใน src/engine/gear.ts ตัวเลขทั้งหมดอยู่ที่นี่
 */
export const RARITIES = ['common', 'uncommon', 'rare', 'enchanted', 'hero'] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_TH: Record<Rarity, string> = { common: 'ของบ้าน', uncommon: 'ของช่าง', rare: 'ของชั้นครู', enchanted: 'ของอาบเวท', hero: 'ของผู้กล้า' };

export const MATERIAL_IDS = ['brass', 'black_iron', 'ileth_wood', 'star_silver', 'demon_coal', 'cold_iron'] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];
/** gives กับ costs คือข้อความบนการ์ดของ (costsOn = ข้อแม้นี้มีผลเฉพาะของในช่องนี้) ตัวกติกาอยู่ใน GEAR.edge และ gear.ts */
export const MATERIALS: Record<MaterialId, { th: string; gives?: string; costs?: string; costsOn?: 'body' }> = {
  brass: { th: 'ทองเหลือง' },
  black_iron: { th: 'เหล็กดำ', costs: 'เกราะหนัก หนียากขึ้น 1', costsOn: 'body' },
  ileth_wood: { th: 'ไม้ไอเลธ' },
  star_silver: { th: 'เงินดาว', gives: '+2 เมื่อเผชิญฝ่ายจอมมาร', costs: 'สวมติดตัวหลายปี รอยดาวขึ้นบนผิว' },
  demon_coal: { th: 'หินถ่านมาร', gives: '+2 เมื่อเผชิญสิ่งที่มาจากดาว', costs: 'จอมมารรู้ว่าใครถือ และศาสนจักรห้ามพก' },
  cold_iron: { th: 'เหล็กเย็น', gives: '+2 เมื่อเผชิญภูตผีและผู้ใช้เวท', costs: 'ผู้สวมร่ายเวทและขอพรไม่ได้' },
};

/** ป้ายของของ: ป้ายลักษณะที่เทียบกับจุดอ่อนของศัตรู (FOE_TAGS) กับป้ายใช้งานที่เหตุการณ์ถามหา (requires.has_tag) */
export const ITEM_TAGS = [...FOE_TAGS, 'rope', 'tool', 'medicine'] as const;
export type ItemTag = (typeof ITEM_TAGS)[number];
export const ITEM_TAG_TH: Record<ItemTag, string> = { ...FOE_TAG_TH, rope: 'เชือก', tool: 'เครื่องมือช่าง', medicine: 'ยา' };

/**
 * statCap  = โบนัสค่าพลังจากของทุกชิ้นรวมกันไม่เกินเท่านี้ต่อค่าพลังหนึ่งอย่าง · checkCap = แต้มทอยจากของ (check_bonus) รวมกันไม่เกินเท่านี้ต่อค่าพลัง
 * budget   = งบของแต่ละระดับ [ต่ำสุดของของที่ร้านขาย, สูงสุด] นับแต้มตาม gear.ts itemBudget:
 *            ค่าพลัง +1 = 1 · แต้มทอย +1 = 1 · พลังชีวิตสูงสุดทุก +2 = 1 · เกราะ 1 = 1 · โล่ = 1 · ทอยใหม่ = 2 · แต้มฤดูหนาว 1 = 1 (ป้ายและวัสดุไม่กินงบ)
 * price    = ช่วงราคาที่ร้านของแต่ละระดับ ตั้งจากรายได้จริงในเกม (ชีวิตจำลอง: หาเงินได้ทั้งชีวิตราว 24 เหรียญ ถือติดตัวราว 9 เหรียญช่วงอายุ 30 ถึง 50)
 *            เป้าคือชาวบ้านธรรมดาซื้อของช่างได้สองสามชิ้นทั้งชีวิต ของอาบเวทต้องแลกด้วยอย่างอื่นนอกจากเงิน (needs กับ toll ของชิ้นนั้น)
 * supply   = ช่วงราคาของใช้แล้วหมด · stack = ของใช้แล้วหมดชนิดเดียวกันพกได้กี่ชิ้น
 * sellShare= ร้านรับซื้อคืนที่สัดส่วนนี้ของราคา (ปัดลง ไม่ต่ำกว่า 1) ของที่ไม่มีราคาคือของที่มีเรื่องของตัวเอง ขายไม่ได้
 * shelf    = ของหมุนเวียนที่ร้านวางแผงต่อปี (ไม่นับของประจำร้าน) · shopAge = อายุที่เดินเข้าร้านเองได้
 * edge     = แต้มเมื่อสวมของที่ทำจากวัสดุที่ได้เปรียบศัตรูฝ่ายนั้น (บุก ชิงจังหวะ ตั้งรับ) ไม่ทบกันหลายชิ้น
 * heavyFlee= เกราะตัวที่ทำจากเหล็กดำทำให้หนียากขึ้นเท่านี้ · thrown = ของขว้างที่ไม่ตรงจุดอ่อนยังได้แต้มเท่านี้
 * starSilver = สวมเงินดาวครบ first ปีได้รอยดาว แล้วลุกลามหนึ่งขั้นทุก every ปีที่ยังสวม (ทีฟลิ่งไม่ติดรอยดาว)
 * demonCoal  = สวมหินถ่านมารข้ามปี คะแนนจอมมารของโลก +demon ต่อปี และชื่อเสียงกับศาสนจักรตะเกียง −1 ทุก church ปี
 * lootMax  = ชนะการปะทะหนึ่งครั้งได้ของจากศัตรูไม่เกินเท่านี้ชิ้น · winterMax = แต้มเช็คฤดูหนาวจากของกันหนาวรวมกันไม่เกินเท่านี้
 * hpCap    = พลังชีวิตสูงสุดจากของทุกชิ้นรวมกันไม่เกินเท่านี้ (ของชิ้นละ +2 สวมได้ผลสามชิ้น) กันการสวมของเพิ่มพลังชีวิตทุกช่องจนการปะทะและฤดูหนาวไม่มีความหมาย
 */
export const GEAR = {
  statCap: 3,
  checkCap: 2,
  hpCap: 6,
  budget: { common: [0, 1], uncommon: [1, 2], rare: [2, 3], enchanted: [3, 4], hero: [4, 8] } as Record<Rarity, readonly [number, number]>,
  price: { common: [1, 3], uncommon: [4, 7], rare: [12, 20], enchanted: [30, 50], hero: [0, 0] } as Record<Rarity, readonly [number, number]>,
  supply: [1, 3] as readonly [number, number],
  stack: 3,
  sellShare: 0.4,
  shelf: 5,
  shopAge: 12,
  edge: 2,
  heavyFlee: 1,
  thrown: 1,
  starSilver: { first: 4, every: 6 },
  demonCoal: { demon: 1, church: 3 },
  lootMax: 1,
  winterMax: 2,
} as const;
/** วัสดุที่ได้เปรียบศัตรูฝ่ายไหน เหล็กเย็นได้เปรียบศัตรูที่เป็นภูตผีหรือผู้ใช้เวท (FoeDef.magic) ไม่ว่าฝ่ายไหน */
export const MATERIAL_EDGE: Partial<Record<MaterialId, FoeSide | 'magic'>> = { star_silver: 'demon', demon_coal: 'star', cold_iron: 'magic' };
/** สิ่งติดตัวที่ได้จากการสวมเงินดาวนาน */
export const STAR_MARKS_TRAIT = 'curse_star_marks';

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
  'fang_house', // โรงรับเขี้ยว
] as const;
export type FactionId = (typeof FACTIONS)[number];
export const REPUTATION_CAP = 10;
/** ส่วนที่ติดไปชีวิตถัดไป (1 = จำครบ) */
export const REPUTATION_CARRY = 1;

// ---------- องค์กร ----------
/**
 * องค์กรที่ตัวละครเป็นสมาชิกได้ (กติกาอยู่ใน src/engine/orgs.ts) ชื่อยศและเรื่องขององค์กรเขียนไว้ในคัมภีร์โลก
 * ranks    = ชื่อยศสี่ขั้น ขั้นแรกคือวันที่เข้า
 * faction  = ฝ่ายที่ชื่อเสียงขององค์กรนี้ผูกอยู่ (FACTIONS)
 * jobs     = งานที่ทำให้เป็นสมาชิกเอง: ได้งานนี้เมื่อไรเป็นสมาชิกเมื่อนั้น เลิกงานคือออกจากองค์กร องค์กรที่ไม่มี jobs เข้าและออกด้วยผลของเหตุการณ์
 * enemy    = ฝ่ายที่ตามล่าสมาชิกขององค์กรนี้ เข้าองค์กรแล้วภัยตามล่าจากฝ่ายนั้นเริ่มที่ enemyLevel
 * foes     = ฝ่ายของศัตรูที่ท่าขององค์กร (TECHNIQUES[id]) ใช้ได้ผล
 * bounty   = true: ชนะการปะทะกับสิ่งที่ไม่ใช่คน องค์กรรับซื้อหลักฐานการล่า (ORG.bounty)
 */
export const ORG_IDS = ['wardens', 'fang_house'] as const;
export type OrgId = (typeof ORG_IDS)[number];
export interface OrgDef {
  th: string;
  ranks: readonly [string, string, string, string];
  faction: FactionId;
  jobs?: readonly string[];
  enemy: FactionId;
  foes: readonly FoeSide[];
  bounty?: boolean;
}
export const ORGS: Record<OrgId, OrgDef> = {
  wardens: {
    th: 'ภาคีผู้เฝ้าผนึก',
    ranks: ['ผู้เฝ้า', 'ผู้นับหิน', 'ผู้ถือกุญแจ', 'ผู้เฒ่าเจ็ดป้อม'],
    faction: 'wardens',
    jobs: ['job_wardens', 'job_fort_priest'],
    enemy: 'ash_cult',
    foes: ['demon'],
  },
  fang_house: {
    th: 'โรงรับเขี้ยว',
    ranks: ['คนส่งเขี้ยว', 'นักล่าป้ายทองเหลือง', 'นักล่าป้ายเหล็กดำ', 'เจ้าโต๊ะชั่ง'],
    faction: 'fang_house',
    enemy: 'fang_house',
    foes: ['demon', 'star', 'machine', 'nature'],
    bounty: true,
  },
};
/**
 * merit     = ผลงานสะสมที่ต้องมีก่อนฉากเลื่อนยศจะออก [ขึ้นยศ 2, ยศ 3, ยศ 4] ยศเลื่อนด้วยผลงาน ไม่ใช่ด้วยเวลา
 * done      = ผลงานที่ได้เมื่อทำงานที่องค์กรส่งมาสำเร็จ (ทอยผ่าน หรือชนะ เจรจาได้ ยันไว้ได้ในการปะทะ) พลาดหรือถอยไม่ได้ผลงาน
 * refused   = ผลงานที่เสียเมื่อปฏิเสธงาน (ตัวเลือกที่ติดป้าย refuse) ราคาอย่างอื่นของการปฏิเสธเขียนไว้ในผลของตัวเลือกนั้น
 * dutyGap   = งานขององค์กรเว้นกันอย่างน้อย min เหตุการณ์ และเมื่อไม่มีงานมา max เหตุการณ์ติดกัน เรื่องถัดไปคืองานขององค์กร (ถ้ายังมีงานที่ออกได้)
 * techRank  = ยศที่ได้ท่าขององค์กร
 * bounty    = เหรียญที่โรงรับเขี้ยวจ่ายเมื่อชนะการปะทะกับสิ่งที่ไม่ใช่คน ตามระดับภัย 1 ถึง 5 ของศัตรู
 * enemyLevel= ภัยตามล่าขั้นต่ำที่ติดมากับการเป็นสมาชิก · huntMax = ภัยตามล่าสูงสุด
 * huntFade  = โอกาสต่อปีที่ภัยตามล่าจากฝ่ายหนึ่งลดลงหนึ่งขั้นเอง (รอยเย็นลง) ภัยที่ติดมากับองค์กรที่ยังเป็นสมาชิกอยู่ไม่ลดต่ำกว่า enemyLevel
 */
export const ORG = {
  merit: [3, 7, 12],
  done: 1,
  refused: -1,
  dutyGap: { min: 1, max: 4 },
  techRank: 2,
  bounty: [1, 1, 2, 2, 3],
  enemyLevel: 1,
  huntMax: 5,
  huntFade: 0.08,
} as const;
export const ORG_RANKS = 4;

// ---------- ชุด ม: เมือง ----------
/**
 * เมืองที่ตัวละครอยู่ได้ (กติกาอยู่ใน src/engine/cities.ts) ชื่อย่านและเรื่องของเมืองเขียนไว้ในคัมภีร์โลก
 * tag       = location_tag ของถิ่นที่เมืองนี้ตั้งอยู่ ร้านค้า ฉากหลัง และหมุดบนแผนที่ยังอ่านจาก location_tag ตามเดิม
 * main      = เมืองหลักของถิ่น: ใครได้ location_tag นี้โดยเนื้อเรื่องไม่ระบุเมือง ถือว่าอยู่เมืองนี้ (ถิ่นที่ไม่มีเมืองหลักคืออยู่ชนบทของถิ่นนั้น)
 * map       = รหัสของที่นี้บนแผนที่โลก (art/map/places.yaml) หมุด "อยู่ที่นี่" ลงตรงนั้น
 * districts = ย่าน รหัส → ชื่อ ย่านแรกคือย่านที่คนมาใหม่ลงหลักปักฐาน
 * natives   = ชาติกำเนิด (flag origin_*) ของเด็กที่เกิดในเมืองนี้ → ย่านบ้านเกิด
 */
export const CITY_IDS = ['ventras', 'kardin', 'tundar', 'market_town', 'foothill_market', 'star_hall'] as const;
export type CityId = (typeof CITY_IDS)[number];
export interface CityDef {
  th: string;
  tag: string;
  main?: boolean;
  map: string;
  districts: Readonly<Record<string, string>>;
  natives?: Readonly<Record<string, string>>;
}
export const CITIES: Record<CityId, CityDef> = {
  ventras: {
    th: 'เวนทราส',
    tag: 'ventras',
    main: true,
    map: 'ventras',
    districts: { sky_docks: 'ย่านท่าเรือเหาะ', refineries: 'ย่านโรงกลั่น', temple_hill: 'ย่านวิหาร', institute: 'ย่านสถาบัน' },
    natives: { origin_refinery: 'refineries', origin_marked_hidden: 'temple_hill' },
  },
  kardin: {
    th: 'คาร์ดิน',
    tag: 'kardin',
    main: true,
    map: 'kardin',
    districts: { junction: 'ย่านชุมทาง', foundries: 'ย่านเตาหลอม', ledger_row: 'ถนนสมุดบัญชี' },
  },
  tundar: {
    th: 'ทุนดาร์',
    tag: 'hordun',
    main: true,
    map: 'tundar',
    districts: { lower_gate: 'ลานประตูล่าง', forge_levels: 'ชั้นโรงหลอม', clan_levels: 'ถนนวนของตระกูล', council_ring: 'วงสภา' },
    natives: { origin_dwarf_clan: 'clan_levels' },
  },
  market_town: {
    th: 'เมืองตลาด',
    tag: 'arvel_village',
    map: 'market_town',
    districts: { rail_side: 'ย่านริมราง', weigh_square: 'ลานโรงชั่ง', mill_lane: 'ซอยโรงสี' },
  },
  foothill_market: {
    th: 'ตลาดตีนเขา',
    tag: 'hordun',
    map: 'foothill_market',
    districts: { inn_row: 'แถวโรงเตี๊ยม', coal_yard: 'ลานถ่าน', rail_end: 'ปลายราง' },
  },
  star_hall: {
    th: 'หอนับดาว',
    tag: 'ileth',
    map: 'star_tower',
    districts: { root_camp: 'ลานโคนต้น', letter_boughs: 'กิ่งจดหมาย', count_deck: 'ชานนับ' },
  },
};
/** ชั้นของคนเมืองสี่ขั้น ขั้นแรกคือวันที่ย้ายเข้า คนที่เกิดในเมืองเริ่มที่ขั้น nativeRank */
export const CITY_RANKS = ['คนมาใหม่', 'ชาวย่าน', 'คนมีหน้ามีตา', 'ผู้อาวุโสของเมือง'] as const;
/** สภาพของเมือง: สงบ ตึงเครียด จลาจล โรคระบาด */
export const CITY_MOODS = ['calm', 'tense', 'riot', 'plague'] as const;
export type CityMood = (typeof CITY_MOODS)[number];
export const CITY_MOOD_TH: Record<CityMood, string> = { calm: 'สงบ', tense: 'ตึงเครียด', riot: 'จลาจล', plague: 'โรคระบาด' };
/** ที่อยู่ในเมือง: บ้านของครอบครัว (คนที่เกิดในเมือง) ห้องเช่า บ้านของตัวเอง หรือร้านของตัวเอง (อยู่ชั้นบนของร้าน) */
export const HOME_KINDS = ['family', 'room', 'house', 'shop'] as const;
export type HomeKind = (typeof HOME_KINDS)[number];
export const HOME_TH: Record<HomeKind, string> = { family: 'บ้านของครอบครัว', room: 'ห้องเช่า', house: 'บ้านของตัวเอง', shop: 'ร้านของตัวเอง' };
/**
 * merit      = ผลงานต่อเมือง (ความดีความชอบที่คนในย่านจำได้) ที่ต้องมีก่อนฉากขึ้นชั้นจะออก [ชาวย่าน, คนมีหน้ามีตา, ผู้อาวุโส]
 * nativeRank = ชั้นตั้งต้นของคนที่เกิดในเมืองนั้น
 * rent       = ค่าเช่าห้อง จ่ายตอนสิ้นปีทุก rentEvery ปี (เงินทั้งชีวิตของคนทั่วไปราว 30 เหรียญ ค่าเช่ารายปีจะกินหมด)
 *              ไม่มีจ่าย = ค้างค่าเช่า (ไม่เป็นหนี้) ค้างซ้ำอีกรอบ = ถูกไล่ออกจากห้อง
 * shopIncome = รายได้ของร้านของตัวเอง ได้ตอนสิ้นปีทุก shopEvery ปี ปีที่เมืองจลาจลร้านปิด ไม่ได้
 * roof       = แต้มบวกของเช็คฤดูหนาวสำหรับคนที่อยู่บ้านหรือร้านของตัวเอง นับรวมกับของกันหนาว ไม่เกิน GEAR.winterMax
 * minPrice   = ราคาต่ำสุดที่เนื้อเรื่องตั้งได้เมื่อให้ซื้อบ้านหรือร้าน (ตัวตรวจเนื้อเรื่องบังคับ) ราคาจริงของแต่ละเมืองเขียนในเหตุการณ์
 * ease       = โอกาสต่อปีที่สภาพเมืองจะคลายลงเองหนึ่งขั้น (จลาจล → ตึงเครียด → สงบ, โรคระบาด → สงบ)
 */
export const CITY = {
  merit: [3, 7, 12],
  nativeRank: 2,
  rent: 1,
  rentEvery: 4,
  shopIncome: 1,
  shopEvery: 3,
  roof: 1,
  minPrice: { house: 10, shop: 14 },
  ease: { tense: 0.15, riot: 0.5, plague: 0.4 },
} as const;

// ---------- ชุด ม: หลักสูตร ----------
/**
 * ช่วงชีวิตแบบหลักสูตร (กติกาอยู่ใน src/engine/course.ts): ระหว่างเรียน ชีวิตเดินด้วยเหตุการณ์ของหลักสูตร ปีละเรื่อง ตามปีที่เรียน
 * years   = จำนวนปีของหลักสูตร จบปีสุดท้ายแล้วถือว่าเรียนจบ
 * tracks  = สาย (สำนัก) ที่เลือกได้ระหว่างเรียน รหัส → ชื่อ เลือกแล้วติด flag <trackFlag><รหัส> ไปตลอดชีวิต
 * student = flag ที่ติดระหว่างเรียน · done = flag ที่ได้เมื่อเรียนจบ (ติดตลอดชีวิต)
 */
export const COURSE_IDS = ['institute'] as const;
export type CourseId = (typeof COURSE_IDS)[number];
export interface CourseDef {
  th: string;
  years: number;
  tracks: Readonly<Record<string, string>>;
  trackFlag: string;
  student: string;
  done: string;
}
export const COURSES: Record<CourseId, CourseDef> = {
  institute: {
    th: 'สถาบันเวทหลวง',
    years: 6,
    tracks: { distill: 'สำนักกลั่น', machine: 'สำนักจักรกลเวท', texts: 'สำนักตำรา', stars: 'สำนักดาราศาสตร์', healing: 'สำนักรักษา', war: 'สำนักสงคราม' },
    trackFlag: 'school_',
    student: 'institute_student',
    done: 'institute_graduate',
  },
};

// ---------- ชุด 4: เจ้าเดิมและข้อห้ามของแผ่นดิน ----------
/**
 * เจ้าเดิมเจ็ดตนกับข้อห้ามที่คนยังถือ (กติกาอยู่ใน src/engine/land.ts เรื่องเล่าอยู่ในหัวข้อเจ้าเดิมของคัมภีร์โลก)
 * th = ชื่อเจ้าเดิม · rule = ข้อห้ามแบบที่คนแก่สอน · boon = พรของคนที่ถือข้อห้ามข้อนี้มาตลอด (รหัสในทะเบียนสิ่งติดตัว)
 * พรหลุดเองเมื่อฝืนข้อห้ามของเจ้าเดิมตนนั้น และกลายเป็นคำสาปถ้าทะเบียนเขียน becomes ไว้
 */
export const TABOO_IDS = ['river', 'field', 'fire', 'stone', 'forest', 'wind', 'night'] as const;
export type TabooId = (typeof TABOO_IDS)[number];
export const TABOOS: Record<TabooId, { th: string; rule: string; boon: string }> = {
  river: { th: 'แม่น้ำเฒ่า', rule: 'ไม่เทของเสียลงน้ำตอนกลางคืน โยนเหรียญแรกของปีลงน้ำ', boon: 'old_river' },
  field: { th: 'วัวใต้ทุ่ง', rule: 'ไถอ้อมเนิน เว้นรวงสุดท้ายไว้ในนา', boon: 'old_field' },
  fire: { th: 'แม่เสือไฟ', rule: 'ไม่ดับเตาด้วยน้ำ ไฟที่ยืมมาต้องคืนก่อนรุ่ง', boon: 'old_fire' },
  stone: { th: 'ยายหมีหิน', rule: 'เคาะหินสามครั้งก่อนเจาะ ไม่ขุดในเดือนที่หนาวที่สุด', boon: 'old_stone' },
  forest: { th: 'กวางไม่มีเขา', rule: 'ไม่โค่นไม้เป็น ไม่ล่าสัตว์ที่มีลูกอ่อน', boon: 'old_forest' },
  wind: { th: 'ฝูงนกไม่มีรัง', rule: 'ไม่ขังนกป่า เปิดหน้าต่างไว้บานหนึ่งเมื่อมีคนตาย', boon: 'old_wind' },
  night: { th: 'เค้ากลางคืน', rule: 'ไม่ชี้ดาว ไม่นับดาวออกเสียง', boon: 'old_night' },
};
/** สิ่งที่ตัวเลือกทำกับข้อห้ามหนึ่งข้อ: learn รู้ข้อห้าม · keep ถือหนึ่งครั้ง · break ฝืนหนึ่งครั้ง · mend ทำพิธีขอขมา (ล้างครั้งที่เคยฝืน) */
export const TABOO_ACTS = ['learn', 'keep', 'break', 'mend'] as const;
export type TabooAct = (typeof TABOO_ACTS)[number];
/**
 * holds  = ถือครบเท่านี้ครั้งโดยไม่มีครั้งที่ฝืนค้างอยู่ นับเป็นคนถือข้อห้ามข้อนั้น (เงื่อนไข taboo.keeps ฉากรับพรใช้ข้อนี้)
 * defies = ฝืนครบเท่านี้ครั้ง นับเป็นคนฝืนซ้ำ (เงื่อนไข taboo.defies ฉากคำสาปและลูกหลานของเจ้าเดิมใช้ข้อนี้)
 * land   = คะแนนแผ่นดินที่ขึ้นเมื่อฝืนหนึ่งครั้ง · mend = คะแนนแผ่นดินที่ลงเมื่อทำพิธีขอขมาหนึ่งครั้ง
 */
export const TABOO = { holds: 2, defies: 2, land: 1, mend: 1 } as const;

// ---------- ชุด 4: เส้นเรื่องยาว ----------
/**
 * เส้นเรื่องยาว (กติกาอยู่ใน src/engine/arcs.ts): เรื่องที่เดินเป็นตอนๆ ข้ามหลายสิบปี เหตุการณ์ที่มี arc: { id, step } คือตอนหนึ่งของเส้นนั้น
 * maxOpen = จำนวนเส้นที่เปิดค้างพร้อมกันได้ในชีวิตเดียว ครบแล้วตอนแรกของเส้นใหม่ไม่ออก
 * gap     = ตอนถัดไปออกได้เมื่อผ่านไปอย่างน้อยเท่านี้ปีนับจากตอนก่อน
 * due     = ผ่านไปเท่านี้ปีแล้วตอนถัดไปยังไม่มา เรื่องถัดไปของชีวิตคือตอนนั้น (ถ้าเข้าเงื่อนไข) เส้นเรื่องจึงไม่ค้างเพราะดวง
 * stale   = เส้นที่ไม่มีตอนไหนออกได้มานานเท่านี้ปี (คนในเรื่องตาย ย้ายถิ่น) เลิกนับเป็นเส้นที่เปิดค้าง ที่ว่างจึงคืนให้เส้นอื่น
 */
export const ARC_IDS = ['relics', 'debt', 'horned_child', 'pupil', 'feud', 'low_voice', 'glass', 'seal_secret', 'climb', 'faith', 'house', 'pillars'] as const;
export type ArcId = (typeof ARC_IDS)[number];
export const ARC_TH: Record<ArcId, string> = {
  relics: 'ของของผู้กล้าทั้งหก',
  debt: 'หนี้ที่ไม่ตายตามคน',
  horned_child: 'ลูกมีเขา',
  pupil: 'ศิษย์',
  feud: 'คู่แค้น',
  low_voice: 'เสียงทุ้มในฝัน',
  glass: 'ผิวแก้ว',
  seal_secret: 'ความลับของผนึก',
  climb: 'ไต่ชนชั้น',
  faith: 'ศรัทธาที่แตก',
  house: 'บ้าน',
  pillars: 'เจ็ดเสา',
};
export const ARC = { maxOpen: 3, gap: 3, due: 7, stale: 15 } as const;
