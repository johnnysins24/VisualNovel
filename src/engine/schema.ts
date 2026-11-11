import { z } from 'zod';
import { CLASS_IDS, FACTIONS, FOE_SIDES, GOD_IDS, WORLD_KEYS } from './balance';
import { TIMES } from './timeOfDay';

export const STATS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export type Stat = (typeof STATS)[number];
export const StatSchema = z.enum(STATS);

/** death = ฉากตาย ออกเฉพาะตอนตัวละครกำลังจะตาย (when.dying) ไม่ปนกับกองเหตุการณ์ตามวัย */
export const STAGES = ['infancy', 'childhood', 'youth', 'adult', 'elder', 'death'] as const;
export type Stage = (typeof STAGES)[number];
export const StageSchema = z.enum(STAGES);

export const SLOTS = ['head', 'body', 'hands', 'legs', 'feet', 'weapon', 'offhand', 'cloak', 'accessory'] as const;
export const SlotSchema = z.enum(SLOTS);
export type Slot = z.infer<typeof SlotSchema>;

const ClassSchema = z.enum(CLASS_IDS as [string, ...string[]]);
const GodSchema = z.enum(GOD_IDS as [string, ...string[]]);
const FactionSchema = z.enum(FACTIONS);
const WorldKeySchema = z.enum(WORLD_KEYS);
const FoeSchema = z.enum(FOE_SIDES);

/** ตำแหน่งในผังครอบครัว พ่อแม่ถูกเพิ่มเองตอนสุ่มชื่อ (id father, mother) */
export const KIN_ROLES = [
  'father', 'mother',
  'grandfather_paternal', 'grandmother_paternal', 'grandfather_maternal', 'grandmother_maternal',
  'sibling_older', 'sibling_younger', 'spouse', 'child',
] as const;
export type KinRole = (typeof KIN_ROLES)[number];
/** ชนิดความสัมพันธ์บนผังความสัมพันธ์ */
export const BONDS = ['kin', 'friend', 'mentor', 'love', 'rival'] as const;
export type Bond = (typeof BONDS)[number];

/** เหตุที่ตัวละครตาย ใช้เลือกฉากตาย: สิ้นอายุขัย แผล การปะทะ หรือเลือกสละเอง */
export const DEATH_CAUSES = ['age', 'wound', 'fight', 'sacrifice'] as const;
export type DeathCause = (typeof DEATH_CAUSES)[number];

/** คนในชีวิต อ้างด้วย id เดิมทุกครั้ง ครั้งแรกต้องมี name ส่วน id ที่ขึ้นต้นด้วย @ คือบทใน cast ของเหตุการณ์นั้น เช่น @who */
export const PersonEffectSchema = z
  .object({
    id: z.string().regex(/^@?[a-z0-9_]+$/),
    name: z.string().optional(),
    /** อายุของคนนี้ตอนเข้ามาในชีวิต (ปี) ไม่ใส่ = ระบบกะจากบทบาท เช่น พ่อแม่แก่กว่าผู้เล่น 20 ถึง 34 ปี */
    age: z.number().int().min(0).optional(),
    gender: z.enum(['m', 'f']).optional(),
    kin: z.enum(KIN_ROLES).optional(),
    bond: z.enum(BONDS).optional(),
    /** บวกลบความสนิท ช่วง −5 ถึง 5 */
    closeness: z.number().int().optional(),
    dies: z.boolean().optional(),
  })
  .strict();
export type PersonEffect = z.infer<typeof PersonEffectSchema>;

const WorldRange = z.partialRecord(WorldKeySchema, z.tuple([z.number().int(), z.number().int()]));
const RepMap = z.partialRecord(FactionSchema, z.number().int());

export const EffectsSchema = z
  .object({
    stats: z.partialRecord(StatSchema, z.number().int()).optional(),
    hp: z.number().int().optional(),
    gold: z.number().int().optional(),
    /** เงินที่เสียใน effect นี้ทำให้ติดลบได้ (หนี้ที่ผู้เล่นเลือกก่อเอง เช่น ค้ำหนี้แล้วรับหนี้มาจ่ายแทน) ไม่มี = เสียได้แค่เท่าที่มี */
    debt: z.boolean().optional(),
    flags: z.array(z.string()).optional(),
    clear_flags: z.array(z.string()).optional(),
    traits: z.array(z.string()).optional(),
    /** ถอดสิ่งติดตัวออก (แก้คำสาป ผิดเงื่อนไขของพร) */
    lose_traits: z.array(z.string()).optional(),
    /** ขยับขั้นของสิ่งติดตัวที่มีหลายขั้น (บวกคือลุกลาม ลบคือทุเลา) ไม่ต่ำกว่าขั้น 1 ไม่เกินขั้นสุดท้าย */
    trait_step: z.record(z.string(), z.number().int()).optional(),
    items: z.array(z.string()).optional(),
    location_tag: z.string().optional(),
    /** ตัวละครตาย true = ระบบเดาเหตุเอง (เช็คที่มี foe คือการปะทะ นอกนั้นคือแผล) หรือระบุเหตุเองเช่น sacrifice */
    die: z.union([z.boolean(), z.enum(DEATH_CAUSES)]).optional(),
    /** พลังชีวิตสูงสุดเปลี่ยนถาวร (แผลที่ไม่หาย การดูแลที่ทำให้แข็งแรงขึ้น) */
    max_hp: z.number().int().optional(),
    /** มีลูกเพิ่มหนึ่งคน ระบบตั้งชื่อจากกลุ่มชื่อของบ้าน สุ่มเพศถ้าไม่ระบุ และจดปีเกิด ใช้ในข้อความด้วย {child} */
    child: z.object({ gender: z.enum(['m', 'f']).optional(), horned: z.boolean().optional() }).strict().optional(),
    /** ป้ายสั้นๆ ของเหตุการณ์นี้บนเส้นชีวิตในหน้าชีวประวัติ เช่น "เลือกทางพราน" (ทับ mark ของเหตุการณ์) */
    mark: z.string().optional(),
    /** ประโยคสุดท้ายของชีวิต ใช้ในฉากตาย แสดงใต้ชื่อในหน้าชีวประวัติ */
    epitaph: z.string().optional(),
    /**
     * ฉากตายเท่านั้น: ตัวละครรอดจากความตายครั้งนี้ (ข้อตกลง ปาฏิหาริย์) ฉากจบแล้วชีวิตเดินต่อ
     * คนที่กำลังสิ้นอายุขัยต้องได้ max_hp คืนใน effect เดียวกัน ไม่อย่างนั้นร่างไม่มีอะไรให้อยู่ต่อ ชีวิตจบตามเดิม
     */
    survive: z.boolean().optional(),
    /** คะแนนโลกลับ (เทพ จอมมาร ดาว) ผู้เล่นไม่เห็นตัวเลข */
    world: z.partialRecord(WorldKeySchema, z.number().int()).optional(),
    /** แนวทางส่วนตัว: law + คือระเบียบ − คืออิสระ, moral + คือดี − คือชั่ว */
    alignment: z.object({ law: z.number().int().optional(), moral: z.number().int().optional() }).strict().optional(),
    /** ชื่อเสียงต่อกลุ่ม ติดข้ามชีวิต */
    reputation: RepMap.optional(),
    /** ตั้งอาชีพ (ครั้งแรกครั้งเดียว) */
    class: ClassSchema.optional(),
    /** เปลี่ยนกลุ่มชื่อของตัวเอง/พ่อแม่จากค่าตามเผ่า parents: none = ไม่มีพ่อแม่ที่รู้จัก (ใช้ พ่อ แม่) */
    name_pool: z.object({ self: z.string().optional(), parents: z.string().optional() }).strict().optional(),
    /** ตั้งเทพที่นับถือ */
    god: GodSchema.optional(),
    /**
     * มีคนรัก (แทนคนเดิมถ้ามีอยู่แล้ว) ชื่อสุ่มจากกลุ่มชื่อ pool ตามเพศที่ระบุ ไม่ระบุ pool ใช้กลุ่มชื่อของพ่อแม่หรือเผ่า
     * ใช้ในข้อความด้วย {partner} และ {p:เขา|เธอ}
     */
    partner: z.object({ gender: z.enum(['m', 'f']), pool: z.string().optional() }).strict().optional(),
    /** เพิ่มหรือปรับคนในชีวิต (ผังครอบครัวและผังความสัมพันธ์) */
    people: z.array(PersonEffectSchema).optional(),
  })
  .strict();
export type Effects = z.infer<typeof EffectsSchema>;

const CheckSchema = z.object({
  stat: StatSchema,
  dc: z.number().int().min(1).max(30),
  /** ฝั่งของศัตรู/สิ่งที่เผชิญ: ใช้กับรอยจอมมาร */
  foe: FoeSchema.optional(),
  /** เช็คสำคัญ: โชว์กล่องทอยเต๋ากลางจอ (เช็คที่มี foe ก็โชว์) */
  major: z.boolean().optional(),
});

const OutcomeSchema = z.object({ text: z.string().optional(), effects: EffectsSchema.optional() });

/** เงื่อนไขร่วมของ when (เหตุการณ์) และ requires (ตัวเลือก) ในส่วนสถานะโลกและตัวละคร */
const StateConds = {
  /** เพศของตัวละคร เช่น ประกาศเกณฑ์ทหารที่เรียกเฉพาะผู้ชาย */
  gender: z.enum(['m', 'f']).optional(),
  /** ต้องไม่มีสิ่งติดตัวเหล่านี้ */
  not_traits: z.array(z.string()).optional(),
  /** true = ยังถือพรหรือคำสาปใหญ่ได้อีก (ไม่เกิน BIG_TRAITS_MAX) ใช้กับเหตุการณ์หรือตัวเลือกที่ให้ของใหญ่ */
  big_room: z.boolean().optional(),
  class: ClassSchema.optional(),
  god: GodSchema.optional(),
  world: WorldRange.optional(),
  min_reputation: RepMap.optional(),
  max_reputation: RepMap.optional(),
};

/**
 * บทของตัวแสดง: เหตุการณ์บอกแค่ว่าต้องการคนแบบไหน ระบบเลือกคนที่มีอยู่จริงในชีวิตนั้นมาเล่น ไม่มีใครเข้าบท เหตุการณ์ไม่ออก
 * ในข้อความใช้ {ชื่อบท} เป็นชื่อคน และ {ชื่อบท:เขา|เธอ} เลือกคำตามเพศ ใน effects.people ใช้ id: "@ชื่อบท"
 */
export const CAST_PICKS = ['closest', 'eldest', 'youngest', 'first', 'random'] as const;
export const CastSpecSchema = z
  .object({
    /** เจาะจงคนด้วย id เช่น partner, father */
    id: z.string().optional(),
    kin: z.array(z.enum(KIN_ROLES)).optional(),
    bond: z.array(z.enum(BONDS)).optional(),
    min_closeness: z.number().int().optional(),
    max_closeness: z.number().int().optional(),
    /** อายุของคนนั้น เทียบเป็นอายุมนุษย์ */
    min_age: z.number().int().optional(),
    max_age: z.number().int().optional(),
    /** false = คนที่ตายไปแล้ว (เหตุการณ์รำลึก) */
    alive: z.boolean().default(true),
    pick: z.enum(CAST_PICKS).default('closest'),
    /** true = ไม่มีใครเข้าบทเหตุการณ์ก็ยังออกได้ ใช้ชื่อบทนี้ได้เฉพาะในตัวเลือกที่มี requires.cast */
    optional: z.boolean().default(false),
  })
  .strict();
export type CastSpec = z.infer<typeof CastSpecSchema>;

export const ChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** ตัวเลือกนี้นับเป็นนิสัยหนึ่งครั้ง เลือกครบ HABIT_COUNT ครั้งและไม่น้อยกว่า HABIT_SHARE ของครั้งที่มีให้เลือก ได้ลักษณะนั้นติดตัว (id ในทะเบียนสิ่งติดตัวที่มี habit: true) */
  habit: z.string().optional(),
  /** ข้อความหลังเลือก (ตัวเลือกที่ไม่มี check ก็แสดงได้) */
  text: z.string().optional(),
  requires: z
    .object({
      trait: z.string().optional(),
      flag: z.string().optional(),
      /** ตัวเลือกซ่อนถ้ามี flag ใดในนี้ (เช่น race_tiefling สำหรับงานที่ไม่รับคนมีเขา) */
      not_flags: z.array(z.string()).optional(),
      item: z.string().optional(),
      /** ต้องมีคนเข้าบทเหล่านี้ (บทที่ optional ใน cast ของเหตุการณ์) */
      cast: z.array(z.string()).optional(),
      /** ตัวเลือกที่ต้องจ่ายเงิน (ซื้อ ให้ ฝาก) ซ่อนถ้าเงินไม่ถึง ข้อความที่บอกว่าจ่ายกี่เหรียญจึงตรงกับเงินที่มีจริง */
      min_gold: z.number().int().min(1).optional(),
      min_stat: z.partialRecord(StatSchema, z.number().int()).optional(),
      ...StateConds,
    })
    .optional(),
  check: CheckSchema.optional(),
  effects: EffectsSchema.optional(),
  success: OutcomeSchema.optional(),
  failure: OutcomeSchema.optional(),
});
export type Choice = z.infer<typeof ChoiceSchema>;

/**
 * ฉากหลังของเหตุการณ์ (ภาพประกอบจาก thread ศิลป์) ไม่ใส่ = ใช้ภาพตาม location_tag
 * home กับ market มีภาพแยกตามถิ่น ฉากอื่นใช้ภาพเดียวทุกถิ่น
 */
export const SCENES = [
  'home', 'market', 'temple', 'tavern', 'refinery', 'road', 'fort', 'noble_hall', 'workshop', 'smithy', 'golem_shop', 'healer',
  'ship_deck', 'mine', 'clan_hall', 'institute', 'belek_bank', 'star_hall',
] as const;
export type Scene = (typeof SCENES)[number];

export const EventSchema = z.object({
  id: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/, 'id ต้องเป็น stage.name'),
  stage: StageSchema,
  weight: z.number().positive().default(10),
  once: z.boolean().default(true),
  /**
   * เหตุการณ์ที่ต้องเกิด (พิธีผ่านวัย การเลือกงาน หมุดเหตุการณ์ของโลก) ออกทันทีที่เข้าเงื่อนไขโดยไม่สุ่ม
   * ถ้ามีหลายเรื่องพร้อมกัน เรื่องที่ช่วงอายุหรือช่วงปีจะปิดก่อนได้ออกก่อน ต้องใช้คู่กับ once: true
   */
  must: z.boolean().default(false),
  scene: z.enum(SCENES).optional(),
  /** ช่วงเวลาของภาพฉาก ไม่ใส่ = อ่านจากคำบอกเวลาในเนื้อเรื่อง (src/engine/timeOfDay.ts) */
  time: z.enum(TIMES).optional(),
  /** ตัวแสดง: ชื่อบท → คนแบบที่ต้องการ (ดู CastSpecSchema) */
  cast: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), CastSpecSchema).optional(),
  /**
   * เหตุการณ์ที่เล่าเวลาหลายปีรวบเดียว (เช่น "สามปีผ่านไป") เวลาเดินเท่านี้ปีแทนหนึ่งปี
   * ระบบตัดให้สั้นลงเองถ้าจะข้ามหมุดของโลกหรือข้ามเข้าวัยที่ต้องเช็คฤดูหนาวทุกปี
   */
  years: z.number().int().min(2).max(20).optional(),
  /** เหตุการณ์หลายปีที่เนื้อเรื่องต้องใช้เวลานานจริง (เช่น คนสามรุ่นผ่านไป): ไม่ออกถ้าเวลาที่เดินได้จริงสั้นกว่านี้ ต้องใช้คู่กับ years */
  min_years: z.number().int().min(2).max(20).optional(),
  /** เหตุการณ์สำรอง ออกเฉพาะปีที่กองเหตุการณ์ปกติบาง (น้อยกว่า THIN_POOL เรื่อง) พอเนื้อเรื่องช่วงนั้นแน่นขึ้นก็เลิกออกเอง */
  fallback: z.boolean().default(false),
  /** ป้ายสั้นๆ บนเส้นชีวิตในหน้าชีวประวัติ ไม่ใส่ = เหตุการณ์นี้ไม่ขึ้นเส้นชีวิต */
  mark: z.string().optional(),
  /** คนที่เหตุการณ์นี้พาเข้ามาในชีวิต (หรือเปลี่ยน) ไม่ว่าจะเลือกทางไหน ใช้ก่อนผลของตัวเลือก รูปแบบเดียวกับ effects.people */
  people: z.array(PersonEffectSchema).optional(),
  when: z
    .object({
      age: z.tuple([z.number().int(), z.number().int()]).optional(),
      /** ปีในโลก = birth_year + age */
      year: z.tuple([z.number().int(), z.number().int()]).optional(),
      location_tag: z.string().optional(),
      flags: z.array(z.string()).optional(),
      not_flags: z.array(z.string()).optional(),
      trait: z.string().optional(),
      /** ฉากตาย: ออกเมื่อตัวละครกำลังจะตายด้วยเหตุใดเหตุหนึ่งในนี้ */
      dying: z.array(z.enum(DEATH_CAUSES)).optional(),
      /**
       * ฉากตาย: true = ออกเฉพาะเมื่อข้อความก่อนหน้าเล่าความตายไปแล้ว (ผลที่มี die) ฉากนี้จึงเล่าจากข้างในว่าสิ่งสุดท้ายที่ตัวละครรู้คืออะไร
       * false = ออกเฉพาะเมื่อยังไม่มีใครเล่า (พลังชีวิตหมดจากแผล หรือสิ้นอายุขัย) ฉากนี้ต้องเล่าความตายเอง ไม่ใส่ = ออกได้ทั้งสองแบบ
       */
      told: z.boolean().optional(),
      ...StateConds,
    })
    .default({}),
  text: z.string(),
  choices: z.array(ChoiceSchema).min(1),
});
export type GameEvent = z.infer<typeof EventSchema>;

export const PassiveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('check_bonus'), stat: StatSchema, amount: z.number().int() }),
  z.object({ kind: z.literal('max_hp'), amount: z.number().int() }),
  z.object({ kind: z.literal('reroll_failed_check'), once_per_event: z.boolean().default(true) }),
]);
export type Passive = z.infer<typeof PassiveSchema>;

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slot: SlotSchema,
  rarity: z.enum(['common', 'uncommon', 'rare']).default('common'),
  stats: z.partialRecord(StatSchema, z.number().int()).default({}),
  passive: z.object({ description: z.string(), effect: PassiveSchema }).optional(),
  /** sprite layer id; palette swaps are applied by the sprite system */
  sprite: z.string().optional(),
});
export type Item = z.infer<typeof ItemSchema>;

/** กลุ่มชื่อสำหรับตั้งชื่อตัวละครและพ่อแม่ตามเผ่า (thread เนื้อเรื่องเป็นคนเติม) */
export const NamePoolSchema = z.object({
  /** id ของกลุ่มชื่อ ใช้เป็นกลุ่มปริยายของเผ่าที่มี id ตรงกัน หรือเลือกด้วย effects.name_pool */
  race: z.string(),
  male: z.array(z.string()).default([]),
  female: z.array(z.string()).default([]),
  /** นามสกุล/ตระกูล ใช้กับ {surname} */
  surname: z.array(z.string()).default([]),
});
export type NamePool = z.infer<typeof NamePoolSchema>;

// ---------- ทะเบียนสิ่งติดตัว (ลักษณะ พร คำสาป แผล) ----------
export const TRAIT_KINDS = ['boon', 'curse', 'trait', 'wound'] as const;
export type TraitKind = (typeof TRAIT_KINDS)[number];

const Where = {
  /** ใช้ได้เฉพาะเมื่ออยู่ในถิ่นเหล่านี้ (location_tag) */
  locations: z.array(z.string()).optional(),
  /** ใช้ไม่ได้เมื่ออยู่ในถิ่นเหล่านี้ */
  not_locations: z.array(z.string()).optional(),
};
export const TraitEffectSchema = z.discriminatedUnion('kind', [
  /** บวกหรือลบแต้มทอย เจาะจง stat ฝั่งของศัตรู หรือถิ่นได้ ไม่เจาะจง = ทุกการทอย */
  z.object({ kind: z.literal('check_bonus'), amount: z.number().int().min(-5).max(5), stats: z.array(StatSchema).optional(), foes: z.array(FoeSchema).optional(), ...Where }).strict(),
  z.object({ kind: z.literal('max_hp'), amount: z.number().int() }).strict(),
  /** พลังชีวิตที่ฟื้นเพิ่มหรือลดต่อปี */
  z.object({ kind: z.literal('regen'), amount: z.number().int(), ...Where }).strict(),
  /** บวกหรือลบแต้มเช็คฤดูหนาว */
  z.object({ kind: z.literal('winter'), amount: z.number().int() }).strict(),
  /** ไม่แก่: ร่างกายไม่โรยและไม่ต้องเช็คฤดูหนาว */
  z.object({ kind: z.literal('ageless') }).strict(),
  /** กันตายหนึ่งครั้ง (ไม่กันสิ้นอายุขัย) ใช้แล้วสิ่งติดตัวนี้หายไป ตั้ง flag ที่ระบุ และกลายเป็น becomes ถ้ามี */
  z.object({ kind: z.literal('cheat_death'), flag: z.string().optional(), becomes: z.string().optional() }).strict(),
]);
export type TraitEffect = z.infer<typeof TraitEffectSchema>;

const TraitStepSchema = z
  .object({
    name: z.string().optional(),
    gives: z.array(z.string()).default([]),
    costs: z.array(z.string()).default([]),
    effects: z.array(TraitEffectSchema).default([]),
  })
  .strict();

export const TraitSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    kind: z.enum(TRAIT_KINDS),
    /** ผู้ให้หรือที่มา เช่น ชื่อเทพ เจ้าเดิม องค์กร (ลักษณะกับแผลไม่ต้องมี) */
    source: z.string().optional(),
    /** ได้มาอย่างไร หนึ่งประโยค */
    how: z.string(),
    /** สิ่งที่ได้ (บรรทัดบวกบนการ์ด) และราคาที่จ่าย (บรรทัดลบ) ของที่มีหลายขั้นเขียนใน steps แทน */
    gives: z.array(z.string()).default([]),
    costs: z.array(z.string()).default([]),
    effects: z.array(TraitEffectSchema).default([]),
    /** ขั้นของสิ่งที่ลุกลามได้ ขั้น n ใช้ steps[n-1] */
    steps: z.array(TraitStepSchema).min(2).optional(),
    /** พรหรือคำสาปใหญ่ ถือพร้อมกันได้ไม่เกิน BIG_TRAITS_MAX */
    big: z.boolean().default(false),
    /** คนอื่นมองไม่เห็น */
    hidden: z.boolean().default(false),
    /** ตกถึงลูก */
    heritable: z.boolean().default(false),
    /** ลักษณะที่ก่อตัวจากการเลือกทางเดิมซ้ำ (choice.habit) */
    habit: z.boolean().default(false),
    /** ลักษณะที่เป็นไปพร้อมกันไม่ได้ เช่น ใจร้อนกับใจเย็น */
    excludes: z.array(z.string()).default([]),
    /**
     * นิสัยที่คนถือสิ่งนี้เลือกไม่ได้อีก: ตัวเลือกที่ติดป้าย habit ตรงกับรายการนี้ถูกล็อก (หน้าจอโชว์เป็นล็อกพร้อมชื่อสิ่งติดตัว)
     * เช่น ใจร้อนปิดทางของคนใจเย็น ราคาข้อนี้ต้องเขียนไว้ใน costs ด้วย
     */
    blocks: z.array(z.string()).default([]),
    /** ประโยคในบันทึกชีวิตตอนลักษณะนี้ก่อตัว */
    gained: z.string().optional(),
    /** พร: ทำอะไรแล้วพรหมด และกลับเป็นคำสาปไหน */
    breaks: z.string().optional(),
    becomes: z.string().optional(),
    /** คำสาป: ทางแก้อย่างน้อยสองทาง และทางที่ไม่ใช่การแก้แต่เป็นการอยู่กับมัน */
    cures: z.array(z.string()).default([]),
    live_with: z.string().optional(),
  })
  .strict();
export type Trait = z.infer<typeof TraitSchema>;

export const ContentSchema = z.object({
  events: z.array(EventSchema),
  items: z.array(ItemSchema),
  names: z.array(NamePoolSchema).default([]),
  traits: z.array(TraitSchema).default([]),
  /** ประโยคสั้นที่ระบบหยิบไปเติมในบันทึกชีวิต (ร่างกายโรย ฤดูหนาว ข่าวคนรอบตัวจากไป) กุญแจ → รายการให้สุ่ม */
  lines: z.record(z.string(), z.array(z.string())).default({}),
});
export type Content = z.infer<typeof ContentSchema>;
