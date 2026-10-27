import { describe, expect, it } from 'vitest';
import {
  RoundState,
  createBattle,
  frameAdvantage,
  stepBattle,
  type BattleInput,
  type BattleState,
} from '../src/engine/battle.ts';
import { DT, f32 } from '../src/engine/f32.ts';
import { setCurrentAction } from '../src/engine/fighter.ts';
import { ActionId, DamageResult, InputBit, type BattleEvent } from '../src/engine/types.ts';
import { data, repeat } from './helpers/engine.ts';

const { Left, Right, Attack } = InputBit;
const NEUTRAL: BattleInput = { p1: 0, p2: 0 };

const step = (b: BattleState, input: BattleInput = NEUTRAL): void => stepBattle(b, data, input);

function stepUntil(b: BattleState, done: (b: BattleState) => boolean, input = NEUTRAL, max = 5000) {
  let n = 0;
  while (!done(b)) {
    if (n++ >= max) throw new Error('trop de ticks');
    step(b, input);
  }
  return n;
}

/** Bat un combat jusqu'au début de la phase Fight. */
function fightBattle(): BattleState {
  const b = createBattle();
  stepUntil(b, (s) => s.roundState === RoundState.Fight);
  return b;
}

/** Ticks nécessaires à un timer float 32 bits (-= DT par tick) pour passer sous `limit` (inclus). */
function timerTicks(seconds: number, limit = 0): number {
  let t = f32(seconds);
  let n = 0;
  while (t > limit) {
    t = f32(t - DT);
    n++;
  }
  return n;
}

const damageEvents = (b: BattleState) => b.events.filter((e) => e.kind === 'damage');

/** Appuyer, relâcher, et jouer pour que J1 lance N_ATTACK (frame 0 au tick de l'appui). */
function attackOnce(b: BattleState, ticks: number): void {
  step(b, { p1: Attack, p2: 0 });
  for (let i = 0; i < ticks; i++) step(b);
}

describe("déroulé d'un round", () => {
  it('Stop -> Intro : un tick, persos replacés, garde 3, événement roundStart', () => {
    const b = createBattle();
    expect(b.roundState).toBe(RoundState.Stop);
    step(b);
    expect(b.roundState).toBe(RoundState.Intro);
    expect(b.timer).toBe(3);
    expect([b.fighter1.x, b.fighter2.x]).toEqual([-2, 2]);
    expect([b.fighter1.isFaceRight, b.fighter2.isFaceRight]).toEqual([true, false]);
    expect([b.fighter1.guardHealth, b.fighter2.guardHealth]).toEqual([3, 3]);
    expect(b.events).toEqual([{ kind: 'roundStart' }]);
  });

  it("l'intro dure 151 ticks, pas 150 : timer float 32 bits -= 0.02f", () => {
    expect(timerTicks(3)).toBe(151);
    const b = createBattle();
    step(b); // Stop -> Intro
    const introTicks = stepUntil(b, (s) => s.roundState === RoundState.Fight);
    expect(introTicks).toBe(151);
  });

  it("pendant l'intro les persos restent en STAND, même si on appuie", () => {
    const b = createBattle();
    step(b);
    for (let i = 0; i < 60; i++) step(b, { p1: Right | Attack, p2: Left });
    expect(b.fighter1.currentActionId).toBe(ActionId.STAND);
    expect(b.fighter2.currentActionId).toBe(ActionId.STAND);
    expect([b.fighter1.x, b.fighter2.x]).toEqual([-2, 2]);
  });

  it('en Fight, les persos répondent aux inputs', () => {
    const b = fightBattle();
    step(b, { p1: Right, p2: Left });
    expect(b.fighter1.currentActionId).toBe(ActionId.FORWARD);
    expect(b.fighter2.currentActionId).toBe(ActionId.FORWARD);
    expect(b.fighter1.x).toBeGreaterThan(-2);
    expect(b.fighter2.x).toBeLessThan(2);
  });
});

describe('poussée perso contre perso', () => {
  it('chevauchement : correction partagée moitié-moitié', () => {
    const b = fightBattle();
    b.fighter1.x = 0;
    b.fighter2.x = 1; // pushbox de base 1,4 : chevauchement de 0,4
    step(b);
    expect(b.fighter1.x).toBeCloseTo(-0.2, 6);
    expect(b.fighter2.x).toBeCloseTo(1.2, 6);
  });

  it('même chose quand J1 est à droite de J2', () => {
    const b = fightBattle();
    b.fighter1.x = 1;
    b.fighter2.x = 0;
    step(b);
    expect(b.fighter1.x).toBeCloseTo(1.2, 6);
    expect(b.fighter2.x).toBeCloseTo(-0.2, 6);
  });

  it('Rect.Overlaps strict : deux pushboxes qui se touchent seulement ne se poussent pas', () => {
    const b = fightBattle();
    b.fighter1.x = 0;
    b.fighter2.x = f32(1.4);
    step(b);
    expect([b.fighter1.x, b.fighter2.x]).toEqual([0, f32(1.4)]);
  });

  it('même position : aucune poussée', () => {
    const b = fightBattle();
    b.fighter1.x = 1;
    b.fighter2.x = 1;
    step(b);
    expect([b.fighter1.x, b.fighter2.x]).toEqual([1, 1]);
  });

  it('x est traité comme le bord gauche du Rect Unity (pushbox DEAD, large et décalée)', () => {
    const b = fightBattle();
    b.fighter1.x = 0; // STAND : pushbox de base, Rect [0 ; 1,4]
    b.fighter2.x = 0.8;
    // J2 (tourné à gauche) en DEAD frame 25 : pushbox x = -0,5 * -1, largeur 2,5 -> Rect [1,3 ; 3,8]
    setCurrentAction(b.fighter2, { data, events: [] }, ActionId.DEAD, 24);
    step(b);
    // Le recul de DEAD (frames 20-39 : -3 u/s) pousse d'abord J2 de +0,06 -> Rect [1,36 ; 3,86].
    // Chevauchement de 1,4 - 1,36 = 0,04 -> 0,02 chacun. Avec un x centré on aurait poussé de 0,3.
    expect(b.fighter1.x).toBeCloseTo(-0.02, 6);
    expect(b.fighter2.x).toBeCloseTo(0.88, 6);
  });
});

describe("bords de l'aire", () => {
  it("un perso ne sort pas de l'aire (x de -5 à +5, pushbox 1,4)", () => {
    const b = fightBattle();
    b.fighter1.x = -4.9;
    b.fighter2.x = 4.9;
    step(b);
    expect(b.fighter1.x).toBeCloseTo(-4.3, 5);
    expect(b.fighter2.x).toBeCloseTo(4.3, 5);
    expect(b.fighter1.pushbox.x - b.fighter1.pushbox.width / 2).toBeCloseTo(-5, 5);
  });

  it('marcher contre le bord ne le dépasse pas', () => {
    const b = fightBattle();
    for (let i = 0; i < 300; i++) step(b, { p1: Left, p2: 0 });
    expect(b.fighter1.x).toBeCloseTo(-4.3, 5);
  });
});

describe('coups : normal, hitstop, garde', () => {
  /** J1 à -1,5 et J2 à 1 : la hitbox de N_ATTACK (portée 1,8) touche à 2,5. */
  function closeBattle(): BattleState {
    const b = fightBattle();
    b.fighter1.x = -1.5;
    b.fighter2.x = 1;
    return b;
  }

  it('un normal touche à la frame 4 : DAMAGE, hitstop 12 des deux côtés, garde -1 même sans garde', () => {
    const b = closeBattle();
    attackOnce(b, 3);
    expect(damageEvents(b)).toHaveLength(0);
    step(b); // frame 4 : la hitbox réelle devient active
    expect(damageEvents(b)).toHaveLength(1);
    expect(b.fighter2.currentActionId).toBe(ActionId.DAMAGE);
    expect(b.fighter2.vitalHealth).toBe(1);
    expect(b.fighter2.guardHealth).toBe(2);
    expect([b.fighter1.currentHitStunFrame, b.fighter2.currentHitStunFrame]).toEqual([12, 12]);
    expect(b.fighter1.currentActionHitCount).toBe(1);
    expect(b.fighter2.spriteShakePosition).toBe(4); // 12 / 3, J2 regarde à gauche
  });

  it("l'événement de dégât porte le résultat et le point d'impact", () => {
    const b = closeBattle();
    attackOnce(b, 4);
    const evt = b.events.find(
      (e): e is Extract<BattleEvent, { kind: 'damage' }> => e.kind === 'damage',
    );
    expect(evt).toMatchObject({ damagedIsPlayerOne: false, result: DamageResult.Damage });
    expect(evt?.x).toBeGreaterThan(0.2);
    expect(evt?.x).toBeLessThan(1);
  });

  it('hitstop : la frame du coup reste figée 12 ticks, puis repart', () => {
    const b = closeBattle();
    attackOnce(b, 4);
    expect(b.fighter1.currentActionFrame).toBe(4);
    for (let i = 0; i < 12; i++) step(b);
    expect(b.fighter1.currentActionFrame).toBe(4);
    step(b);
    expect(b.fighter1.currentActionFrame).toBe(5);
  });

  it("un coup ne touche qu'une fois (numberOfHit)", () => {
    const b = closeBattle();
    attackOnce(b, 4);
    let hits = 0;
    for (let i = 0; i < 25; i++) {
      step(b);
      hits += damageEvents(b).length;
    }
    expect(hits).toBe(0);
  });

  it('défenseur en arrière : coup gardé, hitstop de garde, pas de dégât vital', () => {
    const b = fightBattle();
    b.fighter1.x = -1.5;
    b.fighter2.x = 0.7;
    // J2 tient arrière (Droite) : la hitbox de proximité l'arrête en GUARD_PROXIMITY, toujours en garde.
    step(b, { p1: Attack, p2: Right });
    let result: unknown;
    for (let i = 0; i < 8 && result === undefined; i++) {
      step(b, { p1: 0, p2: Right });
      result = damageEvents(b)[0]?.result;
    }
    expect(result).toBe(DamageResult.Guard);
    expect(b.fighter2.currentActionId).toBe(ActionId.GUARD_CROUCH);
    expect(b.fighter2.vitalHealth).toBe(1);
    expect(b.fighter2.guardHealth).toBe(2);
    expect([b.fighter1.currentHitStunFrame, b.fighter2.currentHitStunFrame]).toEqual([12, 12]);
  });

  it('garde à 0 : le coup suivant gardé fait un guard break (hitstop 30, puis GUARD_BREAK)', () => {
    const b = fightBattle();
    b.fighter1.x = -1.5;
    b.fighter2.x = 0.7;
    b.fighter2.guardHealth = 0;
    step(b, { p1: Attack, p2: Right });
    let result: unknown;
    for (let i = 0; i < 8 && result === undefined; i++) {
      step(b, { p1: 0, p2: Right });
      result = damageEvents(b)[0]?.result;
    }
    expect(result).toBe(DamageResult.GuardBreak);
    expect(b.fighter2.guardHealth).toBe(0);
    expect(b.fighter2.currentHitStunFrame).toBe(30);
    expect(b.fighter2.reserveDamageActionId).toBe(ActionId.GUARD_BREAK);
    expect(b.events.some((e) => e.kind === 'sound' && e.clip === 'GuardBreak_1')).toBe(true);
    for (let i = 0; i < 30; i++) step(b);
    expect(b.fighter2.currentActionId).toBe(ActionId.GUARD_BREAK);
  });

  it('cancel : appuyer pendant le hitstop enchaîne N_SPECIAL dès la fin du gel', () => {
    const b = closeBattle();
    attackOnce(b, 4);
    step(b, { p1: Attack, p2: 0 }); // frame 4 figée, fenêtre d'exécution 4-5 -> buffer
    expect(b.fighter1.bufferActionId).toBe(ActionId.N_SPECIAL);
    for (let i = 0; i < 10; i++) step(b);
    expect(b.fighter1.currentActionId).toBe(ActionId.N_ATTACK);
    step(b);
    expect(b.fighter1.currentActionId).toBe(ActionId.N_SPECIAL);
  });

  it('whiff : appuyer pendant le coup ne cancel pas', () => {
    const b = fightBattle(); // distance 4 : le normal ne touche pas
    attackOnce(b, 3);
    step(b, { p1: Attack, p2: 0 });
    for (let i = 0; i < 12; i++) step(b);
    expect(b.fighter1.currentActionId).toBe(ActionId.N_ATTACK);
  });
});

/** J1 charge 59 ticks puis relâche : N_SPECIAL. */
const SPECIAL_SEQUENCE: number[] = [...repeat(Attack, 59), 0];

function playSpecialRound(b: BattleState, p1Special = true, p2Special = false): void {
  const seq = SPECIAL_SEQUENCE;
  for (let i = 0; i < seq.length; i++) {
    step(b, { p1: p1Special ? (seq[i] ?? 0) : 0, p2: p2Special ? (seq[i] ?? 0) : 0 });
  }
  stepUntil(b, (s) => s.roundState !== RoundState.Fight, { p1: 0, p2: 0 }, 200);
}

describe('spéciaux, KO et fin de round', () => {
  it('un spécial qui touche tue : KO, pas de hitstop, DEAD', () => {
    const b = fightBattle();
    b.fighter1.x = -2;
    b.fighter2.x = 1;
    playSpecialRound(b);
    expect(b.roundState).toBe(RoundState.KO);
    expect(b.fighter2.vitalHealth).toBe(0);
    expect(b.fighter2.currentActionId).toBe(ActionId.DEAD);
    expect([b.fighter1.currentHitStunFrame, b.fighter2.currentHitStunFrame]).toEqual([0, 0]);
    expect(b.events.some((e) => e.kind === 'roundEnd')).toBe(true);
  });

  it('KO 2 s (gel), puis End 3 s : le vainqueur marque et prend WIN', () => {
    const b = fightBattle();
    b.fighter1.x = -2;
    b.fighter2.x = 1;
    playSpecialRound(b);
    const frozenX = b.fighter1.x;
    const koTicks = stepUntil(b, (s) => s.roundState === RoundState.End);
    expect(koTicks).toBe(timerTicks(2));
    expect(koTicks).toBe(101); // et non 100, comme l'intro
    expect(b.fighter1.x).toBe(frozenX);
    expect([b.fighter1RoundWon, b.fighter2RoundWon]).toEqual([1, 0]);
    // Le vainqueur est encore dans N_SPECIAL (non annulable) : WIN ne démarre qu'à sa fin.
    expect(b.fighter1.currentActionId).toBe(ActionId.N_SPECIAL);
    stepUntil(b, (s) => s.fighter1.currentActionId === ActionId.WIN, NEUTRAL, 140);
    expect(b.roundState).toBe(RoundState.End);
  });

  it('End : passable après 1,5 s avec Attack, pas avant', () => {
    const toEnd = (): BattleState => {
      const b = fightBattle();
      b.fighter1.x = -2;
      b.fighter2.x = 1;
      playSpecialRound(b);
      stepUntil(b, (s) => s.roundState === RoundState.End);
      return b;
    };
    const skip = { p1: 0, p2: 0, skip: true };

    // Sans appui : 3 s complètes.
    const slow = toEnd();
    expect(stepUntil(slow, (s) => s.roundState === RoundState.Stop)).toBe(timerTicks(3));

    // Attack tenu dès le début : ignoré tant que timer > 1,5 s, puis l'écran est sauté.
    const fast = toEnd();
    const skippable = timerTicks(3, 1.5);
    expect(stepUntil(fast, (s) => s.roundState === RoundState.Stop, skip)).toBe(skippable);
    expect(skippable).toBeGreaterThan(70);
    expect(skippable).toBeLessThan(80);
  });

  it('round suivant : persos replacés, garde remise à 3, score conservé', () => {
    const b = fightBattle();
    b.fighter1.x = -2;
    b.fighter2.x = 1;
    playSpecialRound(b);
    stepUntil(b, (s) => s.roundState === RoundState.Intro);
    expect([b.fighter1.x, b.fighter2.x]).toEqual([-2, 2]);
    expect([b.fighter1.guardHealth, b.fighter2.guardHealth]).toEqual([3, 3]);
    expect([b.fighter1.vitalHealth, b.fighter2.vitalHealth]).toEqual([1, 1]);
    expect(b.fighter1RoundWon).toBe(1);
    expect(b.matchOver).toBe(false);
  });

  it('double KO : aucun point, le round est rejoué', () => {
    const b = fightBattle();
    // Deux spéciaux symétriques et simultanés : J1 est résolu d'abord, mais les boxes de J2
    // (calculées avant) touchent encore la hurtbox de J1.
    playSpecialRound(b, true, true);
    expect(b.roundState).toBe(RoundState.KO);
    expect([b.fighter1.vitalHealth, b.fighter2.vitalHealth]).toEqual([0, 0]);
    stepUntil(b, (s) => s.roundState === RoundState.Intro);
    expect([b.fighter1RoundWon, b.fighter2RoundWon]).toEqual([0, 0]);
    expect(b.fighter1.vitalHealth).toBe(1);
  });

  it('premier à 3 rounds : matchOver, plus aucun tick simulé', () => {
    const b = fightBattle();
    b.fighter1RoundWon = 2;
    b.fighter1.x = -2;
    b.fighter2.x = 1;
    playSpecialRound(b);
    stepUntil(b, (s) => s.matchOver);
    expect(b.fighter1RoundWon).toBe(3);
    expect(b.roundState).toBe(RoundState.Stop);
    const snapshot = structuredClone(b);
    step(b, { p1: Attack, p2: Attack });
    expect(b).toEqual(snapshot);
  });
});

describe('avantage de frame (debug)', () => {
  it('actions toujours annulables : 0', () => {
    const b = fightBattle();
    expect(frameAdvantage(b, data, true)).toBe(0);
  });

  it("attaquant en cours (22 - frame) contre perso libre : désavantage pour lui, avantage pour l'autre", () => {
    const b = fightBattle();
    attackOnce(b, 9); // N_ATTACK frame 9 : 13 frames restantes
    expect(frameAdvantage(b, data, true)).toBe(0 - 13);
    expect(frameAdvantage(b, data, false)).toBe(13 - 0);
  });
});
