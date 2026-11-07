import { expect, it } from 'vitest';
import { runChecks } from '../art/kit/check.mjs';

it('sprite kit: every piece builds and the proof looks match the locked look', () => {
  expect(runChecks().errors).toEqual([]);
});
