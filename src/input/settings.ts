import { DEFAULT_BINDINGS, type Bindings, type PlayerBinding } from './input-state.ts';
import { isReservedKey } from './keys.ts';

/** Réglages du joueur, sauvegardés dans `localStorage`. */
export interface Settings {
  bindings: Bindings;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  musicEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  bindings: DEFAULT_BINDINGS,
  // Moins fort que le maximum : le son part dès le premier clic, sans avoir pu régler quoi que ce soit.
  masterVolume: 0.3,
  musicVolume: 1,
  sfxVolume: 1,
  musicEnabled: true,
};

export const SETTINGS_KEY = 'footsies-web.settings';
const VERSION = 1;

/** Ce dont on a besoin de `localStorage` (pour les tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parsePlayer(v: unknown): PlayerBinding | null {
  if (!isRecord(v)) return null;
  const { left, right, attack } = v;
  if (typeof left !== 'string' || typeof right !== 'string' || typeof attack !== 'string')
    return null;
  if (!left || !right || !attack) return null;
  return { left, right, attack };
}

/** Des touches valides : 6 touches distinctes, aucune réservée. Sinon, les touches par défaut. */
function parseBindings(v: unknown): Bindings {
  if (!isRecord(v)) return DEFAULT_BINDINGS;
  const p1 = parsePlayer(v['p1']);
  const p2 = parsePlayer(v['p2']);
  if (!p1 || !p2) return DEFAULT_BINDINGS;
  const codes = [p1.left, p1.right, p1.attack, p2.left, p2.right, p2.attack];
  if (new Set(codes).size !== codes.length || codes.some(isReservedKey)) return DEFAULT_BINDINGS;
  return { p1, p2 };
}

function parseVolume(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

/**
 * Lit des réglages sauvegardés. Tout champ invalide retombe sur sa valeur par défaut (le
 * contenu de `localStorage` peut être vide, périmé, modifié à la main ou corrompu).
 */
export function parseSettings(text: string | null): Settings {
  if (!text) return DEFAULT_SETTINGS;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!isRecord(raw) || raw['version'] !== VERSION) return DEFAULT_SETTINGS;
  return {
    bindings: parseBindings(raw['bindings']),
    masterVolume: parseVolume(raw['masterVolume'], DEFAULT_SETTINGS.masterVolume),
    musicVolume: parseVolume(raw['musicVolume'], DEFAULT_SETTINGS.musicVolume),
    sfxVolume: parseVolume(raw['sfxVolume'], DEFAULT_SETTINGS.sfxVolume),
    musicEnabled:
      typeof raw['musicEnabled'] === 'boolean'
        ? raw['musicEnabled']
        : DEFAULT_SETTINGS.musicEnabled,
  };
}

export function serializeSettings(s: Settings): string {
  return JSON.stringify({ version: VERSION, ...s });
}

/** Charge les réglages ; `storage` null ou qui lève une exception (navigation privée) : défauts. */
export function loadSettings(storage: StorageLike | null): Settings {
  try {
    return parseSettings(storage?.getItem(SETTINGS_KEY) ?? null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Sauvegarde sans jamais lever d'exception ; renvoie si l'écriture a réussi. */
export function saveSettings(storage: StorageLike | null, s: Settings): boolean {
  try {
    storage?.setItem(SETTINGS_KEY, serializeSettings(s));
    return storage !== null;
  } catch {
    return false;
  }
}
