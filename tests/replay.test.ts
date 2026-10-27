import { describe, expect, it } from 'vitest';
import { cpuInput, cpuObserve, createCpu } from '../src/ai/cpu.ts';
import { RoundState, createBattle, stepBattle, type BattleState } from '../src/engine/battle.ts';
import { hashBattle } from '../src/engine/hash.ts';
import {
  MAX_RECORDING_TICKS,
  RoundRecorder,
  createReplay,
  isIdentical,
  recordTick,
  runReplay,
  startRecording,
  stepReplay,
  type RoundRecording,
} from '../src/engine/replay.ts';
import { data } from './helpers/engine.ts';
import { makeGame } from './helpers/script.ts';

interface Completed {
  rec: RoundRecording;
  /** État du moteur à la fin du round, au moment où il a été terminé. */
  finalState: BattleState;
}

/** Un match J1 scripté / CPU seedé, enregistré comme le fait main.ts. */
function playMatch(seed: number, ticks: number, recorder = new RoundRecorder()) {
  const battle = createBattle();
  const cpu = createCpu(seed);
  const game = makeGame(7);
  const completed: Completed[] = [];
  for (let i = 0; i < ticks && !battle.matchOver; i++) {
    const input = {
      p1: game.p1[i] ?? 0,
      p2: cpuInput(cpu, battle),
      skip: i % 7 === 0,
    };
    stepBattle(battle, data, input);
    cpuObserve(cpu, battle.events);
    if (recorder.observe(input, battle) && recorder.last) {
      completed.push({ rec: recorder.last, finalState: structuredClone(battle) });
    }
  }
  return { battle, completed, recorder };
}

const SEED = 123;

describe('enregistrement des rounds', () => {
  const { completed } = playMatch(SEED, 8000);

  it('le match contient plusieurs rounds terminés', () => {
    expect(completed.length).toBeGreaterThanOrEqual(2);
  });

  it("un round commence à l'Intro (événement roundStart compris) et se termine au retour à Stop", () => {
    for (const { rec, finalState } of completed) {
      expect(rec.complete).toBe(true);
      expect(rec.truncated).toBe(false);
      expect(rec.start.roundState).toBe(RoundState.Intro);
      expect(rec.start.events).toEqual([{ kind: 'roundStart' }]);
      expect(finalState.roundState).toBe(RoundState.Stop);
    }
  });

  it("autant d'entrées que de hashs ; un round dure au moins intro + KO + fin", () => {
    for (const { rec } of completed) {
      expect(rec.inputs).toHaveLength(rec.hashes.length);
      // intro 151 + au moins un tick de combat + KO 101 + fin 76 (passée) ou 151 ticks
      expect(rec.inputs.length).toBeGreaterThan(151 + 101 + 70);
    }
  });

  it('chaque entrée enregistrée a les trois champs, skip booléen', () => {
    const first = completed[0]?.rec.inputs[0];
    expect(Object.keys(first ?? {}).sort()).toEqual(['p1', 'p2', 'skip']);
    expect(typeof first?.skip).toBe('boolean');
  });

  it("le dernier hash est celui de l'état final du round", () => {
    for (const { rec, finalState } of completed) {
      expect(rec.hashes.at(-1)).toBe(hashBattle(finalState));
    }
  });

  it('les rounds enregistrés sont distincts et le dernier terminé est conservé', () => {
    const { completed: rounds, recorder } = playMatch(SEED, 8000);
    expect(new Set(rounds.map((c) => c.rec.hashes.at(-1))).size).toBe(rounds.length);
    expect(recorder.last).toBe(rounds.at(-1)?.rec);
  });

  it('reset oublie tout (nouveau match)', () => {
    const { recorder } = playMatch(SEED, 3000);
    recorder.reset();
    expect(recorder.current).toBeNull();
    expect(recorder.last).toBeNull();
  });

  it("le tick qui entre en Intro n'est pas enregistré (l'instantané est pris après lui)", () => {
    const recorder = new RoundRecorder();
    const battle = createBattle();
    const input = { p1: 0, p2: 0, skip: false };
    stepBattle(battle, data, input); // Stop -> Intro
    recorder.observe(input, battle);
    expect(recorder.current?.inputs).toHaveLength(0);
    stepBattle(battle, data, input);
    recorder.observe(input, battle);
    expect(recorder.current?.inputs).toHaveLength(1);
  });
});

describe('rejeu', () => {
  const { completed } = playMatch(SEED, 8000);

  it("reproduit chaque round à l'identique, tick par tick", () => {
    for (const { rec, finalState } of completed) {
      const replay = runReplay(rec, data);
      expect(replay.done).toBe(true);
      expect(replay.divergedAt).toBeNull();
      expect(isIdentical(replay)).toBe(true);
      expect(replay.tick).toBe(rec.inputs.length);
      expect(replay.battle).toEqual(finalState);
    }
  });

  it('sans CPU : les entrées enregistrées suffisent (J2 compris)', () => {
    const rec = completed[0]?.rec;
    expect(rec?.inputs.some((i) => i.p2 !== 0)).toBe(true);
    if (rec) expect(isIdentical(runReplay(rec, data))).toBe(true);
  });

  it("avance d'un tick à la fois et vérifie le hash à chaque tick", () => {
    const rec = completed[0]?.rec;
    if (!rec) throw new Error('aucun round');
    const replay = createReplay(rec);
    for (let i = 0; i < 40; i++) {
      expect(stepReplay(replay, rec, data)).toBe(true);
      expect(hashBattle(replay.battle)).toBe(rec.hashes[i]);
    }
    expect(replay.tick).toBe(40);
    expect(replay.done).toBe(false);
  });

  it("un rejeu terminé n'avance plus", () => {
    const rec = completed[0]?.rec;
    if (!rec) throw new Error('aucun round');
    const replay = runReplay(rec, data);
    const before = structuredClone(replay.battle);
    expect(stepReplay(replay, rec, data)).toBe(false);
    expect(replay.battle).toEqual(before);
  });

  it('un input modifié est détecté, au tick exact de la modification', () => {
    const rec = structuredClone(completed[0]?.rec);
    if (!rec) throw new Error('aucun round');
    // Un tick en plein combat : on cherche le premier tick de Fight puis on avance de 20.
    const probe = createReplay(rec);
    let fightTick = 0;
    while (probe.battle.roundState !== RoundState.Fight) {
      stepReplay(probe, rec, data);
      fightTick = probe.tick;
    }
    const k = fightTick + 20;
    rec.inputs[k] = {
      ...(rec.inputs[k] as { p1: number; p2: number }),
      p1: (rec.inputs[k]?.p1 ?? 0) ^ 4,
    };
    const replay = runReplay(rec, data);
    expect(replay.divergedAt).toBe(k);
    expect(isIdentical(replay)).toBe(false);
    expect(replay.done).toBe(true); // le rejeu va quand même jusqu'au bout
  });

  it('un hash enregistré faux est détecté', () => {
    const rec = structuredClone(completed[0]?.rec);
    if (!rec) throw new Error('aucun round');
    rec.hashes[100] = 'deadbeef';
    expect(runReplay(rec, data).divergedAt).toBe(100);
  });

  it('la divergence signalée est la première, pas la dernière', () => {
    const rec = structuredClone(completed[0]?.rec);
    if (!rec) throw new Error('aucun round');
    rec.hashes[60] = 'aaaaaaaa';
    rec.hashes[200] = 'bbbbbbbb';
    expect(runReplay(rec, data).divergedAt).toBe(60);
  });

  it("rejouer ne modifie pas l'enregistrement", () => {
    const rec = completed[0]?.rec;
    if (!rec) throw new Error('aucun round');
    const snapshot = structuredClone(rec);
    runReplay(rec, data);
    runReplay(rec, data);
    expect(rec).toEqual(snapshot);
  });

  it('rejouer deux fois donne deux fois le même résultat', () => {
    const rec = completed[0]?.rec;
    if (!rec) throw new Error('aucun round');
    expect(runReplay(rec, data).battle).toEqual(runReplay(rec, data).battle);
  });

  it('un enregistrement vide est déjà terminé', () => {
    const empty = startRecording(createBattle());
    expect(createReplay(empty).done).toBe(true);
  });
});

describe("isolation de l'instantané", () => {
  it("modifier le combat après l'instantané ne change pas l'enregistrement", () => {
    const battle = createBattle();
    stepBattle(battle, data, { p1: 0, p2: 0 });
    const rec = startRecording(battle);
    const x = rec.start.fighter1.x;
    battle.fighter1.x = 3.5;
    battle.fighter1.history.input[0] = 7;
    battle.events.push({ kind: 'roundEnd' });
    expect(rec.start.fighter1.x).toBe(x);
    expect(rec.start.fighter1.history.input[0]).toBe(0);
    expect(rec.start.events).toEqual([{ kind: 'roundStart' }]);
  });

  it("le rejeu travaille sur une copie : l'instantané reste intact", () => {
    const battle = createBattle();
    stepBattle(battle, data, { p1: 0, p2: 0 });
    const rec = startRecording(battle);
    const replay = createReplay(rec);
    expect(replay.battle).not.toBe(rec.start);
    replay.battle.fighter1.x = 99;
    expect(rec.start.fighter1.x).not.toBe(99);
  });
});

describe("plafond d'enregistrement", () => {
  it("18 000 ticks, comme l'original", () => {
    expect(MAX_RECORDING_TICKS).toBe(18000);
  });

  it("au-delà du plafond : abandonné, aucun round terminé n'est proposé", () => {
    const recorder = new RoundRecorder(50);
    const { completed } = playMatch(SEED, 1000, recorder);
    expect(completed).toHaveLength(0);
    expect(recorder.last).toBeNull();
    expect(recorder.current).toBeNull();
  });

  it("recordTick marque truncated et n'enregistre plus", () => {
    const battle = createBattle();
    stepBattle(battle, data, { p1: 0, p2: 0 });
    const rec = startRecording(battle);
    const input = { p1: 0, p2: 0, skip: false };
    for (let i = 0; i < 5; i++) {
      stepBattle(battle, data, input);
      recordTick(rec, input, battle, 3);
    }
    expect(rec.truncated).toBe(true);
    expect(rec.inputs).toHaveLength(3);
    expect(rec.complete).toBe(false);
  });

  it('un nouveau round après un round abandonné est enregistré normalement', () => {
    const recorder = new RoundRecorder(400); // assez pour un round (intro 151 + KO 101 + fin)
    const { completed } = playMatch(SEED, 8000, recorder);
    // Le premier round (>= 400 ticks avec le combat) est abandonné, ceux qui tiennent sont gardés.
    for (const { rec } of completed) expect(rec.inputs.length).toBeLessThanOrEqual(400);
  });
});

describe('fin de match', () => {
  it("le dernier round d'un match (matchOver) est terminé et rejouable", () => {
    const { battle, completed } = playMatch(SEED, 40_000);
    expect(battle.matchOver).toBe(true);
    const last = completed.at(-1);
    expect(last?.rec.complete).toBe(true);
    expect(last?.finalState.matchOver).toBe(true);
    if (last) {
      const replay = runReplay(last.rec, data);
      expect(isIdentical(replay)).toBe(true);
      expect(replay.battle.matchOver).toBe(true);
    }
  });
});
