/**
 * Générateur pseudo-aléatoire seedé (mulberry32) : même graine, même suite. Le moteur et l'IA
 * n'ont pas le droit d'utiliser `Math.random()` (non reproductible). L'état tient dans un
 * nombre de 32 bits : il se sérialise, se clone et se restaure comme le reste de l'état.
 */
export interface Rng {
  state: number;
}

/** La graine est ramenée à un entier de 32 bits non signé. */
export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** Prochain nombre dans [0, 1). */
export function rngNext(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Équivalent de `UnityEngine.Random.Range(int min, int max)` : entier dans [min, max[ (max exclu). */
export function rngInt(rng: Rng, min: number, maxExclusive: number): number {
  if (!(maxExclusive > min)) throw new Error(`Intervalle vide : [${min}, ${maxExclusive}[`);
  return min + Math.floor(rngNext(rng) * (maxExclusive - min));
}
