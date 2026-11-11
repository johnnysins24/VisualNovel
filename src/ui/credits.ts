// เครดิตของงานที่ไม่ได้ทำเอง แสดงในแผง "เพิ่มเติม" และตรงกับ CREDITS.md ที่รากของ repo
// pack = โฟลเดอร์ใน art/thirdparty/ (tests/adopted.test.ts กับ tests/studio.test.ts ตรวจว่าทุกชุดและผู้วาดทุกคนที่ภาพในเกมใช้มีเครดิต)

export interface Credit {
  pack?: string;
  what: string;
  by: string;
  licence: string;
  licenceUrl: string;
  url: string;
}

export const CREDITS: Credit[] = [
  {
    pack: 'shikashi',
    what: "Shikashi's Fantasy Icons Pack",
    by: 'Matt Firth (shikashipx) ดัดแปลงจากไอคอนของ game-icons.net',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    url: 'https://shikashipx.itch.io/shikashis-fantasy-icons-pack',
  },
  {
    pack: 'game-icons',
    what: 'game-icons.net',
    by: 'Icons made by Delapouite, Lorc, Skoll, Caro Asercion and Cathelineau (ผู้วาดแต่ละไอคอนอยู่ใน CREDITS.md)',
    licence: 'CC BY 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    url: 'https://game-icons.net',
  },
  {
    pack: '7soul-496',
    what: '496 pixel art icons for medieval/fantasy RPG',
    by: '7Soul',
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    url: 'https://opengameart.org/node/39455',
  },
  {
    pack: 'dungeon-crawl',
    what: 'Dungeon Crawl 32x32 tiles และชุดเสริม',
    by: 'ทีมศิลป์ของ Dungeon Crawl Stone Soup',
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    url: 'https://opengameart.org/content/dungeon-crawl-32x32-tiles',
  },
  {
    what: 'System Reference Document 5.1 ("SRD 5.1") โดย Wizards of the Coast LLC',
    by: 'กลไกบางส่วนของเกมนำมาจาก SRD 5.1',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/legalcode',
    url: 'https://dnd.wizards.com/resources/systems-reference-document',
  },
];
