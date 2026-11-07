import { z } from 'zod';
import { CLASS_IDS, FACTIONS, FOE_SIDES, GOD_IDS, WORLD_KEYS } from './balance';

export const STATS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export type Stat = (typeof STATS)[number];
export const StatSchema = z.enum(STATS);

export const STAGES = ['infancy', 'childhood', 'youth', 'adult', 'elder'] as const;
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
    items: z.array(z.string()).optional(),
    location_tag: z.string().optional(),
    die: z.boolean().optional(),
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
  })
  .strict();
export type Effects = z.infer<typeof EffectsSchema>;

const CheckSchema = z.object({
  stat: StatSchema,
  dc: z.number().int().min(1).max(30),
  /** ฝั่งของศัตรู/สิ่งที่เผชิญ: ใช้กับรอยจอมมาร */
  foe: FoeSchema.optional(),
});

const OutcomeSchema = z.object({ text: z.string().optional(), effects: EffectsSchema.optional() });

/** เงื่อนไขร่วมของ when (เหตุการณ์) และ requires (ตัวเลือก) ในส่วนสถานะโลกและตัวละคร */
const StateConds = {
  /** เพศของตัวละคร เช่น ประกาศเกณฑ์ทหารที่เรียกเฉพาะผู้ชาย */
  gender: z.enum(['m', 'f']).optional(),
  class: ClassSchema.optional(),
  god: GodSchema.optional(),
  world: WorldRange.optional(),
  min_reputation: RepMap.optional(),
  max_reputation: RepMap.optional(),
};

export const ChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** ข้อความหลังเลือก (ตัวเลือกที่ไม่มี check ก็แสดงได้) */
  text: z.string().optional(),
  requires: z
    .object({
      trait: z.string().optional(),
      flag: z.string().optional(),
      /** ตัวเลือกซ่อนถ้ามี flag ใดในนี้ (เช่น race_tiefling สำหรับงานที่ไม่รับคนมีเขา) */
      not_flags: z.array(z.string()).optional(),
      item: z.string().optional(),
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
  'home', 'market', 'temple', 'tavern', 'refinery', 'road', 'fort', 'noble_hall', 'workshop',
  'ship_deck', 'mine', 'clan_hall', 'institute', 'belek_bank', 'star_hall',
] as const;
export type Scene = (typeof SCENES)[number];

export const EventSchema = z.object({
  id: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/, 'id ต้องเป็น stage.name'),
  stage: StageSchema,
  weight: z.number().positive().default(10),
  once: z.boolean().default(true),
  scene: z.enum(SCENES).optional(),
  when: z
    .object({
      age: z.tuple([z.number().int(), z.number().int()]).optional(),
      /** ปีในโลก = birth_year + age */
      year: z.tuple([z.number().int(), z.number().int()]).optional(),
      location_tag: z.string().optional(),
      flags: z.array(z.string()).optional(),
      not_flags: z.array(z.string()).optional(),
      trait: z.string().optional(),
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

export const ContentSchema = z.object({
  events: z.array(EventSchema),
  items: z.array(ItemSchema),
  names: z.array(NamePoolSchema).default([]),
});
export type Content = z.infer<typeof ContentSchema>;
