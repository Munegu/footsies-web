import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../src/input/input-state.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/input/settings.ts';
import { selectedId } from '../src/ui/menu.ts';
import {
  OPTION_ITEMS,
  assignKey,
  bindingOf,
  createOptions,
  reduceOptions,
  stepVolume,
  type OptionsEvent,
  type OptionsResult,
} from '../src/ui/options.ts';

/** Applique des événements en chaîne. */
function run(events: OptionsEvent[], settings: Settings = DEFAULT_SETTINGS): OptionsResult {
  let r: OptionsResult = { options: createOptions(), settings, effects: [], leave: false };
  for (const e of events) {
    const next = reduceOptions(r.options, r.settings, e);
    r = { ...next, effects: [...r.effects, ...next.effects] };
  }
  return r;
}

const down = (n: number): OptionsEvent[] =>
  Array.from({ length: n }, () => ({ kind: 'move', delta: 1 }) as const);
const confirm: OptionsEvent = { kind: 'confirm' };
const key = (code: string): OptionsEvent => ({ kind: 'key', code });
const adjust = (delta: -1 | 1): OptionsEvent => ({ kind: 'adjust', delta });

const idx = (id: (typeof OPTION_ITEMS)[number]): number => OPTION_ITEMS.indexOf(id);

describe('structure', () => {
  it('12 lignes : 6 touches, 3 volumes, musique, réinitialiser, retour', () => {
    expect(OPTION_ITEMS).toEqual([
      'p1Left',
      'p1Right',
      'p1Attack',
      'p2Left',
      'p2Right',
      'p2Attack',
      'master',
      'music',
      'sfx',
      'sound',
      'reset',
      'back',
    ]);
  });

  it('navigation circulaire : haut depuis la 1re ligne = Retour', () => {
    const r = run([{ kind: 'move', delta: -1 }]);
    expect(selectedId(r.options.menu)).toBe('back');
  });

  it('survol de la souris sélectionne', () => {
    const r = run([{ kind: 'hover', id: 'sfx' }]);
    expect(selectedId(r.options.menu)).toBe('sfx');
  });
});

describe("affectation d'une touche", () => {
  it('assignKey : nouvelle touche libre', () => {
    const { bindings, swappedWith } = assignKey(DEFAULT_BINDINGS, 'p1Left', 'KeyQ');
    expect(bindings.p1.left).toBe('KeyQ');
    expect(swappedWith).toBeNull();
    expect(bindings.p1.right).toBe('KeyD');
  });

  it('assignKey : touche déjà prise par une autre action = échange', () => {
    const { bindings, swappedWith } = assignKey(DEFAULT_BINDINGS, 'p1Left', 'KeyD');
    expect(swappedWith).toBe('p1Right');
    expect(bindings.p1.left).toBe('KeyD');
    expect(bindings.p1.right).toBe('KeyA'); // elle prend l'ancienne touche
  });

  it('assignKey : échange entre joueurs', () => {
    const { bindings, swappedWith } = assignKey(DEFAULT_BINDINGS, 'p2Attack', 'Space');
    expect(swappedWith).toBe('p1Attack');
    expect(bindings.p2.attack).toBe('Space');
    expect(bindings.p1.attack).toBe('ShiftRight');
  });

  it('assignKey : la même touche ne change rien (même référence)', () => {
    expect(assignKey(DEFAULT_BINDINGS, 'p1Left', 'KeyA').bindings).toBe(DEFAULT_BINDINGS);
  });

  it("assignKey ne modifie jamais les touches d'origine", () => {
    const snapshot = structuredClone(DEFAULT_BINDINGS);
    assignKey(DEFAULT_BINDINGS, 'p1Left', 'KeyD');
    expect(DEFAULT_BINDINGS).toEqual(snapshot);
  });

  it('bindingOf lit les six touches', () => {
    expect(
      (['p1Left', 'p1Right', 'p1Attack', 'p2Left', 'p2Right', 'p2Attack'] as const).map((id) =>
        bindingOf(DEFAULT_BINDINGS, id),
      ),
    ).toEqual(['KeyA', 'KeyD', 'Space', 'ArrowLeft', 'ArrowRight', 'ShiftRight']);
  });
});

describe("capture d'une touche", () => {
  it('valider une ligne de touche lance la capture', () => {
    const r = run([confirm]);
    expect(r.options.capturing).toBe('p1Left');
    expect(r.options.message).toEqual({ kind: 'capture', id: 'p1Left' });
  });

  it('la touche suivante est affectée, la capture se termine', () => {
    const r = run([confirm, key('KeyQ')]);
    expect(r.settings.bindings.p1.left).toBe('KeyQ');
    expect(r.options.capturing).toBeNull();
    expect(r.options.message).toEqual({
      kind: 'assigned',
      id: 'p1Left',
      code: 'KeyQ',
      swappedWith: null,
    });
  });

  it('un conflit échange et le dit', () => {
    const r = run([confirm, key('ArrowLeft')]);
    expect(r.settings.bindings.p1.left).toBe('ArrowLeft');
    expect(r.settings.bindings.p2.left).toBe('KeyA');
    expect(r.options.message).toMatchObject({ swappedWith: 'p2Left' });
  });

  it("Échap annule la capture sans rien changer ni quitter l'écran", () => {
    for (const cancelEvent of [key('Escape'), { kind: 'cancel' } as const]) {
      const r = run([confirm, cancelEvent]);
      expect(r.settings).toBe(DEFAULT_SETTINGS);
      expect(r.options.capturing).toBeNull();
      expect(r.leave).toBe(false);
    }
  });

  it('une touche réservée est refusée, la capture continue', () => {
    for (const code of ['F1', 'F2', 'F12']) {
      const r = run([confirm, key(code)]);
      expect(r.settings).toBe(DEFAULT_SETTINGS);
      expect(r.options.capturing).toBe('p1Left');
      expect(r.options.message).toEqual({ kind: 'reserved', code });
    }
  });

  it('pendant la capture : navigation, réglage et validation sont ignorés', () => {
    const r = run([confirm, ...down(3), adjust(1), confirm]);
    expect(r.options.capturing).toBe('p1Left');
    expect(selectedId(r.options.menu)).toBe('p1Left');
    expect(r.settings).toBe(DEFAULT_SETTINGS);
  });

  it('le clic sur une ligne de touche la capture aussi', () => {
    const r = run([{ kind: 'activate', id: 'p2Attack' }]);
    expect(r.options.capturing).toBe('p2Attack');
    expect(selectedId(r.options.menu)).toBe('p2Attack');
  });

  it("on peut affecter n'importe quelle autre touche : Entrée, Espace, flèches, chiffres", () => {
    for (const code of ['Enter', 'Space', 'ArrowUp', 'Digit1', 'Numpad4']) {
      const r = run([confirm, key(code)]);
      expect(r.settings.bindings.p1.left).toBe(code);
    }
  });

  it("aucun doublon possible après une série d'affectations", () => {
    const r = run([
      confirm,
      key('KeyD'), // p1Left <- D (échange avec p1Right)
      ...down(1),
      confirm,
      key('Space'), // p1Right <- Space (échange avec p1Attack)
      ...down(3),
      confirm,
      key('KeyA'), // p2Left <- A
    ]);
    const b = r.settings.bindings;
    const all = [b.p1.left, b.p1.right, b.p1.attack, b.p2.left, b.p2.right, b.p2.attack];
    expect(new Set(all).size).toBe(6);
  });
});

describe('réinitialisation des touches', () => {
  it('remet les touches par défaut, pas les volumes', () => {
    const changed = { ...DEFAULT_SETTINGS, sfxVolume: 0.2 };
    const r = run([confirm, key('KeyQ'), ...down(10), confirm], changed);
    expect(selectedId(r.options.menu)).toBe('reset');
    expect(r.settings.bindings).toBe(DEFAULT_BINDINGS);
    expect(r.settings.sfxVolume).toBe(0.2);
    expect(r.options.message).toEqual({ kind: 'reset' });
  });
});

describe('volumes', () => {
  const toMaster = down(6);

  it('stepVolume : crans de 0,1 sans dérive, bornés', () => {
    let v = 0;
    for (let i = 0; i < 10; i++) v = stepVolume(v, 1);
    expect(v).toBe(1); // exactement 1, pas 0,9999999
    expect(stepVolume(1, 1)).toBe(1);
    expect(stepVolume(0, -1)).toBe(0);
    expect(stepVolume(0.7, -1)).toBe(0.6);
    expect(stepVolume(0.3, 1)).toBe(0.4);
  });

  it('gauche / droite règlent le volume sélectionné', () => {
    const r = run([...toMaster, adjust(-1), adjust(-1)]);
    expect(r.settings.masterVolume).toBe(0.8);
    const music = run([...down(7), adjust(-1)]);
    expect(music.settings.musicVolume).toBe(0.9);
    const sfx = run([...down(8), adjust(-1)]);
    expect(sfx.settings.sfxVolume).toBe(0.9);
  });

  it('au maximum, droite ne change rien (même référence)', () => {
    const r = run([...toMaster, adjust(1)]);
    expect(r.settings).toBe(DEFAULT_SETTINGS);
    expect(r.effects).toEqual([]);
  });

  it("un son d'essai accompagne le volume général et les bruitages, pas la musique", () => {
    expect(run([...down(6), adjust(-1)]).effects).toEqual([{ kind: 'previewSfx' }]);
    expect(run([...down(8), adjust(-1)]).effects).toEqual([{ kind: 'previewSfx' }]);
    expect(run([...down(7), adjust(-1)]).effects).toEqual([]);
  });

  it('clic sur un curseur : valeur visée, arrondie au cran', () => {
    const r = run([{ kind: 'setVolume', id: 'music', value: 0.34 }]);
    expect(r.settings.musicVolume).toBe(0.3);
    expect(run([{ kind: 'setVolume', id: 'master', value: 9 }]).settings).toBe(DEFAULT_SETTINGS); // déjà 1
    expect(run([{ kind: 'setVolume', id: 'sfx', value: -3 }]).settings.sfxVolume).toBe(0);
  });

  it('gauche / droite sur une ligne de touche : rien', () => {
    expect(run([adjust(1)]).settings).toBe(DEFAULT_SETTINGS);
  });
});

describe('musique, retour', () => {
  it('valider ou gauche / droite sur « Musique » la coupe et la rétablit', () => {
    const toSound = down(idx('sound'));
    expect(run([...toSound, confirm]).settings.musicEnabled).toBe(false);
    expect(run([...toSound, adjust(1)]).settings.musicEnabled).toBe(false);
    expect(run([...toSound, confirm, confirm]).settings.musicEnabled).toBe(true);
  });

  it("Retour (valider) et Échap quittent l'écran", () => {
    expect(run([...down(idx('back')), confirm]).leave).toBe(true);
    expect(run([{ kind: 'cancel' }]).leave).toBe(true);
  });

  it('une touche appuyée hors capture est ignorée', () => {
    const r = run([key('KeyQ')]);
    expect(r.settings).toBe(DEFAULT_SETTINGS);
    expect(r.leave).toBe(false);
  });
});
