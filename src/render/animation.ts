import type { AnimationClipJson, CurveKeyJson } from '../data/types.ts';

/** Durée d'un tick de logique, en secondes : les animations avancent au rythme du moteur. */
export const TICK_SECONDS = 0.02;

/**
 * Valeur d'une courbe d'animation Unity à l'instant `t` (secondes) : interpolation de Hermite
 * cubique entre deux clés avec leurs pentes. Une pente `null` (infinie dans Unity) donne un escalier.
 */
export function sampleCurve(keys: readonly CurveKeyJson[], t: number): number {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) throw new Error('Courbe vide');
  if (t <= first.time) return first.value;
  if (t >= last.time) return last.value;

  let i = 0;
  while (i + 1 < keys.length && (keys[i + 1]?.time ?? Infinity) <= t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  if (!k0 || !k1) return last.value;
  if (k0.outSlope === null || k1.inSlope === null) return k0.value;

  const dt = k1.time - k0.time;
  const u = (t - k0.time) / dt;
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * k0.value +
    (u3 - 2 * u2 + u) * dt * k0.outSlope +
    (-2 * u3 + 3 * u2) * k1.value +
    (u3 - u2) * dt * k1.inSlope
  );
}

/** Sprite d'une piste en escalier : celui de la dernière clé dont le temps est atteint. */
export function sampleSprite(track: AnimationClipJson['sprites'], t: number): string | null {
  let current: string | null = null;
  for (const key of track) {
    if (key.time <= t) current = key.sprite;
    else break;
  }
  return current;
}

export interface ClipSample {
  sprite: string | null;
  /** 1 si le clip n'anime pas l'alpha. */
  alpha: number;
}

export function sampleClip(clip: AnimationClipJson, t: number): ClipSample {
  return {
    sprite: sampleSprite(clip.sprites, t),
    alpha: clip.alpha ? sampleCurve(clip.alpha, t) : 1,
  };
}

export const isFinished = (clip: AnimationClipJson, t: number): boolean => t >= clip.length;
