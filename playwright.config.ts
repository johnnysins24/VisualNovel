import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  webServer: { command: 'CONTENT_DIR=tests/fixtures/content npm run build && npx vite preview --port 4173', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120_000 },
  use: { baseURL: 'http://localhost:4173', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {} },
  // เทสต์ที่ติดป้าย @once (พฤติกรรมที่ไม่ขึ้นกับขนาดจอ และธีมมืด) รันบน portrait อย่างเดียว เทสต์การจัดวางรันครบสามขนาด
  projects: [
    { name: 'portrait', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: 'landscape', grepInvert: /@once/, use: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: 'desktop', grepInvert: /@once/, use: { viewport: { width: 1280, height: 800 } } },
  ],
});
