// Rendu de debug sur Canvas 2D : boxes colorées, textes et mini-HUD. Pas de sprites (étape 5).
// Port de BattleGUI.DrawFighter / DrawFightBox / DrawBox (BattleGUI.cs). Le rendu lit l'état du
// moteur sans jamais le modifier (DeepReadonly).
import { frameAdvantage, RoundState, type BattleState } from '../engine/battle.ts';
import type { Box } from '../engine/boxes.ts';
import { getAction, type FighterData } from '../engine/fighter-data.ts';
import type { DeepReadonly } from '../engine/readonly.ts';
import type { FighterState } from '../engine/types.ts';
import {
  AREA_BOTTOM,
  AREA_LEFT,
  AREA_RIGHT,
  AREA_TOP,
  REF_HEIGHT,
  REF_WIDTH,
  fightBoxToScreen,
  fightToScreenX,
} from './layout.ts';

type Fighter = DeepReadonly<FighterState>;

const LINE_WIDTH = 3; // `_battleBoxLineWidth` = 2 px écran dans l'original
const FILL_ALPHA = 0.25;

// Couleurs de DrawFighter.
const HURTBOX = '#ffff00';
const PUSHBOX = '#3060ff';
const HITBOX = '#ff2020';
const PROXIMITY = '#909090';

const ROUND_LABEL: Record<number, string> = {
  [RoundState.Stop]: '',
  [RoundState.Intro]: 'INTRO',
  [RoundState.Fight]: 'FIGHT',
  [RoundState.KO]: 'KO',
  [RoundState.End]: '',
};

export interface RenderOptions {
  /** F12 : boxes et textes de debug. */
  showDebug: boolean;
}

/**
 * Dessine un tick de combat. `scale` = largeur du canvas / 1600 : tout est dessiné dans le
 * repère de référence 1600x900 (voir layout.ts).
 */
export function renderBattle(
  ctx: CanvasRenderingContext2D,
  scale: number,
  b: DeepReadonly<BattleState>,
  data: FighterData,
  options: RenderOptions,
): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  drawBackground(ctx);
  drawHud(ctx, b);

  for (const f of [b.fighter1, b.fighter2]) drawFighterMarker(ctx, f);

  if (options.showDebug) {
    for (const f of [b.fighter1, b.fighter2]) drawFighterDebug(ctx, b, data, f);
    ctx.fillStyle = '#c8c8c8';
    ctx.font = '26px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('F12 = affichage debug', REF_WIDTH / 2, REF_HEIGHT * 0.95);
  }
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, REF_WIDTH, REF_HEIGHT);

  ctx.fillStyle = '#1c1c24';
  ctx.fillRect(AREA_LEFT, AREA_TOP, AREA_RIGHT - AREA_LEFT, AREA_BOTTOM - AREA_TOP);

  ctx.strokeStyle = '#555';
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeRect(AREA_LEFT, AREA_TOP, AREA_RIGHT - AREA_LEFT, AREA_BOTTOM - AREA_TOP);

  // Sol.
  ctx.strokeStyle = '#888';
  ctx.beginPath();
  ctx.moveTo(AREA_LEFT, AREA_BOTTOM);
  ctx.lineTo(AREA_RIGHT, AREA_BOTTOM);
  ctx.stroke();
}

/**
 * Mini-HUD provisoire (rounds, garde, état du round) : l'interface de combat de l'original
 * (Battle_Window, boucliers, annonces) arrive à l'étape 5.
 */
function drawHud(ctx: CanvasRenderingContext2D, b: DeepReadonly<BattleState>): void {
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '34px monospace';
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  ctx.fillText(
    `J1  rounds ${b.fighter1RoundWon}  garde ${b.fighter1.guardHealth}`,
    AREA_LEFT,
    AREA_TOP / 2,
  );
  ctx.textAlign = 'right';
  ctx.fillText(
    `J2  rounds ${b.fighter2RoundWon}  garde ${b.fighter2.guardHealth}`,
    AREA_RIGHT,
    AREA_TOP / 2,
  );

  ctx.textAlign = 'center';
  ctx.font = '64px monospace';
  ctx.fillStyle = '#ffd040';
  ctx.fillText(ROUND_LABEL[b.roundState] ?? '', REF_WIDTH / 2, AREA_TOP + 90);
}

/** Repère minimal d'un perso sans sprite : sa position au sol et le sens vers lequel il regarde. */
function drawFighterMarker(ctx: CanvasRenderingContext2D, f: Fighter): void {
  const x = fightToScreenX(f.x);
  const dir = f.isFaceRight ? 1 : -1;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = LINE_WIDTH;
  ctx.beginPath();
  ctx.moveTo(x, AREA_BOTTOM + 14);
  ctx.lineTo(x + dir * 60, AREA_BOTTOM + 14);
  ctx.lineTo(x + dir * 44, AREA_BOTTOM + 2);
  ctx.moveTo(x + dir * 60, AREA_BOTTOM + 14);
  ctx.lineTo(x + dir * 44, AREA_BOTTOM + 26);
  ctx.stroke();
}

/** `BattleGUI.DrawFighter` : textes, puis hurtboxes, pushbox et hitboxes (ordre de l'original). */
function drawFighterDebug(
  ctx: CanvasRenderingContext2D,
  b: DeepReadonly<BattleState>,
  data: FighterData,
  f: Fighter,
): void {
  const isP1 = f.isFaceRight;
  const action = getAction(data, f.currentActionId);
  const adv = frameAdvantage(b, data, isP1);
  const lines = [
    `(${f.x.toFixed(1)}, ${f.y.toFixed(1)})`,
    `Frame: ${f.currentActionFrame}/${action.frameCount}(${adv > 0 ? '+' : ''}${adv})`,
    `Stun: ${f.currentHitStunFrame}`,
    `Action: ${f.currentActionId} ${action.actionName}`,
  ];

  ctx.fillStyle = '#ffffff';
  ctx.font = '28px monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = isP1 ? 'left' : 'right';
  const x = isP1 ? REF_WIDTH * 0.01 : REF_WIDTH * 0.99;
  lines.forEach((line, i) => ctx.fillText(line, x, REF_HEIGHT * (0.86 + i * 0.03)));

  for (const hurtbox of f.hurtboxes) drawFightBox(ctx, hurtbox, HURTBOX);
  drawFightBox(ctx, f.pushbox, PUSHBOX);
  for (const hitbox of f.hitboxes) {
    drawFightBox(ctx, hitbox, hitbox.proximity ? PROXIMITY : HITBOX);
  }
}

/** `DrawFightBox` + `DrawBox` : contour et remplissage à 25 %. */
function drawFightBox(ctx: CanvasRenderingContext2D, box: Readonly<Box>, color: string): void {
  const r = fightBoxToScreen(box);
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeRect(r.x, r.y, r.width, r.height);

  ctx.globalAlpha = FILL_ALPHA;
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.width, r.height);
  ctx.globalAlpha = 1;
}
