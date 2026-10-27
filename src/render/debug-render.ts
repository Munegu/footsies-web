// Overlay de debug (F12) : boxes colorées et textes de frame data, par-dessus le jeu.
// Port de BattleGUI.DrawFighter / DrawFightBox / DrawBox (BattleGUI.cs). Lit l'état du moteur
// sans jamais le modifier (DeepReadonly).
import { frameAdvantage, type BattleState } from '../engine/battle.ts';
import type { Box } from '../engine/boxes.ts';
import { getAction, type FighterData } from '../engine/fighter-data.ts';
import type { DeepReadonly } from '../engine/readonly.ts';
import type { FighterState } from '../engine/types.ts';
import { REF_HEIGHT, REF_WIDTH, fightBoxToScreen } from './layout.ts';

type Fighter = DeepReadonly<FighterState>;

const LINE_WIDTH = 3; // `_battleBoxLineWidth` = 2 px écran dans l'original
const FILL_ALPHA = 0.25;

// Couleurs de DrawFighter.
const HURTBOX = '#ffff00';
const PUSHBOX = '#3060ff';
const HITBOX = '#ff2020';
const PROXIMITY = '#909090';

export function renderDebugOverlay(
  ctx: CanvasRenderingContext2D,
  b: DeepReadonly<BattleState>,
  data: FighterData,
): void {
  for (const f of [b.fighter1, b.fighter2]) drawFighterDebug(ctx, b, data, f);

  ctx.fillStyle = '#505050';
  ctx.font = '26px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('F12 = affichage debug', REF_WIDTH / 2, REF_HEIGHT * 0.95);
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

  ctx.fillStyle = '#000000';
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
