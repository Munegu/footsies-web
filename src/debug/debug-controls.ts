import { RoundState } from '../engine/battle.ts';

/**
 * Pause et pas à pas de debug (BattleCore.CheckUpdateDebugPause) : F1 bascule la pause, F2 avance
 * d'un tick pendant la pause. Comme dans l'original, cela ne s'applique qu'en phase de combat
 * (Fight) : l'intro, le KO et l'écran de fin ne s'arrêtent jamais.
 */
export interface DebugControls {
  paused: boolean;
}

export const createDebugControls = (): DebugControls => ({ paused: false });

/**
 * À appeler à chaque tick avec les appuis F1 / F2 survenus depuis le dernier tick.
 * Renvoie true si le jeu doit avancer d'un tick.
 */
export function updateDebugControls(
  d: DebugControls,
  roundState: RoundState,
  f1Pressed: boolean,
  f2Pressed: boolean,
): boolean {
  if (roundState !== RoundState.Fight) return true;
  if (f1Pressed) d.paused = !d.paused;
  if (!d.paused) return true;
  return f2Pressed;
}
