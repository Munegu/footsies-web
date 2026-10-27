import { describe, expect, it } from 'vitest';
import {
  BUTTON,
  DEAD_ZONE,
  GamepadPoller,
  assignPads,
  mergePadInput,
  padDirections,
  padInputBits,
  padOfSlot,
  padStatusText,
  snapshotOf,
  type GamepadLike,
  type PadSlots,
  type PadSnapshot,
} from '../src/input/gamepad.ts';
import { InputBit } from '../src/engine/types.ts';

const { Left, Right, Attack } = InputBit;

/** Une manette : boutons pressés par indice, axes du stick gauche. */
function pad(
  index: number,
  opts: { pressed?: number[]; x?: number; y?: number; connected?: boolean; id?: string } = {},
): PadSnapshot {
  const buttons = new Array<boolean>(17).fill(false);
  for (const i of opts.pressed ?? []) buttons[i] = true;
  return {
    index,
    id: opts.id ?? `Manette ${index} (STANDARD GAMEPAD Vendor: 045e Product: 028e)`,
    connected: opts.connected ?? true,
    buttons,
    axes: [opts.x ?? 0, opts.y ?? 0, 0, 0],
  };
}

describe('direction et attaque', () => {
  it('zone morte du stick : 0,25', () => {
    expect(DEAD_ZONE).toBe(0.25);
  });

  it('croix directionnelle', () => {
    expect(padDirections(pad(0, { pressed: [BUTTON.LEFT] })).left).toBe(true);
    expect(padDirections(pad(0, { pressed: [BUTTON.RIGHT] })).right).toBe(true);
    expect(padDirections(pad(0, { pressed: [BUTTON.UP] })).up).toBe(true);
    expect(padDirections(pad(0, { pressed: [BUTTON.DOWN] })).down).toBe(true);
  });

  it('stick gauche au-delà de la zone morte, pas en deçà', () => {
    expect(padDirections(pad(0, { x: -0.24 })).left).toBe(false);
    expect(padDirections(pad(0, { x: -0.25 })).left).toBe(false); // strict, comme `< seuil`
    expect(padDirections(pad(0, { x: -0.26 })).left).toBe(true);
    expect(padDirections(pad(0, { x: 0.26 })).right).toBe(true);
    expect(padDirections(pad(0, { x: 0.24 })).right).toBe(false);
  });

  it('stick Y : négatif = haut, positif = bas (Gamepad API)', () => {
    const up = padDirections(pad(0, { y: -0.9 }));
    expect([up.up, up.down]).toEqual([true, false]);
    const down = padDirections(pad(0, { y: 0.9 }));
    expect([down.up, down.down]).toEqual([false, true]);
  });

  it('bits de jeu : gauche, droite, attaque (A)', () => {
    expect(padInputBits(pad(0))).toBe(0);
    expect(padInputBits(pad(0, { pressed: [BUTTON.LEFT] }))).toBe(Left);
    expect(padInputBits(pad(0, { x: 0.9 }))).toBe(Right);
    expect(padInputBits(pad(0, { pressed: [BUTTON.A] }))).toBe(Attack);
    expect(padInputBits(pad(0, { pressed: [BUTTON.A], x: -1 }))).toBe(Attack | Left);
  });

  it('les autres boutons ne donnent rien en jeu', () => {
    expect(padInputBits(pad(0, { pressed: [BUTTON.B, 2, 3, 4, 5, BUTTON.START] }))).toBe(0);
  });

  it('croix à droite et stick à gauche : les deux bits (STAND côté moteur)', () => {
    expect(padInputBits(pad(0, { pressed: [BUTTON.RIGHT], x: -1 }))).toBe(Left | Right);
  });

  it('pas de manette : 0', () => {
    expect(padInputBits(null)).toBe(0);
  });

  it('snapshotOf convertit un objet Gamepad', () => {
    const g: GamepadLike = {
      index: 2,
      id: 'X',
      connected: true,
      buttons: [{ pressed: true }, { pressed: false }],
      axes: [0.5, -0.5],
    };
    expect(snapshotOf(g)).toEqual({
      index: 2,
      id: 'X',
      connected: true,
      buttons: [true, false],
      axes: [0.5, -0.5],
    });
  });
});

describe('fusion clavier + manettes', () => {
  it('un input est actif si le clavier OU la manette le donne', () => {
    const merged = mergePadInput(
      { p1: Left, p2: 0, skip: false },
      pad(0, { pressed: [BUTTON.A] }),
      pad(1, { x: 1 }),
    );
    expect(merged).toEqual({ p1: Left | Attack, p2: Right, skip: true });
  });

  it('sans manette : le clavier tel quel', () => {
    expect(mergePadInput({ p1: Right, p2: Attack, skip: true }, null, null)).toEqual({
      p1: Right,
      p2: Attack,
      skip: true,
    });
  });

  it("skip suit l'attaque de n'importe quel joueur, manette comprise", () => {
    expect(
      mergePadInput({ p1: 0, p2: 0, skip: false }, null, pad(1, { pressed: [BUTTON.A] })).skip,
    ).toBe(true);
    expect(mergePadInput({ p1: Left, p2: Right, skip: false }, null, null).skip).toBe(false);
  });
});

describe('attribution des manettes (UpdateGamePad)', () => {
  const none: PadSlots = [null, null];

  it('la première manette connectée va à J1, la seconde à J2', () => {
    expect(assignPads(none, [pad(0)])).toEqual([0, null]);
    expect(assignPads([0, null], [pad(0), pad(1)])).toEqual([0, 1]);
  });

  it("deux manettes d'un coup : par indice croissant", () => {
    expect(assignPads(none, [pad(1), pad(0)])).toEqual([0, 1]);
  });

  it("une seule manette sur l'indice 2 : J1", () => {
    expect(assignPads(none, [null, null, pad(2)])).toEqual([2, null]);
  });

  it('une manette ne prend jamais deux emplacements', () => {
    expect(assignPads(none, [pad(0)])).toEqual([0, null]);
    expect(assignPads([0, null], [pad(0)])).toEqual([0, null]);
  });

  it("une troisième manette n'est attribuée à personne", () => {
    expect(assignPads([0, 1], [pad(0), pad(1), pad(2)])).toEqual([0, 1]);
  });

  it("l'attribution est stable : une manette garde son joueur", () => {
    expect(assignPads([1, 0], [pad(0), pad(1)])).toEqual([1, 0]);
  });

  it('la déconnexion de J1 libère son emplacement ; J2 garde la sienne', () => {
    expect(assignPads([0, 1], [null, pad(1)])).toEqual([null, 1]);
    expect(assignPads([0, 1], [pad(0, { connected: false }), pad(1)])).toEqual([null, 1]);
  });

  it('une manette libre prend le premier emplacement vide (J1 libéré)', () => {
    expect(assignPads([null, 1], [pad(1), pad(2)])).toEqual([2, 1]);
  });

  it('reconnexion après déconnexion', () => {
    const afterUnplug = assignPads([0, 1], [null, pad(1)]);
    expect(assignPads(afterUnplug, [pad(0), pad(1)])).toEqual([0, 1]);
  });

  it('aucune manette connectée : plus personne', () => {
    expect(assignPads([0, 1], [])).toEqual([null, null]);
    expect(assignPads([0, 1], [null, null])).toEqual([null, null]);
  });

  it("padOfSlot : la manette de l'emplacement, ou null", () => {
    const pads = [pad(0), pad(3)];
    expect(padOfSlot([3, null], 0, pads)?.index).toBe(3);
    expect(padOfSlot([3, null], 1, pads)).toBeNull();
    expect(padOfSlot([5, null], 0, pads)).toBeNull();
  });
});

describe('GamepadPoller', () => {
  const g = (index: number): GamepadLike => ({
    index,
    id: `pad${index}`,
    connected: true,
    buttons: [{ pressed: false }],
    axes: [0, 0],
  });

  it('lit les manettes présentes et ignore les trous (null)', () => {
    const poller = new GamepadPoller(() => [null, g(1), null, g(3)]);
    expect(poller.poll().map((p) => p.index)).toEqual([1, 3]);
    expect(poller.isDisabled).toBe(false);
  });

  it('getGamepads qui lève une exception : aucune manette, et désactivé pour de bon', () => {
    let calls = 0;
    const poller = new GamepadPoller(() => {
      calls++;
      throw new Error('SecurityError: permissions policy');
    });
    expect(poller.poll()).toEqual([]);
    expect(poller.isDisabled).toBe(true);
    expect(poller.poll()).toEqual([]);
    expect(poller.poll()).toEqual([]);
    expect(calls).toBe(1); // jamais réessayé
  });

  it("une lecture suivante reflète l'état courant", () => {
    let list: (GamepadLike | null)[] = [];
    const poller = new GamepadPoller(() => list);
    expect(poller.poll()).toEqual([]);
    list = [g(0)];
    expect(poller.poll()).toHaveLength(1);
    list = [];
    expect(poller.poll()).toEqual([]);
  });
});

describe('état affiché dans les options', () => {
  it('aucune manette : invite à appuyer sur un bouton', () => {
    expect(padStatusText([null, null], [])).toContain('appuyez sur un bouton');
  });

  it('noms raccourcis (on retire les détails entre parenthèses)', () => {
    const text = padStatusText(
      [0, 1],
      [
        pad(0, { id: 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e)' }),
        pad(1, { id: 'Wireless Controller' }),
      ],
    );
    expect(text).toBe('Manette J1 : Xbox 360 Controller · Manette J2 : Wireless Controller');
  });

  it('une seule manette : J2 « aucune », sans invite', () => {
    const text = padStatusText([0, null], [pad(0, { id: 'Pad (x)' })]);
    expect(text).toBe('Manette J1 : Pad · Manette J2 : aucune');
  });

  it('nom très long tronqué', () => {
    const text = padStatusText([0, null], [pad(0, { id: 'A'.repeat(60) })]);
    expect(text).toContain('…');
    expect(text.length).toBeLessThan(90);
  });

  it('API indisponible', () => {
    expect(padStatusText([null, null], [], true)).toBe('Manettes indisponibles dans ce navigateur');
  });
});
