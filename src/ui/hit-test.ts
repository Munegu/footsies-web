import type { Screen } from './app.ts';
import { pauseItemAt } from './pause.ts';
import { titleItemAt } from './title.ts';

/** L'élément de menu sous la souris sur l'écran courant (repère de référence), ou null. */
export function itemAt(screen: Screen, x: number, y: number): string | null {
  if (screen === 'title') return titleItemAt(x, y);
  if (screen === 'pause') return pauseItemAt(x, y);
  return null;
}
