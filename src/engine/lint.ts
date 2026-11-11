import type { Choice, Content, Effects, GameEvent } from './schema';
import { DEATH_CAUSES } from './schema';
import { CLERIC_DRIFT_FLAG, RACES } from './balance';
import { unknownPlaceholders } from './text';
import { DIED_FLAG, HAS_CHILD_FLAG } from './engine';

/** กุญแจของ Content.lines ที่ระบบใช้ (ขึ้นต้นด้วยคำเหล่านี้) */
const LINE_KEYS = ['decline', 'decline_STR', 'decline_DEX', 'winter_fail', 'news_death'];

const outcomes = (ch: Choice): (Effects | undefined)[] => [ch.effects, ch.success?.effects, ch.failure?.effects];

/** Story linter: catches content that can never work. Returns human-readable problems. */
export function lintContent(c: Content): string[] {
  const problems: string[] = [];
  const itemIds = new Set(c.items.map((i) => i.id));
  const registry = new Map(c.traits.map((t) => [t.id, t]));
  // ค่าที่ระบบตั้งให้เอง ไม่ต้องมีเหตุการณ์ตั้ง
  const setFlags = new Set<string>([CLERIC_DRIFT_FLAG, HAS_CHILD_FLAG, ...(Object.values(DIED_FLAG) as string[])]);
  const raceTraits = new Set<string>(Object.values(RACES).flatMap((r) => r.traits as readonly string[]));
  const setTraits = new Set<string>(raceTraits);
  const lostTraits = new Set<string>();
  const dupes = new Set<string>();
  const seen = new Set<string>();

  for (const e of c.events) {
    if (seen.has(e.id)) dupes.add(e.id);
    seen.add(e.id);
    for (const ch of e.choices) {
      for (const fx of outcomes(ch)) {
        fx?.flags?.forEach((f) => setFlags.add(f));
        fx?.traits?.forEach((t) => setTraits.add(t));
        fx?.lose_traits?.forEach((t) => lostTraits.add(t));
      }
      // ลักษณะที่ก่อตัวจากนิสัย
      if (ch.habit) setTraits.add(ch.habit);
    }
  }
  // สิ่งที่กันตายแล้วกลายเป็นอย่างอื่น หรือพรที่ผิดเงื่อนไขแล้วกลับเป็นคำสาป นับว่าได้มาได้
  for (const t of c.traits) {
    for (const fx of [...t.effects, ...(t.steps ?? []).flatMap((s) => s.effects)]) {
      if (fx.kind !== 'cheat_death') continue;
      if (fx.becomes) setTraits.add(fx.becomes);
      if (fx.flag) setFlags.add(fx.flag).add(`${fx.flag}_twice`);
    }
  }
  dupes.forEach((id) => problems.push(`id ซ้ำ: ${id}`));
  const namedPeople = new Set<string>(['father', 'mother', 'partner']);
  for (const e of c.events) {
    for (const pe of e.people ?? []) if (pe.name) namedPeople.add(pe.id);
    for (const ch of e.choices) for (const fx of outcomes(ch)) for (const pe of fx?.people ?? []) if (pe.name) namedPeople.add(pe.id);
  }
  for (const f of setFlags) {
    if (f.startsWith('race_') && !(f.slice(5) in RACES)) problems.push(`flag ${f}: ไม่มีเผ่า "${f.slice(5)}" (มี ${Object.keys(RACES).join(', ')})`);
  }
  const poolIds = new Set(c.names.map((n) => n.race));
  if (poolIds.size !== c.names.length) problems.push('names: id กลุ่มชื่อซ้ำ');

  // ---- ทะเบียนสิ่งติดตัว ----
  const knownTrait = (where: string, id: string) => {
    // เนื้อหาชุดเล็กที่ไม่มีทะเบียน (ชุดทดสอบ) ไม่ตรวจ
    if (registry.size && !registry.has(id)) problems.push(`${where}: ไม่มีสิ่งติดตัว "${id}" ในทะเบียน`);
  };
  if (registry.size !== c.traits.length) problems.push('traits: id สิ่งติดตัวซ้ำ');
  for (const t of c.traits) {
    const where = `traits/${t.id}`;
    const gives = t.steps ? t.steps.flatMap((s) => s.gives) : t.gives;
    const costs = t.steps ? t.steps.flatMap((s) => s.costs) : t.costs;
    if (t.steps && (t.gives.length || t.costs.length || t.effects.length)) problems.push(`${where}: มี steps แล้ว ให้เขียน gives costs effects ในแต่ละขั้น`);
    // กติกาของโลก: พรทุกอย่างมีเงื่อนไข คำสาปทุกอย่างมีของแถม
    if (t.kind === 'boon' && !costs.length && !t.breaks) problems.push(`${where}: พรต้องมีราคา (costs) หรือเงื่อนไขที่ทำให้พรหมด (breaks)`);
    if (t.kind === 'curse') {
      if (!gives.length) problems.push(`${where}: คำสาปต้องมีของแถม (gives)`);
      if (t.cures.length < 2) problems.push(`${where}: คำสาปต้องมีทางแก้อย่างน้อยสองทาง (cures)`);
      if (!t.live_with) problems.push(`${where}: คำสาปต้องมีทางอยู่กับมัน (live_with)`);
    }
    if (t.habit && t.kind !== 'trait') problems.push(`${where}: habit ใช้ได้กับชนิด trait เท่านั้น`);
    if (t.habit && !t.gained) problems.push(`${where}: ลักษณะจากนิสัยต้องมีประโยคตอนก่อตัว (gained)`);
    for (const x of [...t.excludes, ...(t.becomes ? [t.becomes] : [])]) if (!registry.has(x)) problems.push(`${where}: อ้างถึง "${x}" ที่ไม่มีในทะเบียน`);
    // นิสัยที่สิ่งนี้ปิดทาง: ต้องเป็นลักษณะจากนิสัย ไม่ใช่ตัวเอง ต้องบอกราคาไว้บนการ์ด และห้ามปิดจนเหตุการณ์ไหนไม่เหลือตัวเลือก
    for (const x of t.blocks) {
      if (!registry.get(x)?.habit) problems.push(`${where}: blocks "${x}" ต้องเป็นลักษณะจากนิสัย (habit) ในทะเบียน`);
      if (x === t.id) problems.push(`${where}: blocks ตัวเองไม่ได้`);
    }
    if (t.blocks.length && !costs.length) problems.push(`${where}: มี blocks ต้องเขียนราคานี้ไว้ใน costs ด้วย`);
    if (t.blocks.length) {
      for (const ev of c.events) {
        if (ev.choices.every((ch) => ch.habit && t.blocks.includes(ch.habit))) problems.push(`${where}: ปิดตัวเลือกทุกข้อของเหตุการณ์ ${ev.id}`);
      }
    }
    for (const fx of [...t.effects, ...(t.steps ?? []).flatMap((s) => s.effects)]) {
      if (fx.kind === 'cheat_death' && fx.becomes && !registry.has(fx.becomes)) problems.push(`${where}: becomes "${fx.becomes}" ไม่มีในทะเบียน`);
    }
    for (const text of [t.gained]) for (const ph of unknownPlaceholders(text ?? '')) problems.push(`${where}: placeholder ไม่รู้จัก ${ph}`);
    // คำสาปที่เหตุการณ์ให้ได้ต้องมีเหตุการณ์ที่ถอดออกได้ (คำสาปที่ติดมากับเผ่าไม่นับ)
    if (t.kind === 'curse' && setTraits.has(t.id) && !raceTraits.has(t.id) && !lostTraits.has(t.id)) {
      problems.push(`${where}: มีเหตุการณ์ที่ให้คำสาปนี้ แต่ไม่มีเหตุการณ์ไหนถอดออกได้ (lose_traits)`);
    }
  }

  // ---- ประโยคของระบบ ----
  for (const [key, list] of Object.entries(c.lines)) {
    if (!LINE_KEYS.some((k) => key === k || key.startsWith(`${k}_`))) problems.push(`lines/${key}: ระบบไม่ใช้กุญแจนี้`);
    for (const t of list) for (const ph of unknownPlaceholders(t, key.startsWith('news_') ? ['who'] : [])) problems.push(`lines/${key}: placeholder ไม่รู้จัก ${ph}`);
  }

  // ---- ฉากตาย ----
  const deathScenes = c.events.filter((e) => e.stage === 'death');
  const unconditional = (e: GameEvent) => {
    const { dying: _d, told: _t, ...rest } = e.when;
    return Object.keys(rest).length === 0 && Object.values(e.cast ?? {}).every((s) => s.optional) && e.choices.some((ch) => !ch.requires);
  };
  if (deathScenes.length) {
    // สิ้นอายุขัยไม่มีข้อความเล่าก่อน การเสียสละเล่าไปแล้วเสมอ (die: sacrifice) แผลกับการปะทะเป็นได้ทั้งสองแบบ
    const cases: [(typeof DEATH_CAUSES)[number], boolean][] = [['age', false], ['wound', false], ['wound', true], ['fight', false], ['fight', true], ['sacrifice', true]];
    for (const [cause, told] of cases) {
      if (!deathScenes.some((e) => e.when.dying?.includes(cause) && (e.when.told === undefined || e.when.told === told) && unconditional(e))) {
        problems.push(`ฉากตาย: เหตุ "${cause}" ${told ? 'ที่เล่าความตายไปแล้ว (told: true)' : 'ที่ยังไม่ได้เล่าความตาย (told: false)'} ไม่มีฉากที่ออกได้เสมอ (ไม่มีเงื่อนไขอื่นและไม่ต้องมีตัวแสดง)`);
      }
    }
  }

  for (const e of c.events) {
    const where = e.id;
    const w = e.when;
    const roles = Object.keys(e.cast ?? {});
    const optional = roles.filter((r) => e.cast![r]!.optional);
    if (w.age && w.age[0] > w.age[1]) problems.push(`${where}: ช่วงอายุกลับด้าน`);
    if (w.year && w.year[0] > w.year[1]) problems.push(`${where}: ช่วงปีกลับด้าน`);
    if (e.must && !e.once) problems.push(`${where}: must ใช้กับ once: false ไม่ได้ (จะออกซ้ำทุกปีไม่มีที่สิ้นสุด)`);
    if (e.must && !w.age && !w.year && !w.flags?.length && !w.trait && !roles.length) problems.push(`${where}: must ที่ไม่มีเงื่อนไขอายุ ปี flag trait หรือตัวแสดง จะออกเป็นเรื่องแรกของทุกชีวิต`);
    if (e.must && (e.fallback || e.years)) problems.push(`${where}: must ใช้กับ fallback หรือ years ไม่ได้`);
    if (e.min_years && (!e.years || e.min_years > e.years)) problems.push(`${where}: min_years ต้องใช้คู่กับ years และไม่เกิน years`);
    if ((e.stage === 'death') !== !!w.dying) problems.push(`${where}: ฉากตาย (stage: death) ต้องคู่กับ when.dying เสมอ`);
    if (e.stage === 'death' && (e.must || e.years)) problems.push(`${where}: ฉากตายใช้ must หรือ years ไม่ได้`);
    if (w.told !== undefined && e.stage !== 'death') problems.push(`${where}: when.told ใช้ได้เฉพาะในฉากตาย`);
    if (e.stage === 'death') {
      // ทุกทางออกของฉากตายต้องทิ้งป้ายสุดท้ายบนเส้นชีวิตและประโยคสุดท้ายของชีวิตไว้ ยกเว้นทางที่รอด
      for (const ch of e.choices) {
        const outs = ch.check ? [ch.success?.effects, ch.failure?.effects] : [undefined];
        const dies = outs.filter((out) => !(out?.survive ?? ch.effects?.survive));
        if (dies.some((out) => !(out?.mark ?? ch.effects?.mark ?? e.mark))) problems.push(`${where}/${ch.id}: ฉากตายต้องมี mark (ป้ายสุดท้ายบนเส้นชีวิต)`);
        if (dies.some((out) => !(out?.epitaph ?? ch.effects?.epitaph))) problems.push(`${where}/${ch.id}: ฉากตายต้องมี epitaph (ประโยคสุดท้ายของชีวิต)`);
      }
    }
    for (const pe of e.people ?? []) {
      if (pe.id.startsWith('@')) {
        if (!roles.includes(pe.id.slice(1))) problems.push(`${where}: people "${pe.id}" ไม่มีบทนี้ใน cast ของเหตุการณ์`);
      } else if (!pe.name && !namedPeople.has(pe.id)) problems.push(`${where}: people "${pe.id}" ไม่มีชื่อและไม่เคยถูกตั้งชื่อที่ไหน`);
    }
    for (const [k, r] of Object.entries(w.world ?? {})) if (r && r[0] > r[1]) problems.push(`${where}: ช่วง world.${k} กลับด้าน`);
    for (const t of unknownPlaceholders(e.text, roles)) problems.push(`${where}: placeholder ไม่รู้จัก ${t}`);
    for (const t of unknownPlaceholders(e.mark ?? '', roles)) problems.push(`${where}: mark มี placeholder ไม่รู้จัก ${t}`);
    if (!e.years && [e.text, e.mark, ...e.choices.flatMap((c) => [c.label, c.text, c.success?.text, c.failure?.text])].some((t) => t?.includes('{years}'))) problems.push(`${where}: {years} ใช้ได้เฉพาะเหตุการณ์ที่มี years`);
    for (const r of optional) {
      if (new RegExp(`\\{${r}[}:]`).test(e.text + (e.mark ?? ''))) problems.push(`${where}: ข้อความของเหตุการณ์ใช้บท "${r}" ที่อาจไม่มีคนเล่น (optional) ให้ใช้ในตัวเลือกที่มี requires.cast เท่านั้น`);
    }
    for (const f of w.flags ?? []) if (!setFlags.has(f)) problems.push(`${where}: อ่าน flag "${f}" ที่ไม่เคยถูกตั้ง (เหตุการณ์นี้ไม่มีทางเกิด)`);
    if (w.trait) {
      knownTrait(where, w.trait);
      if (!setTraits.has(w.trait)) problems.push(`${where}: trait "${w.trait}" ไม่เคยถูกให้`);
    }
    for (const t of w.not_traits ?? []) knownTrait(where, t);
    for (const [role, spec] of Object.entries(e.cast ?? {})) {
      if (spec.id && !namedPeople.has(spec.id) && !/^child_\d+$|^partner_\d+$/.test(spec.id)) problems.push(`${where}: cast.${role} อ้างถึงคน "${spec.id}" ที่ไม่เคยมี`);
      if (spec.min_age !== undefined && spec.max_age !== undefined && spec.min_age > spec.max_age) problems.push(`${where}: cast.${role} ช่วงอายุกลับด้าน`);
    }
    const eventBigRoom = w.big_room === true;
    const ids = new Set<string>();
    for (const ch of e.choices) {
      if (ids.has(ch.id)) problems.push(`${where}: choice id ซ้ำ ${ch.id}`);
      ids.add(ch.id);
      const cw = `${where}/${ch.id}`;
      if (ch.requires?.flag && !setFlags.has(ch.requires.flag)) problems.push(`${cw}: requires flag "${ch.requires.flag}" ที่ไม่เคยถูกตั้ง`);
      if (ch.requires?.trait) {
        knownTrait(cw, ch.requires.trait);
        if (!setTraits.has(ch.requires.trait)) problems.push(`${cw}: requires trait "${ch.requires.trait}" ที่ไม่เคยถูกให้`);
      }
      for (const t of ch.requires?.not_traits ?? []) knownTrait(cw, t);
      if (ch.requires?.item && !itemIds.has(ch.requires.item)) problems.push(`${cw}: requires ของ "${ch.requires.item}" ที่ไม่มี`);
      for (const r of ch.requires?.cast ?? []) if (!roles.includes(r)) problems.push(`${cw}: requires.cast "${r}" ไม่มีใน cast ของเหตุการณ์`);
      if (ch.habit) {
        knownTrait(cw, ch.habit);
        if (registry.size && registry.get(ch.habit) && !registry.get(ch.habit)!.habit) problems.push(`${cw}: habit "${ch.habit}" ไม่ใช่ลักษณะที่ก่อตัวจากนิสัย (habit: true)`);
      }
      const texts = [ch.label, ch.text, ch.success?.text, ch.failure?.text];
      for (const fx of outcomes(ch)) {
        for (const id of fx?.items ?? []) if (!itemIds.has(id)) problems.push(`${cw}: ไม่มีของ "${id}"`);
        for (const [k, id] of Object.entries(fx?.name_pool ?? {})) {
          if (id && id !== 'none' && !(k === 'parents' && id === 'none') && !poolIds.has(id)) problems.push(`${cw}: name_pool.${k} "${id}" ไม่มีใน names.yaml`);
        }
        for (const pe of fx?.people ?? []) {
          if (pe.id.startsWith('@')) {
            if (!roles.includes(pe.id.slice(1))) problems.push(`${cw}: people "${pe.id}" ไม่มีบทนี้ใน cast ของเหตุการณ์`);
          } else if (!pe.name && !namedPeople.has(pe.id)) problems.push(`${cw}: people "${pe.id}" ไม่มีชื่อและไม่เคยถูกตั้งชื่อที่ไหน`);
        }
        if (fx?.name_pool?.self === 'none') problems.push(`${cw}: name_pool.self ใช้ none ไม่ได้ (none ใช้กับ parents)`);
        if (fx?.partner?.pool && !poolIds.has(fx.partner.pool)) problems.push(`${cw}: partner.pool "${fx.partner.pool}" ไม่มีใน names.yaml`);
        for (const t of [...(fx?.traits ?? []), ...(fx?.lose_traits ?? []), ...Object.keys(fx?.trait_step ?? {})]) knownTrait(cw, t);
        for (const t of Object.keys(fx?.trait_step ?? {})) if (registry.get(t) && !registry.get(t)!.steps) problems.push(`${cw}: trait_step "${t}" ไม่ใช่สิ่งติดตัวที่มีหลายขั้น`);
        for (const t of fx?.traits ?? []) {
          if (registry.get(t)?.big && !eventBigRoom && ch.requires?.big_room !== true) problems.push(`${cw}: ให้ของใหญ่ "${t}" ต้องกันด้วย big_room: true ที่ when หรือ requires`);
        }
        if (fx?.epitaph !== undefined && e.stage !== 'death') problems.push(`${cw}: epitaph ใช้ได้เฉพาะในฉากตาย`);
        if (fx?.survive && e.stage !== 'death') problems.push(`${cw}: survive ใช้ได้เฉพาะในฉากตาย`);
        texts.push(fx?.mark, fx?.epitaph);
      }
      for (const t of texts) for (const ph of unknownPlaceholders(t ?? '', roles)) problems.push(`${cw}: placeholder ไม่รู้จัก ${ph}`);
      for (const r of optional) {
        if (texts.some((t) => t && new RegExp(`\\{${r}[}:]`).test(t)) && !ch.requires?.cast?.includes(r)) problems.push(`${cw}: ใช้บท "${r}" ที่อาจไม่มีคนเล่น ต้องมี requires.cast: [${r}]`);
      }
      const hasEffect = !!ch.text || outcomes(ch).some((fx) => fx && Object.keys(fx).length > 0);
      if (!hasEffect) problems.push(`${cw}: ตัวเลือกไม่มีผลอะไร`);
      if (ch.check && !ch.success && !ch.failure) problems.push(`${cw}: มี check แต่ไม่มีผล success/failure`);
    }
  }
  return problems;
}
