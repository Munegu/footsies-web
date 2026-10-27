import { describe, expect, it } from 'vitest';
import {
  FIGHT_STATE_READ_INDEX,
  MAX_FIGHT_STATE_RECORD,
  createBattleAI,
  nextAIInput,
  type BattleAIState,
  type RandomInt,
} from '../src/ai/battle-ai.ts';
import { createBattle, type BattleState } from '../src/engine/battle.ts';
import { ActionId, InputBit } from '../src/engine/types.ts';

// Pour J2 (tourné à gauche) : avant = Left, arrière = Right.
const F = InputBit.Left;
const B = InputBit.Right;
const A = InputBit.Attack;

const rep = (bits: number, n: number): number[] => new Array<number>(n).fill(bits);

// Les patterns de BattleAI.cs, écrits à la main (indépendamment du code testé).
const PATTERN = {
  neutral: rep(0, 30),
  farApproach1: [...rep(F, 40), ...rep(B, 10), ...rep(F, 30), ...rep(B, 10)],
  farApproach2: [F, 0, F, ...rep(B, 25), F, 0, F, ...rep(B, 25)],
  midApproach1: [...rep(F, 30), ...rep(B, 10), ...rep(F, 20), ...rep(B, 10)],
  midApproach2: [F, 0, F, ...rep(B, 30)],
  fallBack1: rep(B, 60),
  // Copie du bug de l'original : le « dash arrière » est un dash AVANT (F, 0, F).
  fallBack2: [F, 0, F, ...rep(B, 60)],
  noAttack: rep(0, 30),
  oneHit: [A, ...rep(0, 18)],
  twoHit: [A, 0, 0, 0, A, ...rep(0, 18)],
  immediateSpecial: [...rep(A, 60), 0],
  delaySpecial: [...rep(A, 120), 0],
};

/** `Random.Range` scripté : renvoie les valeurs données et note les bornes demandées. */
function scripted(values: number[]): { rand: RandomInt; calls: [number, number][] } {
  const calls: [number, number][] = [];
  const queue = [...values];
  return {
    calls,
    rand: (min, max) => {
      calls.push([min, max]);
      const v = queue.shift();
      if (v === undefined) throw new Error('Range appelé plus de fois que prévu');
      return v;
    },
  };
}

const noRandom: RandomInt = () => {
  throw new Error('Aucun tirage attendu');
};

/** Un combat où J1 et J2 sont à `distance` l'un de l'autre et J1 dans l'action `p1Action`. */
function scene(distance: number, p1Action: number = ActionId.STAND): BattleState {
  const b = createBattle();
  b.fighter1.x = -distance / 2;
  b.fighter2.x = distance / 2;
  b.fighter1.currentActionId = p1Action;
  return b;
}

/** Amène l'IA au point où elle décide (2e appel, voir le test du décalage) et renvoie son état. */
function decide(
  b: BattleState,
  rand: RandomInt,
): { ai: BattleAIState; firstOutput: number; secondOutput: number } {
  const ai = createBattleAI();
  const firstOutput = nextAIInput(ai, noRandom, b); // rien à lire encore
  const secondOutput = nextAIInput(ai, rand, b); // décision
  return { ai, firstOutput, secondOutput };
}

describe("décalage de l'historique (porté littéralement)", () => {
  it("lit la case 5 d'un historique de 10", () => {
    expect([FIGHT_STATE_READ_INDEX, MAX_FIGHT_STATE_RECORD]).toEqual([5, 10]);
    expect(createBattleAI().fightStates).toHaveLength(10);
  });

  it("au 1er appel : rien d'observé à la case 5, aucune décision, aucun tirage", () => {
    const ai = createBattleAI();
    expect(nextAIInput(ai, noRandom, scene(3))).toBe(0);
    expect(ai.moveQueue).toEqual([]);
    expect(ai.attackQueue).toEqual([]);
  });

  it("au 2e appel : décide déjà (la boucle croissante recopie l'état précédent partout)", () => {
    const { rand, calls } = scripted([0, 0]);
    const { ai } = decide(scene(3.5), rand);
    expect(calls).toHaveLength(2); // un tirage de déplacement, un d'attaque
    expect(ai.moveQueue.length).toBeGreaterThan(0);
  });

  it("les cases 1 à 9 contiennent toutes l'état du tick précédent", () => {
    const ai = createBattleAI();
    const { rand } = scripted([0, 0, 0, 0, 0, 0]);
    const distances = [3.1, 3.2, 3.3];
    for (const d of distances) nextAIInput(ai, rand, scene(d));
    const seen = ai.fightStates.map((s) => s?.distanceX);
    expect(seen[0]).toBeCloseTo(3.3, 5); // état courant
    for (let i = 1; i < 10; i++) expect(seen[i]).toBeCloseTo(3.2, 5); // celui d'avant, partout
  });

  it("retard de réaction de 1 tick : l'IA agit sur l'état précédent, pas sur l'actuel", () => {
    // Appel 1 : J1 vient d'être touché (DAMAGE). Appel 2 : il est revenu en STAND.
    const ai = createBattleAI();
    nextAIInput(ai, noRandom, scene(3, ActionId.DAMAGE));
    // L'attaque est choisie sur l'état DAMAGE de l'appel 1 : TwoHit forcé, sans tirage d'attaque.
    const { rand, calls } = scripted([0]);
    nextAIInput(ai, rand, scene(3, ActionId.STAND));
    expect(calls).toEqual([[0, 5]]); // seul le déplacement tire au sort (distance 3 : plage > 2,5)
    expect(ai.attackQueue).toEqual(PATTERN.twoHit);
  });
});

describe('une file vide déclenche un choix mais ne fournit rien ce tick-là', () => {
  it('le tick de décision renvoie 0, le suivant le premier élément du pattern', () => {
    const b = scene(3.5);
    const { rand } = scripted([0, 3]); // MidApproach1 ; attaque OneHit (rand 3 de Range(0,5))
    const { ai, secondOutput } = decide(b, rand);
    expect(secondOutput).toBe(0);
    expect(ai.moveQueue).toEqual(PATTERN.midApproach1);
    expect(ai.attackQueue).toEqual(PATTERN.oneHit);

    expect(nextAIInput(ai, noRandom, b)).toBe(F | A); // premiers éléments des deux files
    expect(ai.moveQueue).toHaveLength(PATTERN.midApproach1.length - 1);
    expect(ai.attackQueue).toHaveLength(PATTERN.oneHit.length - 1);
  });

  it('les files sont consommées indépendamment, puis un nouveau pattern est tiré', () => {
    const b = scene(3.5);
    const { rand, calls } = scripted([6, 0, 6, 0]);
    // Neutre (30 x 0) et pas d'attaque (30 x 0) : on voit les tirages revenir après 30 ticks.
    const { ai } = decide(b, rand);
    for (let i = 0; i < 29; i++) expect(nextAIInput(ai, noRandom, b)).toBe(0);
    expect(calls).toHaveLength(2);
    nextAIInput(ai, rand, b); // dernier élément consommé
    expect(calls).toHaveLength(2);
    nextAIInput(ai, rand, b); // files vides : nouveau choix
    expect(calls).toHaveLength(4);
  });

  it('les bits des deux files sont combinés', () => {
    const b = scene(2.2); // plage > 2
    const { rand } = scripted([2, 0]); // Neutral ; OneHit (Range(0,6) -> 0)
    const { ai } = decide(b, rand);
    expect(nextAIInput(ai, noRandom, b)).toBe(0 | A);
  });
});

describe('SelectMovement : table des patterns par distance', () => {
  const cases: [string, number, number, [number, number], number[]][] = [
    // [plage, distance, rand, bornes de Range, pattern attendu]
    ['> 4', 5, 0, [0, 2], PATTERN.farApproach1],
    ['> 4', 5, 1, [0, 2], PATTERN.farApproach2],
    ['> 3', 3.5, 0, [0, 7], PATTERN.midApproach1],
    ['> 3', 3.5, 1, [0, 7], PATTERN.midApproach1],
    ['> 3', 3.5, 2, [0, 7], PATTERN.midApproach2],
    ['> 3', 3.5, 3, [0, 7], PATTERN.midApproach2],
    ['> 3', 3.5, 4, [0, 7], PATTERN.farApproach1],
    ['> 3', 3.5, 5, [0, 7], PATTERN.farApproach2],
    ['> 3', 3.5, 6, [0, 7], PATTERN.neutral],
    ['> 2,5', 2.8, 0, [0, 5], PATTERN.midApproach1],
    ['> 2,5', 2.8, 1, [0, 5], PATTERN.midApproach2],
    ['> 2,5', 2.8, 2, [0, 5], PATTERN.fallBack1],
    ['> 2,5', 2.8, 3, [0, 5], PATTERN.fallBack2],
    ['> 2,5', 2.8, 4, [0, 5], PATTERN.neutral],
    ['> 2', 2.2, 0, [0, 4], PATTERN.fallBack1],
    ['> 2', 2.2, 1, [0, 4], PATTERN.fallBack2],
    ['> 2', 2.2, 2, [0, 4], PATTERN.neutral],
    ['> 2', 2.2, 3, [0, 4], PATTERN.neutral],
    ['<= 2', 1.5, 0, [0, 3], PATTERN.fallBack1],
    ['<= 2', 1.5, 1, [0, 3], PATTERN.fallBack2],
    ['<= 2', 1.5, 2, [0, 3], PATTERN.neutral],
  ];

  it.each(cases)('plage %s, distance %f, tirage %i', (_band, distance, rand, bounds, expected) => {
    const { rand: r, calls } = scripted([rand, 0]);
    const { ai } = decide(scene(distance), r);
    expect(calls[0]).toEqual(bounds);
    expect(ai.moveQueue).toEqual(expected);
  });

  it('les seuils sont stricts : 4, 3, 2,5 et 2 tombent dans la plage du dessous', () => {
    const bounds = (d: number) => {
      const { rand, calls } = scripted([0, 0]);
      decide(scene(d), rand);
      return calls[0];
    };
    expect(bounds(4)).toEqual([0, 7]); // distance de départ : plage > 3, pas > 4
    expect(bounds(4.01)).toEqual([0, 2]);
    expect(bounds(3)).toEqual([0, 5]);
    expect(bounds(2.5)).toEqual([0, 4]);
    expect(bounds(2)).toEqual([0, 3]);
    expect(bounds(2.01)).toEqual([0, 4]);
  });
});

describe('SelectAttack : table des patterns', () => {
  /** Déplacement neutre dans la plage donnée, puis le tirage d'attaque voulu. */
  function attackFor(distance: number, p1Action: number, attackRand: number | null, moveRand = 99) {
    const values = attackRand === null ? [moveRand] : [moveRand, attackRand];
    const { rand, calls } = scripted(values);
    const { ai } = decide(scene(distance, p1Action), rand);
    return { queue: ai.attackQueue, calls };
  }
  // Un tirage de déplacement qui donne « neutre » ne compte pas : on lit calls[1] pour l'attaque.
  const S = ActionId.STAND;

  it.each([ActionId.DAMAGE, ActionId.GUARD_BREAK, ActionId.N_SPECIAL, ActionId.B_SPECIAL])(
    "adversaire en action %i : TwoHit immédiat, sans tirage d'attaque, à toute distance",
    (action) => {
      for (const d of [5, 3.5, 2.8, 2.2, 1.5]) {
        const { queue, calls } = attackFor(d, action, null);
        expect(queue).toEqual(PATTERN.twoHit);
        expect(calls).toHaveLength(1); // seul le déplacement a tiré
      }
    },
  );

  it('> 4 : jamais de spécial (Range(0,4) et test `<= 3`) : toujours NoAttack', () => {
    for (const rand of [0, 1, 2, 3]) {
      const { queue, calls } = attackFor(5, S, rand, 0);
      expect(queue).toEqual(PATTERN.noAttack);
      expect(calls[1]).toEqual([0, 4]);
    }
  });

  it('> 3 : adversaire en attaque normale = TwoHit sans tirage', () => {
    for (const action of [ActionId.N_ATTACK, ActionId.B_ATTACK]) {
      const { queue, calls } = attackFor(3.5, action, null, 0);
      expect(queue).toEqual(PATTERN.twoHit);
      expect(calls).toHaveLength(1);
    }
  });

  it.each([
    [3.5, 0, PATTERN.noAttack, [0, 5]],
    [3.5, 1, PATTERN.noAttack, [0, 5]],
    [3.5, 2, PATTERN.oneHit, [0, 5]],
    [3.5, 3, PATTERN.oneHit, [0, 5]],
    [3.5, 4, PATTERN.delaySpecial, [0, 5]],
    [2.8, 0, PATTERN.noAttack, [0, 3]],
    [2.8, 1, PATTERN.oneHit, [0, 3]],
    [2.8, 2, PATTERN.twoHit, [0, 3]],
    [2.2, 0, PATTERN.oneHit, [0, 6]],
    [2.2, 1, PATTERN.oneHit, [0, 6]],
    [2.2, 2, PATTERN.twoHit, [0, 6]],
    [2.2, 3, PATTERN.twoHit, [0, 6]],
    [2.2, 4, PATTERN.immediateSpecial, [0, 6]],
    [2.2, 5, PATTERN.delaySpecial, [0, 6]],
    [1.5, 0, PATTERN.oneHit, [0, 3]],
    [1.5, 1, PATTERN.twoHit, [0, 3]],
    [1.5, 2, PATTERN.twoHit, [0, 3]],
  ])('distance %f, tirage %i', (distance, rand, expected, bounds) => {
    const { queue, calls } = attackFor(distance, S, rand, 0);
    expect(queue).toEqual(expected);
    expect(calls[1]).toEqual(bounds);
  });

  it("un adversaire qui garde (isOpponentBlocking) ne change rien : champ inutilisé par l'original", () => {
    for (const action of [ActionId.GUARD_CROUCH, ActionId.GUARD_STAND, ActionId.GUARD_M]) {
      const guard = attackFor(2.2, action, 4, 0);
      const stand = attackFor(2.2, S, 4, 0);
      expect(guard.queue).toEqual(stand.queue);
    }
  });
});

describe('patterns', () => {
  it('longueurs : spécial immédiat 61, spécial retardé 121, un coup 19, deux coups 23', () => {
    expect(PATTERN.immediateSpecial).toHaveLength(61);
    expect(PATTERN.delaySpecial).toHaveLength(121);
    expect(PATTERN.oneHit).toHaveLength(19);
    expect(PATTERN.twoHit).toHaveLength(23);
  });

  it("le « dash arrière » est un dash avant (bug de l'original conservé)", () => {
    const { rand } = scripted([3, 0]); // plage > 2,5 : FallBack2
    const { ai } = decide(scene(2.8), rand);
    expect(ai.moveQueue.slice(0, 3)).toEqual([F, 0, F]);
    expect(ai.moveQueue.slice(3)).toEqual(rep(B, 60));
  });
});
