import type { Choice, Content, Effects, Encounter, GameEvent, Requires } from './schema';
import { DEATH_CAUSES } from './schema';
import { ARC_IDS, ARC_TH, CITIES, CITY, CITY_IDS, CLERIC_DRIFT_FLAG, COURSES, COURSE_IDS, DEMON_MARK_TRAIT, GEAR, HOME_TH, ORGS, ORG_IDS, RACES, RARITIES, RARITY_TH, TABOOS, TABOO_IDS, type CityId, type CourseId, type OrgId, type TabooAct, type TabooId } from './balance';
import type { TabooCond } from './land';
import { unknownPlaceholders } from './text';
import { DIED_FLAG, HAS_CHILD_FLAG } from './engine';
import { knowsFlag } from './encounter';
import { itemBudget } from './gear';

/** กุญแจของ Content.lines ที่ระบบใช้ (ขึ้นต้นด้วยคำเหล่านี้) */
const LINE_KEYS = ['decline', 'decline_STR', 'decline_DEX', 'winter_fail', 'news_death', 'gear', 'hunt_cold', 'bounty', 'rent', 'shop', 'mood'];

const outcomes = (ch: Choice): (Effects | undefined)[] => [ch.effects, ch.success?.effects, ch.failure?.effects];
/** ทางจบของการปะทะที่มีผล (ความตายไม่มีผล มีแต่ข้อความ) */
const ENDS = ['win', 'lose', 'stalemate', 'flee', 'parley'] as const;
const endings = (enc: Encounter | undefined): (Effects | undefined)[] => (enc ? ENDS.map((k) => enc[k]?.effects) : []);

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
  // องค์กรที่มีทางเข้า (ผลของเหตุการณ์ หรืองานที่ผูกกับองค์กรถูกตั้งเป็น flag) และฝ่ายที่มีเหตุการณ์ทำให้ตามล่า (หรือเป็นศัตรูขององค์กรที่เข้าได้)
  const joinable = new Set<OrgId>();
  const hunters = new Set<string>();
  const noteOrg = (fx: Effects | undefined) => {
    if (fx?.org?.join) joinable.add(fx.org.id);
    for (const [by, d] of Object.entries(fx?.hunted ?? {})) if ((d ?? 0) > 0) hunters.add(by);
  };

  // เมืองที่มีทางไปถึง (ผล city.move หรือผล location_tag ของถิ่นที่เมืองนั้นเป็นเมืองหลัก) และหลักสูตรที่มีทางเข้าเรียน
  const reachable = new Set<CityId>();
  const entered = new Set<CourseId>();
  const noteCity = (fx: Effects | undefined) => {
    if (fx?.city?.move) reachable.add(fx.city.move);
    if (fx?.location_tag) for (const id of CITY_IDS) if (CITIES[id].main && CITIES[id].tag === fx.location_tag) reachable.add(id);
    if (fx?.course?.enter) entered.add(fx.course.enter);
  };

  // ข้อห้ามของแผ่นดินที่เนื้อเรื่องให้รู้ ถือ ฝืน หรือขอขมาได้
  const tabooActs = new Map<TabooId, Set<TabooAct>>();
  const noteTaboo = (fx: Effects | undefined) => {
    for (const id of TABOO_IDS) {
      const act = fx?.taboo?.[id];
      if (act) tabooActs.set(id, (tabooActs.get(id) ?? new Set()).add(act));
    }
  };

  for (const e of c.events) {
    if (seen.has(e.id)) dupes.add(e.id);
    seen.add(e.id);
    for (const fx of [...e.choices.flatMap(outcomes), ...endings(e.encounter)]) {
      noteOrg(fx);
      noteCity(fx);
      noteTaboo(fx);
    }
    for (const ch of e.choices) {
      for (const fx of outcomes(ch)) {
        fx?.flags?.forEach((f) => setFlags.add(f));
        fx?.traits?.forEach((t) => setTraits.add(t));
        fx?.lose_traits?.forEach((t) => lostTraits.add(t));
      }
      // ลักษณะที่ก่อตัวจากนิสัย
      if (ch.habit) setTraits.add(ch.habit);
    }
    for (const fx of endings(e.encounter)) {
      fx?.flags?.forEach((f) => setFlags.add(f));
      fx?.traits?.forEach((t) => setTraits.add(t));
      fx?.lose_traits?.forEach((t) => lostTraits.add(t));
    }
  }
  // การปะทะจดจุดอ่อนที่รู้เป็น flag และให้แผลของศัตรูชนิดนั้นเอง
  const foes = new Map((c.foes ?? []).map((f) => [f.id, f]));
  for (const f of foes.values()) {
    setFlags.add(knowsFlag(f.id));
    f.wounds.forEach((w) => setTraits.add(w));
  }
  // สิ่งที่กันตายแล้วกลายเป็นอย่างอื่น หรือพรที่ผิดเงื่อนไขแล้วกลับเป็นคำสาป นับว่าได้มาได้
  for (const t of c.traits) {
    for (const fx of [...t.effects, ...(t.steps ?? []).flatMap((s) => s.effects)]) {
      if (fx.kind !== 'cheat_death') continue;
      if (fx.becomes) setTraits.add(fx.becomes);
      if (fx.flag) setFlags.add(fx.flag).add(`${fx.flag}_twice`);
    }
  }
  // พรของเจ้าเดิมหลุดเองเมื่อฝืนข้อห้ามของตนนั้น และกลับเป็นคำสาปถ้าทะเบียนเขียน becomes ไว้ (ดู applyEffects)
  for (const id of TABOO_IDS) {
    const boon = registry.get(TABOOS[id].boon);
    if (!tabooActs.get(id)?.has('break') || !boon || !setTraits.has(boon.id)) continue;
    lostTraits.add(boon.id);
    if (boon.becomes) setTraits.add(boon.becomes);
  }
  for (const id of ORG_IDS) if (ORGS[id].jobs?.some((j) => setFlags.has(j))) joinable.add(id);
  // หลักสูตรที่เข้าเรียนได้ตั้ง flag นักเรียน เรียนจบ และสายที่เลือกให้เอง
  for (const id of entered) {
    const def = COURSES[id];
    setFlags.add(def.student).add(def.done);
    for (const t of Object.keys(def.tracks)) setFlags.add(`${def.trackFlag}${t}`);
  }
  for (const id of joinable) if (ORGS[id].enemy) hunters.add(ORGS[id].enemy!);
  dupes.forEach((id) => problems.push(`id ซ้ำ: ${id}`));
  const namedPeople = new Set<string>(['father', 'mother', 'partner']);
  for (const e of c.events) {
    for (const pe of e.people ?? []) if (pe.name) namedPeople.add(pe.id);
    for (const fx of [...e.choices.flatMap(outcomes), ...endings(e.encounter)]) for (const pe of fx?.people ?? []) if (pe.name) namedPeople.add(pe.id);
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
        if (ev.choices.length && ev.choices.every((ch) => ch.habit && t.blocks.includes(ch.habit))) problems.push(`${where}: ปิดตัวเลือกทุกข้อของเหตุการณ์ ${ev.id}`);
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
    for (const t of list) for (const ph of unknownPlaceholders(t, key.startsWith('news_') ? ['who'] : key === 'bounty' ? ['foe'] : [])) problems.push(`lines/${key}: placeholder ไม่รู้จัก ${ph}`);
  }

  // ---- ศัตรู ----
  if (foes.size !== (c.foes ?? []).length) problems.push('foes: id ศัตรูซ้ำ');
  for (const f of foes.values()) {
    const where = `foes/${f.id}`;
    for (const w of f.wounds) {
      knownTrait(where, w);
      if (registry.get(w) && registry.get(w)!.kind !== 'wound') problems.push(`${where}: wounds "${w}" ไม่ใช่สิ่งติดตัวชนิดแผล`);
    }
    for (const x of f.weak) if (f.strong.includes(x)) problems.push(`${where}: "${x}" เป็นทั้งจุดอ่อนและจุดแข็ง`);
    for (const t of [f.lore, ...f.strike, ...f.hurt]) for (const ph of unknownPlaceholders(t, ['foe'])) problems.push(`${where}: placeholder ไม่รู้จัก ${ph}`);
  }

  // ---- ของสวมใส่ ร้านค้า และของที่ศัตรูทิ้งไว้ ----
  const given = new Set<string>();
  const places = new Set<string>();
  for (const e of c.events) {
    for (const fx of [...e.choices.flatMap(outcomes), ...endings(e.encounter)]) {
      fx?.items?.forEach((i) => given.add(i));
      if (fx?.location_tag) places.add(fx.location_tag);
      // เมืองที่ย้ายไปด้วย city.move ตั้งถิ่นของเมืองนั้นให้เอง ร้านของถิ่นนั้นจึงมีทางไปถึง
      if (fx?.city?.move) places.add(CITIES[fx.city.move].tag);
    }
  }
  const shops = c.shops ?? [];
  const sold = new Set(shops.flatMap((sh) => [...sh.staples, ...sh.stock]));
  const dropped = new Set((c.foes ?? []).flatMap((f) => f.loot.flatMap((l) => (l.item ? [l.item] : []))));
  const inRange = (n: number, [lo, hi]: readonly [number, number]) => n >= lo && n <= hi;
  if (itemIds.size !== c.items.length) problems.push('items: id ของซ้ำ');
  for (const it of c.items) {
    const where = `items/${it.id}`;
    const th = RARITY_TH[it.rarity];
    if (it.use) {
      if (it.slot) problems.push(`${where}: ของใช้แล้วหมด (use) ไม่มีช่องสวม`);
      if (Object.keys(it.stats).length || it.passive || it.also) problems.push(`${where}: ของใช้แล้วหมดไม่มีค่าพลังหรือผลพิเศษ ผลของมันอยู่ใน use กับ tags`);
      if (!it.use.heal && !it.use.boost && !it.tags.length) problems.push(`${where}: ของใช้แล้วหมดต้องมีผลอย่างน้อยหนึ่งอย่าง (heal boost หรือป้าย)`);
      if (it.price !== undefined && !inRange(it.price, GEAR.supply)) problems.push(`${where}: ราคา ${it.price} อยู่นอกช่วงของของใช้แล้วหมด (${GEAR.supply.join(' ถึง ')})`);
    } else {
      if (!it.slot) problems.push(`${where}: ของสวมใส่ต้องมีช่องสวม (slot)`);
      const pts = itemBudget(it), [min, max] = GEAR.budget[it.rarity];
      if (pts > max) problems.push(`${where}: ใช้งบ ${pts} แต้ม เกินงบของ${th} (ไม่เกิน ${max})`);
      if (it.price !== undefined) {
        if (pts < min) problems.push(`${where}: ใช้งบ ${pts} แต้ม น้อยกว่างบของ${th}ที่ร้านขาย (อย่างน้อย ${min})`);
        if (it.rarity === 'hero') problems.push(`${where}: ของผู้กล้าไม่มีราคา`);
        else if (!inRange(it.price, GEAR.price[it.rarity])) problems.push(`${where}: ราคา ${it.price} อยู่นอกช่วงของ${th} (${GEAR.price[it.rarity].join(' ถึง ')})`);
      }
      for (const [st, n] of Object.entries(it.stats)) if ((n ?? 0) > GEAR.statCap) problems.push(`${where}: ${st} +${n} เกินเพดานโบนัสของของ (${GEAR.statCap})`);
      if (it.also && RARITIES.indexOf(it.rarity) < RARITIES.indexOf('enchanted')) problems.push(`${where}: ผลพิเศษอย่างที่สอง (also) มีได้ตั้งแต่ของอาบเวทขึ้นไป`);
      if (it.rarity === 'enchanted') {
        if (!it.caveat) problems.push(`${where}: ของอาบเวทต้องมีข้อแม้หนึ่งข้อ (caveat)`);
        if (it.price !== undefined && !it.needs && !it.toll) problems.push(`${where}: ของอาบเวทที่ร้านขายต้องแลกด้วยอย่างอื่นนอกจากเงิน (needs หรือ toll)`);
      }
    }
    if (it.pattern && !it.material) problems.push(`${where}: ของที่มีแบบ (pattern) ต้องมีวัสดุ (material)`);
    if (!given.has(it.id) && !sold.has(it.id) && !dropped.has(it.id)) problems.push(`${where}: ไม่มีทางได้มา (ไม่มีเหตุการณ์ให้ ไม่มีร้านขาย ไม่มีศัตรูทิ้งไว้)`);
    if (it.needs && !it.needs_text) problems.push(`${where}: มี needs ต้องมี needs_text บอกผู้เล่นว่าทำไมคนขายยังไม่ขายให้`);
    if (it.needs?.flag && !setFlags.has(it.needs.flag)) problems.push(`${where}: needs flag "${it.needs.flag}" ที่ไม่เคยถูกตั้ง`);
    if (it.needs?.trait && !setTraits.has(it.needs.trait)) problems.push(`${where}: needs trait "${it.needs.trait}" ที่ไม่เคยถูกให้`);
    if (it.toll && (it.toll.die || it.toll.hp || it.toll.items || it.toll.gold || it.toll.people || it.toll.partner || it.toll.child || it.toll.class)) {
      problems.push(`${where}: toll ใช้ได้กับสิ่งที่เสียนอกจากเงิน (max_hp reputation world alignment flags traits) ราคาเป็นเงินใส่ที่ price`);
    }
    for (const t of it.toll?.traits ?? []) knownTrait(where, t);
    for (const t of [it.name, it.lore, it.caveat, it.needs_text, it.use?.text, it.passive?.description, it.also?.description]) {
      for (const ph of unknownPlaceholders(t ?? '')) problems.push(`${where}: placeholder ไม่รู้จัก ${ph}`);
    }
  }
  if (new Set(shops.map((sh) => sh.id)).size !== shops.length) problems.push('shops: id ร้านซ้ำ');
  for (const sh of shops) {
    const where = `shops/${sh.id}`;
    if (places.size && !places.has(sh.location)) problems.push(`${where}: ไม่มีเหตุการณ์ไหนพาไปถิ่น "${sh.location}"`);
    if (!sh.staples.length && !sh.stock.length) problems.push(`${where}: ร้านไม่มีของขาย`);
    for (const id of [...sh.staples, ...sh.stock]) {
      const it = c.items.find((x) => x.id === id);
      if (!it) problems.push(`${where}: ไม่มีของ "${id}"`);
      else if (it.price === undefined) problems.push(`${where}: "${id}" ไม่มีราคา ขายในร้านไม่ได้`);
    }
    for (const id of sh.staples) if (sh.stock.includes(id)) problems.push(`${where}: "${id}" อยู่ทั้งใน staples และ stock`);
    if (sh.requires && !sh.closed) problems.push(`${where}: ร้านที่ไม่ขายให้ทุกคน (requires) ต้องมีประโยคตอนไม่ขายให้ (closed)`);
    if (sh.requires?.flag && !setFlags.has(sh.requires.flag)) problems.push(`${where}: requires flag "${sh.requires.flag}" ที่ไม่เคยถูกตั้ง`);
    for (const t of [...sh.greet, sh.closed]) for (const ph of unknownPlaceholders(t ?? '')) problems.push(`${where}: placeholder ไม่รู้จัก ${ph}`);
  }
  for (const f of foes.values()) {
    for (const row of f.loot) {
      if (!row.item === !row.gold) problems.push(`foes/${f.id}: loot แต่ละแถวต้องมี item หรือ gold อย่างใดอย่างหนึ่ง`);
      if (row.item && !itemIds.has(row.item)) problems.push(`foes/${f.id}: loot อ้างถึงของ "${row.item}" ที่ไม่มี`);
      for (const ph of unknownPlaceholders(row.text ?? '', ['foe'])) problems.push(`foes/${f.id}: loot placeholder ไม่รู้จัก ${ph}`);
    }
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

  // ---- หลักสูตร: ทุกปีต้องมีเรื่องให้เรียน (เรื่องที่ทุกสายเรียน หรือเรื่องของแต่ละสายครบทุกสาย) ----
  for (const id of entered) {
    const def = COURSES[id];
    const lessons = c.events.filter((e) => e.course?.id === id);
    const covers = (e: GameEvent, y: number) => (typeof e.course!.year === 'number' ? e.course!.year === y : e.course!.year[0] <= y && y <= e.course!.year[1]);
    let picked = false;
    for (let y = 1; y <= def.years; y++) {
      const year = lessons.filter((e) => covers(e, y));
      const missing = Object.keys(def.tracks).filter((t) => !year.some((e) => e.course!.track === t));
      if (!year.some((e) => !e.course!.track) && (missing.length || !picked)) {
        problems.push(`หลักสูตร ${id}: ปี ${y} ${picked ? `ไม่มีเรื่องของสาย ${missing.join(', ')}` : 'ไม่มีเรื่องที่ออกได้ก่อนเลือกสาย (เรื่องที่ไม่ระบุ track)'}`);
      }
      if (year.some((e) => e.choices.some((ch) => outcomes(ch).some((fx) => fx?.course?.track)))) picked = true;
    }
  }

  // ---- เส้นเรื่องยาว: ตอนที่เนื้อหามีของแต่ละเส้น · ข้อห้าม: เงื่อนไขที่ไม่มีเหตุการณ์ไหนทำให้เป็นจริงได้ ----
  const arcSteps = new Map<string, Set<number>>();
  for (const e of c.events) if (e.arc) arcSteps.set(e.arc.id, (arcSteps.get(e.arc.id) ?? new Set()).add(e.arc.step));
  for (const id of ARC_IDS) if (arcSteps.has(id) && !arcSteps.get(id)!.has(1)) problems.push(`เส้นเรื่อง ${id}: ไม่มีตอนที่ 1`);
  const lintTabooCond = (cw: string, cond: TabooCond | undefined) => {
    if (!cond) return;
    const acts = tabooActs.get(cond.id);
    const th = TABOOS[cond.id].th;
    if (cond.taught && !acts) problems.push(`${cw}: อ่านข้อห้ามของ${th} แต่ไม่มีเหตุการณ์ไหนสอนข้อห้ามข้อนี้ (effects.taboo)`);
    if (cond.keeps && !acts?.has('keep')) problems.push(`${cw}: taboo.keeps ของ${th} แต่ไม่มีเหตุการณ์ไหนให้ถือข้อห้ามข้อนี้`);
    if (cond.defies && !acts?.has('break')) problems.push(`${cw}: taboo.defies ของ${th} แต่ไม่มีเหตุการณ์ไหนให้ฝืนข้อห้ามข้อนี้`);
    if (cond.keeps && cond.defies) problems.push(`${cw}: taboo.keeps กับ taboo.defies เป็นจริงพร้อมกันไม่ได้`);
    if (cond.keeps && cond.unbroken === false) problems.push(`${cw}: taboo.keeps กับ unbroken: false เป็นจริงพร้อมกันไม่ได้`);
  };

  for (const e of c.events) {
    const where = e.id;
    const w = e.when;
    const roles = Object.keys(e.cast ?? {});
    const optional = roles.filter((r) => e.cast![r]!.optional);
    if (w.age && w.age[0] > w.age[1]) problems.push(`${where}: ช่วงอายุกลับด้าน`);
    if (w.year && w.year[0] > w.year[1]) problems.push(`${where}: ช่วงปีกลับด้าน`);
    // must ที่เกิดซ้ำได้มีแบบเดียว: วันครบสัญญา (when.org.min_years) ที่ทุกทางออกจากองค์กรหรือเริ่มสัญญารอบใหม่ เงื่อนไขจึงดับเองจนกว่าจะครบรอบหน้า
    const termOrg = typeof w.org === 'object' && w.org.min_years !== undefined ? w.org.id : undefined;
    const closesTerm = (fx: Effects | undefined) => fx?.org?.id === termOrg && !!(fx?.org?.leave || fx?.org?.term);
    const termEnds = !!termOrg && !e.encounter && e.choices.length > 0 && e.choices.every((ch) => (ch.check ? closesTerm(ch.success?.effects) && closesTerm(ch.failure?.effects) : closesTerm(ch.effects)));
    if (e.must && !e.once && !termEnds) problems.push(`${where}: must ใช้กับ once: false ไม่ได้ (จะออกซ้ำทุกปีไม่มีที่สิ้นสุด) เว้นแต่วันครบสัญญาที่มี when.org.min_years และทุกทางมี org.leave หรือ org.term`);
    if (e.must && !w.age && !w.year && !w.flags?.length && !w.trait && !w.org && !w.city && !roles.length) problems.push(`${where}: must ที่ไม่มีเงื่อนไขอายุ ปี flag trait องค์กร เมือง หรือตัวแสดง จะออกเป็นเรื่องแรกของทุกชีวิต`);
    // ---- องค์กร: งานที่ส่งมา และเรื่องถูกตามล่า ----
    const orgOf = (cond: Requires['org']) => (typeof cond === 'string' ? cond : cond?.id);
    const lintOrgConds = (cw: string, r: Pick<Requires, 'org' | 'not_orgs' | 'min_hunted' | 'max_hunted'> | undefined, inherited?: OrgId) => {
      const id = orgOf(r?.org);
      if (id && !joinable.has(id)) problems.push(`${cw}: อ่านสถานะสมาชิกของ "${id}" แต่ไม่มีเหตุการณ์ไหนพาเข้าองค์กรนี้`);
      // องค์กรที่ต้องปิดตัวตน: เรื่องที่เขียนให้คนที่ยังไม่มีใครรู้ต้องไม่ออกกับคนที่โดนเปิดโปงแล้ว เงื่อนไขจึงต้องบอก secret เสมอ
      // (ตัวเลือกในเหตุการณ์ที่ when บอกไว้แล้วไม่ต้องบอกซ้ำ)
      if (id && ORGS[id].covert && id !== inherited && (typeof r?.org !== 'object' || r.org.secret === undefined))
        problems.push(`${cw}: "${id}" เป็นองค์กรที่สมาชิกต้องปิดตัวตน เงื่อนไข org ต้องบอก secret: true (ยังไม่มีใครรู้) หรือ secret: false (โดนเปิดโปงแล้ว)`);
      if (typeof r?.org === 'object' && r.org.min_rank !== undefined && r.org.max_rank !== undefined && r.org.min_rank > r.org.max_rank) problems.push(`${cw}: ช่วงยศของ org กลับด้าน`);
      for (const by of Object.keys(r?.min_hunted ?? {})) if (!hunters.has(by)) problems.push(`${cw}: min_hunted "${by}" แต่ไม่มีเหตุการณ์ไหนทำให้ฝ่ายนี้ตามล่า`);
    };
    lintOrgConds(where, w);
    // ---- เมือง: เงื่อนไขที่อ่านเมือง ย่าน และชั้นของคนเมือง ----
    /** เมืองที่เงื่อนไขนี้หมายถึง (ไม่ระบุ = เมืองไหนก็ได้) */
    const citiesOf = (cond: Requires['city']): readonly CityId[] => {
      if (!cond || cond === 'any' || cond === 'none') return CITY_IDS;
      if (typeof cond === 'string') return [cond];
      return cond.id === undefined ? CITY_IDS : Array.isArray(cond.id) ? cond.id : [cond.id];
    };
    const inCity = (cond: Requires['city']) => cond !== undefined && cond !== 'none';
    const lintCityCond = (cw: string, cond: Requires['city']) => {
      if (!cond || cond === 'any' || cond === 'none') return;
      const ids = citiesOf(cond);
      if (typeof cond === 'string' || cond.id !== undefined) {
        for (const id of ids) if (!reachable.has(id)) problems.push(`${cw}: อ่านเมือง "${id}" แต่ไม่มีเหตุการณ์ไหนพาไปเมืองนี้ (city.move หรือ location_tag ของถิ่นที่เมืองนี้เป็นเมืองหลัก)`);
      }
      if (typeof cond === 'string') return;
      for (const d of cond.district === undefined ? [] : Array.isArray(cond.district) ? cond.district : [cond.district]) {
        if (!ids.some((id) => CITIES[id].districts[d])) problems.push(`${cw}: ไม่มีย่าน "${d}" ใน${ids.length === 1 ? CITIES[ids[0]!].th : 'เมืองที่ระบุ'}`);
      }
      if (cond.min_rank !== undefined && cond.max_rank !== undefined && cond.min_rank > cond.max_rank) problems.push(`${cw}: ช่วงชั้นของ city กลับด้าน`);
      if (cond.min_years !== undefined && cond.max_years !== undefined && cond.min_years > cond.max_years) problems.push(`${cw}: ช่วงปีที่อยู่เมืองของ city กลับด้าน`);
      if (cond.native && !ids.some((id) => CITIES[id].natives)) problems.push(`${cw}: native: true แต่เมืองที่ระบุไม่มีคนเกิดในเมือง (CITIES[เมือง].natives)`);
      if (cond.behind && cond.home && !cond.home.includes('room')) problems.push(`${cw}: behind: true ใช้ได้กับคนเช่าห้อง (home ต้องมี room)`);
    };
    lintCityCond(where, w.city);
    // ---- หลักสูตร ----
    if (e.course) {
      const def = COURSES[e.course.id];
      const [from, to] = typeof e.course.year === 'number' ? [e.course.year, e.course.year] : e.course.year;
      if (from > to) problems.push(`${where}: ช่วงปีของ course กลับด้าน`);
      if (to > def.years) problems.push(`${where}: course ปี ${to} เกินจำนวนปีของ${def.th} (${def.years} ปี)`);
      if (e.course.track && !def.tracks[e.course.track]) problems.push(`${where}: ${def.th}ไม่มีสาย "${e.course.track}" (มี ${Object.keys(def.tracks).join(', ')})`);
      if (!entered.has(e.course.id)) problems.push(`${where}: เหตุการณ์ของ${def.th} แต่ไม่มีเหตุการณ์ไหนพาเข้าเรียน (course.enter)`);
      if (e.must || e.fallback || e.years || e.duty || e.hunt || e.stage === 'death') problems.push(`${where}: เหตุการณ์ของหลักสูตร (course) ใช้กับ must fallback years duty hunt หรือฉากตายไม่ได้`);
      if (w.age || w.year) problems.push(`${where}: เหตุการณ์ของหลักสูตรออกตามปีที่เรียน ไม่ใช้ when.age หรือ when.year (คนเข้าเรียนช้าหรือเรียนซ้ำปีจะไม่ได้เรื่องนี้)`);
    }
    // ---- เส้นเรื่องยาว และข้อห้ามของแผ่นดิน ----
    if (e.arc) {
      if (!e.once) problems.push(`${where}: ตอนของเส้นเรื่องยาว (arc) ต้องเป็น once: true`);
      if (e.must || e.fallback || e.duty || e.hunt || e.course || e.stage === 'death') problems.push(`${where}: ตอนของเส้นเรื่องยาว (arc) ใช้กับ must fallback duty hunt course หรือฉากตายไม่ได้`);
      if (e.arc.step > 1 && !arcSteps.get(e.arc.id)?.has(e.arc.step - 1)) problems.push(`${where}: เส้นเรื่อง "${ARC_TH[e.arc.id]}" ไม่มีตอนที่ ${e.arc.step - 1} (ตอนต้องเรียงต่อกันจากตอนที่ 1)`);
    }
    lintTabooCond(where, w.taboo);
    if (e.duty) {
      if (!joinable.has(e.duty)) problems.push(`${where}: งานของ "${e.duty}" แต่ไม่มีเหตุการณ์ไหนพาเข้าองค์กรนี้`);
      if (orgOf(w.org) && orgOf(w.org) !== e.duty) problems.push(`${where}: duty "${e.duty}" กับ when.org "${orgOf(w.org)}" เป็นคนละองค์กร`);
      if (e.must || e.fallback || e.years || e.stage === 'death') problems.push(`${where}: งานขององค์กร (duty) ใช้กับ must fallback years หรือฉากตายไม่ได้`);
      // ปฏิเสธได้แต่มีราคา: งานแบบมีตัวเลือกต้องมีทางปฏิเสธที่เลือกได้เสมอ และมีทางรับงานที่เลือกได้เสมอ
      if (!e.encounter) {
        if (!e.choices.some((ch) => ch.refuse && !ch.requires)) problems.push(`${where}: งานขององค์กรต้องมีทางปฏิเสธที่เลือกได้เสมอหนึ่งทาง (refuse: true ไม่มี requires)`);
        if (!e.choices.some((ch) => !ch.refuse && !ch.requires)) problems.push(`${where}: งานขององค์กรต้องมีทางรับงานที่เลือกได้เสมออย่างน้อยหนึ่งทาง`);
      }
    }
    for (const ch of e.choices) if (ch.refuse && !e.duty) problems.push(`${where}/${ch.id}: refuse ใช้ได้เฉพาะในงานขององค์กร (event.duty)`);
    // ทางเดินผ่าน: งานขององค์กรมี refuse ของตัวเองอยู่แล้ว และฉากที่มีแต่ทางเดินผ่านจะไม่มีวันออก
    for (const ch of e.choices) if (ch.pass && (e.duty || e.must)) problems.push(`${where}/${ch.id}: pass ใช้กับงานขององค์กร (duty) หรือเหตุการณ์ must ไม่ได้`);
    if (e.choices.some((ch) => ch.pass) && e.choices.every((ch) => ch.pass)) problems.push(`${where}: ทุกตัวเลือกเป็นทางเดินผ่าน (pass) ฉากนี้จะไม่มีวันออก`);
    if (e.hunt) {
      if (!hunters.has(e.hunt)) problems.push(`${where}: เรื่องถูกตามล่าโดย "${e.hunt}" แต่ไม่มีเหตุการณ์ไหนทำให้ฝ่ายนี้ตามล่า`);
      // คนในไม่โดนฝ่ายของตัวเองล่า: เรื่องที่ฝ่ายนี้ตามล่าต้องกันสมาชิกขององค์กรที่ขึ้นกับฝ่ายนี้ออก (เว้นองค์กรที่ศัตรูคือคนร่วมองค์กรเอง)
      for (const id of joinable) {
        if (ORGS[id].faction === e.hunt && ORGS[id].enemy !== e.hunt && !w.not_orgs?.includes(id) && orgOf(w.org) !== id)
          problems.push(`${where}: ${ORGS[id].th}ขึ้นกับฝ่าย "${e.hunt}" เรื่องที่ฝ่ายนี้ตามล่าต้องมี not_orgs: [${id}] (หรือเขียนให้สมาชิกโดยมี when.org)`);
      }
      if (e.must || e.years || e.stage === 'death') problems.push(`${where}: เรื่องถูกตามล่า (hunt) ใช้กับ must years หรือฉากตายไม่ได้`);
      // คนที่ถูกล่าต้องมีทางรอดเสมอ: ทางที่เลือกได้เสมอและไม่มีผลถึงตาย (การปะทะมีกติกาทางหนีอยู่แล้ว)
      if (!e.encounter && !e.choices.some((ch) => !ch.requires && !outcomes(ch).some((fx) => fx?.die))) problems.push(`${where}: เรื่องถูกตามล่าต้องมีทางรอดที่เลือกได้เสมอ (ไม่มี requires และไม่มีผล die)`);
    }
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
    for (const f of w.any_flags ?? []) if (!setFlags.has(f)) problems.push(`${where}: any_flags อ่าน flag "${f}" ที่ไม่เคยถูกตั้ง`);
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
    /** เงื่อนไข requires ของตัวเลือกหรือของวิธีรับมือ */
    const lintRequires = (cw: string, r: Requires | undefined) => {
      if (r?.flag && !setFlags.has(r.flag)) problems.push(`${cw}: requires flag "${r.flag}" ที่ไม่เคยถูกตั้ง`);
      for (const f of r?.any_flags ?? []) if (!setFlags.has(f)) problems.push(`${cw}: requires any_flags อ่าน flag "${f}" ที่ไม่เคยถูกตั้ง`);
      if (r?.trait) {
        knownTrait(cw, r.trait);
        if (!setTraits.has(r.trait)) problems.push(`${cw}: requires trait "${r.trait}" ที่ไม่เคยถูกให้`);
      }
      for (const t of r?.not_traits ?? []) knownTrait(cw, t);
      lintOrgConds(cw, r, typeof w.org === 'object' && w.org.secret !== undefined ? w.org.id : undefined);
      lintCityCond(cw, r?.city);
      lintTabooCond(cw, r?.taboo);
      if (r?.item && !itemIds.has(r.item)) problems.push(`${cw}: requires ของ "${r.item}" ที่ไม่มี`);
      for (const role of r?.cast ?? []) if (!roles.includes(role)) problems.push(`${cw}: requires.cast "${role}" ไม่มีใน cast ของเหตุการณ์`);
    };
    /** ผลของตัวเลือกหรือของทางจบการปะทะ คืนข้อความที่ผลนั้นพกมา (mark epitaph) ให้ตรวจ placeholder ต่อ */
    const lintEffects = (cw: string, fx: Effects | undefined, bigRoomOk: boolean, r?: Requires): (string | undefined)[] => {
      for (const id of [...(fx?.items ?? []), ...(fx?.lose_items ?? [])]) if (!itemIds.has(id)) problems.push(`${cw}: ไม่มีของ "${id}"`);
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
        if (registry.get(t)?.big && !bigRoomOk) problems.push(`${cw}: ให้ของใหญ่ "${t}" ต้องกันด้วย big_room: true ที่ when หรือ requires`);
      }
      if (fx?.org) {
        const o = fx.org;
        if (ORGS[o.id].jobs && (o.join || o.leave)) problems.push(`${cw}: "${o.id}" เป็นองค์กรที่ผูกกับงาน เข้าและออกด้วย flag ของงาน (${ORGS[o.id].jobs!.join(', ')}) ใช้ org.join กับ org.leave ไม่ได้`);
        if (!o.join && !o.leave && !o.merit && !o.promote && !o.term && o.secret === undefined) problems.push(`${cw}: effects.org ไม่มีผลอะไร`);
        if (o.secret === true && !o.join) problems.push(`${cw}: org.secret: true ใช้คู่กับ join เท่านั้น (เปิดเผยตัวใช้ secret: false)`);
        if (o.join && ORGS[o.id].covert && o.secret !== true) problems.push(`${cw}: "${o.id}" เป็นองค์กรที่สมาชิกต้องปิดตัวตน เข้าได้แบบลับเท่านั้น (join: true คู่กับ secret: true)`);
        if (!o.join && !joinable.has(o.id)) problems.push(`${cw}: เปลี่ยนสถานะสมาชิกของ "${o.id}" แต่ไม่มีเหตุการณ์ไหนพาเข้าองค์กรนี้`);
      }
      if (fx?.city) {
        const ct = fx.city;
        // เมืองที่ผลนี้เกิดขึ้น: เมืองที่ย้ายเข้า หรือเมืองที่เงื่อนไขของเหตุการณ์กับตัวเลือกบอกว่าตัวละครอยู่
        const gated = inCity(w.city) || inCity(r?.city);
        const at: readonly CityId[] = ct.move ? [ct.move] : citiesOf(inCity(r?.city) ? r?.city : w.city);
        if (ct.move && ct.leave) problems.push(`${cw}: city.move กับ city.leave ใช้พร้อมกันไม่ได้`);
        if (!ct.move && !ct.leave && !ct.district && !ct.home && !ct.merit && !ct.promote && !ct.mood) problems.push(`${cw}: effects.city ไม่มีผลอะไร`);
        if (ct.district && !at.some((id) => CITIES[id].districts[ct.district!])) problems.push(`${cw}: ไม่มีย่าน "${ct.district}" ใน${at.length === 1 ? CITIES[at[0]!].th : 'เมืองที่ระบุ'}`);
        if (!ct.move && !gated && (ct.leave || ct.district || ct.home)) problems.push(`${cw}: city.leave district home ใช้ได้เมื่อตัวละครอยู่ในเมือง ต้องมี when.city หรือ requires.city (หรือ city.move ในผลเดียวกัน)`);
        if (!ct.move && !gated && !ct.of && (ct.merit || ct.promote || ct.mood)) problems.push(`${cw}: city.merit promote mood ต้องรู้ว่าเป็นเมืองไหน ต้องมี when.city หรือ requires.city หรือระบุ city.of`);
        if (ct.of && !ct.merit && !ct.mood && !ct.promote) problems.push(`${cw}: city.of ใช้คู่กับ merit mood หรือ promote`);
        if (ct.promote && !(typeof w.city === 'object' && w.city.ready === true)) problems.push(`${cw}: city.promote ใช้ได้ในฉากขึ้นชั้นที่กันด้วย when.city.ready: true เท่านั้น`);
        // ซื้อบ้านหรือร้าน: จ่ายเงินจริงในผลเดียวกัน และตัวเลือกต้องกันคนที่เงินไม่พอ (ไม่มีหนี้จากการซื้อบ้าน)
        if (ct.home === 'house' || ct.home === 'shop') {
          const min = CITY.minPrice[ct.home];
          const paid = -(fx.gold ?? 0);
          if (paid < min) problems.push(`${cw}: ซื้อ${HOME_TH[ct.home]}ต้องจ่ายในผลเดียวกันอย่างน้อย ${min} เหรียญ (gold: -${min} หรือมากกว่า)`);
          else if ((r?.min_gold ?? 0) < paid) problems.push(`${cw}: ซื้อ${HOME_TH[ct.home]}ราคา ${paid} เหรียญ ตัวเลือกต้องมี requires.min_gold: ${paid}`);
        }
      }
      if (fx?.course) {
        const cs = fx.course;
        const ids = e.course ? [e.course.id] : cs.enter ? [cs.enter] : COURSE_IDS.filter((id) => w.flags?.includes(COURSES[id].student));
        if (cs.enter && e.course) problems.push(`${cw}: course.enter ใช้ในเหตุการณ์ของหลักสูตรไม่ได้ (ตัวละครเรียนอยู่แล้ว)`);
        if (cs.enter && (cs.leave || cs.hold)) problems.push(`${cw}: course.enter ใช้พร้อม leave หรือ hold ไม่ได้`);
        if (!cs.enter && !cs.track && !cs.leave && !cs.hold) problems.push(`${cw}: effects.course ไม่มีผลอะไร`);
        if (!ids.length) problems.push(`${cw}: course.track leave hold ใช้ได้กับคนที่เรียนอยู่ เหตุการณ์ต้องเป็นของหลักสูตร (course) หรือมี when.flags เป็น flag นักเรียน`);
        if (cs.hold && !e.course) problems.push(`${cw}: course.hold ใช้ได้ในเหตุการณ์ของหลักสูตรเท่านั้น`);
        if (cs.track && ids.length && !ids.some((id) => COURSES[id].tracks[cs.track!])) problems.push(`${cw}: ไม่มีสาย "${cs.track}" ใน${COURSES[ids[0]!].th}`);
      }
      if (fx?.epitaph !== undefined && e.stage !== 'death') problems.push(`${cw}: epitaph ใช้ได้เฉพาะในฉากตาย`);
      if (fx?.survive && e.stage !== 'death') problems.push(`${cw}: survive ใช้ได้เฉพาะในฉากตาย`);
      return [fx?.mark, fx?.epitaph];
    };
    const lintTexts = (cw: string, texts: (string | undefined)[]) => {
      for (const t of texts) for (const ph of unknownPlaceholders(t ?? '', roles)) problems.push(`${cw}: placeholder ไม่รู้จัก ${ph}`);
    };
    const usesRole = (texts: (string | undefined)[], r: string) => texts.some((t) => t && new RegExp(`\\{${r}[}:]`).test(t));

    if (!e.encounter && !e.choices.length) problems.push(`${where}: ไม่มีตัวเลือก`);
    const ids = new Set<string>();
    for (const ch of e.choices) {
      if (ids.has(ch.id)) problems.push(`${where}: choice id ซ้ำ ${ch.id}`);
      ids.add(ch.id);
      const cw = `${where}/${ch.id}`;
      lintRequires(cw, ch.requires);
      if (ch.habit) {
        knownTrait(cw, ch.habit);
        if (registry.size && registry.get(ch.habit) && !registry.get(ch.habit)!.habit) problems.push(`${cw}: habit "${ch.habit}" ไม่ใช่ลักษณะที่ก่อตัวจากนิสัย (habit: true)`);
      }
      const texts = [ch.label, ch.text, ch.success?.text, ch.failure?.text];
      for (const fx of outcomes(ch)) texts.push(...lintEffects(cw, fx, eventBigRoom || ch.requires?.big_room === true, ch.requires));
      lintTexts(cw, texts);
      for (const r of optional) {
        if (usesRole(texts, r) && !ch.requires?.cast?.includes(r)) problems.push(`${cw}: ใช้บท "${r}" ที่อาจไม่มีคนเล่น ต้องมี requires.cast: [${r}]`);
      }
      const hasEffect = !!ch.text || outcomes(ch).some((fx) => fx && Object.keys(fx).length > 0);
      if (!hasEffect) problems.push(`${cw}: ตัวเลือกไม่มีผลอะไร`);
      if (ch.check && !ch.success && !ch.failure) problems.push(`${cw}: มี check แต่ไม่มีผล success/failure`);
    }

    // ---- การปะทะ ----
    const enc = e.encounter;
    if (enc) {
      const ew = `${where}/encounter`;
      const foe = foes.get(enc.foe);
      if (e.choices.length) problems.push(`${where}: เหตุการณ์ที่มีการปะทะ (encounter) มี choices ไม่ได้ วิธีรับมืออยู่ในแต่ละจังหวะ`);
      if (e.years || e.stage === 'death') problems.push(`${where}: การปะทะใช้กับ years หรือฉากตายไม่ได้`);
      if (!foe) problems.push(`${ew}: ไม่มีศัตรู "${enc.foe}" ใน foes.yaml`);
      const morale = enc.morale ?? foe?.morale ?? 2;
      if (morale > enc.beats.length) problems.push(`${ew}: แรงใจ ${morale} ขีดมากกว่าจำนวนจังหวะ ${enc.beats.length} (ไม่มีทางชนะ)`);
      // ฝ่ายดาวมองไม่เห็นคนที่มีตราจอมมาร (เรื่องที่ใบ้ไว้ในเนื้อเรื่อง) ฉากของฝ่ายดาวจึงต้องไม่ออกกับคนมีตรา
      if (foe?.side === 'star' && !e.when.not_traits?.includes(DEMON_MARK_TRAIT)) problems.push(`${ew}: ศัตรูฝ่ายดาว "${foe.id}" ต้องมี when.not_traits: [${DEMON_MARK_TRAIT}] (ฝ่ายดาวมองไม่เห็นคนมีตราจอมมาร)`);
      const deadly = enc.deadly ?? foe?.lethal ?? true;
      const moves = enc.beats.flatMap((b) => b.moves);
      // พลาดได้ทุกจังหวะ และวิธีส่วนใหญ่ใช้ประโยคประจำตัวของศัตรู ถ้าประโยคมีน้อยกว่าจำนวนจังหวะ ผู้เล่นจะอ่านประโยคเดิมซ้ำในการปะทะเดียว
      const stock = enc.beats.filter((bt) => bt.moves.some((m) => !m.failure)).length;
      if (foe && foe.strike.length < stock) problems.push(`${ew}: ฉากมี ${stock} จังหวะที่ใช้ประโยค strike ของศัตรู แต่ "${foe.id}" มีแค่ ${foe.strike.length} ประโยค (จะซ้ำในการปะทะเดียว)`);
      if (moves.some((m) => m.kind === 'flee') && !enc.flee) problems.push(`${ew}: มีวิธีหนีแต่ไม่มีผลของการหนี (flee)`);
      if (moves.some((m) => m.parley) && !enc.parley) problems.push(`${ew}: มีวิธีเจรจาแต่ไม่มีผลของการเจรจา (parley)`);
      for (const k of ENDS) {
        const out = enc[k];
        if (!out) continue;
        if (!out.text) problems.push(`${ew}/${k}: ทางจบของการปะทะต้องมีข้อความ`);
        const texts = [out.text, ...lintEffects(`${ew}/${k}`, out.effects, eventBigRoom)];
        lintTexts(`${ew}/${k}`, texts);
        for (const r of optional) if (usesRole(texts, r)) problems.push(`${ew}/${k}: ใช้บท "${r}" ที่อาจไม่มีคนเล่น (optional)`);
      }
      lintTexts(`${ew}/death`, [enc.death?.text]);
      const moveIds = new Set<string>();
      enc.beats.forEach((b, i) => {
        const bw = `${ew}/จังหวะ ${i + 1}`;
        lintTexts(bw, [b.text]);
        for (const r of optional) if (usesRole([b.text], r)) problems.push(`${bw}: ใช้บท "${r}" ที่อาจไม่มีคนเล่น (optional)`);
        // วิธีที่เลือกได้เสมอ: ไม่มีเงื่อนไข ไม่ต้องมีคนช่วย
        const always = b.moves.filter((m) => !m.requires && !m.ally);
        if (always.filter((m) => m.kind !== 'flee').length < 2) problems.push(`${bw}: ต้องมีวิธีที่เลือกได้เสมออย่างน้อยสองวิธี (ไม่นับการหนี ไม่มี requires ไม่มี ally)`);
        if (deadly && !always.some((m) => m.kind === 'flee')) problems.push(`${bw}: การปะทะที่เอาถึงตายต้องมีทางหนีที่เลือกได้เสมอในทุกจังหวะ`);
        if (b.answer === 'flee') problems.push(`${bw}: answer เป็นการหนีไม่ได้`);
        if (b.answer && !always.some((m) => m.kind === b.answer)) problems.push(`${bw}: answer "${b.answer}" ไม่มีวิธีชนิดนี้ที่เลือกได้เสมอในจังหวะนี้`);
        for (const m of b.moves) {
          const mw = `${bw}/${m.id}`;
          if (moveIds.has(m.id)) problems.push(`${ew}: id ของวิธีซ้ำ ${m.id}`);
          moveIds.add(m.id);
          lintRequires(mw, m.requires);
          if ((m.kind === 'read' || m.kind === 'item') && !m.stat) problems.push(`${mw}: วิธีชนิด ${m.kind} ต้องระบุ stat`);
          if (m.parley && m.kind !== 'talk') problems.push(`${mw}: parley ใช้ได้กับวิธีชนิด talk เท่านั้น`);
          if (m.parley && foe && !foe.speaks) problems.push(`${mw}: เจรจากับ "${foe.id}" ไม่ได้ (speaks: false)`);
          if (m.ally && !roles.includes(m.ally)) problems.push(`${mw}: ally "${m.ally}" ไม่มีใน cast ของเหตุการณ์`);
          const texts = [m.label, m.success, m.failure];
          lintTexts(mw, texts);
          for (const r of optional) {
            if (usesRole(texts, r) && m.ally !== r && !m.requires?.cast?.includes(r)) problems.push(`${mw}: ใช้บท "${r}" ที่อาจไม่มีคนเล่น ต้องมี ally หรือ requires.cast: [${r}]`);
          }
        }
      });
    }
  }
  return problems;
}
