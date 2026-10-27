// Port de BattleAI.cs (vendor/footsies-original/Assets/Script/BattleAI.cs).
// L'IA joue J2 : elle observe J1, son « avant » est le bit Left et son « arrière » le bit Right.
// Les références `BattleAI.cs:NNN` pointent vers la fonction C# portée.
import type { BattleState } from '../engine/battle.ts';
import { f32 } from '../engine/f32.ts';
import type { DeepReadonly } from '../engine/readonly.ts';
import { ActionId, InputBit } from '../engine/types.ts';

/** `FightState` (BattleAI.cs:10-18) : ce que l'IA a observé de l'adversaire à un tick donné. */
export interface FightState {
  distanceX: number;
  isOpponentDamage: boolean;
  isOpponentGuardBreak: boolean;
  /** Calculé par l'original mais jamais lu. */
  isOpponentBlocking: boolean;
  isOpponentNormalAttack: boolean;
  isOpponentSpecialAttack: boolean;
}

/** `maxFightStateRecord` et `fightStateReadIndex` (BattleAI.cs:27-28). */
export const MAX_FIGHT_STATE_RECORD = 10;
export const FIGHT_STATE_READ_INDEX = 5;

/** État de l'IA : données pures (les `Queue<int>` du C# sont des tableaux). */
export interface BattleAIState {
  moveQueue: number[];
  attackQueue: number[];
  fightStates: (FightState | null)[];
}

/** `Random.Range(min, maxExclusive)` : fourni par l'appelant (RNG seedé ou valeurs scriptées). */
export type RandomInt = (min: number, maxExclusive: number) => number;

// GetForwardInput / GetBackwardInput / GetAttackInput (BattleAI.cs:369-382), pour un J2 tourné à gauche.
const FORWARD = InputBit.Left;
const BACKWARD = InputBit.Right;
const ATTACK = InputBit.Attack;

/** `new BattleAI(core)` : files vides, aucun état observé. */
export function createBattleAI(): BattleAIState {
  return {
    moveQueue: [],
    attackQueue: [],
    fightStates: new Array<FightState | null>(MAX_FIGHT_STATE_RECORD).fill(null),
  };
}

/** `getNextAIInput` (BattleAI.cs:35-60) : les bits d'input de J2 pour ce tick. */
export function nextAIInput(
  ai: BattleAIState,
  randInt: RandomInt,
  battle: DeepReadonly<BattleState>,
): number {
  let input = 0;

  updateFightState(ai, battle);
  const fightState = ai.fightStates[FIGHT_STATE_READ_INDEX] ?? null;
  if (fightState !== null) {
    // Une file vide déclenche le choix d'un nouveau pattern, mais ne fournit rien ce tick-là.
    if (ai.moveQueue.length > 0) input |= ai.moveQueue.shift() ?? 0;
    else selectMovement(ai, randInt, fightState);

    if (ai.attackQueue.length > 0) input |= ai.attackQueue.shift() ?? 0;
    else selectAttack(ai, randInt, fightState);
  }

  return input;
}

/** `SelectMovement` (BattleAI.cs:62-120) : pattern de déplacement selon la distance. */
function selectMovement(ai: BattleAIState, randInt: RandomInt, s: FightState): void {
  if (s.distanceX > 4) {
    const rand = randInt(0, 2);
    if (rand === 0) addFarApproach1(ai);
    else addFarApproach2(ai);
  } else if (s.distanceX > 3) {
    const rand = randInt(0, 7);
    if (rand <= 1) addMidApproach1(ai);
    else if (rand <= 3) addMidApproach2(ai);
    else if (rand === 4) addFarApproach1(ai);
    else if (rand === 5) addFarApproach2(ai);
    else addNeutralMovement(ai);
  } else if (s.distanceX > 2.5) {
    const rand = randInt(0, 5);
    if (rand === 0) addMidApproach1(ai);
    else if (rand === 1) addMidApproach2(ai);
    else if (rand === 2) addFallBack1(ai);
    else if (rand === 3) addFallBack2(ai);
    else addNeutralMovement(ai);
  } else if (s.distanceX > 2) {
    const rand = randInt(0, 4);
    if (rand === 0) addFallBack1(ai);
    else if (rand === 1) addFallBack2(ai);
    else addNeutralMovement(ai);
  } else {
    const rand = randInt(0, 3);
    if (rand === 0) addFallBack1(ai);
    else if (rand === 1) addFallBack2(ai);
    else addNeutralMovement(ai);
  }
}

/** `SelectAttack` (BattleAI.cs:122-184) : pattern d'attaque selon l'état adverse et la distance. */
function selectAttack(ai: BattleAIState, randInt: RandomInt, s: FightState): void {
  if (s.isOpponentDamage || s.isOpponentGuardBreak || s.isOpponentSpecialAttack) {
    addTwoHitImmediateAttack(ai);
  } else if (s.distanceX > 4) {
    // Comme l'original : `rand <= 3` est toujours vrai pour Range(0, 4), le spécial retardé
    // de cette plage n'est jamais choisi.
    const rand = randInt(0, 4);
    if (rand <= 3) addNoAttack(ai);
    else addDelaySpecialAttack(ai);
  } else if (s.distanceX > 3) {
    if (s.isOpponentNormalAttack) {
      addTwoHitImmediateAttack(ai);
      return;
    }
    const rand = randInt(0, 5);
    if (rand <= 1) addNoAttack(ai);
    else if (rand <= 3) addOneHitImmediateAttack(ai);
    else addDelaySpecialAttack(ai);
  } else if (s.distanceX > 2.5) {
    const rand = randInt(0, 3);
    if (rand === 0) addNoAttack(ai);
    else if (rand === 1) addOneHitImmediateAttack(ai);
    else addTwoHitImmediateAttack(ai);
  } else if (s.distanceX > 2) {
    const rand = randInt(0, 6);
    if (rand <= 1) addOneHitImmediateAttack(ai);
    else if (rand <= 3) addTwoHitImmediateAttack(ai);
    else if (rand === 4) addImmediateSpecialAttack(ai);
    else addDelaySpecialAttack(ai);
  } else {
    const rand = randInt(0, 3);
    if (rand === 0) addOneHitImmediateAttack(ai);
    else addTwoHitImmediateAttack(ai);
  }
}

const push = (queue: number[], bits: number, count: number): void => {
  for (let i = 0; i < count; i++) queue.push(bits);
};

// Patterns de déplacement (BattleAI.cs:186-247).

function addNeutralMovement(ai: BattleAIState): void {
  push(ai.moveQueue, 0, 30);
}

function addFarApproach1(ai: BattleAIState): void {
  push(ai.moveQueue, FORWARD, 40);
  push(ai.moveQueue, BACKWARD, 10);
  push(ai.moveQueue, FORWARD, 30);
  push(ai.moveQueue, BACKWARD, 10);
}

function addFarApproach2(ai: BattleAIState): void {
  addForwardDash(ai);
  push(ai.moveQueue, BACKWARD, 25);
  addForwardDash(ai);
  push(ai.moveQueue, BACKWARD, 25);
}

function addMidApproach1(ai: BattleAIState): void {
  push(ai.moveQueue, FORWARD, 30);
  push(ai.moveQueue, BACKWARD, 10);
  push(ai.moveQueue, FORWARD, 20);
  push(ai.moveQueue, BACKWARD, 10);
}

function addMidApproach2(ai: BattleAIState): void {
  addForwardDash(ai);
  push(ai.moveQueue, BACKWARD, 30);
}

function addFallBack1(ai: BattleAIState): void {
  push(ai.moveQueue, BACKWARD, 60);
}

function addFallBack2(ai: BattleAIState): void {
  addBackwardDash(ai);
  push(ai.moveQueue, BACKWARD, 60);
}

// Patterns d'attaque (BattleAI.cs:249-306).

function addNoAttack(ai: BattleAIState): void {
  push(ai.attackQueue, 0, 30);
}

function addOneHitImmediateAttack(ai: BattleAIState): void {
  ai.attackQueue.push(ATTACK);
  push(ai.attackQueue, 0, 18);
}

function addTwoHitImmediateAttack(ai: BattleAIState): void {
  ai.attackQueue.push(ATTACK);
  push(ai.attackQueue, 0, 3);
  ai.attackQueue.push(ATTACK);
  push(ai.attackQueue, 0, 18);
}

function addImmediateSpecialAttack(ai: BattleAIState): void {
  push(ai.attackQueue, ATTACK, 60);
  ai.attackQueue.push(0);
}

function addDelaySpecialAttack(ai: BattleAIState): void {
  push(ai.attackQueue, ATTACK, 120);
  ai.attackQueue.push(0);
}

/** `AddForwardDashInputQueue` (BattleAI.cs:324-329) : avant, neutre, avant. */
function addForwardDash(ai: BattleAIState): void {
  ai.moveQueue.push(FORWARD, 0, FORWARD);
}

/**
 * `AddBackwardDashInputQueue` (BattleAI.cs:331-336). Copier-coller de l'original : il appelle
 * `GetForwardInput()` aux deux endroits. Ce « dash arrière » est donc un dash AVANT. Conservé
 * tel quel (SPECS §11 : fidélité avant tout).
 */
function addBackwardDash(ai: BattleAIState): void {
  ai.moveQueue.push(FORWARD, 0, FORWARD);
}

/**
 * `UpdateFightState` (BattleAI.cs:338-357).
 * Le décalage de l'historique est porté LITTÉRALEMENT. La boucle du C# est croissante :
 * `fightStates[i] = fightStates[i - 1]` recopie une case déjà écrasée, donc toutes les cases
 * 1 à 9 reçoivent l'ancien `fightStates[0]`. L'IA lit la case 5 : c'est l'état du tick
 * PRÉCÉDENT (retard de 1 tick, pas de 5 comme l'auteur le voulait sans doute), et elle décide
 * dès le 2e appel.
 */
function updateFightState(ai: BattleAIState, battle: DeepReadonly<BattleState>): void {
  const opponentAction = battle.fighter1.currentActionId;
  const current: FightState = {
    distanceX: f32(Math.abs(f32(battle.fighter2.x - battle.fighter1.x))),
    isOpponentDamage: opponentAction === ActionId.DAMAGE,
    isOpponentGuardBreak: opponentAction === ActionId.GUARD_BREAK,
    isOpponentBlocking:
      opponentAction === ActionId.GUARD_CROUCH ||
      opponentAction === ActionId.GUARD_STAND ||
      opponentAction === ActionId.GUARD_M,
    isOpponentNormalAttack:
      opponentAction === ActionId.N_ATTACK || opponentAction === ActionId.B_ATTACK,
    isOpponentSpecialAttack:
      opponentAction === ActionId.N_SPECIAL || opponentAction === ActionId.B_SPECIAL,
  };

  for (let i = 1; i < ai.fightStates.length; i++) {
    ai.fightStates[i] = ai.fightStates[i - 1] ?? null;
  }
  ai.fightStates[0] = current;
}
