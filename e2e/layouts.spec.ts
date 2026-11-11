import { expect, test, type Page } from '@playwright/test';

const CHOICE = '.sheet .choice:not(.locked)';

/** ข้ามการอ่านทีละย่อหน้า (ถ้ามี) แล้วกดตัวเลือกแรก */
async function pick(page: Page) {
  // รอให้หน้าวาดเสร็จก่อน จะมีแถบอ่านหรือตัวเลือกอย่างใดอย่างหนึ่ง
  await page.locator(`${CHOICE}, .readbar, .end-card`).first().waitFor();
  const skip = page.getByRole('button', { name: 'ข้ามไปตัวเลือก' });
  if (await skip.isVisible()) await skip.click();
  const btn = page.locator(CHOICE).first();
  if (!(await btn.isVisible())) return false;
  await btn.click();
  return true;
}

// ป้าย @once: เทสต์ที่ผลไม่ขึ้นกับขนาดจอ รันบนจอมือถือแนวตั้งอย่างเดียว (ดู playwright.config.ts)
// ธีมมืดเปลี่ยนแค่สี จึงถ่ายจอเดียว ส่วนธีมสว่างถ่ายครบสามขนาดเพราะการจัดวางต่างกัน
const ONCE = { tag: '@once' };

for (const scheme of ['light', 'dark'] as const) {
  test(`plays a few choices and screenshots the layout (${scheme})`, scheme === 'dark' ? ONCE : {}, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await page.locator(`${CHOICE}, .readbar`).first().waitFor();
    const skip = page.getByRole('button', { name: 'ข้ามไปตัวเลือก' });
    if (await skip.isVisible()) await skip.click();
    await expect(page.locator(CHOICE).first()).toBeVisible();
    await page.screenshot({ path: `shots/${info.project.name}-${scheme}-start.png`, fullPage: true });
    for (let i = 0; i < 3; i++) if (!(await pick(page))) break;
    await page.screenshot({ path: `shots/${info.project.name}-${scheme}-later.png`, fullPage: true });
    // no horizontal scroll at any size
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
}

test('reveals the story one paragraph at a time', ONCE, async ({ page }) => {
  await page.goto('/');
  await page.locator(`${CHOICE}, .readbar`).first().waitFor();
  const next = page.locator('.readbar .next');
  // เลือกไปเรื่อยๆ จนเจอช่วงที่มีมากกว่าหนึ่งย่อหน้า (ผลของตัวเลือกกับเหตุการณ์ถัดไป)
  for (let i = 0; i < 10 && !(await next.isVisible()); i++) await page.locator(CHOICE).first().click();
  await expect(next).toBeVisible();
  await expect(page.locator(CHOICE)).toHaveCount(0);
  const count = () => page.locator('.log p').count();
  const before = await count();
  await next.click();
  expect(await count()).toBe(before + 1);
  // อ่านต่อจนหมด ตัวเลือกจะขึ้นแทนแถบอ่าน
  for (let i = 0; i < 30 && (await next.isVisible()); i++) await next.click();
  await expect(page.locator(CHOICE).first()).toBeVisible();
});

test('reading mode "all" shows choices at once', ONCE, async ({ page }) => {
  await page.goto('/');
  await page.locator('.bottom-nav button, .top-tabs button').filter({ visible: true }).last().click();
  await page.getByRole('radio', { name: 'ทั้งหมด' }).click();
  await page.locator('.bottom-nav button, .top-tabs button').filter({ visible: true }).first().click();
  await expect(page.locator(CHOICE).first()).toBeVisible();
  await page.reload();
  await expect(page.locator(CHOICE).first()).toBeVisible();
});

test('saves survive a reload', ONCE, async ({ page }) => {
  await page.goto('/');
  await pick(page);
  const age = (await page.locator('.top .meta').textContent()) ?? '';
  // saving is async: wait until the write has landed in IndexedDB before reloading
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('visualnovel', 1);
        open.onsuccess = () => {
          const get = open.result.transaction('saves').objectStore('saves').get(0);
          get.onsuccess = () => resolve((get.result?.age ?? 0) >= 1);
          get.onerror = () => resolve(false);
        };
        open.onerror = () => resolve(false);
      }),
  );
  await page.reload();
  await expect(page.locator('.top .meta')).toHaveText(age);
  // โหลดเซฟแล้วแสดงทั้งหมด ไม่ต้องอ่านซ้ำทีละย่อหน้า
  await expect(page.locator(CHOICE).first()).toBeVisible();
});

/** ชีวิตที่จบแล้ว (ตายตามวัย) สำหรับดูแผ่นปิดท้ายชีวิต หน้าชีวประวัติ และผังครอบครัว ค่าที่ไม่ได้ใส่ระบบเติมให้ตอนโหลดเซฟ */
const ENDED_LIFE = {
  version: 3,
  seed: 7,
  name: 'ทดสอบ',
  gender: 'f',
  raceApplied: 'human',
  age: 70,
  birthYear: 300,
  alive: false,
  endReason: 'death',
  deathCause: 'age',
  hp: 0,
  baseMaxHp: 0,
  gold: 4,
  epitaph: 'จากไปในหน้าหนาว ข้างเตา',
  traits: ['curse_brand'],
  people: [
    { id: 'mother', name: 'มารดา', gender: 'f', kin: 'mother', bond: 'kin', closeness: 3, alive: false, metAge: 0, diedAge: 40, born: 275 },
    { id: 'partner', name: 'คู่ชีวิต', gender: 'm', kin: 'spouse', bond: 'love', closeness: 4, alive: true, metAge: 20, born: 299 },
    { id: 'child1', name: 'ลูกคนโต', gender: 'f', kin: 'child', bond: 'kin', closeness: 3, alive: true, metAge: 25, born: 325 },
    { id: 'child2', name: 'ลูกคนเล็ก', gender: 'm', kin: 'child', bond: 'kin', closeness: 2, alive: true, metAge: 29, born: 329 },
  ],
  log: [
    { age: 20, eventId: 'youth.test_duel', choiceId: 'none', text: 'ปีที่ออกเรือน', mark: 'แต่งงานกับคู่ชีวิต' },
    { age: 25, eventId: 'adult.world_test', choiceId: 'none', text: 'ปีที่ฟ้ามืด', mark: 'คืนที่ดาวหรี่' },
    {
      age: 70,
      eventId: 'elder.test_end',
      choiceId: 'none',
      text: 'หิมะแรกมาเร็วกว่าทุกปี',
      mark: 'ฤดูหนาวสุดท้าย',
      year: { winter: { d20: 2, mod: 1, dc: 9, success: false, lost: 2 } },
    },
  ],
};

/** ชีวิตที่ค้างอยู่หน้าฉากปะทะของเนื้อหาทดสอบ สถานะการปะทะระบบเริ่มให้เองตอนโหลดเซฟ */
const BRAWL_LIFE = { version: 3, seed: 7, name: 'ทดสอบ', gender: 'm', raceApplied: 'human', age: 18, birthYear: 294, hp: 12, baseMaxHp: 12, flags: ['test_brawl'], currentEventId: 'youth.test_brawl' };

async function loadLife(page: Page, life: unknown) {
  await page.goto('/');
  await page.locator('.top').waitFor();
  await page.evaluate(
    (saved) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('visualnovel', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('saves');
        open.onsuccess = () => {
          const tx = open.result.transaction('saves', 'readwrite');
          tx.objectStore('saves').put(saved, 0);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    life,
  );
  await page.reload();
  await page.locator('.top').waitFor();
}

const tabButton = (page: Page, n: number) => page.locator('.bottom-nav button, .top-tabs button').filter({ visible: true }).nth(n);
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('a finished life closes with the farewell sheet and opens its biography', async ({ page }, info) => {
  await loadLife(page, ENDED_LIFE);
  // ท้ายบันทึก: ปีเกิดถึงปีตาย เช็คฤดูหนาวครั้งสุดท้าย และแผ่นปิดท้ายที่มีปุ่มเดียว
  await expect(page.locator('.end-mark')).toContainText('300');
  await expect(page.locator('.end-mark')).toContainText('370');
  await expect(page.locator('.roll .what')).toHaveText('ฤดูหนาว');
  await expect(page.locator('.sheet.farewell')).toContainText('70');
  await expect(page.locator(CHOICE)).toHaveCount(0);
  await page.getByRole('button', { name: 'อ่านชีวประวัติ' }).click();

  const bio = page.locator('.bio');
  await expect(bio.locator('h2')).toHaveText('ทดสอบ');
  await expect(bio.locator('.bio-last')).toHaveText('จากไปในหน้าหนาว ข้างเตา');
  await expect(bio.locator('.marks li')).toHaveCount(3);
  await expect(bio.locator('.marks li.world')).toHaveCount(1);
  await expect(bio.locator('.ll-bar b')).toHaveCount(3);
  await expect(bio.locator('.bio-people li')).toHaveCount(3);
  // แตะป้ายสิ่งติดตัวแล้วการ์ดเปิดในหน้านั้นเอง
  await bio.locator('.trait').first().click();
  await expect(bio.locator('.trait-card')).toContainText('ตราร้อน');
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: `shots/${info.project.name}-biography.png`, fullPage: true });

  // กลับไปอ่านบันทึกได้ และเกิดใหม่จากหน้าชีวประวัติได้
  await page.getByRole('button', { name: 'อ่านบันทึกชีวิต' }).click();
  await expect(bio).toHaveCount(0);
  await page.getByRole('button', { name: 'อ่านชีวประวัติ' }).click();
  await page.getByRole('button', { name: 'เกิดใหม่' }).click();
  await expect(page.locator('.bio')).toHaveCount(0);
  await expect(page.locator(`${CHOICE}, .readbar`).first()).toBeVisible();
});

test('the family tree shows ages, and a person card with birth year and closeness', async ({ page }, info) => {
  await loadLife(page, ENDED_LIFE);
  await tabButton(page, 2).click();
  const tree = page.locator('.chart.family');
  await expect(tree.locator('.node')).toHaveCount(5);
  await expect(tree.locator('.node.dead')).toHaveCount(1);
  // เลขหลังบทบาทคืออายุ คนที่จากไปแล้วคืออายุตอนเสีย (แม่เกิดปี 275 เสียตอนผู้เล่นอายุ 40 คือปี 340)
  await expect(tree.locator('.node', { hasText: 'มารดา' }).locator('.sub')).toHaveText('แม่ · 65');
  await expect(tree.locator('.node', { hasText: 'ลูกคนโต' }).locator('.sub')).toHaveText('ลูกสาว · 45');
  // ทุกคนอยู่ในกรอบของผัง ไม่มีใครโดนตัดขอบ
  const inside = await tree.evaluate((svg: SVGSVGElement) => {
    const vb = svg.viewBox.baseVal;
    return [...svg.querySelectorAll('.node')].every((g) => {
      const b = (g as SVGGElement).getBBox();
      return b.x >= vb.x && b.x + b.width <= vb.x + vb.width && b.y >= vb.y && b.y + b.height <= vb.y + vb.height;
    });
  });
  expect(inside).toBe(true);
  await tree.locator('.node', { hasText: 'ลูกคนโต' }).click();
  const card = page.locator('.person-card.kin-card');
  await expect(card).toContainText('ลูกคนโต');
  await expect(card).toContainText('325');
  await expect(card.locator('.hearts .icon')).toHaveCount(5);
  await expect(card.locator('.hearts .icon.off')).toHaveCount(2);
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: `shots/${info.project.name}-family.png`, fullPage: true });
  // แท็บตัวละคร: ป้ายสิ่งติดตัวเป็นช่องไอคอน แตะแล้วการ์ดเปิด
  await tabButton(page, 1).click();
  await page.locator('.read .trait').first().click();
  await expect(page.locator('.read .trait-card')).toContainText('คำสาป');
  expect(await noSideScroll(page)).toBe(true);
});

test('an encounter plays beat by beat on the stage and hands back to the story when it ends', ONCE, async ({ page }, info) => {
  await loadLife(page, BRAWL_LIFE);
  const sheet = page.locator('.sheet.enc');
  await expect(sheet).toBeVisible();
  // ศัตรูขึ้นเวทีพร้อมชื่อ แรงใจ และจุดบอกจังหวะ วิธีรับมือของจังหวะแรกครบสามทาง
  await expect(page.locator('.sprite.foe')).toBeVisible();
  await expect(page.locator('.enc-chip.foe .foe-name')).toHaveText('[ทดสอบ] หมาเถ้า');
  await expect(page.locator('.enc-chip.foe .pip.on')).toHaveCount(2);
  await expect(sheet.locator('.choice')).toHaveCount(3);
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: `shots/${info.project.name}-encounter.png`, fullPage: true });

  // จังหวะแรก: ผลการทอยขึ้นในบันทึก แล้วแผ่นเปลี่ยนเป็นวิธีของจังหวะสอง (หรือการปะทะจบถ้าเลือกแล้วจบเลย)
  await sheet.locator('.choice').first().click();
  await expect(page.locator('.entry .roll').first()).toBeVisible();
  // กดต่อจนจบ ไม่เกินจำนวนจังหวะของฉาก
  for (let i = 0; i < 3 && (await sheet.count()); i++) {
    const skip = page.getByRole('button', { name: 'ข้ามไปตัวเลือก' });
    if (await skip.isVisible()) await skip.click();
    if (!(await sheet.count())) break;
    await sheet.locator('.choice').first().click();
    await page.waitForTimeout(350);
  }
  // จบแล้ว: บรรทัดผลอยู่ในบันทึก แผ่นการปะทะหายไป และเรื่องเดินต่อด้วยตัวเลือกของเหตุการณ์ถัดไป
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.entry .outcome')).toHaveCount(1);
  const skip = page.getByRole('button', { name: 'ข้ามไปตัวเลือก' });
  if (await skip.isVisible()) await skip.click();
  await expect(page.locator(CHOICE).first()).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
});
