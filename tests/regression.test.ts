import { describe, expect, it } from 'vitest';
import { stepBattle } from '../src/engine/battle.ts';
import { hashBattle } from '../src/engine/hash.ts';
import { DamageResult } from '../src/engine/types.ts';
import { data } from './helpers/engine.ts';
import { GAME_TICKS, createBattle, inputAt, makeGame, newStats, play } from './helpers/script.ts';

/**
 * Parties scriptées (inputs fixes, PRNG de test) dont on fige le hash de l'état final.
 * Les hashs viennent de NOTRE moteur : ils protègent contre une régression, pas contre une
 * erreur de portage initiale (pas d'Unity sous la main pour une référence).
 * Graines choisies parce qu'elles exercent coups, gardes, KO, double rounds et fin de match.
 * Si une modification VOLONTAIRE du moteur change ces hashs, les régénérer en le disant.
 */
const GOLDEN: Record<number, string> = {
  3: '82d20d55',
  12: '40c8dd17',
  25: '92ea929f',
  31: '07bfc55d',
};

describe('non-régression : parties scriptées', () => {
  for (const [seedText, golden] of Object.entries(GOLDEN)) {
    const seed = Number(seedText);

    it(`graine ${seed} : état final inchangé`, () => {
      const b = createBattle();
      const stats = newStats();
      play(b, makeGame(seed), 0, GAME_TICKS, stats);

      // La partie doit réellement exercer le moteur.
      expect(stats.damage).toBeGreaterThan(5);
      expect(stats.rounds).toBeGreaterThanOrEqual(3);
      expect(b.matchOver).toBe(true);
      expect(stats.results.has(DamageResult.Damage)).toBe(true);

      expect(hashBattle(b)).toBe(golden);
    });
  }

  it('au moins une des parties exerce la garde', () => {
    const seen = new Set<number>();
    for (const seed of Object.keys(GOLDEN).map(Number)) {
      const stats = newStats();
      play(createBattle(), makeGame(seed), 0, GAME_TICKS, stats);
      stats.results.forEach((r) => seen.add(r));
    }
    expect(seen.has(DamageResult.Guard)).toBe(true);
  });
});

describe('déterminisme', () => {
  const game = makeGame(3);

  it('deux exécutions identiques donnent le même hash, tick par tick', () => {
    const a = createBattle();
    const b = createBattle();
    for (let i = 0; i < 1500; i++) {
      stepBattle(a, data, inputAt(game, i));
      stepBattle(b, data, inputAt(game, i));
      expect(hashBattle(a)).toBe(hashBattle(b));
    }
  });

  it('snapshot / restauration : reprendre une copie à mi-partie donne le même résultat', () => {
    const full = createBattle();
    play(full, game, 0, GAME_TICKS);

    const first = createBattle();
    play(first, game, 0, 1700);
    const restored = structuredClone(first);
    play(restored, game, 1700, GAME_TICKS);

    expect(hashBattle(restored)).toBe(hashBattle(full));
    expect(restored).toEqual(full);
  });

  it('une entrée différente change le hash', () => {
    const a = createBattle();
    const b = createBattle();
    play(a, game, 0, 100);
    play(b, game, 0, 99);
    // Pendant l'intro l'input n'a pas d'effet visible, mais l'historique le garde : le hash le voit.
    stepBattle(b, data, { ...inputAt(game, 99), p1: inputAt(game, 99).p1 ^ 4 });
    expect(hashBattle(a)).not.toBe(hashBattle(b));
  });

  it('le hash ignore les événements mais distingue -0 de 0', () => {
    const a = createBattle();
    play(a, game, 0, 10);
    const b = structuredClone(a);
    b.events = [{ kind: 'roundStart' }];
    expect(hashBattle(a)).toBe(hashBattle(b));
    b.fighter1.velocityX = -0;
    a.fighter1.velocityX = 0;
    expect(hashBattle(a)).not.toBe(hashBattle(b));
  });
});
