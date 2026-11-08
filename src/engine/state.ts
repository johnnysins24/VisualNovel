import type { Bond, KinRole, Slot, Stat } from './schema';
import { STATS } from './schema';
import { BIRTH_YEAR, EVEN_AGING_UNTIL, RACES, type RaceId, type WorldKey } from './balance';
import { Rng } from './rng';
import type { Meta } from './meta';

export type Gender = 'm' | 'f';

export interface LifeState {
  version: 2;
  seed: number;
  rngState: number;
  name: string;
  gender: Gender;
  /** ปีเกิดในโลก ปีปัจจุบัน = birthYear + age */
  birthYear: number;
  age: number;
  hp: number;
  baseMaxHp: number;
  gold: number;
  stats: Record<Stat, number>;
  flags: string[];
  traits: string[];
  inventory: string[];
  equipped: Partial<Record<Slot, string>>;
  locationTag: string;
  /** location_tag แรกที่ตั้ง (ถิ่นเกิด) ใช้กับพราน */
  homeTag: string | null;
  classId: string | null;
  god: string | null;
  /** เผ่าที่ได้โบนัสแล้ว (กันให้ซ้ำ) */
  raceApplied: string | null;
  /** พ่อแม่ที่สุ่มจากกลุ่มชื่อของเผ่า null จนกว่าจะรู้เผ่า */
  parents: { father: string; mother: string } | null;
  /** นามสกุล/ตระกูลจากกลุ่มชื่อ (ว่างได้) */
  surname: string;
  /** กลุ่มชื่อที่เลือกด้วย effects.name_pool (ทับค่าตามเผ่า) */
  namePool: { self?: string; parents?: string };
  /** สุ่มชื่อแล้วหรือยัง */
  namesApplied: boolean;
  /** คนรักหรือคู่ครอง ชื่อสุ่มจากกลุ่มชื่อ pool ตอน settle (L16: เพศใดก็ได้) */
  partner: Partner | null;
  /** ซ่อนจากผู้เล่น */
  world: Record<WorldKey, number>;
  alignment: { law: number; moral: number };
  /** เริ่มจากชื่อเสียงที่ติดมาจากชีวิตก่อน แล้วเปลี่ยนตามชีวิตนี้ */
  reputation: Record<string, number>;
  seen: string[];
  log: LogEntry[];
  alive: boolean;
  /** null ระหว่างยังมีชีวิต */
  endReason: EndReason | null;
  /** คนในชีวิตนอกจากพ่อแม่ ดู effects.people */
  people: Person[];
  currentEventId: string | null;
}

export interface Partner {
  /** ว่างจนกว่า settle จะสุ่มชื่อให้ */
  name: string;
  gender: Gender;
  /** id กลุ่มชื่อใน names.yaml */
  pool: string;
}

export interface LogEntry {
  age: number;
  eventId: string;
  choiceId: string;
  roll?: { d20: number; mod: number; dc: number; success: boolean };
  text?: string;
  /** สิ่งที่เปลี่ยนจากตัวเลือกนี้ ใช้แสดงเป็นสัญลักษณ์ใต้ย่อหน้า (เซฟเก่าไม่มี) */
  changes?: LifeChanges;
}

export interface Person {
  id: string;
  name: string;
  gender?: 'm' | 'f';
  kin?: KinRole;
  bond?: Bond;
  /** −5 ถึง 5 */
  closeness: number;
  alive: boolean;
  /** อายุของผู้เล่นตอนรู้จัก */
  metAge: number;
  /** อายุของผู้เล่นตอนคนนี้ตาย */
  diedAge?: number;
}

/** ชีวิตจบเพราะตายจริง หรือเพราะเนื้อเรื่องที่เขียนไว้หมดก่อน */
export type EndReason = 'death' | 'content_end';

export interface LifeChanges {
  stats?: Partial<Record<Stat, number>>;
  hp?: number;
  gold?: number;
  items?: string[];
  traits?: string[];
  classId?: string;
}

export const DEFAULT_NAME = 'ผู้เดินทาง';

/** เพศและปีเกิดสุ่มจาก seed ทำให้ชีวิตเดียวกันเกิดซ้ำได้ */
export function newLife(seed: number, meta?: Pick<Meta, 'reputation'>): LifeState {
  const rng = new Rng(seed);
  const gender: Gender = rng.int(0, 1) === 0 ? 'm' : 'f';
  const birthYear = rng.int(BIRTH_YEAR.min, BIRTH_YEAR.max);
  const stats = Object.fromEntries(STATS.map((s) => [s, 10])) as Record<Stat, number>;
  return {
    version: 2,
    seed,
    rngState: rng.state,
    name: DEFAULT_NAME,
    gender,
    birthYear,
    age: 0,
    hp: 10,
    baseMaxHp: 10,
    gold: 0,
    stats,
    flags: [],
    traits: [],
    inventory: [],
    equipped: {},
    locationTag: 'village',
    homeTag: null,
    classId: null,
    god: null,
    raceApplied: null,
    parents: null,
    surname: '',
    namePool: {},
    namesApplied: false,
    partner: null,
    world: { gods: 0, demon: 0, star: 0 },
    alignment: { law: 0, moral: 0 },
    reputation: { ...(meta?.reputation ?? {}) },
    seen: [],
    log: [],
    alive: true,
    endReason: null,
    people: [],
    currentEventId: null,
  };
}

export const modifier = (score: number) => Math.floor((score - 10) / 2);
export const worldYear = (life: Pick<LifeState, 'birthYear' | 'age'>) => life.birthYear + life.age;

/** จำนวนปีจริงต่อหนึ่งปีชีวิตแบบมนุษย์ (เอลฟ์ 10 คนแคระ 5) ยังไม่รู้เผ่าใช้ 1 */
export const ageScale = (life: Pick<LifeState, 'raceApplied'>) => RACES[life.raceApplied as RaceId]?.ageScale ?? 1;

/**
 * อายุเทียบมนุษย์ ใช้กับ when.age ในเนื้อหา: จนถึง EVEN_AGING_UNTIL เท่าอายุจริงทุกเผ่า หลังจากนั้นเอลฟ์และคนแคระโตช้ากว่า
 * เขียนเนื้อหาครั้งเดียวด้วยอายุแบบมนุษย์ แล้วระบบยืดช่วงหลังจากนั้นให้เอง ส่วน life.age คืออายุจริงที่แสดงในเกม
 */
export const humanAge = (life: Pick<LifeState, 'age' | 'raceApplied'>) =>
  life.age <= EVEN_AGING_UNTIL ? life.age : EVEN_AGING_UNTIL + (life.age - EVEN_AGING_UNTIL) / ageScale(life);

/** ปีที่ผ่านต่อหนึ่งเหตุการณ์: 1 ปีจนถึง EVEN_AGING_UNTIL หลังจากนั้นเท่า ageScale (จำนวนเหตุการณ์ต่อช่วงชีวิตเท่ามนุษย์) */
export const yearsPerEvent = (life: Pick<LifeState, 'age' | 'raceApplied'>) => (life.age < EVEN_AGING_UNTIL ? 1 : ageScale(life));
