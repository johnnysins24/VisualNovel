import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { studioPlugin } from './scripts/studio-plugin.ts';

export default defineConfig({
  // studioPlugin: ทางอ่านเขียนไฟล์ของห้องวาด (studio.html) มีเฉพาะตอน vite dev
  plugins: [preact(), studioPlugin()],
  test: { include: ['tests/**/*.test.ts'] },
});
