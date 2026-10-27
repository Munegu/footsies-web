import fighterJson from '../../src/data/f00.json';
import type { FighterJson } from '../../src/data/types.ts';
import { buildFighterData } from '../../src/engine/fighter-data.ts';
import {
  createFighter,
  incrementActionFrame,
  setupBattleStart,
  updateActionRequest,
  updateBoxes,
  updateInput,
  updateMovement,
} from '../../src/engine/fighter.ts';
import type { BattleEvent, FighterContext, FighterState } from '../../src/engine/types.ts';

export const data = buildFighterData(fighterJson as unknown as FighterJson);

export interface TestFighter {
  f: FighterState;
  ctx: FighterContext;
  events: BattleEvent[];
}

/** Un combattant seul, prêt à combattre (J1 à gauche tourné à droite par défaut). */
export function newFighter(isPlayerOne = true, x = isPlayerOne ? -2 : 2): TestFighter {
  const f = createFighter();
  const events: BattleEvent[] = [];
  const ctx: FighterContext = { data, events };
  setupBattleStart(f, ctx, x, 0, isPlayerOne);
  return { f, ctx, events };
}

/** Un tick de combat pour un seul combattant : même ordre que BattleCore.UpdateFightState. */
export function tick(t: TestFighter, bits = 0): void {
  updateInput(t.f, bits);
  incrementActionFrame(t.f, t.ctx);
  updateActionRequest(t.f, t.ctx);
  updateMovement(t.f, t.ctx);
  updateBoxes(t.f, t.ctx);
}

/** Joue une suite d'inputs, un par tick. */
export function run(t: TestFighter, sequence: readonly number[]): void {
  for (const bits of sequence) tick(t, bits);
}

export const repeat = (bits: number, n: number): number[] => new Array<number>(n).fill(bits);
