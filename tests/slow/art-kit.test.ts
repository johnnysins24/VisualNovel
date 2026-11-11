import { expect, it } from 'vitest';
import { runChecks } from '../../art/kit/check.mjs';

it('sprite kit: every piece builds and the proof looks match the locked look', () => {
  expect(runChecks().errors).toEqual([]);
}, 90_000); // renders every look, NPC sample and scene (ราว 25 วินาทีเมื่อรันเดี่ยว เผื่อเวลาตอนรันพร้อมเทสต์อื่น)
