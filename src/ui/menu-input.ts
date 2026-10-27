import { BUTTON, padDirections, type PadSnapshot } from '../input/gamepad.ts';
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

const pressed = (p: PadSnapshot | null, i: number): boolean => p?.buttons[i] === true;

/**
 * Entrées de menu de la manette 1 (seule manette qui pilote les menus dans l'original) : croix
 * ou stick pour naviguer, A valide (sur appui), B ou Start annulent. `prev` est la lecture du tick
 * précédent : valider / annuler ne se déclenchent qu'à l'appui, pas tant que le bouton est tenu.
 */
export function padMenuInput(prev: PadSnapshot | null, cur: PadSnapshot | null): MenuInput {
  const none: MenuInput = { dir: 0, hdir: 0, confirm: false, cancel: false };
  if (!cur) return none;
  const d = padDirections(cur);
  const edge = (i: number): boolean => pressed(cur, i) && !pressed(prev, i);
  return {
    dir: d.up === d.down ? 0 : d.up ? -1 : 1,
    hdir: d.left === d.right ? 0 : d.left ? -1 : 1,
    confirm: edge(BUTTON.A),
    cancel: edge(BUTTON.B) || edge(BUTTON.START),
  };
}

/** Un appui sur Start (front montant) : ouvre la pause en combat. */
export function padStartPressed(prev: PadSnapshot | null, cur: PadSnapshot | null): boolean {
  return pressed(cur, BUTTON.START) && !pressed(prev, BUTTON.START);
}

/** Clavier et manette se combinent : le clavier l'emporte pour les directions s'il en donne une. */
export function mergeMenuInput(keyboard: MenuInput, pad: MenuInput): MenuInput {
  return {
    dir: keyboard.dir !== 0 ? keyboard.dir : pad.dir,
    hdir: keyboard.hdir !== 0 ? keyboard.hdir : pad.hdir,
    confirm: keyboard.confirm || pad.confirm,
    cancel: keyboard.cancel || pad.cancel,
  };
}
