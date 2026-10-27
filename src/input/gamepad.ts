// Manettes via la Gamepad API. Port d'InputManager.cs (XInput) : deux manettes attribuées aux
// joueurs dans l'ordre de connexion, gauche / droite = croix ou stick gauche, attaque = A.
import type { BattleInput } from '../engine/battle.ts';
import { InputBit } from '../engine/types.ts';

/**
 * Zone morte du stick gauche. L'original lit le stick avec un seuil de 0,01 mais XInput applique
 * avant lui sa propre zone morte (~0,24) : on garde cette valeur effective.
 */
export const DEAD_ZONE = 0.25;

/** Indices du mapping « standard » de la Gamepad API. */
export const BUTTON = { A: 0, B: 1, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

/** Ce que l'on lit d'une manette, sans dépendre de l'objet `Gamepad` du navigateur. */
export interface PadSnapshot {
  /** Indice dans `navigator.getGamepads()` (stable tant que la manette reste branchée). */
  index: number;
  id: string;
  connected: boolean;
  buttons: readonly boolean[];
  axes: readonly number[];
}

export interface GamepadLike {
  index: number;
  id: string;
  connected: boolean;
  buttons: ArrayLike<{ pressed: boolean }>;
  axes: ArrayLike<number>;
}

export function snapshotOf(g: GamepadLike): PadSnapshot {
  return {
    index: g.index,
    id: g.id,
    connected: g.connected,
    buttons: Array.from(g.buttons, (b) => b.pressed),
    axes: Array.from(g.axes),
  };
}

const button = (p: PadSnapshot, i: number): boolean => p.buttons[i] === true;
const axis = (p: PadSnapshot, i: number): number => p.axes[i] ?? 0;

export interface PadDirections {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/** Croix directionnelle ou stick gauche au-delà de la zone morte (IsXInputLeft / Right / Up / Down). */
export function padDirections(p: PadSnapshot): PadDirections {
  return {
    left: button(p, BUTTON.LEFT) || axis(p, 0) < -DEAD_ZONE,
    right: button(p, BUTTON.RIGHT) || axis(p, 0) > DEAD_ZONE,
    // Le stick Y de la Gamepad API est positif vers le bas.
    up: button(p, BUTTON.UP) || axis(p, 1) < -DEAD_ZONE,
    down: button(p, BUTTON.DOWN) || axis(p, 1) > DEAD_ZONE,
  };
}

/** Bits d'input de jeu d'une manette (null = pas de manette) : gauche, droite, attaque (A). */
export function padInputBits(p: PadSnapshot | null): number {
  if (!p) return 0;
  const d = padDirections(p);
  return (
    (d.left ? InputBit.Left : 0) |
    (d.right ? InputBit.Right : 0) |
    (button(p, BUTTON.A) ? InputBit.Attack : 0)
  );
}

/**
 * Combine le clavier et les manettes (l'original teste la manette d'abord puis le clavier : un
 * input est actif si l'un OU l'autre le donne). `skip` (passer l'écran de fin) suit l'attaque
 * de n'importe quel joueur, manette comprise.
 */
export function mergePadInput(
  sampled: BattleInput,
  pad1: PadSnapshot | null,
  pad2: PadSnapshot | null,
): BattleInput {
  const p1 = sampled.p1 | padInputBits(pad1);
  const p2 = sampled.p2 | padInputBits(pad2);
  return { p1, p2, skip: ((p1 | p2) & InputBit.Attack) !== 0 };
}

/** Indice de la manette de chaque joueur (J1, J2), ou null. */
export type PadSlots = readonly [number | null, number | null];

/**
 * `InputManager.UpdateGamePad` : un emplacement dont la manette a disparu est libéré ; chaque
 * emplacement libre reçoit la première manette connectée qui n'est pas déjà utilisée (par
 * indice croissant, comme l'original parcourt PlayerIndex 0 à 3).
 */
export function assignPads(slots: PadSlots, pads: readonly (PadSnapshot | null)[]): PadSlots {
  const connected = new Set<number>();
  for (const p of pads) if (p?.connected) connected.add(p.index);

  const next: [number | null, number | null] = [
    slots[0] !== null && connected.has(slots[0]) ? slots[0] : null,
    slots[1] !== null && connected.has(slots[1]) ? slots[1] : null,
  ];
  const ascending = [...connected].sort((a, b) => a - b);
  for (const i of [0, 1] as const) {
    if (next[i] !== null) continue;
    const free = ascending.find((index) => !next.includes(index));
    if (free !== undefined) next[i] = free;
  }
  return next;
}

/** La manette d'un emplacement dans la liste lue, ou null. */
export function padOfSlot(
  slots: PadSlots,
  slot: 0 | 1,
  pads: readonly PadSnapshot[],
): PadSnapshot | null {
  const index = slots[slot];
  return index === null ? null : (pads.find((p) => p.index === index && p.connected) ?? null);
}

/**
 * Lecture des manettes. `navigator.getGamepads()` peut lever une exception (iframe sans la
 * permission « gamepad ») : au premier échec on désactive les manettes pour de bon (SPECS §9).
 */
export class GamepadPoller {
  private disabled = false;

  constructor(private readonly getPads: () => ArrayLike<GamepadLike | null>) {}

  get isDisabled(): boolean {
    return this.disabled;
  }

  poll(): PadSnapshot[] {
    if (this.disabled) return [];
    try {
      const out: PadSnapshot[] = [];
      for (const g of Array.from(this.getPads())) if (g) out.push(snapshotOf(g));
      return out;
    } catch {
      this.disabled = true;
      return [];
    }
  }
}

const shortName = (id: string): string => {
  const name = id.replace(/\s*\(.*$/, '').trim() || 'manette';
  return name.length > 30 ? `${name.slice(0, 29)}…` : name;
};

/** Ligne d'état des manettes affichée dans les options. */
export function padStatusText(
  slots: PadSlots,
  pads: readonly PadSnapshot[],
  disabled = false,
): string {
  if (disabled) return 'Manettes indisponibles dans ce navigateur';
  const label = (slot: 0 | 1): string => {
    const pad = padOfSlot(slots, slot, pads);
    return pad ? shortName(pad.id) : 'aucune';
  };
  const text = `Manette J1 : ${label(0)} · Manette J2 : ${label(1)}`;
  return slots[0] === null && slots[1] === null
    ? `${text} — appuyez sur un bouton pour la détecter`
    : text;
}
