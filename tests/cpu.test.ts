import { describe, expect, it } from 'vitest';
import { cpuInput, cpuObserve, createCpu } from '../src/ai/cpu.ts';
import { RoundState, createBattle, stepBattle, type BattleState } from '../src/engine/battle.ts';
import { hashBattle } from '../src/engine/hash.ts';
import { createRng, rngNext } from '../src/engine/rng.ts';
import { DamageResult } from '../src/engine/types.ts';
import { data } from './helpers/engine.ts';
import { GAME_TICKS, makeGame } from './helpers/script.ts';

describe('cycle de vie du CPU', () => {
  it('sans round démarré : aucune IA, aucune entrée', () => {
    const cpu = createCpu(1);
    expect(cpu.ai).toBeNull();
    expect(cpuInput(cpu, createBattle())).toBe(0);
  });

  it('roundStart crée une IA vide, roundEnd la supprime', () => {
    const cpu = createCpu(1);
    cpuObserve(cpu, [{ kind: 'roundStart' }]);
    expect(cpu.ai).not.toBeNull();
    expect(cpu.ai?.moveQueue).toEqual([]);
    cpuObserve(cpu, [{ kind: 'roundEnd' }]);
    expect(cpu.ai).toBeNull();
  });

  it('une nouvelle IA à chaque round, mais le RNG continue (état conservé)', () => {
    const cpu = createCpu(5);
    const b = createBattle();
    b.roundState = RoundState.Fight;
    cpuObserve(cpu, [{ kind: 'roundStart' }]);
    for (let i = 0; i < 3; i++) cpuInput(cpu, b); // décisions : consomme le RNG
    const rngAfter = cpu.rng.state;
    expect(rngAfter).not.toBe(createRng(5).state);
    cpuObserve(cpu, [{ kind: 'roundEnd' }, { kind: 'roundStart' }]);
    expect(cpu.ai?.moveQueue).toEqual([]);
    expect(cpu.rng.state).toBe(rngAfter);
  });

  it('inactif hors Intro et Fight (Stop, KO, End), même avec une IA présente', () => {
    for (const state of [RoundState.Stop, RoundState.KO, RoundState.End]) {
      const cpu = createCpu(1);
      cpuObserve(cpu, [{ kind: 'roundStart' }]);
      const b = createBattle();
      b.roundState = state;
      const before = cpu.rng.state;
      expect(cpuInput(cpu, b)).toBe(0);
      expect(cpu.rng.state).toBe(before);
    }
  });

  it('actif en Intro comme en Fight', () => {
    for (const state of [RoundState.Intro, RoundState.Fight]) {
      const cpu = createCpu(1);
      cpuObserve(cpu, [{ kind: 'roundStart' }]);
      const b = createBattle();
      b.roundState = state;
      b.fighter1.x = -2;
      b.fighter2.x = 2;
      cpuInput(cpu, b);
      cpuInput(cpu, b); // 2e appel : l'IA décide
      expect(cpu.ai?.moveQueue.length).toBeGreaterThan(0);
    }
  });

  it("un tirage consomme bien le RNG du CPU (et pas celui d'un autre)", () => {
    const cpu = createCpu(9);
    cpuObserve(cpu, [{ kind: 'roundStart' }]);
    const b = createBattle();
    b.roundState = RoundState.Fight;
    cpuInput(cpu, b);
    cpuInput(cpu, b);
    const ref = createRng(9);
    rngNext(ref);
    rngNext(ref); // un tirage de déplacement + un tirage d'attaque
    expect(cpu.rng.state).toBe(ref.state);
  });
});

interface Played {
  battle: BattleState;
  p2Inputs: number[];
  damage: number;
  guardResults: number;
}

/** Une partie : J1 scripté (voir helpers/script.ts), J2 = CPU de graine `seed`. */
function playVsCpu(seed: number, ticks: number): Played {
  const battle = createBattle();
  const cpu = createCpu(seed);
  const game = makeGame(7);
  const out: Played = { battle, p2Inputs: [], damage: 0, guardResults: 0 };
  for (let i = 0; i < ticks && !battle.matchOver; i++) {
    const p2 = cpuInput(cpu, battle);
    out.p2Inputs.push(p2);
    stepBattle(battle, data, { p1: game.p1[i] ?? 0, p2, skip: i % 7 === 0 });
    cpuObserve(cpu, battle.events);
    for (const e of battle.events) {
      if (e.kind === 'damage') {
        out.damage++;
        if (e.result === DamageResult.Guard) out.guardResults++;
      }
    }
  }
  return out;
}

describe('déterminisme : parties contre le CPU', () => {
  const TICKS = GAME_TICKS;

  it('même graine : mêmes entrées de J2 et même état final', () => {
    const a = playVsCpu(123, TICKS);
    const b = playVsCpu(123, TICKS);
    expect(a.p2Inputs).toEqual(b.p2Inputs);
    expect(hashBattle(a.battle)).toBe(hashBattle(b.battle));
  });

  it('graines différentes : parties différentes', () => {
    const a = playVsCpu(1, TICKS);
    const b = playVsCpu(2, TICKS);
    expect(a.p2Inputs).not.toEqual(b.p2Inputs);
    expect(hashBattle(a.battle)).not.toBe(hashBattle(b.battle));
  });

  it('le CPU joue vraiment : il avance, recule, attaque et touche', () => {
    const g = playVsCpu(123, TICKS);
    const distinct = new Set(g.p2Inputs);
    expect(distinct.size).toBeGreaterThanOrEqual(4); // 0, avant, arrière, attaque...
    expect(g.p2Inputs.some((b) => (b & 4) !== 0)).toBe(true);
    expect(g.damage).toBeGreaterThan(0);
  });

  it('rejouer les entrées enregistrées sans CPU redonne exactement la même partie', () => {
    const live = playVsCpu(77, TICKS);
    const game = makeGame(7);
    const replay = createBattle();
    live.p2Inputs.forEach((p2, i) => {
      stepBattle(replay, data, { p1: game.p1[i] ?? 0, p2, skip: i % 7 === 0 });
    });
    expect(hashBattle(replay)).toBe(hashBattle(live.battle));
  });

  it('état final figé pour la graine 123 (non-régression)', () => {
    const g = playVsCpu(123, TICKS);
    expect(hashBattle(g.battle)).toBe('5fa3cc03');
  });
});
