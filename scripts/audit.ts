/**
 * ตรวจ logic ของเกมด้วยการเล่นชีวิตสุ่มจำนวนมาก แล้วสรุปเป็นตัวเลข
 * ใช้ได้ทั้งจากคำสั่ง (scripts/audit-lives.ts) และจากเทสต์ (tests/audit.test.ts)
 * ทุกอย่างคำนวณจาก seed จึงได้ผลเดิมทุกครั้ง
 */
import { choiceAvailable, eligible, pickEvent, playable, resolveChoice, turnsLeft, type Game } from '../src/engine/engine';
import { humanAge, newLife, type LifeState } from '../src/engine/state';
import { Rng } from '../src/engine/rng';
import { STATS } from '../src/engine/schema';
import { maxHp } from '../src/engine/items';
import { REPEAT_GAP, STAT_CAP } from '../src/engine/balance';

const PARTNER = /\{partner\}|\{p:/;
const bump = <K,>(m: Map<K, number>, k: K, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};
const pct = (n: number, of: number) => `${((100 * n) / Math.max(1, of)).toFixed(1)}%`;

export interface AuditResult {
  lives: number;
  events: number;
  /** logic ที่ผิดจริง ต้องว่างเสมอ (ข้อความ → จำนวนครั้ง) */
  problems: Map<string, number>;
  /**
   * เหตุการณ์ must สองเรื่องที่ถึงโอกาสสุดท้ายในปีเดียวกัน ระบบเลือกได้เรื่องเดียว อีกเรื่องหลุด
   * เป็นปัญหาของการวางช่วงเวลาในเนื้อหา ไม่ใช่ของ engine (ข้อความ → จำนวนครั้ง)
   */
  collisions: Map<string, number>;
  /** ชีวิตที่เจอการชนกันข้างบน (เผ่าของชีวิตนั้น เรื่องที่หลุด และเรื่องที่ได้ออกแทน) */
  collisionLives: { seed: number; race: string | null; lost: string; to: string }[];
  /** จำนวนชีวิตที่เคยเข้าเงื่อนไขของ must แต่ละเรื่อง และจำนวนที่ได้เห็น */
  must: Map<string, { could: number; seen: number }>;
  finals: LifeState[];
  seenEvents: Map<string, number>;
  endReasons: Map<string, number>;
  deathBy: Map<string, number>;
  poolByAge: Map<number, number[]>;
  /** เหตุการณ์ที่เกิดซ้ำในชีวิตเดียว (id → จำนวนครั้งที่ซ้ำรวมทุกชีวิต) */
  repeats: Map<string, number>;
  /** ซ้ำภายใน REPEAT_GAP เหตุการณ์ เกิดได้เฉพาะเมื่อไม่มีเรื่องอื่นให้ออก */
  closeRepeats: Map<string, number>;
  counts: Map<string, number>;
  /** สัดส่วนเหตุการณ์ที่ซ้ำกันของสองชีวิต (0 ถึง 1) */
  overlap: { sameOriginAndClass: number; anyTwo: number; eventsPerLife: number };
}

export function auditLives(game: Game, lives: number): AuditResult {
  const res: AuditResult = {
    lives,
    events: game.events.length,
    problems: new Map(),
    collisions: new Map(),
    collisionLives: [],
    must: new Map(),
    finals: [],
    seenEvents: new Map(),
    endReasons: new Map(),
    deathBy: new Map(),
    poolByAge: new Map(),
    repeats: new Map(),
    closeRepeats: new Map(),
    counts: new Map(),
    overlap: { sameOriginAndClass: 0, anyTwo: 0, eventsPerLife: 0 },
  };
  const { problems, collisions, counts } = res;
  const byId = new Map(game.events.map((e) => [e.id, e]));
  const mustEvents = game.events.filter((e) => e.must);

  for (let seed = 1; seed <= lives; seed++) {
    let l = newLife(seed);
    const r = new Rng(seed * 7919 + 13);
    const inLife = new Map<string, number>();
    const couldMust = new Set<string>();
    /** must ที่เข้าเงื่อนไขแล้วแต่ยังไม่ได้ออก → เรื่องที่แซงไปตอนมันเหลือโอกาสสุดท้าย (ถ้ามี) */
    const waiting = new Map<string, string | null>();

    for (let step = 0; step < 400 && l.alive; step++) {
      const age = Math.floor(humanAge(l));
      const open = game.events.filter((e) => eligible(l, e));
      const pool = open.filter((e) => playable(l, e));
      (res.poolByAge.get(age) ?? res.poolByAge.set(age, []).get(age)!).push(pool.length);
      for (const e of open) if (!pool.includes(e)) bump(problems, `${e.id}: เข้าเงื่อนไขแต่ไม่มีตัวเลือกให้กด`);

      // ---- must ที่รออยู่จากปีก่อน: ถ้าช่วงเวลาปิดไปแล้วโดยยังไม่ได้เห็น คือหลุด ----
      for (const [id, lostTo] of waiting) {
        const ev = byId.get(id)!;
        if (l.seen.includes(id)) waiting.delete(id);
        else if (turnsLeft(l, ev) < 0) {
          if (lostTo) {
            bump(collisions, `${id} ชนกับ ${lostTo} ในปีสุดท้ายของทั้งคู่`);
            res.collisionLives.push({ seed, race: l.raceApplied, lost: id, to: lostTo });
          } else bump(problems, `${id}: เหตุการณ์ must หลุดทั้งที่เคยเข้าเงื่อนไข`);
          waiting.delete(id);
        } else if (!playable(l, ev)) waiting.delete(id); // เงื่อนไขอื่นเปลี่ยน (flag อาชีพ ถิ่น) ไม่นับว่าหลุด
      }

      const picked = pickEvent(game, l);
      if (!picked.event) {
        l = { ...l, alive: false, endReason: 'content_end' };
        break;
      }
      const ev = picked.event;
      const mustNow = mustEvents.filter((e) => pool.includes(e));
      for (const e of mustNow) couldMust.add(e.id);
      if (mustNow.length && !ev.must) bump(problems, `${ev.id}: ถูกหยิบทั้งที่มี must รออยู่ (${mustNow.map((e) => e.id).join(', ')})`);
      for (const e of mustNow) {
        if (e === ev) waiting.delete(e.id);
        else if (!waiting.get(e.id)) waiting.set(e.id, turnsLeft(l, e) <= 0 ? ev.id : null);
      }
      if (!pool.includes(ev)) bump(problems, `${ev.id}: ถูกหยิบทั้งที่ไม่เข้าเงื่อนไขหรือไม่มีตัวเลือก`);
      if (!ev.once && l.log.slice(-REPEAT_GAP).some((x) => x.eventId === ev.id)) {
        bump(res.closeRepeats, ev.id);
        const others = pool.filter((e) => e.once || !l.log.slice(-REPEAT_GAP).some((x) => x.eventId === e.id));
        if (others.length) bump(problems, `${ev.id}: ออกซ้ำภายใน ${REPEAT_GAP} เหตุการณ์ทั้งที่มีเรื่องอื่นให้ออก`);
      }

      l = picked.life;
      bump(res.seenEvents, ev.id);
      bump(inLife, ev.id);

      // ---- ตรวจข้อความกับสถานะ ----
      if (PARTNER.test(ev.text) && !l.partner) bump(problems, `${ev.id}: พูดถึงคนรักที่ไม่มี`);
      const partnerPerson = l.people.find((p) => p.id === 'partner');
      if (PARTNER.test(ev.text) && partnerPerson && !partnerPerson.alive && !(ev.when.flags ?? []).includes('partner_died')) {
        bump(problems, `${ev.id}: พูดถึงคนรักที่ตายแล้ว (ไม่ได้กรอง partner_died)`);
      }
      for (const who of ['father', 'mother'] as const) {
        const p = l.people.find((x) => x.id === who);
        if (ev.text.includes(`{${who}}`) && !l.parents) bump(problems, `${ev.id}: ใช้ {${who}} ตอนไม่มีพ่อแม่ที่รู้จัก`);
        if (ev.text.includes(`{${who}}`) && p && !p.alive) bump(problems, `${ev.id}: ใช้ {${who}} หลังคนนั้นตายแล้ว`);
      }

      const choices = ev.choices.filter((c) => choiceAvailable(l, c));
      if (!choices.length) {
        bump(problems, `${ev.id}: ไม่มีตัวเลือกให้กด (ทางตัน)`);
        break;
      }
      if (choices.length === 1 && ev.choices.length > 1) bump(counts, 'เหตุการณ์ที่เหลือตัวเลือกเดียว');
      bump(counts, 'เหตุการณ์ทั้งหมด');

      const c = choices[r.int(0, choices.length - 1)]!;
      const before = l;
      l = resolveChoice(game, l, ev.id, c.id).life;

      // ---- ตรวจผลของตัวเลือก ----
      for (const fx of [c.effects, c.success?.effects, c.failure?.effects]) {
        for (const pe of fx?.people ?? []) {
          const was = before.people.find((p) => p.id === pe.id);
          if (was && !was.alive && (pe.closeness || pe.dies)) bump(problems, `${ev.id}/${c.id}: ปรับความสนิทหรือสั่งตายกับ "${pe.id}" ที่ตายไปแล้ว`);
        }
      }
      if (!l.alive) {
        bump(res.deathBy, `${ev.id}/${c.id}`);
        if (l.hp > 0 && !(c.effects?.die || c.success?.effects?.die || c.failure?.effects?.die)) bump(problems, `${ev.id}/${c.id}: ตายทั้งที่ HP เหลือและไม่มี die`);
      }
      if (l.hp > maxHp(l, game.items)) bump(problems, `HP เกินค่าสูงสุดหลัง ${ev.id}/${c.id}`);
      for (const s of STATS) if (l.stats[s] < 1) bump(problems, `${s} ต่ำกว่า 1 หลัง ${ev.id}/${c.id}`);
      if (l.gold < 0 && before.gold >= 0 && !(c.effects?.debt || c.success?.effects?.debt || c.failure?.effects?.debt)) {
        bump(problems, `${ev.id}/${c.id}: เงินติดลบโดยไม่ใช่หนี้`);
      }
      if (l.flags.includes('married') && !l.partner) bump(problems, `${ev.id}/${c.id}: แต่งงานแล้วแต่ไม่มีคู่`);
      if (l.flags.includes('has_child') && !l.flags.includes('married') && !l.flags.includes('partner_died') && !before.flags.includes('has_child')) {
        bump(counts, 'มีลูกโดยไม่ได้แต่งงาน');
      }
    }

    for (const id of couldMust) {
      const m = res.must.get(id) ?? res.must.set(id, { could: 0, seen: 0 }).get(id)!;
      m.could++;
      if (l.seen.includes(id)) m.seen++;
    }
    for (const [id, n] of inLife) if (n > 1) bump(res.repeats, id, n - 1);
    bump(res.endReasons, l.endReason ?? 'cap');
    res.finals.push(l);
  }

  res.overlap = measureOverlap(res.finals);
  return res;
}

/** สองชีวิตเจอเหตุการณ์ซ้ำกันกี่ส่วน (นับเฉพาะชีวิตที่ถึงอายุ 40 เทียบกับชีวิตที่สั้นกว่าในคู่) */
function measureOverlap(finals: LifeState[]): AuditResult['overlap'] {
  const groups = new Map<string, Set<string>[]>();
  const all: Set<string>[] = [];
  for (const l of finals) {
    if (humanAge(l) < 40) continue;
    const key = `${l.flags.find((f) => f.startsWith('origin_')) ?? '?'}|${l.classId ?? 'none'}`;
    const s = new Set(l.seen);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
    all.push(s);
  }
  const share = (a: Set<string>, b: Set<string>) => {
    let n = 0;
    for (const x of a) if (b.has(x)) n++;
    return n / Math.max(1, Math.min(a.size, b.size));
  };
  let sum = 0;
  let n = 0;
  for (const ls of groups.values()) {
    const top = Math.min(ls.length, 30);
    for (let i = 0; i < top; i++) for (let j = i + 1; j < top; j++, n++) sum += share(ls[i]!, ls[j]!);
  }
  const same = n ? sum / n : 0;
  sum = 0;
  n = 0;
  const top = Math.min(all.length, 300);
  for (let i = 0; i < top; i++) for (let j = i + 1; j < top; j += 7, n++) sum += share(all[i]!, all[j]!);
  return {
    sameOriginAndClass: same,
    anyTwo: n ? sum / n : 0,
    eventsPerLife: all.length ? all.reduce((a, s) => a + s.size, 0) / all.length : 0,
  };
}

export function formatReport(game: Game, res: AuditResult): string {
  const { finals, lives } = res;
  const out: string[] = [];
  const h = (t: string) => out.push('', `## ${t}`);
  out.push(`# ผลตรวจ logic จากการเล่น ${lives} ชีวิต (เนื้อหา ${res.events} เหตุการณ์)`);

  h('ชีวิตจบอย่างไร');
  for (const [k, n] of res.endReasons) out.push(`- ${k}: ${n} (${pct(n, lives)})`);
  const deaths = finals.filter((l) => l.endReason === 'death');
  out.push(`- อายุตอนตาย (เฉพาะคนตาย): ต่ำสุด ${Math.min(...deaths.map((l) => l.age), 999)} กลาง ${median(deaths.map((l) => l.age))} สูงสุด ${Math.max(...deaths.map((l) => l.age), 0)}`);
  out.push(`- อายุสูงสุดที่ไปถึง: ${Math.max(...finals.map((l) => l.age))} · อายุเทียบมนุษย์สูงสุด: ${Math.max(...finals.map((l) => Math.floor(humanAge(l))))}`);
  out.push('- ตัวเลือกที่ฆ่าผู้เล่นบ่อยสุด:');
  for (const [k, n] of [...res.deathBy].sort((a, b) => b[1] - a[1]).slice(0, 8)) out.push(`  - ${k}: ${n}`);

  h('เผ่าและอาชีพ');
  const tally = (key: (l: LifeState) => string) => {
    const m = new Map<string, number>();
    for (const l of finals) bump(m, key(l));
    return [...m].map(([k, n]) => `${k} ${pct(n, lives)}`).join(' · ');
  };
  out.push(`- เผ่า: ${tally((l) => l.raceApplied ?? 'ไม่มี')}`);
  out.push(`- อาชีพ: ${tally((l) => l.classId ?? 'ไม่มี')}`);

  h('ตัวละครตอนจบ (เฉพาะชีวิตที่ถึงอายุ 40)');
  const full = finals.filter((l) => humanAge(l) >= 40);
  out.push(`- จำนวน: ${full.length}`);
  for (const s of STATS) {
    const xs = full.map((l) => l.stats[s]);
    out.push(`- ${s}: กลาง ${median(xs)} สูงสุด ${Math.max(...xs)} · ถึงเพดาน ${STAT_CAP}: ${pct(xs.filter((x) => x >= STAT_CAP).length, xs.length)}`);
  }
  const top = full.map((l) => Math.max(...STATS.map((s) => l.stats[s])));
  out.push(`- ค่าสูงสุดของแต่ละคน: กลาง ${median(top)} · มีอย่างน้อยหนึ่งค่าถึงเพดาน ${pct(top.filter((x) => x >= STAT_CAP).length, top.length)}`);
  const sum = full.map((l) => STATS.reduce((n, s) => n + l.stats[s], 0));
  out.push(`- ผลรวมหกค่า: กลาง ${median(sum)} ต่ำสุด ${Math.min(...sum)} สูงสุด ${Math.max(...sum)}`);
  const gold = full.map((l) => l.gold);
  out.push(`- เงิน: กลาง ${median(gold)} ต่ำสุด ${Math.min(...gold)} สูงสุด ${Math.max(...gold)} · ติดหนี้ ${pct(gold.filter((g) => g < 0).length, gold.length)}`);
  const hpMax = full.map((l) => maxHp(l, game.items));
  out.push(`- HP สูงสุด: กลาง ${median(hpMax)} ช่วง ${Math.min(...hpMax)}–${Math.max(...hpMax)}`);
  out.push(`- คนที่รู้จัก: กลาง ${median(full.map((l) => l.people.length))} · มีคู่ ${pct(full.filter((l) => l.partner).length, full.length)} · แต่งงาน ${pct(full.filter((l) => l.flags.includes('married')).length, full.length)} · มีลูก ${pct(full.filter((l) => l.flags.includes('has_child')).length, full.length)}`);
  out.push(`- ของในถุง: กลาง ${median(full.map((l) => l.inventory.length))} · สวมอยู่: กลาง ${median(full.map((l) => Object.keys(l.equipped).length))}`);
  for (const k of ['gods', 'demon', 'star'] as const) {
    const xs = full.map((l) => l.world[k]);
    out.push(`- คะแนนโลก ${k}: กลาง ${median(xs)} ช่วง ${Math.min(...xs)}–${Math.max(...xs)}`);
  }

  h('กองเหตุการณ์ต่ออายุ (จำนวนเหตุการณ์ที่ออกได้ตอนสุ่ม)');
  const thin: string[] = [];
  for (const [age, xs] of [...res.poolByAge].sort((a, b) => a[0] - b[0])) {
    const min = Math.min(...xs);
    if (min <= 2) thin.push(`อายุ ${age}: ต่ำสุด ${min} กลาง ${median(xs)}`);
  }
  out.push(thin.length ? `- อายุที่กองบางมาก (ต่ำสุด ≤ 2): ${thin.join(' · ')}` : '- ไม่มีอายุไหนที่กองบางกว่า 3');

  h('เหตุการณ์ที่ต้องเกิด (must)');
  const mustRows = [...res.must].sort((a, b) => a[0].localeCompare(b[0]));
  const missed = mustRows.filter(([, m]) => m.seen < m.could);
  out.push(`- ${mustRows.length} เรื่องที่มีชีวิตเข้าเงื่อนไข · เห็นครบทุกชีวิต ${mustRows.length - missed.length} เรื่อง`);
  for (const [id, m] of missed) out.push(`  - ${id}: เข้าเงื่อนไข ${m.could} ชีวิต ไม่ได้เห็น ${m.could - m.seen} (${pct(m.could - m.seen, m.could)}) รวมชีวิตที่ตายก่อนถึงคิว`);
  const col = [...res.collisions].sort((a, b) => b[1] - a[1]);
  out.push(col.length ? col.map(([k, n]) => `- ชนกัน: ${k} · ${n} ชีวิต`).join('\n') : '- ไม่มี must ที่ชนกัน');

  h('ความหลากหลาย');
  out.push(`- สองชีวิตที่ถิ่นกำเนิดและอาชีพเดียวกันเจอเหตุการณ์ซ้ำกัน ${pct(res.overlap.sameOriginAndClass, 1)}`);
  out.push(`- สองชีวิตใดๆ เจอเหตุการณ์ซ้ำกัน ${pct(res.overlap.anyTwo, 1)}`);
  out.push(`- เหตุการณ์ที่เห็นต่อชีวิต: ${res.overlap.eventsPerLife.toFixed(1)}`);

  h('เหตุการณ์ที่ไม่มีใครได้เห็น');
  const never = game.events.filter((e) => !res.seenEvents.has(e.id)).map((e) => e.id);
  out.push(`- ${never.length} จาก ${res.events}${never.length ? `: ${never.join(', ')}` : ''}`);
  const rare = game.events
    .filter((e) => (res.seenEvents.get(e.id) ?? 0) > 0 && (res.seenEvents.get(e.id) ?? 0) < lives / 400)
    .map((e) => `${e.id} (${res.seenEvents.get(e.id)})`);
  out.push(`- เห็นน้อยกว่า 1 ใน 400 ชีวิต: ${rare.length}${rare.length ? `: ${rare.join(', ')}` : ''}`);

  h('เหตุการณ์ที่เกิดซ้ำในชีวิตเดียว');
  const rep = [...res.repeats].sort((a, b) => b[1] - a[1]);
  out.push(rep.length ? rep.slice(0, 15).map(([k, n]) => `- ${k}: ซ้ำ ${n} ครั้งรวมทุกชีวิต`).join('\n') : '- ไม่มี');
  const close = [...res.closeRepeats].sort((a, b) => b[1] - a[1]);
  out.push(close.length ? `- ซ้ำภายใน ${REPEAT_GAP} เหตุการณ์เพราะไม่มีเรื่องอื่นให้ออก: ${close.map(([k, n]) => `${k} ${n}`).join(' · ')}` : `- ไม่มีเรื่องไหนซ้ำภายใน ${REPEAT_GAP} เหตุการณ์`);

  h('ตัวเลือก');
  out.push(`- เหตุการณ์ที่เหลือตัวเลือกเดียวให้กด: ${pct(res.counts.get('เหตุการณ์ที่เหลือตัวเลือกเดียว') ?? 0, res.counts.get('เหตุการณ์ทั้งหมด') ?? 1)}`);
  out.push(`- มีลูกโดยไม่ได้แต่งงาน: ${res.counts.get('มีลูกโดยไม่ได้แต่งงาน') ?? 0} ครั้ง`);

  h('ปัญหาที่พบ');
  const list = [...res.problems].sort((a, b) => b[1] - a[1]);
  out.push(list.length ? list.map(([k, n]) => `- ${k} · ${n} ครั้ง`).join('\n') : '- ไม่พบ');

  return out.join('\n');
}
