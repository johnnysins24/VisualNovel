/** Canvas size 64x96 (A2, approved). One base body for all races (A3, approved). Art itself is still placeholder. */
export const CANVAS = { w: 64, h: 96 } as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** palette role, not a color: recoloring never needs a redraw */
  role: string;
}

export interface LayerDef {
  id: string;
  z: number;
  rects: Rect[];
}

/** role -> hex color. Swapping a palette recolors a layer without redrawing it. */
export type Palette = Record<string, string>;
