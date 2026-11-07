import { z } from 'zod';

export const STATS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export type Stat = (typeof STATS)[number];
export const StatSchema = z.enum(STATS);

export const STAGES = ['infancy', 'childhood', 'youth', 'adult', 'elder'] as const;
export type Stage = (typeof STAGES)[number];
export const StageSchema = z.enum(STAGES);

export const SLOTS = ['head', 'body', 'hands', 'legs', 'feet', 'weapon', 'offhand', 'cloak', 'accessory'] as const;
export const SlotSchema = z.enum(SLOTS);
export type Slot = z.infer<typeof SlotSchema>;

export const EffectsSchema = z
  .object({
    stats: z.partialRecord(StatSchema, z.number().int()).optional(),
    hp: z.number().int().optional(),
    gold: z.number().int().optional(),
    flags: z.array(z.string()).optional(),
    clear_flags: z.array(z.string()).optional(),
    traits: z.array(z.string()).optional(),
    items: z.array(z.string()).optional(),
    location_tag: z.string().optional(),
    die: z.boolean().optional(),
  })
  .strict();
export type Effects = z.infer<typeof EffectsSchema>;

const CheckSchema = z.object({ stat: StatSchema, dc: z.number().int().min(1).max(30) });

const OutcomeSchema = z.object({ text: z.string().optional(), effects: EffectsSchema.optional() });

export const ChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  requires: z
    .object({
      trait: z.string().optional(),
      flag: z.string().optional(),
      item: z.string().optional(),
      min_stat: z.partialRecord(StatSchema, z.number().int()).optional(),
    })
    .optional(),
  check: CheckSchema.optional(),
  effects: EffectsSchema.optional(),
  success: OutcomeSchema.optional(),
  failure: OutcomeSchema.optional(),
});
export type Choice = z.infer<typeof ChoiceSchema>;

export const EventSchema = z.object({
  id: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/, 'id ต้องเป็น stage.name'),
  stage: StageSchema,
  weight: z.number().positive().default(10),
  once: z.boolean().default(true),
  when: z
    .object({
      age: z.tuple([z.number().int(), z.number().int()]).optional(),
      location_tag: z.string().optional(),
      flags: z.array(z.string()).optional(),
      not_flags: z.array(z.string()).optional(),
      trait: z.string().optional(),
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

export const ContentSchema = z.object({
  events: z.array(EventSchema),
  items: z.array(ItemSchema),
});
export type Content = z.infer<typeof ContentSchema>;
