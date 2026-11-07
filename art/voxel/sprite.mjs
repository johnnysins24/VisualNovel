// The sprites the game uses, drawn with the Voxel Realm studio (render.mjs): the 32 x 32 portrait, the 20 x 20 face
// icon and the full figure, one pixel per head voxel, the figure standing on a fixed floor row so every character
// lines up. Every sprite uses the game's body (vn.mjs GAME_BODY, 3.25 heads tall) unless style picks another: with
// style: VOXEL_REALM (body.mjs) the portrait and face icon come out exactly as Voxel Realm's creator bakes them.
import { fromDict } from './appearance.mjs';
import { buildCharacter } from './rig.mjs';
import { render, portraitCrop, outline, crop, usedRect } from './render.mjs';
import { GAME_BODY } from './vn.mjs';

const HEAD_ONLY = ['head', 'hair', 'horns'];

/** The head-and-shoulders portrait (CharPortrait.make): 48 x 48 render, 32 x 32 crop, outline. */
export function portrait(d, { expr = 'smile', style = GAME_BODY } = {}) {
  const model = buildCharacter(fromDict(d), { expr, style });
  const img = render(model, { w: 48, h: 48, expr });
  return outline(portraitCrop(img, 32, img.eyeY));
}

/** The face icon (creator_icon_bake "face"): head, hair and horns only, 24 x 24 render, 20 x 20 crop, outline. */
export function faceIcon(d, expr = '', { style = GAME_BODY } = {}) {
  const model = buildCharacter(fromDict(d), { expr, style });
  model.parts = model.parts.filter(p => HEAD_ONLY.includes(p.name));
  const img = render(model, { w: 24, h: 24, expr });
  return outline(portraitCrop(img, 20, img.eyeY));
}

/**
 * The full figure on the game's 64 x 96 canvas (A2): w x h art pixels with the camera's grid on the head like the portrait (so the face is the same
 * pixels) and the body's centre line where the portrait has it. The lowest solid row (the soles) sits floor rows
 * above the bottom edge, the outline under it, so every character stands on the same line whatever its shoes.
 * hide drops rig parts by name (e.g. ['hair'] or a list of body parts) to draw pieces on their own. style picks the
 * body: the game's by default, vnStyle(ratio) from vn.mjs for another height, or VOXEL_REALM for Voxel Realm's own.
 */
export function fullBody(d, { expr = 'smile', w = 64, h = 96, floor = 2, hide = [], style = GAME_BODY } = {}) {
  const model = buildCharacter(fromDict(d), { expr, hide, style });
  const pad = 24, H = h + 2 * pad;
  const vs = model.pixel;
  const img = render(model, { w, h: H, expr, centre: [0, (H / 2 - floor - pad) * vs] });
  const u = usedRect(img);
  const bottom = u.h ? u.y + u.h - 1 : Math.round(img.Y1 / vs) - 1;
  return outline(crop(img, w, h, 0, bottom - (h - 1 - floor)));
}
