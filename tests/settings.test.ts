import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../src/input/input-state.ts';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
  parseSettings,
  saveSettings,
  serializeSettings,
  type Settings,
  type StorageLike,
} from '../src/input/settings.ts';

const custom: Settings = {
  bindings: {
    p1: { left: 'KeyQ', right: 'KeyE', attack: 'KeyF' },
    p2: { left: 'KeyJ', right: 'KeyL', attack: 'KeyK' },
  },
  masterVolume: 0.5,
  musicVolume: 0.3,
  sfxVolume: 0.8,
  musicEnabled: false,
};

/** Un faux localStorage en mémoire. */
function memoryStorage(
  initial: Record<string, string> = {},
): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('valeurs par défaut', () => {
  it("touches de l'original, volume général à 30 %, musique active", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      bindings: DEFAULT_BINDINGS,
      masterVolume: 0.3,
      musicVolume: 1,
      sfxVolume: 1,
      musicEnabled: true,
    });
  });
});

describe('parseSettings', () => {
  it('aller-retour exact', () => {
    expect(parseSettings(serializeSettings(custom))).toEqual(custom);
    expect(parseSettings(serializeSettings(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
  });

  it('rien de sauvegardé : défauts', () => {
    expect(parseSettings(null)).toBe(DEFAULT_SETTINGS);
    expect(parseSettings('')).toBe(DEFAULT_SETTINGS);
  });

  it('JSON corrompu : défauts', () => {
    expect(parseSettings('{pas du json')).toBe(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2,3]')).toBe(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toBe(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toBe(DEFAULT_SETTINGS);
  });

  it('version inconnue : défauts', () => {
    const old = JSON.stringify({ ...custom, version: 0 });
    const future = JSON.stringify({ ...custom, version: 99 });
    expect(parseSettings(old)).toBe(DEFAULT_SETTINGS);
    expect(parseSettings(future)).toBe(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify(custom))).toBe(DEFAULT_SETTINGS); // sans version
  });

  it('un champ invalide retombe sur son défaut sans perdre les autres', () => {
    const text = JSON.stringify({
      version: 1,
      bindings: custom.bindings,
      masterVolume: 'fort',
      musicVolume: 0.3,
      sfxVolume: null,
      musicEnabled: 'oui',
    });
    expect(parseSettings(text)).toEqual({
      ...custom,
      masterVolume: 0.3,
      sfxVolume: 1,
      musicEnabled: true,
    });
  });

  it('volumes hors bornes : ramenés dans [0, 1] ; NaN et Infinity : défaut', () => {
    const out = parseSettings(
      JSON.stringify({ version: 1, masterVolume: 7, musicVolume: -2, sfxVolume: 0.25 }),
    );
    expect([out.masterVolume, out.musicVolume, out.sfxVolume]).toEqual([1, 0, 0.25]);
    // NaN / Infinity sont écrits `null` par JSON.stringify : valeur invalide -> défaut.
    const odd = parseSettings(
      JSON.stringify({
        version: 1,
        masterVolume: Number.NaN,
        musicVolume: Number.POSITIVE_INFINITY,
      }),
    );
    expect([odd.masterVolume, odd.musicVolume]).toEqual([0.3, 1]);
  });

  it('touches invalides : touches par défaut, volumes conservés', () => {
    const base = { version: 1, masterVolume: 0.4 };
    const cases: unknown[] = [
      'KeyA',
      { p1: custom.bindings.p1 }, // J2 manquant
      { p1: { left: 'KeyA', right: 'KeyD' }, p2: custom.bindings.p2 }, // attaque manquante
      { p1: { left: '', right: 'KeyD', attack: 'Space' }, p2: custom.bindings.p2 }, // vide
      { p1: { left: 1, right: 'KeyD', attack: 'Space' }, p2: custom.bindings.p2 }, // pas une chaîne
      // Deux actions sur la même touche.
      { p1: { left: 'KeyA', right: 'KeyA', attack: 'Space' }, p2: custom.bindings.p2 },
      // Touche réservée.
      { p1: { left: 'Escape', right: 'KeyD', attack: 'Space' }, p2: custom.bindings.p2 },
      { p1: custom.bindings.p1, p2: { left: 'F12', right: 'KeyL', attack: 'KeyK' } },
    ];
    for (const bindings of cases) {
      const out = parseSettings(JSON.stringify({ ...base, bindings }));
      expect(out.bindings).toBe(DEFAULT_BINDINGS);
      expect(out.masterVolume).toBe(0.4);
    }
  });
});

describe('loadSettings / saveSettings', () => {
  it('sauvegarde puis recharge', () => {
    const storage = memoryStorage();
    expect(saveSettings(storage, custom)).toBe(true);
    expect(storage.data[SETTINGS_KEY]).toBeDefined();
    expect(loadSettings(storage)).toEqual(custom);
  });

  it('rien en stock : défauts', () => {
    expect(loadSettings(memoryStorage())).toBe(DEFAULT_SETTINGS);
  });

  it('contenu corrompu en stock : défauts', () => {
    expect(loadSettings(memoryStorage({ [SETTINGS_KEY]: '{oups' }))).toBe(DEFAULT_SETTINGS);
  });

  it('pas de localStorage (null) : défauts, sauvegarde sans erreur', () => {
    expect(loadSettings(null)).toBe(DEFAULT_SETTINGS);
    expect(saveSettings(null, custom)).toBe(false);
  });

  it("localStorage qui lève une exception (navigation privée, quota) : jamais d'erreur", () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadSettings(broken)).toBe(DEFAULT_SETTINGS);
    expect(saveSettings(broken, custom)).toBe(false);
  });
});
