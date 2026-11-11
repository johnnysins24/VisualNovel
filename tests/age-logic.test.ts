// ตรวจความถูกต้องของวัยและ logic ตลอดทั้งชีวิต: เล่นชีวิตสุ่มด้วยเนื้อหาจริงหลายร้อยชีวิต แล้วดูว่า
// รูปร่างตรงกับวัยทุกปี (ทารก เด็กเล็ก เด็ก วัยรุ่น ผู้ใหญ่) คนรอบตัววาดได้ทุกคน และเหตุการณ์ไม่พูดถึงคนที่ไม่อยู่
import { describe, expect, it } from 'vitest';
import { renderLook } from '../art/kit/core.mjs';
import { loadContent } from '../scripts/content';
import { choiceAvailable, makeGame, pickEvent, resolveChoice } from '../src/engine/engine';
import { humanAge, newLife, type LifeState } from '../src/engine/state';
import { Rng } from '../src/engine/rng';
import { kit } from '../src/sprites/kit';
import { bodyFor, personAge, personLook, playerLook, stageOf } from '../src/sprites/looks';

const game = makeGame(loadContent('content'));
const PARTNER = /\{partner\}|\{p:/;
const fatherGone = (l: LifeState) => l.flags.includes('father_away') || l.flags.includes('father_lost');

describe('age logic over whole lives (real content)', () => {
  it('every year: body matches the age stage, people render, text only names who is there', () => {
    const problems: string[] = [];
    for (let seed = 1; seed <= 120; seed++) {
      let l = newLife(seed);
      const r = new Rng(seed * 31);
      for (let i = 0; i < 100 && l.alive; i++) {
        const look = playerLook(l, game.items);
        const want = bodyFor(stageOf(humanAge(l)), l.gender);
        if (look.body !== want) problems.push(`seed ${seed} age ${l.age}: body ${look.body}, want ${want}`);
        for (const p of l.people) {
          if (personAge(p, l) < 0) problems.push(`seed ${seed}: ${p.id} has a negative age`);
          // วาดจริงเฉพาะบางปี (ช้า) ที่เหลือแค่สร้างรูปร่าง
          if (i % 7 === 0) renderLook(kit, personLook(p, l));
          else personLook(p, l);
        }
        const picked = pickEvent(game, l);
        if (!picked.event) break;
        l = picked.life;
        const ev = picked.event;
        const needsAway = (ev.when.flags ?? []).includes('father_away');
        if (PARTNER.test(ev.text) && !l.partner) problems.push(`${ev.id}: names a partner the player does not have`);
        if (ev.text.includes('{father}') && !needsAway && fatherGone(l)) problems.push(`${ev.id}: father is away or lost`);
        const open = ev.choices.filter((c) => choiceAvailable(game, l, c, ev));
        if (!open.length) problems.push(`${ev.id}: no choice available`);
        for (const c of open) {
          if (PARTNER.test(c.label) && !l.partner) problems.push(`${ev.id}/${c.id}: offers the partner the player does not have`);
          if ((c.label + (c.text ?? '')).includes('{father}') && !needsAway && fatherGone(l)) problems.push(`${ev.id}/${c.id}: father is away or lost`);
        }
        if (!open.length) break;
        l = resolveChoice(game, l, ev.id, open[r.int(0, open.length - 1)]!.id).life;
      }
    }
    expect([...new Set(problems)]).toEqual([]);
  }, 120_000);

  it('the first scene of every life is a newborn in a basket', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const look = playerLook(newLife(seed), game.items);
      expect(look.body).toMatch(/^b[mf]$/);
      expect(look.pieces).toContain('acc/basket');
    }
  });
});
