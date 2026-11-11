/**
 * เมือง: ตัวละครอยู่ในเมืองได้ มีย่าน มีที่อยู่ มีชั้นของคนเมืองสี่ขั้นที่ขึ้นด้วยผลงาน และเมืองมีสภาพที่เปลี่ยนได้
 *   ที่อยู่     life.city + life.district เมืองอยู่ใต้ location_tag ของถิ่น (CITIES[id].tag) ร้านค้า ฉากหลัง และเรื่องประจำถิ่นยังอ่าน location_tag ตามเดิม
 *              เนื้อเรื่องที่ตั้ง location_tag อย่างเดียวพาไปเมืองหลักของถิ่นนั้นเอง (ถิ่นที่ไม่มีเมืองหลัก = ชนบท)
 *   ชั้น        life.standing[เมือง] = ชั้น ผลงาน ปีที่เริ่มอยู่ ผลงานถึงเกณฑ์ CITY.merit แล้วฉากขึ้นชั้น (when.city.ready) จึงออกได้
 *   ที่อยู่อาศัย  life.home = บ้านของครอบครัว (คนที่เกิดในเมือง) ห้องเช่า (จ่ายค่าเช่าทุก CITY.rentEvery ปี) บ้านหรือร้านของตัวเอง
 *   สภาพเมือง   life.moods[เมือง] = ตึงเครียด จลาจล หรือโรคระบาด (ไม่มี = สงบ) เปลี่ยนด้วยเหตุการณ์ คลายลงเองตามปี และติดไปชีวิตถัดไป (meta.moods)
 * ตัวเลขทั้งหมดอยู่ใน balance.ts (CITY, CITIES) ไฟล์นี้มีแต่วิธีคิด
 */
import { CITIES, CITY, CITY_IDS, CITY_RANKS, type CityId, type CityMood, type HomeKind } from './balance';
import type { CityCond, CityEffect } from './schema';
import { worldYear, type Home, type LifeState, type Standing, type YearEnd } from './state';
import type { Rng } from './rng';

export const isCity = (id: string | null | undefined): id is CityId => !!id && (CITY_IDS as readonly string[]).includes(id);
/** เมืองที่ตัวละครอยู่ตอนนี้ */
export const cityOf = (life: Pick<LifeState, 'city'>): CityId | null => (isCity(life.city) ? life.city : null);
/** เมืองหลักของถิ่น (location_tag) นี้ ถ้ามี */
export const mainCityOf = (tag: string): CityId | null => CITY_IDS.find((id) => CITIES[id].tag === tag && CITIES[id].main) ?? null;
/** ชื่อของที่ที่ตัวละครอยู่: ชื่อเมืองถ้าอยู่ในเมือง */
export const cityName = (life: Pick<LifeState, 'city'>): string | null => (cityOf(life) ? CITIES[cityOf(life)!].th : null);
export const districtName = (city: CityId, district: string | null | undefined): string | null => (district ? (CITIES[city].districts[district] ?? null) : null);
/** ย่านแรกของเมือง: ที่ที่คนมาใหม่ลงหลักปักฐาน */
export const arrivalDistrict = (city: CityId): string => Object.keys(CITIES[city].districts)[0]!;

/** ย่านบ้านเกิดของคนที่เกิดในเมืองนี้ (ดูจากชาติกำเนิด) ไม่ได้เกิดที่นี่ = null */
export function nativeDistrict(life: Pick<LifeState, 'flags'>, city: CityId): string | null {
  for (const [flag, district] of Object.entries(CITIES[city].natives ?? {})) if (life.flags.includes(flag)) return district;
  return null;
}
export const isNative = (life: Pick<LifeState, 'flags'>, city: CityId) => nativeDistrict(life, city) !== null;

export const standingIn = (life: LifeState, city: CityId): Standing | undefined => life.standing?.[city];
/** ชั้นของคนเมืองในเมืองนี้ (0 = ไม่เคยอยู่) */
export const cityRank = (life: LifeState, city: CityId | null = cityOf(life)): number => (city ? (standingIn(life, city)?.rank ?? 0) : 0);
export const cityRankName = (rank: number) => CITY_RANKS[Math.max(1, Math.min(CITY_RANKS.length, rank)) - 1]!;
/** ผลงานที่ต้องมีก่อนขึ้นชั้นถัดไป (ชั้นสูงสุดแล้ว = ไม่มี) */
export const cityMeritForNext = (rank: number): number | undefined => CITY.merit[rank - 1];
/** ผลงานถึงเกณฑ์ของชั้นถัดไปแล้ว รอฉากขึ้นชั้น */
export function cityPromotionReady(life: LifeState, city: CityId | null = cityOf(life)): boolean {
  const s = city ? standingIn(life, city) : undefined;
  const need = s ? cityMeritForNext(s.rank) : undefined;
  return !!s && need !== undefined && s.merit >= need;
}

/** สภาพของเมืองนี้ตอนนี้ */
export const moodOf = (life: Pick<LifeState, 'moods'>, city: CityId): CityMood => life.moods?.[city]?.mood ?? 'calm';

/** ที่อยู่ที่ใช้อยู่จริงตอนนี้: ต้องเป็นที่อยู่ในเมืองที่ตัวละครอยู่ (บ้านที่ทิ้งไว้ในเมืองอื่นยังเป็นของตัวเอง แต่ไม่ได้นอนที่นั่น) */
export function homeHere(life: LifeState): Home | null {
  const city = cityOf(life);
  return city && life.home?.city === city ? life.home : null;
}
/** อยู่บ้านหรือร้านของตัวเองในเมืองที่อยู่ตอนนี้ */
export const ownsHomeHere = (life: LifeState): boolean => ['house', 'shop'].includes(homeHere(life)?.kind ?? '');
/** แต้มบวกของเช็คฤดูหนาวจากการมีหลังคาของตัวเอง */
export const roofBonus = (life: LifeState): number => (ownsHomeHere(life) ? CITY.roof : 0);
/** ร้านค้าของเมืองที่อยู่ปิดเพราะจลาจล */
export const shopsShut = (life: LifeState): boolean => !!cityOf(life) && moodOf(life, cityOf(life)!) === 'riot';

/** เงื่อนไข city ของ when และ requires */
export function cityCondMet(life: LifeState, cond: CityCond): boolean {
  const here = cityOf(life);
  if (cond === 'none') return !here;
  if (!here) return false;
  if (cond === 'any') return true;
  if (typeof cond === 'string') return here === cond;
  if (cond.id !== undefined && !(Array.isArray(cond.id) ? cond.id.includes(here) : cond.id === here)) return false;
  if (cond.district !== undefined) {
    const want = Array.isArray(cond.district) ? cond.district : [cond.district];
    if (!life.district || !want.includes(life.district)) return false;
  }
  const rank = cityRank(life, here);
  if (cond.min_rank !== undefined && rank < cond.min_rank) return false;
  if (cond.max_rank !== undefined && rank > cond.max_rank) return false;
  if (cond.ready !== undefined && cityPromotionReady(life, here) !== cond.ready) return false;
  if (cond.mood && !cond.mood.includes(moodOf(life, here))) return false;
  const home = homeHere(life);
  if (cond.home && !cond.home.includes(home?.kind ?? 'none')) return false;
  if (cond.native !== undefined && isNative(life, here) !== cond.native) return false;
  if (cond.behind !== undefined && !!home?.behind !== cond.behind) return false;
  if (cond.min_years !== undefined && worldYear(life) - (standingIn(life, here)?.since ?? worldYear(life)) < cond.min_years) return false;
  return true;
}

function withStanding(life: LifeState, city: CityId, change: (s: Standing) => Standing): LifeState {
  const s = standingIn(life, city);
  return s ? { ...life, standing: { ...(life.standing ?? {}), [city]: change(s) } } : life;
}

/** ตั้งสภาพของเมือง (calm = ลบออกจากรายการ) สภาพเดิมซ้ำไม่นับปีใหม่ */
export function setMood(life: LifeState, city: CityId, mood: CityMood): LifeState {
  if (moodOf(life, city) === mood) return life;
  const moods = { ...(life.moods ?? {}) };
  if (mood === 'calm') delete moods[city];
  else moods[city] = { mood, since: worldYear(life) };
  return { ...life, moods };
}

/**
 * เข้าอยู่เมืองนี้: ตั้งถิ่น ย่าน และชั้นของคนเมือง (คนที่เกิดในเมืองเริ่มที่ CITY.nativeRank และอยู่บ้านของครอบครัว คนอื่นเริ่มที่ชั้นแรก ยังไม่มีที่อยู่)
 * เคยอยู่เมืองนี้มาก่อน ชั้นและผลงานเดิมยังอยู่ ห้องเช่าในเมืองเก่าหลุดไปเอง ส่วนบ้านหรือร้านของตัวเองยังเป็นของตัวเอง
 */
export function enterCity(life: LifeState, city: CityId, district?: string): LifeState {
  const def = CITIES[city];
  const born = nativeDistrict(life, city);
  const at = district && def.districts[district] ? district : cityOf(life) === city && life.district ? life.district : (born ?? arrivalDistrict(city));
  let next: LifeState = { ...life, city, district: at, locationTag: def.tag, homeTag: life.homeTag ?? def.tag };
  if (!standingIn(next, city)) {
    const rank = born ? CITY.nativeRank : 1;
    next = { ...next, standing: { ...(next.standing ?? {}), [city]: { rank, merit: rank > 1 ? CITY.merit[rank - 2]! : 0, since: worldYear(next) } } };
  }
  if (next.home && next.home.city !== city && (next.home.kind === 'room' || next.home.kind === 'family')) next = { ...next, home: null };
  if (!next.home && born) next = { ...next, home: { kind: 'family', city, district: born, since: worldYear(next) } };
  return next;
}

/** ออกจากเมืองไปอยู่ชนบทของถิ่นเดียวกัน (หรือถิ่นอื่นเมื่อ location_tag เปลี่ยน) ห้องเช่าหลุดไป บ้านของตัวเองยังอยู่ */
export function leaveCity(life: LifeState): LifeState {
  if (!cityOf(life)) return life;
  const home = life.home && (life.home.kind === 'room' || life.home.kind === 'family') ? null : life.home;
  return { ...life, city: null, district: null, home };
}

/**
 * ให้เมืองตรงกับถิ่น: เรียกหลังผลที่ตั้ง location_tag และตอนโหลดเซฟเก่า
 * ถิ่นที่มีเมืองหลัก (เวนทราส คาร์ดิน ฮอร์ดุน) = อยู่เมืองหลักนั้น เว้นแต่อยู่อีกเมืองของถิ่นเดียวกันอยู่แล้ว ถิ่นที่ไม่มีเมืองหลัก = ออกจากเมืองที่ไม่ได้อยู่ในถิ่นนั้น
 */
export function syncCity(life: LifeState): LifeState {
  const here = cityOf(life);
  if (here && CITIES[here].tag === life.locationTag) return standingIn(life, here) ? life : enterCity(life, here);
  const main = mainCityOf(life.locationTag);
  if (main) return enterCity(life, main);
  return here ? leaveCity(life) : life;
}

/** ผลของ effects.city (หลังผลอื่นของ effect เดียวกัน รวมทั้ง location_tag) */
export function applyCityEffects(life: LifeState, fx: CityEffect | undefined): LifeState {
  if (!fx) return life;
  let next = life;
  if (fx.move) next = enterCity(next, fx.move, fx.district);
  else if (fx.leave) next = leaveCity(next);
  const here = cityOf(next);
  if (!fx.move && fx.district && here && CITIES[here].districts[fx.district]) next = { ...next, district: fx.district };
  if (fx.home && here) {
    if (fx.home === 'none') next = { ...next, home: null };
    else next = { ...next, home: { kind: fx.home as HomeKind, city: here, district: next.district ?? arrivalDistrict(here), since: worldYear(next) } };
  }
  const target = fx.of ?? here;
  if (target) {
    if (fx.merit) next = withStanding(next, target, (s) => ({ ...s, merit: Math.max(0, s.merit + fx.merit!) }));
    if (fx.promote) next = withStanding(next, target, (s) => ({ ...s, rank: Math.min(CITY_RANKS.length, s.rank + 1) }));
    if (fx.mood) next = setMood(next, target, fx.mood);
  }
  return next;
}

/**
 * สิ้นปีของชีวิตในเมือง: ค่าเช่าห้อง (ทุก CITY.rentEvery ปี) รายได้ของร้าน (ทุก CITY.shopEvery ปี เว้นปีจลาจล)
 * และสภาพของทุกเมืองที่ไม่สงบมีโอกาสคลายลงเองหนึ่งขั้น บันทึกลง rec ให้หน้าจอแสดง คืนรหัสประโยค (content/lines.yaml) ที่ควรเติมท้ายบันทึกของปี
 */
export function cityYear(life: LifeState, rng: Rng, rec: YearEnd): { life: LifeState; lines: string[] } {
  let next = life;
  const lines: string[] = [];
  const year = worldYear(next);
  const home = homeHere(next);
  if (home && year > home.since) {
    const lived = year - home.since;
    if (home.kind === 'room' && lived % CITY.rentEvery === 0) {
      if (next.gold >= CITY.rent) {
        next = { ...next, gold: next.gold - CITY.rent, home: { ...home, behind: false } };
        rec.rent = { paid: CITY.rent };
        lines.push('rent_paid');
      } else if (home.behind) {
        next = { ...next, home: null };
        rec.rent = { evicted: true };
        lines.push('rent_evicted');
      } else {
        next = { ...next, home: { ...home, behind: true } };
        rec.rent = { behind: true };
        lines.push('rent_behind');
      }
    }
    if (home.kind === 'shop' && lived % CITY.shopEvery === 0 && moodOf(next, home.city) !== 'riot') {
      next = { ...next, gold: next.gold + CITY.shopIncome };
      rec.income = CITY.shopIncome;
      lines.push('shop_income');
    }
  }
  const here = cityOf(next);
  for (const id of CITY_IDS) {
    const m = next.moods?.[id];
    if (!m || m.since >= year) continue;
    if (rng.next() >= CITY.ease[m.mood]) continue;
    const eased: CityMood = m.mood === 'riot' ? 'tense' : 'calm';
    next = setMood(next, id, eased);
    (rec.eased ??= {})[id] = eased;
    if (id === here) lines.push(`mood_${m.mood}_eases`);
  }
  return { life: next, lines };
}
