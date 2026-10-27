import {
  createBattle,
  stepBattle,
  type BattleInput,
  type BattleState,
} from '../../src/engine/battle.ts';
import { InputBit } from '../../src/engine/types.ts';
import { data } from './engine.ts';

const { Left, Right, Attack } = InputBit;

/** PRNG xorshift32 : uniquement pour fabriquer les entrées scriptées (le moteur n'a pas de hasard). */
function xorshift(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
}

/**
 * Une suite d'inputs pour un joueur : marches (biaisées vers l'adversaire), taps d'attaque,
 * dashes et charges de spécial. `forward` / `back` = bits Droite / Gauche selon le côté.
 */
function playerScript(seed: number, ticks: number, forward: number, back: number): number[] {
  const next = xorshift(seed);
  const out: number[] = [];
  const push = (bits: number, n: number) => out.push(...new Array<number>(n).fill(bits));
  const dash = (bits: number) => {
    push(bits, 1);
    push(0, 1);
    push(bits, 1);
  };
  while (out.length < ticks) {
    const r = next() % 14;
    if (r < 2) push(0, 2 + (next() % 8));
    else if (r < 6) push(forward, 4 + (next() % 25));
    else if (r === 6) push(back, 3 + (next() % 12));
    else if (r === 7) push(Attack, 1 + (next() % 2));
    else if (r === 8) push(Attack | forward, 1 + (next() % 3));
    else if (r === 9) push(Attack, 59 + (next() % 12));
    else if (r === 10) dash(forward);
    else if (r === 11) dash(back);
    else if (r === 12) push(Attack | back, 59 + (next() % 12));
    else {
      push(forward, 10);
      push(Attack, 1);
    }
    push(0, 1);
  }
  return out.slice(0, ticks);
}

export interface Game {
  p1: number[];
  p2: number[];
}

export const GAME_TICKS = 8000;

export const makeGame = (seed: number, ticks = GAME_TICKS): Game => ({
  p1: playerScript(seed * 2 + 1, ticks, Right, Left),
  p2: playerScript(seed * 2 + 2, ticks, Left, Right),
});

export const inputAt = (g: Game, i: number): BattleInput => ({
  p1: g.p1[i] ?? 0,
  p2: g.p2[i] ?? 0,
  skip: i % 7 === 0,
});

export interface Stats {
  damage: number;
  /** Résultats de coups vus (DamageResult). */
  results: Set<number>;
  rounds: number;
}

/** Joue les ticks [start, end) d'une partie scriptée. */
export function play(b: BattleState, g: Game, start: number, end: number, stats?: Stats): void {
  for (let i = start; i < end; i++) {
    stepBattle(b, data, inputAt(g, i));
    if (!stats) continue;
    for (const e of b.events) {
      if (e.kind === 'damage') {
        stats.damage++;
        stats.results.add(e.result);
      }
      if (e.kind === 'roundStart') stats.rounds++;
    }
  }
}

export const newStats = (): Stats => ({ damage: 0, results: new Set(), rounds: 0 });
export { createBattle };
