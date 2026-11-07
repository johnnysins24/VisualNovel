import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { clearSlot, loadSlot, saveSlot } from '../src/engine/save';
import { newLife } from '../src/engine/state';

it('saves, loads and clears a slot', async () => {
  const life = { ...newLife(5), name: 'ทดสอบ' };
  await saveSlot(1, life);
  expect(await loadSlot(1)).toEqual(life);
  await clearSlot(1);
  expect(await loadSlot(1)).toBeUndefined();
});
