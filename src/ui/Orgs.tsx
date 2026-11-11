import { ORG, ORGS, ORG_TECHNIQUES, TECHNIQUE_HELP, type FactionId, type OrgId } from '../engine/balance';
import { memberOrgs, membership, meritForNext, promotionReady, rankName } from '../engine/orgs';
import type { GameEvent } from '../engine/schema';
import type { LifeChanges, LifeState, YearEnd } from '../engine/state';
import { life } from '../store';
import { Icon } from './icons';

/** ชื่อไทยของฝักฝ่าย (ตามคัมภีร์โลก) ใช้ทั้งหน้าชื่อเสียงและรายการผู้ตามล่า */
export const FACTION_TH: Record<FactionId, string> = {
  crown: 'ราชสำนักอาร์เวล',
  lamp_church: 'ศาสนจักรตะเกียง',
  belek_bank: 'ธนาคารเบเลค',
  royal_institute: 'สถาบันเวทหลวง',
  distillers: 'สมาคมโรงกลั่น',
  dwarf_council: 'สภาตระกูลคนแคระ',
  star_hall: 'หอนับดาว',
  wardens: 'ภาคีผู้เฝ้าผนึก',
  dock_rats: 'หนูท่า',
  ash_cult: 'ลัทธิเถ้า',
  star_listeners: 'ผู้ฟังดาว',
  fang_house: 'โรงรับเขี้ยว',
  cold_iron: 'ภาคีเหล็กเย็น',
};
/** ชื่อของผู้ตามล่า: ส่วนใหญ่คือชื่อฝ่าย ยกเว้นโรงรับเขี้ยว คนที่ตามมาคือนักล่าร่วมโรง ไม่ใช่ตัวโรง */
const HUNTER_TH: Partial<Record<FactionId, string>> = { fang_house: 'นักล่าร่วมโรง' };
const factionTh = (id: string) => HUNTER_TH[id as FactionId] ?? FACTION_TH[id as FactionId] ?? id;
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** ระดับการตามล่า 0 ถึง ORG.huntMax เป็นขีด */
function HuntPips({ level }: { level: number }) {
  return (
    <span class="pips" role="img" aria-label={`ระดับ ${level} จาก ${ORG.huntMax}`}>
      {Array.from({ length: ORG.huntMax }, (_, i) => <i key={i} class={`pip ${i < level ? 'on' : ''}`} />)}
    </span>
  );
}

/** บันไดสี่ขั้น: ขั้นที่ผ่านแล้ว ขั้นปัจจุบัน และขั้นที่ยังไม่ถึง ใช้ทั้งยศขององค์กรและชั้นของคนเมือง */
export function Ladder({ steps, rank, label }: { steps: readonly string[]; rank: number; label: string }) {
  return (
    <ol class="ladder" aria-label={label}>
      {steps.map((th, i) => (
        <li key={th} class={i + 1 < rank ? 'past' : i + 1 === rank ? 'now' : ''} aria-current={i + 1 === rank ? 'step' : undefined}>
          <i />
          <span>{th}</span>
        </li>
      ))}
    </ol>
  );
}

function OrgCard({ l, id }: { l: LifeState; id: OrgId }) {
  const m = membership(l, id)!;
  const need = meritForNext(m.rank);
  const tech = ORG_TECHNIQUES[id];
  const open = m.rank >= ORG.techRank;
  return (
    <article class="orgcard">
      <header>
        <b>{ORGS[id].th}</b>
        {m.secret && <span class="muted"><Icon name="eyeoff" />สมาชิกลับ</span>}
        {ORGS[id].covert && !m.secret && <span class="muted"><Icon name="eye" />โดนเปิดโปงแล้ว</span>}
        <span class="rank">{rankName(id, m.rank)}</span>
      </header>
      <Ladder steps={ORGS[id].ranks} rank={m.rank} label="ยศ" />
      {need !== undefined ? (
        <p class="merit">
          <span>ผลงาน</span>
          <span class="bar"><i style={{ width: `${Math.min(100, (100 * m.merit) / need)}%` }} /></span>
          <span class="num">{m.merit}/{need}</span>
        </p>
      ) : (
        <p class="merit muted">ถึงยศสูงสุดขององค์กรแล้ว</p>
      )}
      {promotionReady(l, id) && <p class="ready"><Icon name="org" />ผลงานถึงเกณฑ์แล้ว รอวันที่องค์กรเรียก</p>}
      <p class="orgfacts">
        <span>งานที่ทำ <b class="num">{m.done}</b></span>
        <span>งานที่ปัด <b class="num">{m.refused}</b></span>
      </p>
      {tech && (
        <p class={`orgtech ${open ? '' : 'locked'}`}>
          <Icon name={open ? 'role' : 'lock'} />
          <span>
            <b>{tech.th}</b>
            {open ? TECHNIQUE_HELP[tech.kind] : `ได้เมื่อขึ้นเป็น${rankName(id, ORG.techRank)}`}
          </span>
        </p>
      )}
    </article>
  );
}

/** หน้าโลก: องค์กรที่สังกัด และฝ่ายที่กำลังตามล่า ไม่มีทั้งสองอย่างก็ไม่แสดงอะไร */
export function OrgSection() {
  const l = life.value;
  const ids = memberOrgs(l);
  const hunters = Object.entries(l.hunted ?? {}).filter(([, v]) => v > 0);
  if (!ids.length && !hunters.length) return null;
  return (
    <>
      {ids.length > 0 && (
        <section class="sec">
          <h3><Icon name="org" />สังกัด</h3>
          {ids.map((id) => <OrgCard key={id} l={l} id={id} />)}
        </section>
      )}
      {hunters.length > 0 && (
        <section class="sec">
          <h3><Icon name="target" />ผู้ตามล่า</h3>
          <ul class="hunters">
            {hunters.map(([f, v]) => (
              <li key={f}>
                <span>{factionTh(f)}</span>
                <HuntPips level={v} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** ป้ายเหนือเนื้อเรื่อง: เรื่องนี้เป็นงานที่องค์กรส่งมา หรือเป็นฝ่ายที่ตามล่ามาถึงตัว */
export function EventTag({ ev }: { ev: GameEvent }) {
  if (ev.duty) return <p class="evtag"><Icon name="org" />งานจาก{ORGS[ev.duty].th}</p>;
  if (ev.hunt) return <p class="evtag hunt"><Icon name="target" />{factionTh(ev.hunt)}ตามมาถึง</p>;
  return null;
}

/** ป้ายใต้ตัวเลือกที่ปัดงาน: บอกก่อนกดว่าองค์กรจะจำ */
export function RefuseTag() {
  return <span class="tags"><span class="refuse"><Icon name="org" />ปัดงาน ผลงาน <span class="num">{signed(ORG.refused)}</span></span></span>;
}

/** สิ่งที่เปลี่ยนกับองค์กรหลังเหตุการณ์: เข้า ออก เลื่อนยศ ผลงาน และระดับการตามล่า */
export function OrgChanges({ c }: { c: LifeChanges }) {
  return (
    <>
      {(Object.entries(c.orgs ?? {}) as [OrgId, number][]).map(([id, rank]) =>
        rank === 0 ? (
          <span key={`o-${id}`} class="bad"><Icon name="org" />ออกจาก{ORGS[id].th}</span>
        ) : (
          <span key={`o-${id}`} class="good"><Icon name="org" />{rank === 1 ? `เข้า${ORGS[id].th}` : `ขึ้นเป็น${rankName(id, rank)}`}</span>
        ),
      )}
      {(Object.entries(c.merit ?? {}) as [OrgId, number][]).map(([id, d]) => (
        <span key={`m-${id}`} class={d > 0 ? 'good' : 'bad'}><Icon name="org" label={ORGS[id].th} />ผลงาน <span class="num">{signed(d)}</span></span>
      ))}
      {Object.entries(c.hunted ?? {}).map(([f, level]) =>
        level > 0 ? (
          <span key={`h-${f}`} class="bad"><Icon name="target" />{factionTh(f)}ตามล่า <HuntPips level={level} /></span>
        ) : (
          <span key={`h-${f}`} class="good"><Icon name="target" />{factionTh(f)}เลิกตาม</span>
        ),
      )}
    </>
  );
}

/** สิ้นปี: ฝ่ายที่รอยเย็นลงหนึ่งระดับ */
export function CooledChips({ y }: { y: YearEnd }) {
  return <>{(y.cooled ?? []).map((f, i) => <span key={`${f}-${i}`} class="good"><Icon name="target" />{factionTh(f)}ตามน้อยลง</span>)}</>;
}
