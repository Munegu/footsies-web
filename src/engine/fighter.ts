// Port de Fighter.cs (vendor/footsies-original/Assets/Script/Fighter.cs).
// Les références `Fighter.cs:NNN` pointent vers la fonction C# portée.
import type { ActionData, AttackData } from '../data/types.ts';
import { transformToFightRect } from './boxes.ts';
import { getAction } from './fighter-data.ts';
import { DT, f32 } from './f32.ts';
import { clearInputHistory, createInputHistory, pushInput } from './input-history.ts';
import {
  ActionId,
  DamageResult,
  InputBit,
  type FighterContext,
  type FighterState,
} from './types.ts';

const MAX_SPRITE_SHAKE_FRAME = 6; // maxSpriteShakeFrame (Fighter.cs:110)

const at = (a: readonly number[], i: number): number => a[i] ?? 0;
const inRange = (frame: number, range: readonly [number, number]): boolean =>
  frame >= range[0] && frame <= range[1];

/** État initial d'un `new Fighter()` (valeurs par défaut C#). */
export function createFighter(): FighterState {
  return {
    x: 0,
    y: 0,
    velocityX: 0,
    isFaceRight: false,
    hitboxes: [],
    hurtboxes: [],
    pushbox: { x: 0, y: 0, width: 0, height: 0 },
    vitalHealth: 0,
    guardHealth: 0,
    currentActionId: 0,
    currentActionFrame: 0,
    currentActionHitCount: 0,
    currentHitStunFrame: 0,
    history: createInputHistory(),
    isInputBackward: false,
    isReserveProximityGuard: false,
    bufferActionId: -1,
    reserveDamageActionId: -1,
    spriteShakePosition: 0,
    hasWon: false,
  };
}

const currentAction = (f: FighterState, ctx: FighterContext): ActionData =>
  getAction(ctx.data, f.currentActionId);

/** `isActionEnd` (Fighter.cs:90). */
export const isActionEnd = (f: FighterState, ctx: FighterContext): boolean =>
  f.currentActionFrame >= currentAction(f, ctx).frameCount;

export const isDead = (f: FighterState): boolean => f.vitalHealth <= 0;

/** `SetupBattleStart` (Fighter.cs:120-135). Ne remet pas `currentHitStunFrame` à zéro (comme le C#). */
export function setupBattleStart(
  f: FighterState,
  ctx: FighterContext,
  startX: number,
  startY: number,
  isPlayerOne: boolean,
): void {
  f.x = f32(startX);
  f.y = f32(startY);
  f.isFaceRight = isPlayerOne;

  f.vitalHealth = 1;
  f.guardHealth = ctx.data.params.startGuardHealth;
  f.hasWon = false;

  f.velocityX = 0;

  clearInput(f);

  setCurrentAction(f, ctx, ActionId.STAND);
}

/** `IncrementActionFrame` (Fighter.cs:140-166). */
export function incrementActionFrame(f: FighterState, ctx: FighterContext): void {
  // Le tremblement du sprite alterne de signe en diminuant d'une unité par tick.
  if (Math.abs(f.spriteShakePosition) > 0) {
    f.spriteShakePosition *= -1;
    f.spriteShakePosition += f.spriteShakePosition > 0 ? -1 : 1;
  }

  // En hitstop la frame d'action ne bouge pas.
  if (f.currentHitStunFrame > 0) {
    f.currentHitStunFrame--;
    return;
  }

  f.currentActionFrame++;

  if (isActionEnd(f, ctx)) {
    const action = currentAction(f, ctx);
    if (action.isLoop) f.currentActionFrame = action.loopFromFrame;
  }
}

/** `UpdateInput` (Fighter.cs:172-188). */
export function updateInput(f: FighterState, bits: number): void {
  pushInput(f.history, bits);
}

/** `ClearInput` (Fighter.cs:521-529). */
export function clearInput(f: FighterState): void {
  clearInputHistory(f.history);
}

/** `UpdateIntroAction` (Fighter.cs:193-196). */
export function updateIntroAction(f: FighterState, ctx: FighterContext): void {
  requestAction(f, ctx, ActionId.STAND);
}

/** `UpdateActionRequest` (Fighter.cs:201-286). L'ordre des `RequestAction` fait partie du comportement. */
export function updateActionRequest(f: FighterState, ctx: FighterContext): void {
  if (f.hasWon) {
    requestAction(f, ctx, ActionId.WIN);
    return;
  }

  // Action réservée (guard break) : jouée une fois le hitstop terminé.
  if (f.reserveDamageActionId !== -1 && f.currentHitStunFrame <= 0) {
    setCurrentAction(f, ctx, f.reserveDamageActionId);
    f.reserveDamageActionId = -1;
    return;
  }

  // Action en buffer (cancel normal -> spécial), seulement si le coup a touché.
  if (f.bufferActionId !== -1 && canCancelAttack(f, ctx) && f.currentHitStunFrame <= 0) {
    setCurrentAction(f, ctx, f.bufferActionId);
    f.bufferActionId = -1;
    return;
  }

  const h = f.history;
  const isForward = isForwardInput(f, at(h.input, 0));
  const isBackward = isBackwardInput(f, at(h.input, 0));
  const isAttack = isAttackInput(at(h.down, 0));
  if (checkSpecialAttackInput(f, ctx)) {
    if (isBackward || isForward) requestAction(f, ctx, ActionId.B_SPECIAL);
    else requestAction(f, ctx, ActionId.N_SPECIAL);
  } else if (isAttack) {
    if (
      (f.currentActionId === ActionId.N_ATTACK || f.currentActionId === ActionId.B_ATTACK) &&
      !isActionEnd(f, ctx)
    ) {
      requestAction(f, ctx, ActionId.N_SPECIAL);
    } else if (isBackward || isForward) {
      requestAction(f, ctx, ActionId.B_ATTACK);
    } else {
      requestAction(f, ctx, ActionId.N_ATTACK);
    }
  }

  if (checkForwardDashInput(f, ctx)) requestAction(f, ctx, ActionId.DASH_FORWARD);
  else if (checkBackwardDashInput(f, ctx)) requestAction(f, ctx, ActionId.DASH_BACKWARD);

  // Pour le test de garde de proximité.
  f.isInputBackward = isBackward;

  if (isForward && isBackward) {
    requestAction(f, ctx, ActionId.STAND);
  } else if (isForward) {
    requestAction(f, ctx, ActionId.FORWARD);
  } else if (isBackward) {
    if (f.isReserveProximityGuard) requestAction(f, ctx, ActionId.GUARD_PROXIMITY);
    else requestAction(f, ctx, ActionId.BACKWARD);
  } else {
    requestAction(f, ctx, ActionId.STAND);
  }

  f.isReserveProximityGuard = false;
}

/** `UpdateMovement` (Fighter.cs:291-319). Vitesses en u/s, multipliées par `DT`. */
export function updateMovement(f: FighterState, ctx: FighterContext): void {
  if (isInHitStun(f)) return;

  const sign = f.isFaceRight ? 1 : -1;
  if (f.currentActionId === ActionId.FORWARD) {
    f.x = f32(f.x + f32(f32(ctx.data.params.forwardMoveSpeed * sign) * DT));
    return;
  } else if (f.currentActionId === ActionId.BACKWARD) {
    f.x = f32(f.x - f32(f32(ctx.data.params.backwardMoveSpeed * sign) * DT));
    return;
  }

  const movement = currentAction(f, ctx).movements.find((m) =>
    inRange(f.currentActionFrame, m.startEndFrame),
  );
  if (movement) {
    f.velocityX = movement.velocity_x;
    if (f.velocityX !== 0) {
      f.x = f32(f.x + f32(f32(f.velocityX * sign) * DT));
    }
  }
}

/** `UpdateBoxes` / `ApplyCurrentActionData` (Fighter.cs:321-324 et 671-697). */
export function updateBoxes(f: FighterState, ctx: FighterContext): void {
  const action = currentAction(f, ctx);
  const frame = f.currentActionFrame;
  const { baseHurtBoxRect, basePushBoxRect } = ctx.data.params;

  f.hitboxes = action.hitboxes
    .filter((h) => inRange(frame, h.startEndFrame))
    .map((h) => ({
      ...transformToFightRect(h.rect, f.x, f.y, f.isFaceRight),
      proximity: h.proximity,
      attackID: h.attackID,
    }));

  f.hurtboxes = action.hurtboxes
    .filter((h) => inRange(frame, h.startEndFrame))
    .map((h) =>
      transformToFightRect(h.useBaseRect ? baseHurtBoxRect : h.rect, f.x, f.y, f.isFaceRight),
    );

  const pushData = action.pushboxes.find((p) => inRange(frame, p.startEndFrame));
  if (!pushData)
    throw new Error(`Action ${f.currentActionId} : pas de pushbox à la frame ${frame}`);
  f.pushbox = transformToFightRect(
    pushData.useBaseRect ? basePushBoxRect : pushData.rect,
    f.x,
    f.y,
    f.isFaceRight,
  );
}

/** `ApplyPositionChange` (Fighter.cs:331-350) : déplace la position et toutes les boxes. */
export function applyPositionChange(f: FighterState, dx: number, dy: number): void {
  f.x = f32(f.x + dx);
  f.y = f32(f.y + dy);
  for (const box of [...f.hitboxes, ...f.hurtboxes, f.pushbox]) {
    box.x = f32(box.x + dx);
    box.y = f32(box.y + dy);
  }
}

/** `NotifyAttackHit` (Fighter.cs:352-355). */
export function notifyAttackHit(f: FighterState): void {
  f.currentActionHitCount++;
}

/** `NotifyDamaged` (Fighter.cs:357-398). La jauge de garde baisse même si le coup n'est pas gardé. */
export function notifyDamaged(
  f: FighterState,
  ctx: FighterContext,
  attack: AttackData,
): DamageResult {
  let isGuardBreak = false;
  if (attack.guardHealthDamage > 0) {
    f.guardHealth -= attack.guardHealthDamage;
    if (f.guardHealth < 0) {
      isGuardBreak = true;
      f.guardHealth = 0;
    }
  }

  // En garde (BACKWARD ou action de type Guard) : le prochain coup est gardé automatiquement.
  if (f.currentActionId === ActionId.BACKWARD || currentAction(f, ctx).type === 'Guard') {
    if (isGuardBreak) {
      setCurrentAction(f, ctx, attack.guardActionID);
      f.reserveDamageActionId = ActionId.GUARD_BREAK;
      playActionSound(f, ctx, ActionId.GUARD_BREAK);
      return DamageResult.GuardBreak;
    }
    setCurrentAction(f, ctx, attack.guardActionID);
    return DamageResult.Guard;
  }

  if (attack.vitalHealthDamage > 0) {
    f.vitalHealth -= attack.vitalHealthDamage;
    if (f.vitalHealth <= 0) f.vitalHealth = 0;
  }
  setCurrentAction(f, ctx, attack.damageActionID);
  return DamageResult.Damage;
}

/** `NotifyInProximityGuardRange` (Fighter.cs:400-406). */
export function notifyInProximityGuardRange(f: FighterState): void {
  if (f.isInputBackward) f.isReserveProximityGuard = true;
}

/** `CanAttackHit` (Fighter.cs:408-420). Une attaque inconnue touche (le C# se contente d'un warning). */
export function canAttackHit(f: FighterState, ctx: FighterContext, attackID: number): boolean {
  const attack = ctx.data.attacks.get(attackID);
  if (!attack) return true;
  return f.currentActionHitCount < attack.numberOfHit;
}

/** `getAttackData` (Fighter.cs:422-431). */
export function getAttackData(ctx: FighterContext, attackID: number): AttackData {
  const attack = ctx.data.attacks.get(attackID);
  if (!attack) throw new Error(`Attaque ${attackID} inconnue`);
  return attack;
}

/** `SetHitStun` (Fighter.cs:433-436). */
export function setHitStun(f: FighterState, frames: number): void {
  f.currentHitStunFrame = frames;
}

export const isInHitStun = (f: FighterState): boolean => f.currentHitStunFrame > 0;

/** `SetSpriteShakeFrame` (Fighter.cs:438-444). */
export function setSpriteShakeFrame(f: FighterState, frames: number): void {
  const n = Math.min(frames, MAX_SPRITE_SHAKE_FRAME);
  f.spriteShakePosition = n === 0 ? 0 : n * (f.isFaceRight ? -1 : 1);
}

/** `GetHitStunFrame` (Fighter.cs:446-454). */
export function getHitStunFrame(
  ctx: FighterContext,
  result: DamageResult,
  attackID: number,
): number {
  const attack = getAttackData(ctx, attackID);
  if (result === DamageResult.Guard) return attack.guardStunFrame;
  if (result === DamageResult.GuardBreak) return attack.guardBreakStunFrame;
  return attack.hitStunFrame;
}

/** `RequestWinAction` (Fighter.cs:461-464). */
export function requestWinAction(f: FighterState): void {
  f.hasWon = true;
}

/** `RequestAction` (Fighter.cs:472-510). */
export function requestAction(
  f: FighterState,
  ctx: FighterContext,
  actionId: number,
  startFrame = 0,
): boolean {
  if (isActionEnd(f, ctx)) {
    setCurrentAction(f, ctx, actionId, startFrame);
    return true;
  }

  if (f.currentActionId === actionId) return false;

  const action = currentAction(f, ctx);
  if (action.alwaysCancelable) {
    setCurrentAction(f, ctx, actionId, startFrame);
    return true;
  }

  for (const cancel of action.cancels) {
    if (!inRange(f.currentActionFrame, cancel.startEndFrame)) continue;
    if (cancel.actionID.includes(actionId)) {
      if (cancel.execute) {
        f.bufferActionId = actionId;
        return true;
      } else if (cancel.buffer) {
        f.bufferActionId = actionId;
      }
    }
  }

  return false;
}

/** `canCancelAttack` (Fighter.cs:531-539). */
function canCancelAttack(f: FighterState, ctx: FighterContext): boolean {
  if (ctx.data.params.canCancelOnWhiff) return true;
  return f.currentActionHitCount > 0;
}

/** Son de l'action (`SoundManager.playFighterSE`), remonté en événement. */
function playActionSound(f: FighterState, ctx: FighterContext, actionId: number): void {
  const clip = getAction(ctx.data, actionId).audioClip;
  if (clip !== null) {
    ctx.events.push({ kind: 'sound', clip, playerOne: f.isFaceRight, posX: f.x });
  }
}

/** `SetCurrentAction` (Fighter.cs:546-563). Le son de GUARD_BREAK est joué à l'impact, pas ici. */
export function setCurrentAction(
  f: FighterState,
  ctx: FighterContext,
  actionId: number,
  startFrame = 0,
): void {
  f.currentActionId = actionId;
  f.currentActionFrame = startFrame;

  f.currentActionHitCount = 0;
  f.bufferActionId = -1;
  f.reserveDamageActionId = -1;
  f.spriteShakePosition = 0;

  if (actionId !== ActionId.GUARD_BREAK) playActionSound(f, ctx, actionId);
}

/** `CheckSpecialAttackInput` (Fighter.cs:569-583) : relâcher Attack après l'avoir tenu 59 ticks. */
function checkSpecialAttackInput(f: FighterState, ctx: FighterContext): boolean {
  if (!isAttackInput(at(f.history.up, 0))) return false;

  for (let i = 1; i < ctx.data.params.specialAttackHoldFrame; i++) {
    if (!isAttackInput(at(f.history.input, i))) return false;
  }
  return true;
}

/** `CheckForwardDashInput` (Fighter.cs:585-609). */
function checkForwardDashInput(f: FighterState, ctx: FighterContext): boolean {
  return checkDashInput(f, ctx, isForwardInput, isBackwardInput);
}

/** `CheckBackwardDashInput` (Fighter.cs:611-635). */
function checkBackwardDashInput(f: FighterState, ctx: FighterContext): boolean {
  return checkDashInput(f, ctx, isBackwardInput, isForwardInput);
}

/**
 * Les deux checks de dash du C# sont identiques au sens près : on cherche un premier appui
 * dans les `dashAllowFrame` derniers ticks (sans appui contraire entre-temps), puis un tick
 * neutre dans la fenêtre qui précède cet appui.
 */
function checkDashInput(
  f: FighterState,
  ctx: FighterContext,
  isSame: (f: FighterState, input: number) => boolean,
  isOpposite: (f: FighterState, input: number) => boolean,
): boolean {
  const { input, down } = f.history;
  const allow = ctx.data.params.dashAllowFrame;
  if (!isSame(f, at(down, 0))) return false;

  for (let i = 1; i < allow; i++) {
    if (isOpposite(f, at(input, i))) return false;

    if (isSame(f, at(input, i))) {
      for (let j = i + 1; j < i + allow; j++) {
        if (!isSame(f, at(input, j)) && !isOpposite(f, at(input, j))) return true;
      }
      return false;
    }
  }
  return false;
}

const isAttackInput = (bits: number): boolean => (bits & InputBit.Attack) > 0;

function isForwardInput(f: FighterState, bits: number): boolean {
  return (bits & (f.isFaceRight ? InputBit.Right : InputBit.Left)) > 0;
}

function isBackwardInput(f: FighterState, bits: number): boolean {
  return (bits & (f.isFaceRight ? InputBit.Left : InputBit.Right)) > 0;
}
