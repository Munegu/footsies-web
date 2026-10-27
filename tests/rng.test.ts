import { describe, expect, it } from 'vitest';
import { createRng, rngInt, rngNext } from '../src/engine/rng.ts';

describe('rng', () => {
  it('même graine, même suite', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) expect(rngNext(a)).toBe(rngNext(b));
  });

  it('graines différentes, suites différentes', () => {
    const a = Array.from(
      { length: 20 },
      (
        (r) => () =>
          rngNext(r)
      )(createRng(1)),
    );
    const b = Array.from(
      { length: 20 },
      (
        (r) => () =>
          rngNext(r)
      )(createRng(2)),
    );
    expect(a).not.toEqual(b);
  });

  it('rngNext est dans [0, 1[', () => {
    const r = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rngNext(r);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('la graine est ramenée à 32 bits non signés', () => {
    expect(createRng(-1).state).toBe(0xffffffff);
    expect(createRng(2 ** 32 + 5).state).toBe(5);
    expect(createRng(0).state).toBe(0);
    // Graine 0 valide : la suite n'est pas dégénérée.
    const r = createRng(0);
    expect(new Set(Array.from({ length: 50 }, () => rngNext(r))).size).toBe(50);
  });

  it('rngInt : borne haute exclue, comme Random.Range(int, int)', () => {
    const r = createRng(3);
    for (let i = 0; i < 5000; i++) {
      expect([0, 1]).toContain(rngInt(r, 0, 2));
      const v = rngInt(r, 5, 8);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(7);
    }
    expect(rngInt(r, 4, 5)).toBe(4); // un seul entier possible
  });

  it('rngInt : répartition à peu près uniforme (graine fixe)', () => {
    const r = createRng(12345);
    const counts = new Array<number>(7).fill(0);
    for (let i = 0; i < 70_000; i++) counts[rngInt(r, 0, 7)]!++;
    for (const c of counts) {
      expect(c).toBeGreaterThan(9_000);
      expect(c).toBeLessThan(11_000);
    }
  });

  it('intervalle vide ou inversé : erreur', () => {
    expect(() => rngInt(createRng(1), 3, 3)).toThrow();
    expect(() => rngInt(createRng(1), 5, 2)).toThrow();
  });

  it("l'état se sauvegarde et se restaure : la suite reprend à l'identique", () => {
    const r = createRng(99);
    for (let i = 0; i < 10; i++) rngNext(r);
    const saved = structuredClone(r);
    const next = Array.from({ length: 5 }, () => rngNext(r));
    const again = Array.from(
      { length: 5 },
      (
        (c) => () =>
          rngNext(c)
      )(saved),
    );
    expect(again).toEqual(next);
  });
});
