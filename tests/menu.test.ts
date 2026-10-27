import { describe, expect, it } from 'vitest';
import {
  REPEAT_DELAY_TICKS,
  REPEAT_INTERVAL_TICKS,
  createMenu,
  createRepeater,
  moveSelection,
  selectId,
  selectedId,
  stepRepeater,
  type Direction,
} from '../src/ui/menu.ts';

describe('menu', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('la sélection initiale est le premier élément', () => {
    expect(selectedId(createMenu(items))).toBe('a');
  });

  it('navigation circulaire dans les deux sens', () => {
    let m = createMenu(items);
    m = moveSelection(m, 1);
    expect(selectedId(m)).toBe('b');
    m = moveSelection(moveSelection(moveSelection(m, 1), 1), 1);
    expect(selectedId(m)).toBe('a'); // le dernier revient au premier
    expect(selectedId(moveSelection(m, -1))).toBe('d'); // et inversement
  });

  it("ne modifie pas le menu d'origine", () => {
    const m = createMenu(items);
    moveSelection(m, 1);
    expect(m.selected).toBe(0);
  });

  it('selectId : sélectionne par id, ignore un id inconnu', () => {
    const m = createMenu(items);
    expect(selectedId(selectId(m, 'c'))).toBe('c');
    expect(selectId(m, 'zzz')).toBe(m);
  });
});

describe("répétition d'une direction maintenue", () => {
  /** Directions déclenchées pendant `ticks` ticks avec `dir` tenue en continu. */
  function firedTicks(dir: Direction, ticks: number): number[] {
    const r = createRepeater();
    const fired: number[] = [];
    for (let t = 0; t < ticks; t++) if (stepRepeater(r, dir) !== 0) fired.push(t);
    return fired;
  }

  it("constantes de l'original : 0,5 s puis 10 par seconde, à 50 ticks par seconde", () => {
    expect([REPEAT_DELAY_TICKS, REPEAT_INTERVAL_TICKS]).toEqual([25, 5]);
  });

  it('tout de suite, puis après 25 ticks, puis tous les 5 ticks', () => {
    expect(firedTicks(1, 46)).toEqual([0, 25, 30, 35, 40, 45]);
  });

  it('renvoie la direction maintenue', () => {
    const r = createRepeater();
    expect(stepRepeater(r, -1)).toBe(-1);
    expect(stepRepeater(r, -1)).toBe(0);
  });

  it('relâcher remet à zéro : un nouvel appui réagit tout de suite', () => {
    const r = createRepeater();
    for (let i = 0; i < 10; i++) stepRepeater(r, 1);
    expect(stepRepeater(r, 0)).toBe(0);
    expect(stepRepeater(r, 1)).toBe(1);
  });

  it('changer de direction réagit tout de suite et repart du délai', () => {
    const r = createRepeater();
    for (let i = 0; i < 20; i++) stepRepeater(r, 1);
    expect(stepRepeater(r, -1)).toBe(-1);
    const fired: number[] = [];
    for (let t = 1; t <= 30; t++) if (stepRepeater(r, -1) !== 0) fired.push(t);
    expect(fired).toEqual([25, 30]);
  });

  it('aucune direction : jamais rien', () => {
    expect(firedTicks(0, 200)).toEqual([]);
  });
});
