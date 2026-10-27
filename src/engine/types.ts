import type { FighterData } from './fighter-data.ts';
import type { InputHistory } from './input-history.ts';
import type { Box, HitboxState } from './boxes.ts';

/** `InputDefine` (InputData.cs). */
export const InputBit = { None: 0, Left: 1, Right: 2, Attack: 4 } as const;

/** `CommonActionID` (Fighter.cs). */
export const ActionId = {
  STAND: 0,
  FORWARD: 1,
  BACKWARD: 2,
  DASH_FORWARD: 10,
  DASH_BACKWARD: 11,
  N_ATTACK: 100,
  B_ATTACK: 105,
  N_SPECIAL: 110,
  B_SPECIAL: 115,
  DAMAGE: 200,
  GUARD_M: 301,
  GUARD_STAND: 305,
  GUARD_CROUCH: 306,
  GUARD_BREAK: 310,
  GUARD_PROXIMITY: 350,
  DEAD: 500,
  WIN: 510,
} as const;

/** `DamageResult` (Fighter.cs). */
export const DamageResult = { Damage: 1, Guard: 2, GuardBreak: 3, Counter: 4 } as const;
export type DamageResult = (typeof DamageResult)[keyof typeof DamageResult];

/** État d'un combattant : données pures et sérialisables (structuredClone, hash). */
export interface FighterState {
  x: number;
  y: number;
  velocityX: number;
  isFaceRight: boolean;

  hitboxes: HitboxState[];
  hurtboxes: Box[];
  pushbox: Box;

  vitalHealth: number;
  guardHealth: number;

  currentActionId: number;
  currentActionFrame: number;
  currentActionHitCount: number;
  currentHitStunFrame: number;

  history: InputHistory;

  isInputBackward: boolean;
  isReserveProximityGuard: boolean;
  bufferActionId: number;
  reserveDamageActionId: number;
  spriteShakePosition: number;
  hasWon: boolean;
}

/** Effets de bord du C# (SoundManager, damageHandler), remontés au lieu d'être appelés. */
export type BattleEvent = {
  kind: 'sound';
  clip: string;
  /** `isFaceRight` du combattant : c'est ce que le C# passe comme `isPlayerOne`. */
  playerOne: boolean;
  posX: number;
};

/** Ce dont les fonctions du moteur ont besoin en plus de l'état. */
export interface FighterContext {
  data: FighterData;
  events: BattleEvent[];
}
