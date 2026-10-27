import type { BattleState } from '../engine/battle.ts';
import { RoundState } from '../engine/battle.ts';
import type { DeepReadonly } from '../engine/readonly.ts';
import { createRng, rngInt, type Rng } from '../engine/rng.ts';
import type { BattleEvent } from '../engine/types.ts';
import { createBattleAI, nextAIInput, type BattleAIState } from './battle-ai.ts';

/**
 * Joueur CPU : le RNG dure tout le match (comme `UnityEngine.Random`), l'IA, elle, est recréée à
 * chaque round (BattleCore.ChangeRoundState : `new BattleAI` en entrant en Intro, `null` au KO).
 */
export interface CpuPlayer {
  rng: Rng;
  ai: BattleAIState | null;
}

export function createCpu(seed: number): CpuPlayer {
  return { rng: createRng(seed), ai: null };
}

/**
 * Bits d'input de J2 pour le prochain tick. L'original ne demande l'input de J2 qu'en Intro
 * et en Fight (UpdateIntroState / UpdateFightState) : l'IA est donc aussi active pendant l'Intro.
 */
export function cpuInput(cpu: CpuPlayer, battle: DeepReadonly<BattleState>): number {
  if (cpu.ai === null) return 0;
  if (battle.roundState !== RoundState.Intro && battle.roundState !== RoundState.Fight) return 0;
  return nextAIInput(cpu.ai, (min, max) => rngInt(cpu.rng, min, max), battle);
}

/** À appeler après chaque `stepBattle` avec ses événements : crée / supprime l'IA du round. */
export function cpuObserve(cpu: CpuPlayer, events: readonly BattleEvent[]): void {
  for (const e of events) {
    if (e.kind === 'roundStart') cpu.ai = createBattleAI();
    else if (e.kind === 'roundEnd') cpu.ai = null;
  }
}
