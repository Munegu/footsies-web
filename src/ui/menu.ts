/** Un menu : une liste d'éléments parcourue en boucle, avec une sélection. */
export interface MenuState {
  readonly items: readonly string[];
  readonly selected: number;
}

export function createMenu(items: readonly string[], selected = 0): MenuState {
  return { items, selected };
}

export const selectedId = (m: MenuState): string => m.items[m.selected] ?? '';

/** Navigation circulaire (BattleCanvas / TitleScene : le dernier élément remonte au premier). */
export function moveSelection(m: MenuState, delta: number): MenuState {
  const n = m.items.length;
  return { ...m, selected: (((m.selected + delta) % n) + n) % n };
}

/** Sélectionne un élément par son id (survol de la souris) ; sans effet s'il n'existe pas. */
export function selectId(m: MenuState, id: string): MenuState {
  const i = m.items.indexOf(id);
  return i < 0 ? m : { ...m, selected: i };
}

// Répétition d'une direction maintenue (StandaloneInputModule du titre : 0,5 s de délai puis
// 10 actions par seconde), comptée en ticks de 20 ms.
export const REPEAT_DELAY_TICKS = 25;
export const REPEAT_INTERVAL_TICKS = 5;

export type Direction = -1 | 0 | 1;

export interface Repeater {
  dir: Direction;
  held: number;
}

export const createRepeater = (): Repeater => ({ dir: 0, held: 0 });

/**
 * À appeler à chaque tick avec la direction tenue. Renvoie la direction à appliquer ce tick
 * (0 = rien) : tout de suite à l'appui, puis après le délai, puis à intervalle régulier.
 */
export function stepRepeater(r: Repeater, dir: Direction): Direction {
  if (dir === 0) {
    r.dir = 0;
    r.held = 0;
    return 0;
  }
  if (r.dir !== dir) {
    r.dir = dir;
    r.held = 0;
    return dir;
  }
  r.held++;
  const due =
    r.held === REPEAT_DELAY_TICKS ||
    (r.held > REPEAT_DELAY_TICKS && (r.held - REPEAT_DELAY_TICKS) % REPEAT_INTERVAL_TICKS === 0);
  return due ? dir : 0;
}
