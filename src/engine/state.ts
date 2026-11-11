import type { Bond, DeathCause, EncounterEnd, KinRole, Slot, Stat } from './schema';
import { STATS } from './schema';
import { BIRTH_YEAR, EVEN_AGING_UNTIL, RACES, type CityId, type CityMood, type CourseId, type HomeKind, type MaterialId, type OrgId, type RaceId, type TechniqueKind, type WorldKey } from './balance';
import { Rng } from './rng';
import type { Meta } from './meta';

export type Gender = 'm' | 'f';

export interface LifeState {
  version: 3;
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
  /** รหัสสิ่งติดตัว (ลักษณะ พร คำสาป แผล) ตามทะเบียน content/traits.yaml */
  traits: string[];
  /** ขั้นของสิ่งติดตัวที่มีหลายขั้น ไม่มีในนี้ = ขั้น 1 */
  traitSteps: Record<string, number>;
  /** จำนวนครั้งที่เลือกทางของแต่ละนิสัย (choice.habit) นับเฉพาะครั้งแรกที่เจอเหตุการณ์นั้น */
  habits: Record<string, number>;
  /** จำนวนครั้งที่ทางของแต่ละนิสัยมีให้เลือก (นับแบบเดียวกับ habits) นิสัยก่อตัวเมื่อเลือกครบ HABIT_COUNT และเลือกไม่น้อยกว่า HABIT_SHARE ของครั้งที่มีให้เลือก */
  habitOffers: Record<string, number>;
  inventory: string[];
  equipped: Partial<Record<Slot, string>>;
  /** ของใช้แล้วหมดที่พกอยู่: รหัสของ → จำนวน (ไม่เกิน GEAR.stack ต่อชนิด) */
  supplies: Record<string, number>;
  /** จำนวนปีที่สวมของวัสดุนั้นข้ามปีมาแล้ว ใช้กับราคาของวัสดุ (เงินดาวทิ้งรอยดาว หินถ่านมารทำให้ศาสนจักรจับตา) */
  worn: Partial<Record<MaterialId, number>>;
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
  /** กำลังจะตายด้วยเหตุนี้ เหตุการณ์ถัดไปคือฉากตาย พอเลือกในฉากนั้นแล้วชีวิตจึงจบ */
  dying: DeathCause | null;
  /** ข้อความที่ทำให้กำลังจะตายเล่าความตายไปแล้วหรือยัง (ผลที่มี die = เล่าแล้ว) ใช้เลือกฉากตาย ดู when.told */
  deathTold?: boolean;
  /** เหตุที่ตาย (หลังชีวิตจบ) */
  deathCause: DeathCause | null;
  /** ประโยคสุดท้ายของชีวิต จากฉากตาย ใช้ในหน้าชีวประวัติ */
  epitaph: string;
  /** คนในชีวิต รวมพ่อแม่ คู่ครอง และลูก ดู effects.people */
  people: Person[];
  currentEventId: string | null;
  /** ตัวแสดงของเหตุการณ์ปัจจุบัน: ชื่อบท → id ของคน */
  cast: Record<string, string>;
  /** จำนวนปีจริงที่เหตุการณ์ปัจจุบันจะกินเวลา (เฉพาะเหตุการณ์ที่เล่าหลายปี) กำหนดตอนเลือกเหตุการณ์ ข้อความ {years} จึงตรงกับเวลาที่เดินจริง */
  span?: number;
  /** ลูกที่เพิ่งเกิดจากผลของตัวเลือก รอ settle ตั้งชื่อและใส่ลงผัง (ไม่ค้างข้ามเหตุการณ์) */
  pendingChildren?: { gender?: 'm' | 'f' | undefined; horned?: boolean | undefined }[];
  /** การปะทะที่กำลังเดินอยู่ (เหตุการณ์ปัจจุบันมี encounter) ไม่มี = ไม่ได้อยู่ในการปะทะ */
  encounter?: EncounterState;
  /** องค์กรที่เป็นสมาชิกอยู่ (กติกาใน orgs.ts) ไม่มีในนี้ = ไม่ได้เป็นสมาชิก */
  orgs: Partial<Record<OrgId, Membership>>;
  /** ภัยตามล่า: ฝ่าย (FACTIONS) → ระดับ 1 ถึง ORG.huntMax ไม่มีในนี้ = ไม่มีใครตาม */
  hunted: Record<string, number>;
  /** เมืองที่อยู่ตอนนี้ (กติกาใน cities.ts) null = อยู่ชนบทของถิ่น locationTag */
  city: CityId | null;
  /** ย่านที่อยู่ในเมืองนั้น (รหัสใน CITIES[city].districts) */
  district: string | null;
  /** ที่อยู่ในเมือง: บ้านของครอบครัว ห้องเช่า หรือบ้านกับร้านของตัวเอง null = ไม่มีที่อยู่เป็นหลักแหล่ง */
  home: Home | null;
  /** ชั้นของคนเมืองในแต่ละเมืองที่เคยอยู่ ไม่มีในนี้ = ไม่เคยอยู่ */
  standing: Partial<Record<CityId, Standing>>;
  /** สภาพของเมืองที่ไม่สงบ (เมืองที่ไม่มีในนี้ = สงบ) เริ่มจากที่ชีวิตก่อนทิ้งไว้ แล้วเปลี่ยนตามเหตุการณ์และคลายลงเองตามปี */
  moods: Partial<Record<CityId, MoodState>>;
  /** หลักสูตรที่กำลังเรียน (กติกาใน course.ts) ไม่มี = ไม่ได้เรียนอยู่ */
  course?: CourseState;
}

/** ชั้นของคนเมืองในเมืองหนึ่ง */
export interface Standing {
  /** ชั้น 1 ถึง 4 (CITY_RANKS) */
  rank: number;
  /** ผลงานสะสมต่อเมือง ถึงเกณฑ์ CITY.merit เมื่อไรฉากขึ้นชั้นจึงออกได้ */
  merit: number;
  /** ปีของโลกที่เริ่มอยู่เมืองนี้ (คนที่เกิดในเมือง = ปีเกิด) */
  since: number;
}

/** ที่อยู่ในเมือง */
export interface Home {
  kind: HomeKind;
  city: CityId;
  district: string;
  /** ปีของโลกที่เริ่มอยู่ที่นี่ ค่าเช่าและรายได้ของร้านนับรอบจากปีนี้ */
  since: number;
  /** ค้างค่าเช่ารอบล่าสุด */
  behind?: boolean;
}

/** สภาพที่ไม่สงบของเมืองหนึ่ง */
export interface MoodState {
  mood: Exclude<CityMood, 'calm'>;
  /** ปีของโลกที่เริ่มเป็นแบบนี้ */
  since: number;
}

/** หลักสูตรที่กำลังเรียน */
export interface CourseState {
  id: CourseId;
  /** ปีที่เรียนอยู่ เริ่มที่ 1 */
  year: number;
  /** สาย (สำนัก) ที่เลือกแล้ว */
  track?: string;
  /** ปีของโลกที่เข้าเรียน */
  since: number;
}

/** สถานะสมาชิกขององค์กรหนึ่ง */
export interface Membership {
  /** ยศ 1 ถึง 4 */
  rank: number;
  /** ปีของโลกที่เข้า */
  joined: number;
  /** ผลงานสะสม ถึงเกณฑ์ ORG.merit เมื่อไรฉากเลื่อนยศจึงออกได้ */
  merit: number;
  /** งานที่ทำสำเร็จ และงานที่ปฏิเสธ */
  done: number;
  refused: number;
  /** เป็นสมาชิกแบบลับ คนนอกไม่รู้ */
  secret?: boolean;
}

/**
 * แต้มพิเศษของหนึ่งจังหวะ: รับสัญญาณ ตรงจุดอ่อน ชนจุดแข็ง มีคนช่วย ท่าของอาชีพ
 * edge = วัสดุของของที่สวมได้เปรียบศัตรูฝ่ายนี้ · heavy = เกราะหนักถ่วงตอนหนี · supply = ของใช้แล้วหมดที่ใช้ในจังหวะนี้
 * by = รหัสของที่ทำให้ได้แต้มนี้ (ป้ายของอาวุธที่ตรงจุดอ่อน ของที่ทำจากวัสดุที่ได้เปรียบ ของที่ใช้)
 */
export interface OddsPart {
  kind: 'tell' | 'weak' | 'strong' | 'ally' | 'tech' | 'edge' | 'heavy' | 'supply';
  amount: number;
  by?: string;
}

/** ผลของหนึ่งจังหวะในการปะทะ */
export interface BeatRecord {
  moveId: string;
  stat: Stat;
  d20: number;
  mod: number;
  dc: number;
  success: boolean;
  /** แต้มพิเศษที่รวมอยู่ใน mod แล้ว */
  parts?: OddsPart[];
  /** สิ่งติดตัวที่บวกหรือลบแต้มในการทอยนี้ (รวมอยู่ใน mod แล้ว) */
  traits?: { id: string; amount: number }[];
  /** ข้อความผลของจังหวะ ยังไม่เติมชื่อ */
  text?: string;
  /** พลังชีวิตที่เสียในจังหวะนี้ */
  damage?: number;
  /** แรงใจของศัตรูที่ลดในจังหวะนี้ */
  pips?: number;
  /** สิ่งที่กันไม่ให้เสียพลังชีวิต: โล่ หรือพรของนักบวช */
  blocked?: 'shield' | 'ward';
  /** ท่าของอาชีพที่ใช้ในจังหวะนี้ */
  tech?: TechniqueKind;
  /** ทอยใหม่หลังพลาดครั้งแรก (ท่าของนักรบ หรือของที่ให้ทอยใหม่) */
  rerolled?: boolean;
  /** ของใช้แล้วหมดที่ใช้ในจังหวะนี้ และพลังชีวิตที่ของนั้นฟื้นให้ */
  supply?: string;
  healed?: number;
}

export interface EncounterState {
  /** จังหวะปัจจุบัน เริ่มที่ 0 */
  beat: number;
  /** แรงใจของศัตรูที่เหลือ */
  morale: number;
  /** พลังชีวิตตอนเริ่ม ใช้ตัดสินว่าเจ็บหนักจนได้แผลติดตัวไหม */
  hpStart: number;
  techUsed: boolean;
  /** องค์กรที่ท่าของมันถูกใช้ไปแล้วในการปะทะนี้ */
  orgTechUsed?: OrgId[];
  shieldUsed: boolean;
  /** ของที่ให้ทอยใหม่ใช้ไปแล้วหรือยัง (ครั้งเดียวต่อการปะทะ) */
  rerollUsed: boolean;
  /** ตัวละครรู้จุดอ่อนของศัตรูตัวนี้ไหม (รู้มาก่อน อ่านทางสำเร็จ หรือเป็นพราน) */
  weakKnown: boolean;
  /** รู้จุดอ่อนมาตั้งแต่ก่อนเริ่มการปะทะนี้ */
  knew: boolean;
  /** จังหวะที่อ่านจุดอ่อนออก (เฉพาะเมื่อไม่ได้รู้มาก่อน) */
  learned?: number;
  records: BeatRecord[];
}

/** การปะทะที่จบแล้ว เก็บในบันทึกชีวิต */
export interface EncounterLog {
  foe: string;
  name: string;
  end: EncounterEnd;
  /** แรงใจตั้งต้นของศัตรู */
  morale: number;
  /** รู้จุดอ่อนมาตั้งแต่ก่อนเริ่ม และจังหวะที่อ่านจุดอ่อนออก ใช้บอกในบันทึกว่าตัวละครรู้อะไรเมื่อไร */
  knew?: boolean;
  learned?: number;
  records: BeatRecord[];
  /** ของหรือเหรียญที่ศัตรูทิ้งไว้เมื่อชนะ (ประโยคตอนเจออยู่ท้ายข้อความของการปะทะ) */
  loot?: { item?: string; gold?: number };
  /** เหรียญที่โรงรับเขี้ยวจ่ายให้สมาชิกเมื่อชนะสิ่งที่ไม่ใช่คน */
  bounty?: number;
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
  /** traits = สิ่งติดตัวที่บวกหรือลบแต้มในการทอยนี้ (รวมอยู่ใน mod แล้ว) ใช้บอกที่มาบนหน้าจอ */
  roll?: { d20: number; mod: number; dc: number; success: boolean; traits?: { id: string; amount: number }[] };
  text?: string;
  /** สิ่งที่เปลี่ยนจากตัวเลือกนี้ ใช้แสดงเป็นสัญลักษณ์ใต้ย่อหน้า (เซฟเก่าไม่มี) */
  changes?: LifeChanges;
  /** ตัวแสดงของเหตุการณ์นี้ (ชื่อบท → id ของคน) ใช้เติมชื่อตอนอ่านย้อน */
  cast?: Record<string, string>;
  /** ป้ายบนเส้นชีวิตในหน้าชีวประวัติ (เติมชื่อแล้ว) */
  mark?: string;
  /** จำนวนปีที่เหตุการณ์นี้กินเวลา (เฉพาะเหตุการณ์ที่เล่าหลายปีรวบเดียว) */
  span?: number;
  /** สิ่งที่เกิดตอนสิ้นปี: ร่างกายโรย เช็คฤดูหนาว ข่าวคนรอบตัวจากไป */
  year?: YearEnd;
  /** เหตุการณ์นี้เป็นการปะทะ: ผลของทุกจังหวะและวิธีที่จบ (choiceId คือวิธีที่จบ เช่น win) */
  encounter?: EncounterLog;
}

export interface YearEnd {
  /** ค่าที่ลดเพราะร่างกายโรย (ตัวละหนึ่งแต้มต่อรายการ) */
  decline?: Stat[];
  /** เช็คฤดูหนาวของปีนี้ lost = พลังชีวิตสูงสุดที่เสียถาวร */
  winter?: { d20: number; mod: number; dc: number; success: boolean; lost: number };
  /** id ของคนที่จากไปตามวัยในปีนี้ */
  passed?: string[];
  /** สิ่งติดตัวที่ได้หรือที่ลุกลามในปีนี้เพราะของที่สวม (รอยดาวจากเงินดาว) */
  marks?: string[];
  /** ฝ่ายที่เลิกตามในปีนี้หนึ่งขั้น (รอยเย็นลง) */
  cooled?: string[];
  /** ค่าเช่าห้องที่จ่ายในปีนี้ (เหรียญ) · behind = ไม่มีจ่าย ค้างไว้ · evicted = ค้างซ้ำจนถูกไล่ออก */
  rent?: { paid?: number; behind?: boolean; evicted?: boolean };
  /** รายได้ของร้านของตัวเองในปีนี้ (เหรียญ) */
  income?: number;
  /** เมืองที่สภาพคลายลงเองในปีนี้ → สภาพใหม่ */
  eased?: Partial<Record<CityId, CityMood>>;
  /** ประโยคที่ระบบเติมท้ายบันทึกของปีนี้ (เติมชื่อแล้ว) */
  lines?: string[];
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
  /** ปีเกิดในโลก (เซฟเก่าไม่มี ระบบเติมให้ตอนโหลด) */
  born?: number;
  /** เผ่า ถ้าต่างจากค่าปริยาย (ญาติสายเลือดเป็นเผ่าเดียวกับผู้เล่น คนอื่นเป็นมนุษย์) ใช้คิดว่าแก่ช้าแค่ไหน */
  race?: string;
  /** ลูกที่เกิดมามีเขา */
  horned?: boolean;
}

/** ชีวิตจบเพราะตายจริง หรือเพราะเนื้อเรื่องที่เขียนไว้หมดก่อน */
export type EndReason = 'death' | 'content_end';

export interface LifeChanges {
  stats?: Partial<Record<Stat, number>>;
  hp?: number;
  /** พลังชีวิตสูงสุดที่เปลี่ยนถาวร */
  maxHp?: number;
  gold?: number;
  items?: string[];
  traits?: string[];
  /** สิ่งติดตัวที่หายไป */
  lostTraits?: string[];
  /** สิ่งติดตัวที่ขยับขั้น: รหัส → ขั้นใหม่ */
  steps?: Record<string, number>;
  classId?: string;
  /** สถานะสมาชิกที่เปลี่ยน: เข้า (ยศ 1) เลื่อนยศ (ยศใหม่) หรือออก (rank 0) */
  orgs?: Partial<Record<OrgId, number>>;
  /** ผลงานในองค์กรที่เปลี่ยน */
  merit?: Partial<Record<OrgId, number>>;
  /** ภัยตามล่าที่เปลี่ยน: ฝ่าย → ระดับใหม่ */
  hunted?: Record<string, number>;
  /** ชั้นของคนเมืองที่เปลี่ยน: เมือง → ชั้นใหม่ (ย้ายเข้า = ชั้นแรก) */
  standing?: Partial<Record<CityId, number>>;
  /** สภาพของเมืองที่เปลี่ยน: เมือง → สภาพใหม่ */
  moods?: Partial<Record<CityId, CityMood>>;
  /** ที่อยู่ที่เปลี่ยน: ชนิดใหม่ หรือ none = ไม่มีที่อยู่แล้ว */
  home?: HomeKind | 'none';
}

export const DEFAULT_NAME = 'ผู้เดินทาง';

/** เพศและปีเกิดสุ่มจาก seed ทำให้ชีวิตเดียวกันเกิดซ้ำได้ ชื่อเสียงและสภาพของเมืองเริ่มจากที่ชีวิตก่อนทิ้งไว้ */
export function newLife(seed: number, meta?: Pick<Meta, 'reputation'> & Partial<Pick<Meta, 'moods'>>): LifeState {
  const rng = new Rng(seed);
  const gender: Gender = rng.int(0, 1) === 0 ? 'm' : 'f';
  const birthYear = rng.int(BIRTH_YEAR.min, BIRTH_YEAR.max);
  const stats = Object.fromEntries(STATS.map((s) => [s, 10])) as Record<Stat, number>;
  return {
    version: 3,
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
    traitSteps: {},
    habits: {},
    habitOffers: {},
    inventory: [],
    equipped: {},
    supplies: {},
    worn: {},
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
    dying: null,
    deathCause: null,
    epitaph: '',
    people: [],
    currentEventId: null,
    cast: {},
    orgs: {},
    hunted: {},
    city: null,
    district: null,
    home: null,
    standing: {},
    // ชีวิตใหม่ย้อนไปเกิดก่อนปีที่ชีวิตก่อนจบ สภาพเมืองที่รับมาจึงนับปีใหม่จากปีเกิด
    moods: Object.fromEntries(Object.entries(meta?.moods ?? {}).map(([id, m]) => [id, { ...m!, since: birthYear }])),
  };
}

export const modifier = (score: number) => Math.floor((score - 10) / 2);
export const worldYear = (life: Pick<LifeState, 'birthYear' | 'age'>) => life.birthYear + life.age;

/** จำนวนปีจริงต่อหนึ่งปีของร่างกายแบบมนุษย์ (เอลฟ์ 10 คนแคระ 5) ยังไม่รู้เผ่าใช้ 1 */
export const ageScale = (life: Pick<LifeState, 'raceApplied'>) => RACES[life.raceApplied as RaceId]?.ageScale ?? 1;
const scaleOf = (race: string | null | undefined) => RACES[race as RaceId]?.ageScale ?? 1;

/** อายุจริง → อายุเทียบมนุษย์ของเผ่านั้น: จนถึง EVEN_AGING_UNTIL เท่าอายุจริงทุกเผ่า หลังจากนั้นเผ่าอายุยืนแก่ช้าลง */
export const toHumanAge = (age: number, race: string | null | undefined) =>
  age <= EVEN_AGING_UNTIL ? age : EVEN_AGING_UNTIL + (age - EVEN_AGING_UNTIL) / scaleOf(race);

/**
 * อายุเทียบมนุษย์ของตัวละคร (มีทศนิยมสำหรับเผ่าอายุยืน) ส่วน life.age คืออายุจริงที่แสดงในเกม
 * เนื้อหาเขียนครั้งเดียวด้วยอายุแบบมนุษย์ ระบบยืดช่วงหลัง EVEN_AGING_UNTIL ให้เผ่าอายุยืนเอง
 */
export const humanAge = (life: Pick<LifeState, 'age' | 'raceApplied'>) => toHumanAge(life.age, life.raceApplied);

/** อายุเทียบมนุษย์แบบเต็มปี ใช้กับ when.age: เอลฟ์อายุจริง 40 ถึง 49 นับเป็นวัย 40 ทั้งสิบปี */
export const stageAge = (life: Pick<LifeState, 'age' | 'raceApplied'>) => Math.floor(humanAge(life) + 1e-9);

/** อายุจริงปีสุดท้ายที่ยังนับเป็นอายุเทียบมนุษย์ h (เต็มปี) ของเผ่านั้น */
export const lastRealAge = (h: number, race: string | null | undefined) =>
  h < EVEN_AGING_UNTIL ? h : EVEN_AGING_UNTIL + (h + 1 - EVEN_AGING_UNTIL) * scaleOf(race) - 1;
