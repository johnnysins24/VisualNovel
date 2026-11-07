import type { LifeState } from '../engine/state';
import type { ItemIndex } from '../engine/items';
import { equippedItems } from '../engine/items';
import { LAYERS } from './placeholder';
import type { LayerDef } from './types';

/** Base body layers plus one layer per equipped item. Equipment shows on the character. */
export function layersFor(life: LifeState, items: ItemIndex): LayerDef[] {
  const ids = ['body', 'head', 'hair_short', 'clothes_basic'];
  for (const it of equippedItems(life, items)) if (it.sprite) ids.push(it.sprite);
  return ids.map((id) => LAYERS[id]).filter((l): l is LayerDef => !!l);
}
