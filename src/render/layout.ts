import type { Box } from '../engine/boxes.ts';

// Géométrie de l'écran de combat, d'après BattleCanvas.prefab (CanvasScaler 1600x900) et
// BattleGUI.cs. On dessine dans ce repère « de référence » ; un seul `setTransform` le met à
// l'échelle du canvas.

/** Résolution interne du jeu (celle de Battle_BG.png) et repère de dessin = 10x. */
export const INTERNAL_WIDTH = 160;
export const INTERNAL_HEIGHT = 90;
export const REF_WIDTH = 1600;
export const REF_HEIGHT = 900;

/** Aire de combat (objet BattleGUI du prefab : 1450 de large, 570 de haut, centrée). */
export const AREA_WIDTH_UNITS = 10; // BattleCore._battleAreaWidth
export const AREA_HEIGHT_UNITS = 2; // BattleCore._battleAreaMaxHeight
export const AREA_LEFT = 75;
export const AREA_RIGHT = 1525;
export const AREA_TOP = 60;
export const AREA_BOTTOM = 630; // le sol

export const CENTER_X = (AREA_LEFT + AREA_RIGHT) / 2;
/** `fightPointToScreenScale` (BattleGUI.CalculateFightPointToScreenScale). */
export const SCALE_X = (AREA_RIGHT - AREA_LEFT) / AREA_WIDTH_UNITS;
export const SCALE_Y = (AREA_BOTTOM - AREA_TOP) / AREA_HEIGHT_UNITS;

/** `TransformHorizontalFightPointToScreen`. */
export const fightToScreenX = (x: number): number => x * SCALE_X + CENTER_X;

/** `TransformVerticalFightPointToScreen`, origine en haut (convention canvas). */
export const fightToScreenY = (y: number): number => AREA_BOTTOM - y * SCALE_Y;

/** `DrawFightBox` : box de combat (x = centre, y = bas) -> rectangle écran (coin haut-gauche). */
export function fightBoxToScreen(box: Readonly<Box>): Box {
  const width = box.width * SCALE_X;
  const height = box.height * SCALE_Y;
  return {
    x: fightToScreenX(box.x) - width / 2,
    y: AREA_BOTTOM - box.y * SCALE_Y - height,
    width,
    height,
  };
}

/**
 * Plus grand facteur entier d'agrandissement de 160x90 qui tient dans l'espace disponible
 * (en pixels physiques). Un facteur entier garde les pixels du pixel art tous identiques.
 */
export function integerScale(availableWidth: number, availableHeight: number): number {
  const s = Math.floor(
    Math.min(availableWidth / INTERNAL_WIDTH, availableHeight / INTERNAL_HEIGHT),
  );
  return Math.max(1, s);
}
