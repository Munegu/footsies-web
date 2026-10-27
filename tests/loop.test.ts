import { describe, expect, it } from 'vitest';
import { FixedStepper, MAX_ACCUMULATED_MS } from '../src/loop.ts';

/** Joue `durationMs` de temps réel à `fps` images par seconde, renvoie le nombre de ticks. */
function simulate(fps: number, durationMs: number, stepper = new FixedStepper()): number {
  let ticks = stepper.advance(0);
  const frames = Math.round((durationMs / 1000) * fps);
  for (let i = 1; i <= frames; i++) ticks += stepper.advance((i * 1000) / fps);
  return ticks;
}

describe('FixedStepper', () => {
  it('le premier appel ne fait rien (pas de temps de référence)', () => {
    expect(new FixedStepper().advance(12345)).toBe(0);
  });

  it.each([30, 50, 60, 75, 120, 144, 240])('50 ticks par seconde à %i images/s', (fps) => {
    expect(simulate(fps, 10_000)).toBe(500);
  });

  it('un affichage plus lent que la logique rattrape plusieurs ticks par frame', () => {
    const s = new FixedStepper();
    s.advance(0);
    expect(s.advance(100)).toBe(5);
  });

  it("un affichage plus rapide que la logique n'exécute rien à certaines frames", () => {
    const s = new FixedStepper();
    s.advance(0);
    expect(s.advance(7)).toBe(0);
    expect(s.advance(14)).toBe(0);
    expect(s.advance(21)).toBe(1);
  });

  it('plafonne le rattrapage (onglet resté en arrière-plan)', () => {
    const s = new FixedStepper();
    s.advance(0);
    expect(s.advance(60_000)).toBe(Math.floor(MAX_ACCUMULATED_MS / 20)); // 12 ticks, reste 10 ms
    expect(s.advance(60_020)).toBe(1);
  });

  it('reset : la frame suivante repart sans rattraper le temps perdu', () => {
    const s = new FixedStepper();
    s.advance(0);
    s.reset();
    expect(s.advance(5000)).toBe(0);
    expect(s.advance(5020)).toBe(1);
  });

  it('une horloge qui recule ne produit pas de ticks négatifs', () => {
    const s = new FixedStepper();
    s.advance(100);
    expect(s.advance(50)).toBe(0);
  });
});
