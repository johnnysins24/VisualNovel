import { CITIES, CITY, CITY_MOOD_TH, CITY_RANKS, COURSES, HOME_TH, type CityId, type CityMood } from '../engine/balance';
import { cityMeritForNext, cityOf, cityPromotionReady, cityRank, isNative, moodOf, standingIn } from '../engine/cities';
import { worldYear, type Home, type LifeChanges, type LifeState, type YearEnd } from '../engine/state';
import { life } from '../store';
import { Icon, type IconName } from './icons';
import { Ladder } from './Orgs';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

const MOOD_ICON: Record<CityMood, IconName> = { calm: 'sun', tense: 'cloud', riot: 'flame', plague: 'drop' };

/** ป้ายสภาพเมือง: สงบ ตึงเครียด จลาจล โรคระบาด */
export function MoodBadge({ mood }: { mood: CityMood }) {
  return <span class={`mood m-${mood}`}><Icon name={MOOD_ICON[mood]} />{CITY_MOOD_TH[mood]}</span>;
}

/** อีกกี่ปีถึงรอบถัดไป (ค่าเช่าหรือรายได้ของร้าน) นับจากปีที่เริ่มอยู่ */
const yearsToNext = (l: LifeState, home: Home, every: number) => every - ((worldYear(l) - home.since) % every);

/** บรรทัดที่อยู่: ห้องเช่ากับรอบสัญญา บ้าน หรือร้านกับรอบรายได้ */
function HomeLine({ l, home }: { l: LifeState; home: Home | null }) {
  if (!home && l.course) return <p class="homeline"><Icon name="book" /><span><b>ที่พักของนักเรียน</b>{COURSES[l.course.id].th}<small>อยู่ได้ตลอดช่วงที่ยังเรียน</small></span></p>;
  if (!home) return <p class="homeline none"><Icon name="kin" /><span><b>ยังไม่มีที่อยู่</b>นอนตามที่หาได้ไปก่อน</span></p>;
  const where = CITIES[home.city].districts[home.district] ?? '';
  let note = '';
  if (home.kind === 'room') note = home.behind ? '' : `ครบรอบสัญญาอีก ${yearsToNext(l, home, CITY.rentEvery)} ปี (${CITY.rent} เหรียญ)`;
  if (home.kind === 'shop') note = moodOf(l, home.city) === 'riot' ? 'ปิดร้านจนกว่าเมืองจะสงบ' : `รายได้รอบถัดไปอีก ${yearsToNext(l, home, CITY.shopEvery)} ปี`;
  if (home.kind === 'house') note = 'อุ่นขึ้นหนึ่งขั้นในฤดูหนาว';
  return (
    <p class={`homeline ${home.behind ? 'behind' : ''}`}>
      <Icon name={home.kind === 'shop' ? 'shop' : 'kin'} />
      <span>
        <b>{HOME_TH[home.kind]}</b>{where}
        {home.behind && <em>ค้างค่าเช่าหนึ่งรอบ ค้างอีกรอบต้องคืนกุญแจ</em>}
        {note && <small>{note}</small>}
      </span>
    </p>
  );
}

function CityCard({ l, id }: { l: LifeState; id: CityId }) {
  const def = CITIES[id];
  const s = standingIn(l, id)!;
  const rank = cityRank(l, id);
  const need = cityMeritForNext(rank);
  const home = l.home && l.home.city === id ? l.home : null;
  const lived = worldYear(l) - s.since;
  return (
    <article class="citycard">
      <header>
        <b>{def.th}</b>
        <MoodBadge mood={moodOf(l, id)} />
        <span class="rank">{CITY_RANKS[rank - 1]}</span>
      </header>
      <ul class="districts" aria-label="ย่าน">
        {Object.entries(def.districts).map(([d, th]) => (
          <li key={d} class={d === l.district ? 'now' : ''} aria-current={d === l.district ? 'location' : undefined}>
            {home?.district === d && <Icon name={home.kind === 'shop' ? 'shop' : 'kin'} label="ที่อยู่" />}
            {th}
          </li>
        ))}
      </ul>
      <Ladder steps={CITY_RANKS} rank={rank} label="ชั้นของคนเมือง" />
      {need !== undefined ? (
        <p class="merit">
          <span>ที่ย่านจำได้</span>
          <span class="bar"><i style={{ width: `${Math.min(100, (100 * s.merit) / need)}%` }} /></span>
          <span class="num">{s.merit}/{need}</span>
        </p>
      ) : (
        <p class="merit muted">ถึงชั้นสูงสุดของเมืองแล้ว</p>
      )}
      {cityPromotionReady(l, id) && <p class="ready"><Icon name="flag" />ย่านจำชื่อนี้ได้พอแล้ว รอวันที่มีคนเอ่ยถึง</p>}
      <HomeLine l={l} home={home} />
      <p class="orgfacts"><span>อยู่มา <b class="num">{lived}</b> ปี</span></p>
    </article>
  );
}

/** ช่วงเรียน: ปีที่เรียนอยู่เป็นขีด และสำนักที่เลือก */
function CourseCard({ l }: { l: LifeState }) {
  const c = l.course!;
  const def = COURSES[c.id];
  return (
    <article class="citycard course">
      <header>
        <b>{def.th}</b>
        <span class="rank">ปี {c.year} จาก {def.years}</span>
      </header>
      <p class="years" role="img" aria-label={`ปี ${c.year} จาก ${def.years}`} style={{ gridTemplateColumns: `repeat(${def.years}, 1fr)` }}>
        {Array.from({ length: def.years }, (_, i) => <i key={i} class={i + 1 < c.year ? 'past' : i + 1 === c.year ? 'now' : ''} />)}
      </p>
      <p class="orgfacts"><span>{c.track ? def.tracks[c.track] : 'ยังไม่ได้เลือกสำนัก'}</span></p>
    </article>
  );
}

/** หน้าโลก: เมืองที่อยู่ (ย่าน ชั้นของคนเมือง ที่อยู่ สภาพเมือง) ช่วงเรียน และทรัพย์สินที่อยู่เมืองอื่น ไม่ได้อยู่เมืองและไม่มีอะไรเลยก็ไม่แสดง */
export function CitySection() {
  const l = life.value;
  const here = cityOf(l);
  const away = l.home && l.home.city !== here ? l.home : null;
  if (!here && !away && !l.course) return null;
  return (
    <>
      {l.course && (
        <section class="sec">
          <h3><Icon name="book" />การเรียน</h3>
          <CourseCard l={l} />
        </section>
      )}
      {(here || away) && (
        <section class="sec">
          <h3><Icon name="kin" />เมือง</h3>
          {here && <CityCard l={l} id={here} />}
          {away && (
            <p class="homeline away">
              <Icon name={away.kind === 'shop' ? 'shop' : 'kin'} />
              <span><b>{HOME_TH[away.kind]}</b>ที่{CITIES[away.city].th} {CITIES[away.city].districts[away.district]}<small>ยังเป็นของตัวเอง กลับไปเมื่อไรก็อยู่ต่อได้</small></span>
            </p>
          )}
        </section>
      )}
    </>
  );
}

/** สภาพเมืองที่เพิ่งเปลี่ยน เขียนต่อท้ายชื่อเมือง */
const MOOD_TURN: Record<CityMood, string> = { calm: 'สงบลง', tense: 'ตึงเครียด', riot: 'เกิดจลาจล', plague: 'มีโรคระบาด' };
const HOME_GOT: Record<Home['kind'], string> = { family: 'กลับเข้าบ้านของครอบครัว', room: 'ได้ห้องเช่า', house: 'ได้บ้านของตัวเอง', shop: 'ได้ร้านของตัวเอง' };

/** สิ่งที่เปลี่ยนกับเมืองหลังเหตุการณ์: ย้ายเข้า ขึ้นชั้น แต้มที่ย่านจำได้ สภาพเมือง และที่อยู่ */
export function CityChanges({ c }: { c: LifeChanges }) {
  const l = life.value;
  return (
    <>
      {(Object.entries(c.standing ?? {}) as [CityId, number][]).map(([id, rank]) =>
        // คนที่เกิดในเมืองได้ชั้นของคนเกิดที่นี่มาตั้งแต่แรก ไม่ใช่สิ่งที่เพิ่งเปลี่ยน
        rank === CITY.nativeRank && isNative(l, id) ? null : (
          <span key={`s-${id}`} class="good"><Icon name="place" />{rank <= 1 ? `ย้ายเข้า${CITIES[id].th}` : `ขึ้นเป็น${CITY_RANKS[rank - 1]}`}</span>
        ),
      )}
      {(Object.entries(c.cityMerit ?? {}) as [CityId, number][]).map(([id, d]) => (
        <span key={`m-${id}`} class={d > 0 ? 'good' : 'bad'}><Icon name="kin" label={CITIES[id].th} />ที่ย่านจำได้ <span class="num">{signed(d)}</span></span>
      ))}
      {(Object.entries(c.moods ?? {}) as [CityId, CityMood][]).map(([id, mood]) => (
        <span key={`d-${id}`} class={mood === 'calm' ? 'good' : `m-${mood}`}><Icon name={MOOD_ICON[mood]} />{CITIES[id].th}{MOOD_TURN[mood]}</span>
      ))}
      {c.home && (c.home === 'none' ? <span><Icon name="kin" />ออกจากที่อยู่เดิม</span> : <span class="good"><Icon name={c.home === 'shop' ? 'shop' : 'kin'} />{HOME_GOT[c.home]}</span>)}
    </>
  );
}

/** สิ้นปี: ค่าเช่าที่จ่ายหรือค้าง รายได้ของร้าน และเมืองที่สภาพคลายลงเอง */
export function CityYearChips({ y }: { y: YearEnd }) {
  return (
    <>
      {y.rent?.paid ? <span class="bad"><Icon name="coin" label="ทอง" />ค่าเช่า <span class="num">-{y.rent.paid}</span></span> : null}
      {y.rent?.behind && <span class="bad"><Icon name="kin" />ค้างค่าเช่า</span>}
      {y.rent?.evicted && <span class="bad"><Icon name="kin" />ต้องคืนกุญแจห้อง</span>}
      {y.income ? <span class="gold"><Icon name="coin" label="ทอง" />ร้าน <span class="num">+{y.income}</span></span> : null}
      {(Object.entries(y.eased ?? {}) as [CityId, CityMood][]).map(([id, mood]) => (
        <span key={id} class="good"><Icon name={MOOD_ICON[mood]} />{CITIES[id].th}{mood === 'calm' ? 'สงบลง' : `คลายเป็น${CITY_MOOD_TH[mood]}`}</span>
      ))}
    </>
  );
}

/** จุดสีของสภาพเมืองต่อท้ายชื่อเมืองบนแถบบน เมืองสงบไม่มีจุด (Phupha เลือกแบบ ข เมื่อ 12 พ.ย. 2026) */
export function MoodDot({ l }: { l: LifeState }) {
  const here = cityOf(l);
  const mood = here ? moodOf(l, here) : 'calm';
  return mood === 'calm' ? null : <i class={`mooddot m-${mood}`} role="img" aria-label={CITY_MOOD_TH[mood]} title={CITY_MOOD_TH[mood]} />;
}
