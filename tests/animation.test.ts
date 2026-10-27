import { describe, expect, it } from 'vitest';
import uiAnimationsJson from '../src/data/ui-animations.json';
import type { CurveKeyJson, UiAnimationsJson } from '../src/data/types.ts';
import { isFinished, sampleClip, sampleCurve, sampleSprite } from '../src/render/animation.ts';

const clips = (uiAnimationsJson as unknown as UiAnimationsJson).clips;
const clip = (name: string) => {
  const c = clips[name];
  if (!c) throw new Error(`clip ${name} absent`);
  return c;
};

const key = (time: number, value: number, inSlope = 0, outSlope = 0): CurveKeyJson => ({
  time,
  value,
  inSlope,
  outSlope,
});

describe('sampleCurve (Hermite)', () => {
  const keys = [key(0, 0), key(1, 1)];

  it('avant la première clé et après la dernière : valeurs des bornes', () => {
    expect(sampleCurve(keys, -5)).toBe(0);
    expect(sampleCurve(keys, 5)).toBe(1);
  });

  it('pentes nulles : smoothstep (3u² - 2u³)', () => {
    expect(sampleCurve(keys, 0.5)).toBeCloseTo(0.5, 10);
    expect(sampleCurve(keys, 0.25)).toBeCloseTo(3 * 0.0625 - 2 * 0.015625, 10);
    expect(sampleCurve(keys, 0.75)).toBeCloseTo(1 - (3 * 0.0625 - 2 * 0.015625), 10);
  });

  it('pentes non nulles : Hermite complet (pente 1 des deux côtés = droite)', () => {
    const line = [key(0, 0, 1, 1), key(1, 1, 1, 1)];
    for (const t of [0.1, 0.4, 0.9]) expect(sampleCurve(line, t)).toBeCloseTo(t, 10);
  });

  it('pente infinie (null) : escalier', () => {
    const step = [key(0, 0), { time: 1, value: 1, inSlope: null, outSlope: null }];
    expect(sampleCurve(step, 0.99)).toBe(0);
    expect(sampleCurve(step, 1)).toBe(1);
  });

  it('plusieurs segments : choisit le bon intervalle', () => {
    const k = [key(0, 0), key(1, 1), key(2, 1), key(3, 0)];
    expect(sampleCurve(k, 1.5)).toBe(1);
    expect(sampleCurve(k, 2.5)).toBeCloseTo(0.5, 10);
  });

  it('courbe vide : erreur', () => {
    expect(() => sampleCurve([], 0)).toThrow();
  });
});

describe('sampleSprite', () => {
  const track = [
    { time: 0, sprite: 'a' },
    { time: 1, sprite: 'b' },
  ];
  it('dernière clé dont le temps est atteint', () => {
    expect(sampleSprite(track, 0)).toBe('a');
    expect(sampleSprite(track, 0.99)).toBe('a');
    expect(sampleSprite(track, 1)).toBe('b');
    expect(sampleSprite(track, 50)).toBe('b');
  });
  it('avant la première clé : null', () => {
    expect(sampleSprite(track, -1)).toBeNull();
  });
});

describe("clips de l'original", () => {
  it('RoundStart : READY apparaît en fondu, tient, disparaît ; FIGHT surgit à 1,833 s', () => {
    const c = clip('RoundStartAnimation');
    const at = (t: number) => sampleClip(c, t);
    expect(at(0)).toEqual({ sprite: 'UI_0', alpha: 0 });
    expect(at(1 / 12).alpha).toBeCloseTo(0.5, 6); // milieu du fondu 0 -> 0,1667 s
    expect(at(0.5)).toEqual({ sprite: 'UI_0', alpha: 1 });
    expect(at(1.375).alpha).toBeCloseTo(0.5, 5); // milieu du fondu de sortie
    // L'alpha remonte sur un sprite vide : rien ne se voit jusqu'à 1,833 s.
    expect(at(1.6).sprite).toBe('UI_3');
    expect(at(1.9)).toEqual({ sprite: 'UI_1', alpha: expect.closeTo(1, 5) });
    expect(at(2.5)).toEqual({ sprite: 'UI_1', alpha: 1 });
    expect(isFinished(c, 2.9)).toBe(false);
    expect(isFinished(c, 2.9167)).toBe(true);
  });

  it("RoundEnd : K.O. à pleine opacité de 0,083 à 2 s, s'efface jusqu'à 2,5 s", () => {
    const c = clip('RoundEndAnimation');
    expect(sampleClip(c, 0)).toEqual({ sprite: 'UI_2', alpha: 0 });
    expect(sampleClip(c, 1)).toEqual({ sprite: 'UI_2', alpha: 1 });
    expect(sampleClip(c, 2.25).alpha).toBeCloseTo(0.5, 5);
    expect(isFinished(c, 2.5)).toBe(true);
  });

  it('impact : une cellule toutes les 2/60 s', () => {
    const c = clip('HitEffect');
    expect(sampleClip(c, 0).sprite).toBe('HitEffect_0');
    expect(sampleClip(c, 0.033).sprite).toBe('HitEffect_0');
    expect(sampleClip(c, 0.034).sprite).toBe('HitEffect_1');
    expect(sampleClip(c, 0.14).sprite).toBe('HitEffect_4');
    expect(sampleClip(c, 0.1).alpha).toBe(1);
  });
});
