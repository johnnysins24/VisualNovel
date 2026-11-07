import { expect, test } from '@playwright/test';

test('plays a few choices and screenshots the layout', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('.story .choices button').first()).toBeVisible();
  await page.screenshot({ path: `shots/${info.project.name}-start.png`, fullPage: true });
  for (let i = 0; i < 3; i++) {
    const btn = page.locator('.story .choices button').first();
    if (!(await btn.isVisible())) break;
    await btn.click();
  }
  await page.screenshot({ path: `shots/${info.project.name}-later.png`, fullPage: true });
  // no horizontal scroll at any size
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('saves survive a reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('.story .choices button').first().click();
  const age = await page.locator('.stats h2').innerText();
  await page.reload();
  await expect(page.locator('.stats h2')).toHaveText(age);
});
