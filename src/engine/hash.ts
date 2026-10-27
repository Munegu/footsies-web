import type { BattleState } from './battle.ts';

/**
 * Hash FNV-1a 32 bits de l'état de combat (hors `events`), pour les tests de non-régression
 * et, plus tard, la détection de désynchronisation.
 * `JSON.stringify` écrit chaque nombre de façon injective (aller-retour exact) ; seul `-0` est
 * confondu avec `0`, on le distingue explicitement.
 */
export function hashBattle(b: BattleState): string {
  const text = JSON.stringify(b, (key, value: unknown) => {
    if (key === 'events') return undefined;
    return Object.is(value, -0) ? '-0' : value;
  });

  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
