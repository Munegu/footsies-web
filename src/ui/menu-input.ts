import type { InputState } from '../input/input-state.ts';
import type { Direction } from './menu.ts';

// Touches de navigation de l'original (InputManager.asset : MenuUpDown, MenuEnter, Cancel). Elles
// ne sont pas remappables : seules les touches de jeu le sont.
const UP = ['ArrowUp', 'KeyW'];
const DOWN = ['ArrowDown', 'KeyS'];
// Gauche / droite : réglage des curseurs de l'écran d'options (ajout du portage).
const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const CONFIRM = ['Enter', 'NumpadEnter', 'Space'];
const CANCEL = ['Escape'];

export interface MenuInput {
  /** Direction tenue : -1 haut, 1 bas, 0 aucune (ou les deux). */
  dir: Direction;
  /** Direction horizontale tenue : -1 gauche, 1 droite, 0 aucune (ou les deux). */
  hdir: Direction;
  confirm: boolean;
  cancel: boolean;
}

/** Lit le clavier pour un tick de menu, puis oublie les appuis courts. */
export function sampleMenuInput(input: InputState): MenuInput {
  const down = (code: string): boolean => input.isHeld(code) || input.wasPressed(code);
  const up = UP.some(down);
  const dn = DOWN.some(down);
  const left = LEFT.some(down);
  const right = RIGHT.some(down);
  const out: MenuInput = {
    dir: up === dn ? 0 : up ? -1 : 1,
    hdir: left === right ? 0 : left ? -1 : 1,
    confirm: CONFIRM.some((c) => input.wasPressed(c)),
    cancel: CANCEL.some((c) => input.wasPressed(c)),
  };
  input.clearPressed();
  return out;
}
