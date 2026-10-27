// Port de BattleCore.cs (vendor/footsies-original/Assets/Script/BattleCore.cs).
// Les entrées (clavier, manette, IA, rejeu) arrivent en paramètre de `stepBattle` : le moteur
// n'appelle ni InputManager ni BattleAI. Débug (F1/F2) et enregistrement des inputs : hors moteur.
import { overlaps, rectOverlaps, rectXMax, rectXMin, xMax, xMin, yMax, yMin } from './boxes.ts';
import { getAction, type FighterData } from './fighter-data.ts';
import { DT, f32 } from './f32.ts';
import {
  applyPositionChange,
  canAttackHit,
  clearInput,
  createFighter,
  getAttackData,
  getHitStunFrame,
  incrementActionFrame,
  isDead,
  notifyAttackHit,
  notifyDamaged,
  notifyInProximityGuardRange,
  requestWinAction,
  setHitStun,
  setSpriteShakeFrame,
  setupBattleStart,
  updateActionRequest,
  updateBoxes,
  updateInput,
  updateIntroAction,
  updateMovement,
} from './fighter.ts';
import type { DeepReadonly } from './readonly.ts';
import type { BattleEvent, FighterContext, FighterState } from './types.ts';

/** `RoundStateType` (BattleCore.cs:14-21). */
export const RoundState = { Stop: 0, Intro: 1, Fight: 2, KO: 3, End: 4 } as const;
export type RoundState = (typeof RoundState)[keyof typeof RoundState];

// Constantes de BattleCore (BattleCore.cs:24, 45, 81-84), en float 32 bits.
const BATTLE_AREA_WIDTH = f32(10);
const MAX_ROUND_WON = 3;
const INTRO_STATE_TIME = f32(3);
const KO_STATE_TIME = f32(2);
const END_STATE_TIME = f32(3);
const END_STATE_SKIPPABLE_TIME = f32(1.5);

export interface BattleState {
  fighter1: FighterState;
  fighter2: FighterState;
  fighter1RoundWon: number;
  fighter2RoundWon: number;
  roundState: RoundState;
  /** Décompte en secondes (float 32 bits), décrémenté de `DT` à chaque tick. */
  timer: number;
  /** Un joueur a atteint 3 rounds : le C# charge l'écran titre. Plus aucun tick n'est simulé. */
  matchOver: boolean;
  /** Événements du dernier tick (sons, dégâts, déclencheurs d'UI). Hors hash. */
  events: BattleEvent[];
}

/** Entrées d'un tick. `skip` : une touche Attack physique est pressée (saut de l'écran de fin). */
export interface BattleInput {
  p1: number;
  p2: number;
  skip?: boolean;
}

/** `Awake` (BattleCore.cs:86-101). */
export function createBattle(): BattleState {
  return {
    fighter1: createFighter(),
    fighter2: createFighter(),
    fighter1RoundWon: 0,
    fighter2RoundWon: 0,
    roundState: RoundState.Stop,
    timer: 0,
    matchOver: false,
    events: [],
  };
}

const fightersOf = (b: BattleState): [FighterState, FighterState] => [b.fighter1, b.fighter2];

/** `FixedUpdate` (BattleCore.cs:103-169) : un tick à 50 Hz. */
export function stepBattle(b: BattleState, data: FighterData, input: BattleInput): void {
  if (b.matchOver) return;

  b.events = [];
  const ctx: FighterContext = { data, events: b.events };

  switch (b.roundState) {
    case RoundState.Stop:
      changeRoundState(b, ctx, RoundState.Intro);
      break;

    case RoundState.Intro:
      updateIntroState(b, ctx, input);
      b.timer = f32(b.timer - DT);
      if (b.timer <= 0) changeRoundState(b, ctx, RoundState.Fight);
      break;

    case RoundState.Fight:
      updateFightState(b, ctx, input);
      if (fightersOf(b).some(isDead)) changeRoundState(b, ctx, RoundState.KO);
      break;

    case RoundState.KO:
      // UpdateKOState : rien, le jeu est figé.
      b.timer = f32(b.timer - DT);
      if (b.timer <= 0) changeRoundState(b, ctx, RoundState.End);
      break;

    case RoundState.End:
      updateEndState(b, ctx);
      b.timer = f32(b.timer - DT);
      if (b.timer <= 0 || (b.timer <= END_STATE_SKIPPABLE_TIME && input.skip === true)) {
        changeRoundState(b, ctx, RoundState.Stop);
      }
      break;
  }
}

/** `ChangeRoundState` (BattleCore.cs:171-241). */
function changeRoundState(b: BattleState, ctx: FighterContext, state: RoundState): void {
  b.roundState = state;
  switch (state) {
    case RoundState.Stop:
      if (b.fighter1RoundWon >= MAX_ROUND_WON || b.fighter2RoundWon >= MAX_ROUND_WON) {
        b.matchOver = true; // GameManager.LoadTitleScene()
      }
      break;

    case RoundState.Intro:
      setupBattleStart(b.fighter1, ctx, -2, 0, true);
      setupBattleStart(b.fighter2, ctx, 2, 0, false);
      b.timer = INTRO_STATE_TIME;
      ctx.events.push({ kind: 'roundStart' });
      break;

    case RoundState.Fight:
      break;

    case RoundState.KO:
      b.timer = KO_STATE_TIME;
      clearInput(b.fighter1);
      clearInput(b.fighter2);
      ctx.events.push({ kind: 'roundEnd' });
      break;

    case RoundState.End: {
      b.timer = END_STATE_TIME;
      const dead = fightersOf(b).filter(isDead);
      // Double KO : personne ne marque, le round est rejoué.
      if (dead.length === 1) {
        if (dead[0] === b.fighter1) {
          b.fighter2RoundWon++;
          requestWinAction(b.fighter2);
        } else {
          b.fighter1RoundWon++;
          requestWinAction(b.fighter1);
        }
      }
      break;
    }
  }
}

/** `UpdateIntroState` (BattleCore.cs:243-259) : pas de `UpdateActionRequest`, seulement STAND. */
function updateIntroState(b: BattleState, ctx: FighterContext, input: BattleInput): void {
  const fighters = fightersOf(b);
  updateInput(b.fighter1, input.p1);
  updateInput(b.fighter2, input.p2);

  fighters.forEach((f) => incrementActionFrame(f, ctx));

  fighters.forEach((f) => updateIntroAction(f, ctx));
  fighters.forEach((f) => updateMovement(f, ctx));
  fighters.forEach((f) => updateBoxes(f, ctx));

  pushCharacterVsCharacter(b);
  pushCharacterVsBackground(b);
}

/** `UpdateFightState` (BattleCore.cs:261-278) : l'ordre des étapes a des conséquences de gameplay. */
function updateFightState(b: BattleState, ctx: FighterContext, input: BattleInput): void {
  const fighters = fightersOf(b);
  updateInput(b.fighter1, input.p1);
  updateInput(b.fighter2, input.p2);

  fighters.forEach((f) => incrementActionFrame(f, ctx));

  fighters.forEach((f) => updateActionRequest(f, ctx));
  fighters.forEach((f) => updateMovement(f, ctx));
  fighters.forEach((f) => updateBoxes(f, ctx));

  pushCharacterVsCharacter(b);
  pushCharacterVsBackground(b);
  updateHitboxHurtboxCollision(b, ctx);
}

/** `UpdateEndState` (BattleCore.cs:285-295) : pas d'`UpdateInput`, l'historique a été vidé au KO. */
function updateEndState(b: BattleState, ctx: FighterContext): void {
  const fighters = fightersOf(b);
  fighters.forEach((f) => incrementActionFrame(f, ctx));

  fighters.forEach((f) => updateActionRequest(f, ctx));
  fighters.forEach((f) => updateMovement(f, ctx));
  fighters.forEach((f) => updateBoxes(f, ctx));

  pushCharacterVsCharacter(b);
  pushCharacterVsBackground(b);
}

/**
 * `UpdatePushCharacterVsCharacter` (BattleCore.cs:363-381).
 * `rect1` / `rect2` sont des `UnityEngine.Rect` copiés (struct) : `x` y est le bord gauche et
 * `Overlaps` est strict, bien que `x` contienne le centre de la pushbox (voir SPECS 4.3).
 */
function pushCharacterVsCharacter(b: BattleState): void {
  const { fighter1, fighter2 } = b;
  const rect1 = { ...fighter1.pushbox };
  const rect2 = { ...fighter2.pushbox };

  if (!rectOverlaps(rect1, rect2)) return;

  if (fighter1.x < fighter2.x) {
    const overlap = f32(rectXMax(rect1) - rectXMin(rect2));
    applyPositionChange(fighter1, f32(f32(overlap * -1) / 2), fighter1.y);
    applyPositionChange(fighter2, f32(f32(overlap * 1) / 2), fighter2.y);
  } else if (fighter1.x > fighter2.x) {
    const overlap = f32(rectXMax(rect2) - rectXMin(rect1));
    applyPositionChange(fighter1, f32(f32(overlap * 1) / 2), fighter1.y);
    // Le C# passe `fighter1.position.y` ici (sans effet : y vaut toujours 0).
    applyPositionChange(fighter2, f32(f32(overlap * -1) / 2), fighter1.y);
  }
}

/** `UpdatePushCharacterVsBackground` (BattleCore.cs:383-399) : bornes de l'aire, pushbox `BoxBase`. */
function pushCharacterVsBackground(b: BattleState): void {
  const stageMinX = f32(f32(BATTLE_AREA_WIDTH * -1) / 2);
  const stageMaxX = f32(BATTLE_AREA_WIDTH / 2);

  for (const f of fightersOf(b)) {
    if (xMin(f.pushbox) < stageMinX) {
      applyPositionChange(f, f32(stageMinX - xMin(f.pushbox)), f.y);
    } else if (xMax(f.pushbox) > stageMaxX) {
      applyPositionChange(f, f32(stageMaxX - xMax(f.pushbox)), f.y);
    }
  }
}

/**
 * `UpdateHitboxHurtboxCollision` (BattleCore.cs:401-471).
 * J1 attaque d'abord, puis J2, SANS recalculer les boxes entre les deux : un coup de J1 change
 * l'action du défenseur, mais les boxes de J2 évaluées ensuite sont celles du début du tick
 * (trade et double KO possibles).
 */
function updateHitboxHurtboxCollision(b: BattleState, ctx: FighterContext): void {
  const fighters = fightersOf(b);

  for (const attacker of fighters) {
    let isHit = false;
    let isProximity = false;
    let hitAttackID = 0;
    const damagePos = { x: 0, y: 0 };

    for (const damaged of fighters) {
      if (attacker === damaged) continue;

      for (const hitbox of attacker.hitboxes) {
        // Un coup qui a déjà touché ne touche plus (numberOfHit).
        if (!canAttackHit(attacker, ctx, hitbox.attackID)) continue;

        for (const hurtbox of damaged.hurtboxes) {
          if (overlaps(hitbox, hurtbox)) {
            if (hitbox.proximity) {
              isProximity = true;
            } else {
              isHit = true;
              hitAttackID = hitbox.attackID;
              const x1 = Math.min(xMax(hitbox), xMax(hurtbox));
              const x2 = Math.max(xMin(hitbox), xMin(hurtbox));
              const y1 = Math.min(yMax(hitbox), yMax(hurtbox));
              const y2 = Math.max(yMin(hitbox), yMin(hurtbox));
              damagePos.x = f32(f32(x1 + x2) / 2);
              damagePos.y = f32(f32(y1 + y2) / 2);
              break;
            }
          }
        }

        if (isHit) break;
      }

      if (isHit) {
        notifyAttackHit(attacker);
        const result = notifyDamaged(damaged, ctx, getAttackData(ctx, hitAttackID));

        // Hitstop : l'attaquant ET le défenseur sont gelés.
        const hitStunFrame = getHitStunFrame(ctx, result, hitAttackID);
        setHitStun(attacker, hitStunFrame);
        setHitStun(damaged, hitStunFrame);
        setSpriteShakeFrame(damaged, Math.trunc(hitStunFrame / 3));

        ctx.events.push({
          kind: 'damage',
          damagedIsPlayerOne: damaged === b.fighter1,
          x: damagePos.x,
          y: damagePos.y,
          result,
        });
      } else if (isProximity) {
        notifyInProximityGuardRange(damaged);
      }
    }
  }
}

/**
 * `GetFrameAdvantage` (BattleCore.cs:531-545), pour l'affichage de debug : frames restantes de
 * l'adversaire moins les siennes (une action toujours annulable compte pour 0).
 */
export function frameAdvantage(
  b: DeepReadonly<BattleState>,
  data: FighterData,
  forPlayerOne: boolean,
): number {
  const framesLeft = (f: DeepReadonly<FighterState>): number => {
    const action = getAction(data, f.currentActionId);
    return action.alwaysCancelable ? 0 : action.frameCount - f.currentActionFrame;
  };
  const p1Left = framesLeft(b.fighter1);
  const p2Left = framesLeft(b.fighter2);
  return forPlayerOne ? p2Left - p1Left : p1Left - p2Left;
}
