import type { Content, Effects } from './schema';

/** Story linter: catches content that can never work. Returns human-readable problems. */
export function lintContent(c: Content): string[] {
  const problems: string[] = [];
  const itemIds = new Set(c.items.map((i) => i.id));
  const setFlags = new Set<string>();
  const setTraits = new Set<string>();
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

  for (const e of c.events) {
    const where = e.id;
    const w = e.when;
    if (w.age && w.age[0] > w.age[1]) problems.push(`${where}: ช่วงอายุกลับด้าน`);
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
      for (const fx of [ch.effects, ch.success?.effects, ch.failure?.effects]) checkItems(cw, fx);
      const hasEffect = [ch.effects, ch.success?.effects, ch.failure?.effects].some((fx) => fx && Object.keys(fx).length > 0);
      if (!hasEffect) problems.push(`${cw}: ตัวเลือกไม่มีผลอะไร`);
      if (ch.check && !ch.success && !ch.failure) problems.push(`${cw}: มี check แต่ไม่มีผล success/failure`);
    }
  }
  return problems;
}
