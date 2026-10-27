// Écran titre, d'après TitleScene.unity (repère de référence 1600x900, origine en haut à gauche).
import type { Atlas } from '../render/assets.ts';
import { BG_RECT, type Rect } from '../render/hud-layout.ts';
import { drawSprite } from '../render/render.ts';
import type { MenuState } from './menu.ts';
import { selectedId } from './menu.ts';

export const LOGO_RECT: Rect = { x: 300, y: 100, w: 1000, h: 300 };
export const CREATED_BY_RECT: Rect = { x: 550, y: 825, w: 500, h: 50 };
export const VERSION_RECT: Rect = { x: 1350, y: 825, w: 200, h: 50 };

/**
 * Les trois boutons : 500x110, empilés sans espace dans un panneau de 500x330 centré à y = 600
 * (VerticalLayoutGroup). Dans l'ordre de la hiérarchie : VS PL2, VS CPU, puis OPTIONS.
 */
const BUTTON_X = 550;
const BUTTON_W = 500;
const BUTTON_H = 110;
const BUTTONS_TOP = 435;

export const BUTTON_IDS = ['vsPlayer', 'vsCpu', 'options'] as const;

export const BUTTON_RECTS: Readonly<Record<(typeof BUTTON_IDS)[number], Rect>> = {
  vsPlayer: { x: BUTTON_X, y: BUTTONS_TOP, w: BUTTON_W, h: BUTTON_H },
  vsCpu: { x: BUTTON_X, y: BUTTONS_TOP + BUTTON_H, w: BUTTON_W, h: BUTTON_H },
  options: { x: BUTTON_X, y: BUTTONS_TOP + 2 * BUTTON_H, w: BUTTON_W, h: BUTTON_H },
};

/** Libellé (Menu.png) de chaque bouton. */
const LABELS = { vsPlayer: 'Menu_1', vsCpu: 'Menu_0', options: 'Menu_Options' } as const;

/** Zone cliquable de la case son : 150x150 en haut à droite ; l'image fait 110x110 au centre. */
export const SOUND_HIT_RECT: Rect = { x: 1450, y: 0, w: 150, h: 150 };
export const SOUND_ICON_RECT: Rect = { x: 1470, y: 20, w: 110, h: 110 };

const inside = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Quel élément du titre se trouve sous ce point ? */
export function titleItemAt(x: number, y: number): string | null {
  for (const id of BUTTON_IDS) if (inside(BUTTON_RECTS[id], x, y)) return id;
  return inside(SOUND_HIT_RECT, x, y) ? 'sound' : null;
}

export interface TitleView {
  /** Élément sur lequel le bouton de la souris est enfoncé, ou null. */
  pressedId: string | null;
  musicOn: boolean;
}

export function drawTitle(
  ctx: CanvasRenderingContext2D,
  scale: number,
  ui: Atlas,
  menu: MenuState,
  view: TitleView,
): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;

  drawSprite(ctx, ui, 'BG', BG_RECT);
  drawSprite(ctx, ui, 'Logo', LOGO_RECT);
  drawSprite(ctx, ui, 'CreatedBy', CREATED_BY_RECT);
  drawSprite(ctx, ui, 'Version', VERSION_RECT);

  const selected = selectedId(menu);

  // Boutons : échange de sprite (normal / sélectionné / enfoncé), puis le libellé par-dessus.
  for (const id of BUTTON_IDS) {
    const rect = BUTTON_RECTS[id];
    const face =
      id !== selected ? 'MenuButton_2' : view.pressedId === id ? 'MenuButton_0' : 'MenuButton_1';
    drawSprite(ctx, ui, face, rect);
    drawSprite(ctx, ui, LABELS[id], rect);
  }

  // Case son : fond (sprite 2 quand elle est sélectionnée) + coche si la musique est active.
  drawSprite(ctx, ui, selected === 'sound' ? 'Sound_2' : 'Sound_0', SOUND_ICON_RECT);
  if (view.musicOn) drawSprite(ctx, ui, 'Sound_1', SOUND_ICON_RECT);
}
