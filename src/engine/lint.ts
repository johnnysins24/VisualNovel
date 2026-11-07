import type { Content, Effects } from './schema';
import { CLERIC_DRIFT_FLAG, DEMON_MARK_TRAIT, RACES } from './balance';
import { unknownPlaceholders } from './text';

/** Story linter: catches content that can never work. Returns human-readable problems. */
export function lintContent(c: Content): string[] {
  const problems: string[] = [];
  const itemIds = new Set(c.items.map((i) => i.id));
  // ค่าที่ระบบตั้งให้เอง ไม่ต้องมีเหตุการณ์ตั้ง
  const setFlags = new Set<string>([CLERIC_DRIFT_FLAG]);
  const setTraits = new Set<string>([DEMON_MARK_TRAIT]);
  const dupes = new Set<string>();
  const seen = new Set<string>();

  const collect = (fx?: Effects) => {
    fx?.flags?.forEach((f) => setFlags.add(f));
    fx?.traits?.forEach((t) => setTraits.add(t));
  };
  const checkItems = (where: string, fx?: Effects) => {
    for (const id of fx?.items ?? []) if (!itemIds.has(id)) problems.push(`${where}: ไม่มีของ "${id}"`);
  };

  for (const e of c.events) {
    if (seen.has(e.id)) dupes.add(e.id);
    seen.add(e.id);
    for (const ch of e.choices) {
      for (const fx of [ch.effects, ch.success?.effects, ch.failure?.effects]) collect(fx);
    }
  }
  dupes.forEach((id) => problems.push(`id ซ้ำ: ${id}`));
  for (const f of setFlags) {
    if (f.startsWith('race_') && !(f.slice(5) in RACES)) problems.push(`flag ${f}: ไม่มีเผ่า "${f.slice(5)}" (มี ${Object.keys(RACES).join(', ')})`);
  }
  const poolIds = new Set(c.names.map((n) => n.race));
  if (poolIds.size !== c.names.length) problems.push('names: id กลุ่มชื่อซ้ำ');

  for (const e of c.events) {
    const where = e.id;
    const w = e.when;
    if (w.age && w.age[0] > w.age[1]) problems.push(`${where}: ช่วงอายุกลับด้าน`);
    if (w.year && w.year[0] > w.year[1]) problems.push(`${where}: ช่วงปีกลับด้าน`);
    for (const [k, r] of Object.entries(w.world ?? {})) if (r && r[0] > r[1]) problems.push(`${where}: ช่วง world.${k} กลับด้าน`);
    for (const t of unknownPlaceholders(e.text)) problems.push(`${where}: placeholder ไม่รู้จัก ${t}`);
    for (const f of w.flags ?? []) if (!setFlags.has(f)) problems.push(`${where}: อ่าน flag "${f}" ที่ไม่เคยถูกตั้ง (เหตุการณ์นี้ไม่มีทางเกิด)`);
    if (w.trait && !setTraits.has(w.trait)) problems.push(`${where}: trait "${w.trait}" ไม่เคยถูกให้`);
    const ids = new Set<string>();
    for (const ch of e.choices) {
      if (ids.has(ch.id)) problems.push(`${where}: choice id ซ้ำ ${ch.id}`);
      ids.add(ch.id);
      const cw = `${where}/${ch.id}`;
      if (ch.requires?.flag && !setFlags.has(ch.requires.flag)) problems.push(`${cw}: requires flag "${ch.requires.flag}" ที่ไม่เคยถูกตั้ง`);
      if (ch.requires?.trait && !setTraits.has(ch.requires.trait)) problems.push(`${cw}: requires trait "${ch.requires.trait}" ที่ไม่เคยถูกให้`);
      if (ch.requires?.item && !itemIds.has(ch.requires.item)) problems.push(`${cw}: requires ของ "${ch.requires.item}" ที่ไม่มี`);
      for (const fx of [ch.effects, ch.success?.effects, ch.failure?.effects]) {
        checkItems(cw, fx);
        for (const [k, id] of Object.entries(fx?.name_pool ?? {})) {
          if (id && id !== 'none' && !(k === 'parents' && id === 'none') && !poolIds.has(id)) problems.push(`${cw}: name_pool.${k} "${id}" ไม่มีใน names.yaml`);
        }
        if (fx?.name_pool?.self === 'none') problems.push(`${cw}: name_pool.self ใช้ none ไม่ได้ (none ใช้กับ parents)`);
        if (fx?.partner?.pool && !poolIds.has(fx.partner.pool)) problems.push(`${cw}: partner.pool "${fx.partner.pool}" ไม่มีใน names.yaml`);
      }
      for (const t of [ch.label, ch.text, ch.success?.text, ch.failure?.text]) {
        for (const ph of unknownPlaceholders(t ?? '')) problems.push(`${cw}: placeholder ไม่รู้จัก ${ph}`);
      }
      const hasEffect =
        !!ch.text || [ch.effects, ch.success?.effects, ch.failure?.effects].some((fx) => fx && Object.keys(fx).length > 0);
      if (!hasEffect) problems.push(`${cw}: ตัวเลือกไม่มีผลอะไร`);
      if (ch.check && !ch.success && !ch.failure) problems.push(`${cw}: มี check แต่ไม่มีผล success/failure`);
    }
  }
  return problems;
}
