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

for (const scheme of ['light', 'dark'] as const) {
  test(`plays a few choices and screenshots the layout (${scheme})`, async ({ page }, info) => {
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

test('reveals the story one paragraph at a time', async ({ page }) => {
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

test('reading mode "all" shows choices at once', async ({ page }) => {
  await page.goto('/');
  await page.locator('.bottom-nav button, .top-tabs button').filter({ visible: true }).last().click();
  await page.getByRole('radio', { name: 'ทั้งหมด' }).click();
  await page.locator('.bottom-nav button, .top-tabs button').filter({ visible: true }).first().click();
  await expect(page.locator(CHOICE).first()).toBeVisible();
  await page.reload();
  await expect(page.locator(CHOICE).first()).toBeVisible();
});

test('saves survive a reload', async ({ page }) => {
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
