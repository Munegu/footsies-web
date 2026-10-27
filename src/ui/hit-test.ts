import type { Screen } from './app.ts';
import { optionsHitAt, type OptionsHit } from './options-screen.ts';
import { pauseItemAt } from './pause.ts';
import { titleItemAt } from './title.ts';

/** L'élément de menu sous la souris sur l'écran courant (repère de référence), ou null. */
export function itemAt(screen: Screen, x: number, y: number): string | null {
  if (screen === 'title') return titleItemAt(x, y);
  if (screen === 'pause') return pauseItemAt(x, y);
  return null;
}

/** Pareil, avec la valeur visée sur un curseur de volume (écran d'options). */
export function hitAt(screen: Screen, x: number, y: number): OptionsHit | null {
  if (screen === 'options') return optionsHitAt(x, y);
  const id = itemAt(screen, x, y);
  return id === null ? null : { id };
}
