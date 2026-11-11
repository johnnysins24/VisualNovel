import { z } from 'zod';
import { CITY_IDS, CITY_MOODS, CITY_RANKS, CLASS_IDS, COURSE_IDS, FACTIONS, FOE_SIDES, FOE_TAGS, GOD_IDS, HOME_KINDS, ITEM_TAGS, MATERIAL_IDS, MOVE_KINDS, ORG_IDS, ORG_RANKS, RACE_IDS, RARITIES, WORLD_KEYS } from './balance';
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
    /** เผ่าของคนนี้ ใส่เมื่อไม่ใช่มนุษย์และไม่ใช่ญาติสายเลือด (เอลฟ์กับคนแคระแก่ช้าและอยู่นานกว่า รูปก็เป็นเผ่านั้น) */
    race: z.enum(RACE_IDS as [string, ...string[]]).optional(),
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

// ---------- องค์กร ----------
const OrgIdSchema = z.enum(ORG_IDS);
const RankSchema = z.number().int().min(1).max(ORG_RANKS);
/**
 * ผลต่อสถานะสมาชิกขององค์กรหนึ่ง (กติกาใน orgs.ts)
 * join = เข้าเป็นสมาชิกที่ยศแรก · secret = เข้าแบบลับ (ใช้คู่กับ join) หรือ secret: false = ตัวตนถูกเปิดเผย · leave = ออก (ผลงานและยศหายไป)
 * merit = บวกลบผลงานนอกเหนือจากที่ระบบให้เองเมื่อทำงานขององค์กร · promote = เลื่อนยศหนึ่งขั้น (ใช้ในฉากเลื่อนยศ)
 * องค์กรที่ผูกกับงาน (ORGS[id].jobs) เข้าและออกตาม flag ของงาน ใช้ join กับ leave ไม่ได้
 */
export const OrgEffectSchema = z
  .object({
    id: OrgIdSchema,
    join: z.boolean().optional(),
    secret: z.boolean().optional(),
    leave: z.boolean().optional(),
    merit: z.number().int().optional(),
    promote: z.boolean().optional(),
  })
  .strict();
export type OrgEffect = z.infer<typeof OrgEffectSchema>;
/**
 * เงื่อนไขสมาชิก: เขียนแค่รหัสองค์กร = เป็นสมาชิก หรือระบุยศและผลงาน
 * ready: true = ผลงานถึงเกณฑ์ของยศถัดไปแล้ว (ใช้กับฉากเลื่อนยศ ตัวเลขอยู่ใน ORG.merit) · min_refused = ปฏิเสธงานมาแล้วอย่างน้อยเท่านี้ครั้ง
 */
export const OrgCondSchema = z.union([
  OrgIdSchema,
  z
    .object({
      id: OrgIdSchema,
      min_rank: RankSchema.optional(),
      max_rank: RankSchema.optional(),
      ready: z.boolean().optional(),
      secret: z.boolean().optional(),
      min_refused: z.number().int().min(1).optional(),
    })
    .strict(),
]);
export type OrgCond = z.infer<typeof OrgCondSchema>;
const HuntMap = z.partialRecord(FactionSchema, z.number().int());

const CityIdSchema = z.enum(CITY_IDS);
const CityRankSchema = z.number().int().min(1).max(CITY_RANKS.length);
const MoodSchema = z.enum(CITY_MOODS);
/**
 * ผลต่อชีวิตในเมือง (กติกาใน cities.ts)
 * move = ย้ายเข้าเมืองนี้ (ตั้ง location_tag ของเมืองให้เอง ลงที่ย่านแรกของเมือง หรือย่านที่ระบุใน district) · leave = ออกไปอยู่ชนบทของถิ่นเดียวกัน
 * district = ย้ายย่านในเมืองที่อยู่ · home = ที่อยู่ใหม่ (room เช่าห้อง, house ซื้อบ้าน, shop ซื้อร้าน, none ไม่มีที่อยู่แล้ว)
 *   ซื้อบ้านหรือร้านต้องจ่ายเงินใน effect เดียวกัน (gold ติดลบไม่น้อยกว่า CITY.minPrice) ตัวตรวจเนื้อเรื่องบังคับ
 * merit = บวกลบผลงานต่อเมือง · promote = ขึ้นชั้นหนึ่งขั้น (ใช้ในฉากขึ้นชั้น) · mood = สภาพใหม่ของเมือง
 * of = เมืองที่ merit กับ mood หมายถึง ถ้าไม่ใช่เมืองที่อยู่ (เช่น ข่าวจลาจลในเมืองอื่น)
 */
export const CityEffectSchema = z
  .object({
    move: CityIdSchema.optional(),
    leave: z.boolean().optional(),
    district: z.string().optional(),
    home: z.enum(['room', 'house', 'shop', 'none']).optional(),
    merit: z.number().int().optional(),
    promote: z.boolean().optional(),
    mood: MoodSchema.optional(),
    of: CityIdSchema.optional(),
  })
  .strict();
export type CityEffect = z.infer<typeof CityEffectSchema>;
/**
 * เงื่อนไขเรื่องเมือง: เขียนแค่รหัสเมือง = อยู่เมืองนั้น · any = อยู่เมืองไหนก็ได้ · none = ไม่ได้อยู่ในเมือง หรือระบุละเอียด
 * id = เมืองเดียวหรือหลายเมือง (ไม่ใส่ = เมืองไหนก็ได้) · district = อยู่ย่านใดย่านหนึ่งในนี้ · min_rank / max_rank = ชั้นของคนเมือง
 * ready: true = ผลงานถึงเกณฑ์ของชั้นถัดไปแล้ว (ใช้กับฉากขึ้นชั้น ตัวเลขอยู่ใน CITY.merit) · mood = เมืองอยู่ในสภาพใดสภาพหนึ่งในนี้
 * home = ที่อยู่เป็นแบบใดแบบหนึ่งในนี้ (none = ไม่มีที่อยู่) · native = เกิดในเมืองนี้ · behind = ค้างค่าเช่า · min_years / max_years = อยู่เมืองนี้มาแล้วอย่างน้อย / ไม่เกินเท่านี้ปี (นับจากปีแรกที่เข้ามาอยู่)
 */
export const CityCondSchema = z.union([
  CityIdSchema,
  z.enum(['any', 'none']),
  z
    .object({
      id: z.union([CityIdSchema, z.array(CityIdSchema).min(1)]).optional(),
      district: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
      min_rank: CityRankSchema.optional(),
      max_rank: CityRankSchema.optional(),
      ready: z.boolean().optional(),
      mood: z.array(MoodSchema).min(1).optional(),
      home: z.array(z.enum([...HOME_KINDS, 'none'])).min(1).optional(),
      native: z.boolean().optional(),
      behind: z.boolean().optional(),
      min_years: z.number().int().min(1).optional(),
      max_years: z.number().int().min(0).optional(),
    })
    .strict(),
]);
export type CityCond = z.infer<typeof CityCondSchema>;

const CourseIdSchema = z.enum(COURSE_IDS);
/**
 * ผลต่อหลักสูตร (กติกาใน course.ts)
 * enter = เข้าเรียนหลักสูตรนี้ เริ่มปีหนึ่ง · track = เลือกสาย (สำนัก) · leave = ออกกลางคัน (ลาออก ถูกไล่ออก)
 * hold = ปีนี้ไม่นับเป็นปีเรียน เรียนซ้ำปีเดิม (เหตุการณ์ของหลักสูตรปกตินับขึ้นปีถัดไปเองเมื่อจบเหตุการณ์ และจบหลักสูตรเมื่อพ้นปีสุดท้าย)
 */
export const CourseEffectSchema = z
  .object({
    enter: CourseIdSchema.optional(),
    track: z.string().optional(),
    leave: z.boolean().optional(),
    hold: z.boolean().optional(),
  })
  .strict();
export type CourseEffect = z.infer<typeof CourseEffectSchema>;
/**
 * เหตุการณ์ของหลักสูตร: ออกเฉพาะกับคนที่กำลังเรียนหลักสูตรนี้ในปีที่ระบุ (ปีเดียวหรือช่วงปี) track = เฉพาะสายนี้ (ไม่ใส่ = ทุกสาย)
 * ระหว่างเรียน ชีวิตเดินด้วยเหตุการณ์ของหลักสูตรก่อนเรื่องอื่น ปีละเรื่อง ยกเว้นเหตุการณ์ must ของโลก
 */
export const CourseSlotSchema = z
  .object({
    id: CourseIdSchema,
    year: z.union([z.number().int().min(1), z.tuple([z.number().int().min(1), z.number().int().min(1)])]),
    track: z.string().optional(),
  })
  .strict();
export type CourseSlot = z.infer<typeof CourseSlotSchema>;

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
    /** สถานะสมาชิกองค์กร: เข้า ออก ผลงาน เลื่อนยศ */
    org: OrgEffectSchema.optional(),
    /** ภัยตามล่า: บวกลบระดับที่ฝ่ายหนึ่งตามล่าตัวละคร (0 ถึง ORG.huntMax) */
    hunted: HuntMap.optional(),
    /** ชีวิตในเมือง: ย้ายเข้า ย้ายย่าน ที่อยู่ ผลงาน ขึ้นชั้น และสภาพของเมือง */
    city: CityEffectSchema.optional(),
    /** หลักสูตร: เข้าเรียน เลือกสาย ออกกลางคัน */
    course: CourseEffectSchema.optional(),
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
  /** มีของที่ติดป้ายนี้อยู่กับตัว (สวมอยู่ อยู่ในกระเป๋า หรือเป็นของใช้แล้วหมด) เช่น ตะเกียงในเหมือง เชือกบนหน้าผา */
  has_tag: z.enum(ITEM_TAGS).optional(),
  /** สวมของที่ทำจากวัสดุนี้อยู่ (ป่าไอเลธไม่ต้อนรับเหล็กดำ ศาสนจักรห้ามพกหินถ่านมาร) */
  wears: z.enum(MATERIAL_IDS).optional(),
  /** ต้องไม่ได้สวมของที่ทำจากวัสดุเหล่านี้ */
  not_wears: z.array(z.enum(MATERIAL_IDS)).optional(),
  /** สวมของระดับนี้ขึ้นไปอย่างน้อยหนึ่งชิ้น (คนในเมืองทักต่างกัน โจรเลือกเหยื่อจากของที่สวม) */
  wears_rarity: z.enum(RARITIES).optional(),
  /** เป็นสมาชิกองค์กรนี้ (ระบุยศหรือผลงานได้ ดู OrgCondSchema) */
  org: OrgCondSchema.optional(),
  /** ต้องไม่ได้เป็นสมาชิกองค์กรเหล่านี้ */
  not_orgs: z.array(OrgIdSchema).optional(),
  /** ฝ่ายนี้ตามล่าตัวละครอยู่อย่างน้อยระดับนี้ / ไม่เกินระดับนี้ */
  min_hunted: HuntMap.optional(),
  max_hunted: HuntMap.optional(),
  /** อยู่ในเมือง (ระบุเมือง ย่าน ชั้นของคนเมือง สภาพเมือง หรือที่อยู่ได้ ดู CityCondSchema) */
  city: CityCondSchema.optional(),
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

/** เงื่อนไขของตัวเลือก ใช้กับวิธีรับมือในการปะทะด้วย */
export const RequiresSchema = z.object({
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
});
export type Requires = z.infer<typeof RequiresSchema>;

export const ChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** ตัวเลือกนี้นับเป็นนิสัยหนึ่งครั้ง เลือกครบ HABIT_COUNT ครั้งและไม่น้อยกว่า HABIT_SHARE ของครั้งที่มีให้เลือก ได้ลักษณะนั้นติดตัว (id ในทะเบียนสิ่งติดตัวที่มี habit: true) */
  habit: z.string().optional(),
  /** ข้อความหลังเลือก (ตัวเลือกที่ไม่มี check ก็แสดงได้) */
  text: z.string().optional(),
  /** งานขององค์กร (event.duty) เท่านั้น: ตัวเลือกนี้คือการปฏิเสธงาน เสียผลงาน ORG.refused และนับเป็นการปฏิเสธหนึ่งครั้ง */
  refuse: z.boolean().optional(),
  requires: RequiresSchema.optional(),
  check: CheckSchema.optional(),
  effects: EffectsSchema.optional(),
  success: OutcomeSchema.optional(),
  failure: OutcomeSchema.optional(),
});
export type Choice = z.infer<typeof ChoiceSchema>;

// ---------- การปะทะ ----------
const MoveKindSchema = z.enum(MOVE_KINDS);
const FoeTagSchema = z.enum(FOE_TAGS);
/** จุดอ่อนและจุดแข็งของศัตรู ระบุเป็นป้ายลักษณะ (ไฟ แสง ของทื่อ ...) หรือชนิดของวิธีรับมือ (บุก ชิงจังหวะ ...) */
const FoeMatchSchema = z.enum([...FOE_TAGS, ...MOVE_KINDS]);

/** วิธีรับมือหนึ่งวิธีในจังหวะหนึ่ง ความยากมาจากระดับภัยของศัตรู ฉากจึงไม่ใส่ตัวเลข */
export const MoveSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    kind: MoveKindSchema,
    /** ค่าพลังที่ใช้ ไม่ใส่ = ตามชนิดของวิธี (MOVE_STAT) อ่านทางกับใช้ของต้องระบุ */
    stat: StatSchema.optional(),
    /** ป้ายลักษณะของวิธีนี้ เช่น คบไฟ = fire ใช้เทียบกับจุดอ่อนและจุดแข็งของศัตรู */
    tags: z.array(FoeTagSchema).default([]),
    /** คนในบทนี้เข้ามาช่วย: ได้แต้มเพิ่ม และวิธีนี้มีให้เลือกเมื่อมีคนเล่นบทนั้น */
    ally: z.string().optional(),
    /** ข่มหรือเจรจาที่สำเร็จแล้วการปะทะจบทันทีแบบเจรจา ใช้ได้กับศัตรูที่พูดรู้เรื่องเท่านั้น */
    parley: z.boolean().optional(),
    requires: RequiresSchema.optional(),
    /** ข้อความเมื่อสำเร็จและเมื่อพลาด ไม่ใส่ = ใช้ประโยคประจำตัวของศัตรู (hurt กับ strike) */
    success: z.string().optional(),
    failure: z.string().optional(),
  })
  .strict();
export type Move = z.infer<typeof MoveSchema>;

export const BeatSchema = z
  .object({
    /** สัญญาณ: ศัตรูกำลังจะทำอะไร */
    text: z.string(),
    /** ชนิดของวิธีที่รับสัญญาณนี้ได้ วิธีชนิดนั้นได้แต้มเพิ่ม */
    answer: MoveKindSchema.optional(),
    moves: z.array(MoveSchema).min(2).max(6),
  })
  .strict();
export type Beat = z.infer<typeof BeatSchema>;

const OutcomeSchemaStrict = z.object({ text: z.string().optional(), effects: EffectsSchema.optional() }).strict();

export const ENCOUNTER_ENDS = ['win', 'lose', 'flee', 'parley', 'stalemate', 'death'] as const;
export type EncounterEnd = (typeof ENCOUNTER_ENDS)[number];

export const EncounterSchema = z
  .object({
    /** รหัสศัตรูใน content/foes.yaml */
    foe: z.string(),
    /** ชื่อที่แสดง ถ้าต่างจากชื่อชนิด เช่น ฝูงหมาเถ้า */
    name: z.string().optional(),
    /** ทับค่าของชนิดเฉพาะฉากนี้ (ตัวที่บาดเจ็บ ตัวจ่าฝูง) */
    threat: z.number().int().min(1).max(5).optional(),
    morale: z.number().int().min(2).max(4).optional(),
    /** พลังชีวิตหมดแล้วตายไหม ไม่ใส่ = ตามชนิดของศัตรู (lethal) */
    deadly: z.boolean().optional(),
    beats: z.array(BeatSchema).min(2).max(4),
    /** แรงใจศัตรูหมด */
    win: OutcomeSchemaStrict,
    /** พลังชีวิตหมดแต่ไม่ตาย: หมดสติ โดนปล้น โดนลากออกมา */
    lose: OutcomeSchemaStrict,
    /** ครบทุกจังหวะแล้วยังไม่มีใครล้ม */
    stalemate: OutcomeSchemaStrict,
    /** หนีสำเร็จ ต้องมีถ้ามีวิธีชนิด flee */
    flee: OutcomeSchemaStrict.optional(),
    /** เจรจาสำเร็จ ต้องมีถ้ามีวิธีที่ parley: true */
    parley: OutcomeSchemaStrict.optional(),
    /** ตายในการปะทะ: ข้อความเล่าความตาย ไม่ใส่ = ฉากตายเล่าเอง */
    death: z.object({ text: z.string() }).strict().optional(),
  })
  .strict();
export type Encounter = z.infer<typeof EncounterSchema>;

/** ศัตรูหนึ่งชนิด (content/foes.yaml) ฉากปะทะอ้างด้วย id แล้วเขียนแค่เนื้อเรื่องกับวิธีรับมือ */
export const FoeDefSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    side: FoeSchema,
    /** ระดับภัย 1 ถึง 5: ความยากของการทอยและพลังชีวิตที่เสียเมื่อพลาด */
    threat: z.number().int().min(1).max(5),
    /** แรงใจ 2 ถึง 4 ขีด สำเร็จหนึ่งครั้งลดหนึ่งขีด หมดเมื่อไรศัตรูล้ม หนี หรือยอม */
    morale: z.number().int().min(2).max(4),
    weak: z.array(FoeMatchSchema).min(1),
    strong: z.array(FoeMatchSchema).default([]),
    /** พูดรู้เรื่อง เจรจาได้ */
    speaks: z.boolean().default(false),
    /** เอาถึงตาย: พลังชีวิตหมดในการปะทะกับศัตรูชนิดนี้คือตาย */
    lethal: z.boolean().default(true),
    /** สิ่งที่คนในโลกเล่าต่อกันเรื่องจุดอ่อนของมัน หนึ่งประโยค แสดงเมื่อตัวละครรู้จุดอ่อน */
    lore: z.string(),
    /** ประโยคตอนศัตรูทำร้ายตัวละคร ใช้เมื่อวิธีที่พลาดไม่ได้เขียนข้อความเอง */
    strike: z.array(z.string()).min(2),
    /** ประโยคตอนศัตรูเสียแรงใจ ใช้เมื่อวิธีที่สำเร็จไม่ได้เขียนข้อความเอง */
    hurt: z.array(z.string()).min(2),
    /** แผลที่ได้เมื่อเจ็บหนักจากศัตรูชนิดนี้ (รหัสสิ่งติดตัวชนิด wound) ได้อันแรกที่ยังไม่มี */
    wounds: z.array(z.string()).default(['wound_knee']),
    /** ภูต ผี หรือผู้ใช้เวท: ของเหล็กเย็นได้เปรียบ (MATERIAL_EDGE) */
    magic: z.boolean().default(false),
    /**
     * ของที่ศัตรูทิ้งไว้เมื่อชนะ ไล่ตามลำดับ ชิ้นแรกที่ทอยติดคือชิ้นที่ได้ (ไม่เกิน GEAR.lootMax ต่อการปะทะ)
     * item = รหัสของ · gold = เหรียญ · chance = โอกาส 0 ถึง 1 · text = ประโยคตอนเจอของ (ไม่ใส่ = ไม่มีประโยค มีแต่ป้ายของที่ได้)
     */
    loot: z
      .array(z.object({ item: z.string().optional(), gold: z.number().int().min(1).optional(), chance: z.number().gt(0).max(1), text: z.string().optional() }).strict())
      .default([]),
  })
  .strict();
export type FoeDef = z.infer<typeof FoeDefSchema>;

/**
 * ฉากหลังของเหตุการณ์ (ภาพประกอบจาก thread ศิลป์) ไม่ใส่ = ใช้ภาพตาม location_tag
 * home กับ market มีภาพแยกตามถิ่น ฉากอื่นใช้ภาพเดียวทุกถิ่น
 */
export const SCENES = [
  'home', 'market', 'temple', 'tavern', 'refinery', 'road', 'fort', 'noble_hall', 'workshop', 'smithy', 'golem_shop', 'healer',
  'ship_deck', 'mine', 'clan_hall', 'institute', 'belek_bank', 'star_hall',
  'classroom', 'library', 'dormitory', 'laboratory', 'observatory', 'council_hall', 'station',
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
  /**
   * งานที่องค์กรนี้ส่งมา ออกเฉพาะกับสมาชิก ระบบคุมจังหวะให้ (ORG.dutyGap) และให้ผลงานเองเมื่อทำสำเร็จ
   * เหตุการณ์แบบมีตัวเลือกต้องมีทางปฏิเสธหนึ่งทาง (refuse: true) การปะทะปฏิเสธด้วยการหนี
   */
  duty: OrgIdSchema.optional(),
  /** เรื่องถูกตามล่าโดยฝ่ายนี้ ออกเฉพาะเมื่อภัยตามล่าจากฝ่ายนั้นมีอย่างน้อยหนึ่งระดับ ยิ่งระดับสูงยิ่งออกบ่อย (น้ำหนักคูณด้วยระดับ) */
  hunt: FactionSchema.optional(),
  /** เหตุการณ์ของหลักสูตร ออกเฉพาะกับคนที่กำลังเรียนในปีที่ระบุ (ดู CourseSlotSchema) */
  course: CourseSlotSchema.optional(),
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
  /** เหตุการณ์ปกติต้องมีตัวเลือกอย่างน้อยหนึ่งข้อ เหตุการณ์ที่เป็นการปะทะ (encounter) ไม่มีตัวเลือก มีวิธีรับมือในแต่ละจังหวะแทน */
  choices: z.array(ChoiceSchema).default([]),
  encounter: EncounterSchema.optional(),
});
export type GameEvent = z.infer<typeof EventSchema>;

export const PassiveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('check_bonus'), stat: StatSchema, amount: z.number().int() }),
  z.object({ kind: z.literal('max_hp'), amount: z.number().int() }),
  z.object({ kind: z.literal('reroll_failed_check'), once_per_event: z.boolean().default(true) }),
  /** เกราะ: ลดพลังชีวิตที่เสียในการปะทะ (รวมทุกชิ้นไม่เกิน ENCOUNTER.armorMax) */
  z.object({ kind: z.literal('armor'), amount: z.number().int().min(1).max(2) }),
  /** โล่: กันการเสียพลังชีวิตได้หนึ่งครั้งต่อการปะทะ */
  z.object({ kind: z.literal('shield') }),
  /** ของกันหนาว: แต้มบวกของเช็คฤดูหนาวในวัยชรา */
  z.object({ kind: z.literal('winter'), amount: z.number().int().min(1).max(2) }),
]);
export type Passive = z.infer<typeof PassiveSchema>;

const PassiveEntry = z.object({ description: z.string(), effect: PassiveSchema });

/** ของใช้แล้วหมด: ใช้ได้ทีละชิ้น ในการปะทะใช้ได้จังหวะละชิ้น ป้ายของชิ้นนั้น (tags) คือสิ่งที่มันทำกับศัตรู */
export const UseSchema = z
  .object({
    /** ฟื้นพลังชีวิตเท่านี้ ใช้นอกการปะทะได้ */
    heal: z.number().int().min(1).max(6).optional(),
    /** ในการปะทะ: วิธีชนิดเหล่านี้ได้แต้มเพิ่มในจังหวะที่ใช้ */
    boost: z.object({ kinds: z.array(z.enum(MOVE_KINDS)).min(1), amount: z.number().int().min(1).max(3) }).strict().optional(),
    /** ประโยคตอนใช้ หนึ่งประโยค */
    text: z.string(),
  })
  .strict();

export const ItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** ช่องสวม ของใช้แล้วหมด (มี use) ไม่มีช่อง */
    slot: SlotSchema.optional(),
    rarity: z.enum(RARITIES).default('common'),
    /** แบบ (art/gear.yaml) กำหนดไอคอน ของที่มีแบบต้องมีวัสดุ */
    pattern: z.string().optional(),
    /** วัสดุ กำหนดสีของไอคอน ข้อได้เปรียบ และข้อแม้ (MATERIALS) */
    material: z.enum(MATERIAL_IDS).optional(),
    /** ไอคอนเฉพาะชิ้น public/icons/item_<icon>.png ไม่ใส่ = ตามแบบกับวัสดุ ถ้าไม่มีแบบใช้ id ของชิ้นนั้น */
    icon: z.string().optional(),
    /** ป้ายลักษณะ: อาวุธกับของมือรองส่งป้ายให้การบุกและการใช้ของในการปะทะ และเหตุการณ์ถามหาได้ด้วย has_tag */
    tags: z.array(z.enum(ITEM_TAGS)).default([]),
    stats: z.partialRecord(StatSchema, z.number().int()).default({}),
    passive: PassiveEntry.optional(),
    /** ผลพิเศษอย่างที่สอง (ของอาบเวทขึ้นไป) */
    also: PassiveEntry.optional(),
    /** ราคาที่ร้าน (เหรียญ) ไม่ใส่ = ของที่มีเรื่องของตัวเอง ซื้อขายไม่ได้ */
    price: z.number().int().min(1).optional(),
    /** ใครซื้อได้ (ของอาบเวทต้องแลกด้วยอย่างอื่นนอกจากเงิน) และประโยคที่คนขายบอกเมื่อยังไม่ขายให้ */
    needs: RequiresSchema.optional(),
    needs_text: z.string().optional(),
    /** สิ่งที่เสียเพิ่มตอนซื้อ นอกจากเงิน */
    toll: EffectsSchema.optional(),
    /** เรื่องของชิ้นนี้ หนึ่งหรือสองประโยค แสดงบนการ์ดของ */
    lore: z.string().optional(),
    /** ข้อแม้ของของอาบเวท หนึ่งประโยค แสดงบนการ์ดของ */
    caveat: z.string().optional(),
    use: UseSchema.optional(),
    /** sprite layer id; palette swaps are applied by the sprite system */
    sprite: z.string().optional(),
  })
  .strict();
export type Item = z.infer<typeof ItemSchema>;

/** ร้านค้าของถิ่นหนึ่ง (content/shops.yaml) */
export const ShopSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    /** location_tag ของถิ่นที่ร้านอยู่ */
    location: z.string(),
    /** คำทักของคนขาย สุ่มหนึ่งประโยคต่อปี */
    greet: z.array(z.string()).min(1),
    /** ของที่มีขายทุกปี */
    staples: z.array(z.string()).default([]),
    /** ของหมุนเวียน ปีหนึ่งวางแผง GEAR.shelf ชิ้น */
    stock: z.array(z.string()).default([]),
    /** ร้านนี้ขายให้ใคร (ร้านของเอลฟ์ไม่ขายให้ทุกคน) และประโยคเมื่อไม่ขายให้ */
    requires: RequiresSchema.optional(),
    closed: z.string().optional(),
  })
  .strict();
export type Shop = z.infer<typeof ShopSchema>;

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
  /** ศัตรูในการปะทะ (content/foes.yaml) */
  foes: z.array(FoeDefSchema).default([]),
  /** ร้านค้า (content/shops.yaml) */
  shops: z.array(ShopSchema).default([]),
  /** ประโยคสั้นที่ระบบหยิบไปเติมในบันทึกชีวิต (ร่างกายโรย ฤดูหนาว ข่าวคนรอบตัวจากไป) กุญแจ → รายการให้สุ่ม */
  lines: z.record(z.string(), z.array(z.string())).default({}),
});
export type Content = z.infer<typeof ContentSchema>;
