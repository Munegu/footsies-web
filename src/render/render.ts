// Dessin d'une frame de combat : décor, interface, combattants, effets. Lit l'état du moteur
// (DeepReadonly) et la vue (BattleView) sans rien modifier. Tout est dessiné en repère de
// référence 1600x900 ; `scale` = largeur du canvas / 1600.
import type { BattleState } from '../engine/battle.ts';
import type { FighterData } from '../engine/fighter-data.ts';
import type { DeepReadonly } from '../engine/readonly.ts';
import type { FighterState } from '../engine/types.ts';
import type { Atlas, GameAssets } from './assets.ts';
import { renderDebugOverlay } from './debug-render.ts';
import {
  ANNOUNCE_RECT,
  BG_RECT,
  FIGHTER_HEIGHT,
  FIGHTER_TOP,
  FIGHTER_WIDTH,
  HIT_EFFECT_SIZE,
  LABEL_RECTS,
  LOGO_RECT,
  ROUND_RECTS,
  SHIELD_RECTS,
  WINDOW_RECT,
  type Rect,
} from './hud-layout.ts';
import { fightToScreenX } from './layout.ts';
import type { BattleView, Layer } from './view.ts';

export interface RenderOptions {
  /** F12 : boxes et textes de debug. */
  showDebug: boolean;
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  scale: number,
  view: BattleView,
  b: DeepReadonly<BattleState>,
  data: FighterData,
  assets: GameAssets,
  options: RenderOptions,
): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false; // pixel art net : pas de lissage à l'agrandissement
  ctx.globalAlpha = 1;

  // Éléments fixes, derrière tout (BG, Battle_Window, Logo, panneaux de rounds).
  drawUi(ctx, assets.ui, 'BG', BG_RECT);
  drawUi(ctx, assets.ui, 'Battle_Window', WINDOW_RECT);
  drawUi(ctx, assets.ui, 'Logo', LOGO_RECT);
  drawUi(ctx, assets.ui, 'P1_Label', LABEL_RECTS[0]);
  drawUi(ctx, assets.ui, 'P2_Label', LABEL_RECTS[1]);
  drawRounds(ctx, assets.ui, 0, b.fighter1RoundWon);
  drawRounds(ctx, assets.ui, 1, b.fighter2RoundWon);

  // Éléments à l'ordre variable (voir BattleView.order).
  for (const layer of view.order) drawLayer(ctx, layer, scale, view, b, assets);

  if (options.showDebug) renderDebugOverlay(ctx, b, data);
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  scale: number,
  view: BattleView,
  b: DeepReadonly<BattleState>,
  assets: GameAssets,
): void {
  switch (layer) {
    case 'fighter1':
      drawFighter(ctx, assets.fighter, scale, view, b.fighter1, 0);
      break;
    case 'fighter2':
      drawFighter(ctx, assets.fighter, scale, view, b.fighter2, 1);
      break;
    case 'guard1':
      drawShields(ctx, assets.ui, 0, b.fighter1.guardHealth);
      break;
    case 'guard2':
      drawShields(ctx, assets.ui, 1, b.fighter2.guardHealth);
      break;
    case 'roundUi': {
      const a = view.announcement();
      if (a) drawUi(ctx, assets.ui, a.sprite, ANNOUNCE_RECT, a.alpha);
      break;
    }
    case 'hit1':
    case 'hit2': {
      const e = view.hitEffect(layer === 'hit1' ? 0 : 1);
      if (e) {
        const size = HIT_EFFECT_SIZE * e.scale;
        drawUi(ctx, assets.ui, e.sprite, {
          x: e.x - size / 2,
          y: e.y - size / 2,
          w: size,
          h: size,
        });
      }
      break;
    }
  }
}

/** Dessine un sprite de l'atlas `atlas` (nom ou motionID) dans `dest`. */
function drawSprite(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  key: string,
  dest: Rect,
  alpha = 1,
): void {
  const s = atlas.sprites[key];
  if (!s) throw new Error(`Sprite inconnu : ${key}`);
  ctx.globalAlpha = alpha;
  ctx.drawImage(atlas.image, s.x, s.y, s.w, s.h, dest.x, dest.y, dest.w, dest.h);
  ctx.globalAlpha = 1;
}

const drawUi = (
  ctx: CanvasRenderingContext2D,
  ui: Atlas,
  name: string,
  dest: Rect,
  alpha = 1,
): void => drawSprite(ctx, ui, name, dest, alpha);

/** `GuardPanelController` : un bouclier par point de garde, le plus à l'extérieur disparaît en dernier. */
function drawShields(
  ctx: CanvasRenderingContext2D,
  ui: Atlas,
  player: 0 | 1,
  health: number,
): void {
  SHIELD_RECTS[player].forEach((rect, i) => {
    if (i <= health - 1) drawUi(ctx, ui, 'Guard', rect);
  });
}

/** `RoundPanelController` : pastille pleine pour chaque round gagné, vide sinon. */
function drawRounds(ctx: CanvasRenderingContext2D, ui: Atlas, player: 0 | 1, won: number): void {
  ROUND_RECTS[player].forEach((rect, i) => {
    drawUi(ctx, ui, i <= won - 1 ? 'Round_Won' : 'Round_Empty', rect);
  });
}

/**
 * Un combattant : image de 600x500 centrée sur son x, posée sur le sol. Le sprite 60x50 la
 * remplit exactement (x10). J2 est retourné (rotation de 180° autour de Y dans le prefab).
 * Le x est aligné sur un pixel du canvas pour que tous les pixels du sprite restent identiques.
 */
function drawFighter(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  scale: number,
  view: BattleView,
  f: DeepReadonly<FighterState>,
  index: 0 | 1,
): void {
  const motion = view.motion[index];
  if (motion === null) return;

  const centerX = fightToScreenX(f.x) + view.shakeOffset(f.spriteShakePosition);
  const left = Math.round((centerX - FIGHTER_WIDTH / 2) * scale) / scale;
  const dest = { x: left, y: FIGHTER_TOP, w: FIGHTER_WIDTH, h: FIGHTER_HEIGHT };

  if (f.isFaceRight) {
    drawSprite(ctx, atlas, String(motion), dest);
  } else {
    const cx = left + FIGHTER_WIDTH / 2;
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    drawSprite(ctx, atlas, String(motion), { ...dest, x: -FIGHTER_WIDTH / 2 });
    ctx.restore();
  }
}
