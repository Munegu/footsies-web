import { REF_HEIGHT, REF_WIDTH, AREA_BOTTOM } from './layout.ts';

// Positions de l'interface de combat, en repère de référence 1600x900 (origine en haut à gauche).
// Dérivées des ancres de BattleCanvas.prefab ; tous les sprites sont affichés x10 (1 pixel de
// sprite = 10 px de référence = 1 pixel interne), sauf l'effet d'impact.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const centered = (cx: number, cy: number, w: number, h: number): Rect => ({
  x: cx - w / 2,
  y: cy - h / 2,
  w,
  h,
});

export const BG_RECT: Rect = { x: 0, y: 0, w: REF_WIDTH, h: REF_HEIGHT };
/** Battle_Window : 1550x650, centré en x, centre à y = 350. */
export const WINDOW_RECT: Rect = centered(800, 350, 1550, 650);
/** Logo : 500x150, ancré en bas au centre, centre à 151 du bas. */
export const LOGO_RECT: Rect = centered(800, REF_HEIGHT - 151, 500, 150);

/** Boucliers de garde (Guard_P1 / Guard_P2) : 100x100, l'index 0 est le plus à l'extérieur. */
const SHIELD_Y = 135;
export const SHIELD_RECTS: readonly [readonly Rect[], readonly Rect[]] = [
  [150, 275, 400].map((cx) => centered(cx, SHIELD_Y, 100, 100)),
  [1450, 1325, 1200].map((cx) => centered(cx, SHIELD_Y, 100, 100)),
];

/** Pastilles de rounds gagnés (Panel_P1 / Panel_P2) : 80x80, l'index 0 est le plus proche du centre. */
const ROUND_Y = 735;
export const ROUND_RECTS: readonly [readonly Rect[], readonly Rect[]] = [
  [460, 360, 260].map((cx) => centered(cx, ROUND_Y, 80, 80)),
  [1140, 1240, 1340].map((cx) => centered(cx, ROUND_Y, 80, 80)),
];

/** Labels « P1 » / « P2 » : 100x70. */
export const LABEL_RECTS: readonly [Rect, Rect] = [
  centered(447.5, 832.5, 100, 70),
  centered(1152.5, 832.5, 100, 70),
];

/** Annonce de round (Round_UI) : 500x100, centre à (800, 135). */
export const ANNOUNCE_RECT: Rect = centered(800, 135, 500, 100);

/** Taille de base de l'effet d'impact (HitEffect_1/2) ; multipliée par 1, 2 ou 5 selon le coup. */
export const HIT_EFFECT_SIZE = 100;

/** Rect d'image d'un combattant : 600x500, centré sur son x, posé sur le sol. */
export const FIGHTER_WIDTH = 600;
export const FIGHTER_HEIGHT = 500;
export const FIGHTER_TOP = AREA_BOTTOM - FIGHTER_HEIGHT;
