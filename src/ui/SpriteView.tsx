import { useEffect, useRef } from 'preact/hooks';
import type { Look } from '../../art/kit/core.mjs';
import { game, life } from '../store';
import { maxHp } from '../engine/items';
import { faceOf, playerLook } from '../sprites/looks';
import { CANVAS, drawLook } from '../sprites/render';

/** รูปตัวละครผู้เล่นตอนนี้ (ร่าง เผ่า ชุด ของที่สวม และสีหน้า) */
export function currentPlayerLook(): Look {
  const l = life.value;
  return playerLook(l, game.items, faceOf(l, maxHp(l, game.items)));
}

/** ตัวละครบน canvas 64×96 ไม่ส่ง look = ตัวผู้เล่น */
export function SpriteView({ look, label, class: cls }: { look?: Look; label?: string; class?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shown = look ?? currentPlayerLook();
  const key = JSON.stringify(shown);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawLook(ctx, shown);
  }, [key]);
  return <canvas ref={ref} class={`sprite ${cls ?? ''}`} width={CANVAS.w} height={CANVAS.h} role="img" aria-label={label ?? 'ตัวละคร'} />;
}
