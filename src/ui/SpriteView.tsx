import { useEffect, useRef } from 'preact/hooks';
import { game, life } from '../store';
import { layersFor } from '../sprites/character';
import { composeCanvas } from '../sprites/compose';
import { PALETTES } from '../sprites/placeholder';
import { CANVAS } from '../sprites/types';

export function SpriteView() {
  const ref = useRef<HTMLCanvasElement>(null);
  const l = life.value;
  const equippedKey = JSON.stringify(l.equipped);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const src = composeCanvas(layersFor(life.value, game.items), 'default', PALETTES.default!);
    ctx.clearRect(0, 0, CANVAS.w, CANVAS.h);
    ctx.drawImage(src, 0, 0);
  }, [equippedKey]);
  return <canvas ref={ref} class="sprite" width={CANVAS.w} height={CANVAS.h} aria-label="ตัวละคร" />;
}
