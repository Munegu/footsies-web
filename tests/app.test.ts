import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/input/settings.ts';
import {
  PAUSE_ITEMS,
  TITLE_ITEMS,
  createApp,
  reduce,
  type AppEvent,
  type AppState,
} from '../src/ui/app.ts';
import { selectedId } from '../src/ui/menu.ts';

/** Applique des événements en chaîne et renvoie l'état et tous les effets émis. */
function run(events: AppEvent[], from: AppState = createApp()) {
  let state = from;
  const effects: string[] = [];
  for (const e of events) {
    const r = reduce(state, e);
    state = r.state;
    effects.push(
      ...r.effects.map((x) => (x.kind === 'startBattle' ? `startBattle:${x.mode}` : x.kind)),
    );
  }
  return { state, effects };
}

const down: AppEvent = { kind: 'move', delta: 1 };
const up: AppEvent = { kind: 'move', delta: -1 };
const confirm: AppEvent = { kind: 'confirm' };
const cancel: AppEvent = { kind: 'cancel' };

describe('titre', () => {
  it('démarre sur le titre, VS PL2 sélectionné (comme TitleScene.unity)', () => {
    const app = createApp();
    expect(app.screen).toBe('title');
    expect(selectedId(app.titleMenu)).toBe('vsPlayer');
  });

  it('ordre de navigation : VS PL2, VS CPU, OPTIONS, son, puis retour à VS PL2', () => {
    expect(TITLE_ITEMS).toEqual(['vsPlayer', 'vsCpu', 'options', 'sound']);
    const ids: string[] = [];
    let state = createApp();
    for (let i = 0; i < 5; i++) {
      ids.push(selectedId(state.titleMenu));
      state = reduce(state, down).state;
    }
    expect(ids).toEqual(['vsPlayer', 'vsCpu', 'options', 'sound', 'vsPlayer']);
  });

  it("haut depuis VS PL2 remonte au bouton son (navigation explicite de l'original)", () => {
    expect(selectedId(run([up]).state.titleMenu)).toBe('sound');
  });

  it('valider VS PL2 : combat à deux joueurs', () => {
    const r = run([confirm]);
    expect(r.state.screen).toBe('battle');
    expect(r.effects).toEqual(['startBattle:2p']);
  });

  it('valider VS CPU : combat contre le CPU', () => {
    const r = run([down, confirm]);
    expect(r.state.screen).toBe('battle');
    expect(r.effects).toEqual(['startBattle:cpu']);
  });

  it("valider OPTIONS : écran d'options, puis retour au titre sur OPTIONS", () => {
    const r = run([down, down, confirm]);
    expect(r.state.screen).toBe('options');
    expect(r.effects).toEqual([]);
    const back = run([cancel], r.state);
    expect(back.state.screen).toBe('title');
    expect(selectedId(back.state.titleMenu)).toBe('options');
  });

  it('valider le son : bascule la musique (réglage) sans quitter le titre', () => {
    const r = run([up, confirm]);
    expect(r.state.screen).toBe('title');
    expect(r.effects).toEqual([]);
    expect(r.state.settings.musicEnabled).toBe(false);
    // La sélection reste sur le son : valider de nouveau rétablit la musique.
    expect(run([confirm], r.state).state.settings.musicEnabled).toBe(true);
  });

  it('Échap sur le titre : rien', () => {
    expect(run([cancel]).state).toEqual(createApp());
  });

  it('valider VS PL2 ne touche pas aux réglages (même référence)', () => {
    const before = createApp();
    expect(run([confirm], before).state.settings).toBe(before.settings);
  });
});

describe('souris', () => {
  it('survoler sélectionne', () => {
    const r = run([{ kind: 'hover', id: 'options' }]);
    expect(selectedId(r.state.titleMenu)).toBe('options');
    expect(r.state.screen).toBe('title');
  });

  it('survoler un id inconnu garde la sélection (clic dans le vide)', () => {
    const r = run([{ kind: 'hover', id: 'nimportequoi' }]);
    expect(selectedId(r.state.titleMenu)).toBe('vsPlayer');
  });

  it('cliquer sélectionne puis active', () => {
    const r = run([{ kind: 'activate', id: 'vsCpu' }]);
    expect(r.state.screen).toBe('battle');
    expect(r.effects).toEqual(['startBattle:cpu']);
  });

  it('cliquer le son bascule la musique', () => {
    const r = run([{ kind: 'activate', id: 'sound' }]);
    expect(r.state.settings.musicEnabled).toBe(false);
    expect(selectedId(r.state.titleMenu)).toBe('sound');
  });
});

describe('combat et pause', () => {
  const inBattle = () => run([confirm]).state;

  it('Échap en combat ouvre la pause (Reprendre sélectionné)', () => {
    const r = run([cancel], inBattle());
    expect(r.state.screen).toBe('pause');
    expect(selectedId(r.state.pauseMenu)).toBe('resume');
    expect(r.effects).toEqual([]);
  });

  it('Échap en pause reprend le combat', () => {
    const r = run([cancel, cancel], inBattle());
    expect(r.state.screen).toBe('battle');
    expect(r.effects).toEqual(['resumeBattle']);
  });

  it('valider Reprendre reprend le combat', () => {
    const r = run([cancel, confirm], inBattle());
    expect(r.state.screen).toBe('battle');
    expect(r.effects).toEqual(['resumeBattle']);
  });

  it('valider Retour au titre : quitte le combat, titre neuf', () => {
    const r = run([cancel, down, down, confirm], inBattle());
    expect(r.state.screen).toBe('title');
    expect(r.effects).toEqual(['quitBattle']);
    expect(selectedId(r.state.titleMenu)).toBe('vsPlayer');
  });

  it('la pause se rouvre toujours sur Reprendre', () => {
    const r = run([cancel, down, cancel, cancel], inBattle());
    expect(r.state.screen).toBe('pause');
    expect(selectedId(r.state.pauseMenu)).toBe('resume');
  });

  it('souris sur la pause : survol et clic', () => {
    const r = run([cancel, { kind: 'activate', id: 'quit' }], inBattle());
    expect(r.state.screen).toBe('title');
    expect(r.effects).toEqual(['quitBattle']);
  });

  it('fin de match : retour au titre', () => {
    const r = run([{ kind: 'matchOver' }], inBattle());
    expect(r.state.screen).toBe('title');
    expect(r.effects).toEqual(['quitBattle']);
  });

  it('fin de match pendant la pause : retour au titre aussi', () => {
    const r = run([cancel, { kind: 'matchOver' }], inBattle());
    expect(r.state.screen).toBe('title');
  });

  it("les directions et la validation n'ont aucun effet en combat", () => {
    const before = inBattle();
    expect(run([down, up, confirm], before).state).toEqual(before);
  });

  it('matchOver hors combat est ignoré', () => {
    expect(run([{ kind: 'matchOver' }]).effects).toEqual([]);
  });
});

describe('réglages conservés', () => {
  const custom = { ...DEFAULT_SETTINGS, sfxVolume: 0.3, musicEnabled: false };

  it('createApp garde les réglages donnés', () => {
    expect(createApp(custom).settings).toBe(custom);
  });

  it('retour au titre depuis la pause, fin de match et sortie des options les conservent', () => {
    const inBattle = run([confirm], createApp(custom)).state;
    expect(run([cancel, down, down, confirm], inBattle).state.settings).toBe(custom);
    expect(run([{ kind: 'matchOver' }], inBattle).state.settings).toBe(custom);
    const options = run([down, down, confirm], createApp(custom)).state;
    expect(run([cancel], options).state.settings).toBe(custom);
  });

  it('options : entrer ouvre un écran neuf, quitter ramène au titre sur OPTIONS', () => {
    const enter = run([down, down, confirm]);
    expect(enter.state.screen).toBe('options');
    expect(selectedId(enter.state.options.menu)).toBe('p1Left');
    const left = run([cancel], enter.state);
    expect(left.state.screen).toBe('title');
    expect(selectedId(left.state.titleMenu)).toBe('options');
  });

  it('options : Retour (dernière ligne) ramène au titre', () => {
    let state = run([down, down, confirm]).state;
    state = run([up, confirm], state).state; // haut depuis la 1re ligne = dernière ligne : Retour
    expect(state.screen).toBe('title');
  });

  it('options : un réglage modifié change la référence des réglages, pas les autres', () => {
    const entered = run([down, down, confirm]).state;
    const adjusted = run(
      [
        { kind: 'move', delta: -1 },
        { kind: 'move', delta: -1 },
        { kind: 'move', delta: -1 },
        { kind: 'adjust', delta: -1 },
      ],
      entered,
    );
    expect(adjusted.state.settings).not.toBe(entered.settings);
    expect(adjusted.state.settings.bindings).toBe(entered.settings.bindings);
  });

  it("les événements d'options sont ignorés hors de l'écran d'options", () => {
    const app = createApp();
    expect(
      run(
        [
          { kind: 'adjust', delta: 1 },
          { kind: 'key', code: 'KeyZ' },
        ],
        app,
      ).state,
    ).toEqual(app);
  });
});

describe('rejeu du dernier round (outil de debug)', () => {
  const inPause = () => run([confirm, cancel]).state;
  const available: AppEvent = { kind: 'setReplayAvailable', value: true };

  it('la pause a trois éléments : Reprendre, Rejeu du dernier round, Retour au titre', () => {
    expect(PAUSE_ITEMS).toEqual(['resume', 'replay', 'quit']);
  });

  it('aucun round terminé : « Rejeu » ne fait rien', () => {
    const r = run([down, confirm], inPause());
    expect(r.state.screen).toBe('pause');
    expect(r.effects).toEqual([]);
    expect(selectedId(r.state.pauseMenu)).toBe('replay');
  });

  it('un round terminé : valider lance le rejeu', () => {
    const r = run([available, down, confirm], inPause());
    expect(r.state.screen).toBe('replay');
    expect(r.effects).toEqual(['startReplay']);
  });

  it('un clic sur « Rejeu » le lance aussi', () => {
    const r = run([available, { kind: 'activate', id: 'replay' }], inPause());
    expect(r.state.screen).toBe('replay');
    expect(r.effects).toEqual(['startReplay']);
  });

  it('Échap pendant le rejeu : retour à la pause, le rejeu reste disponible', () => {
    const r = run([available, down, confirm, cancel], inPause());
    expect(r.state.screen).toBe('pause');
    expect(r.effects).toEqual(['startReplay', 'stopReplay']);
    expect(r.state.replayAvailable).toBe(true);
    expect(selectedId(r.state.pauseMenu)).toBe('replay');
  });

  it('pendant le rejeu : directions, validation et fin de match sont ignorées', () => {
    const replaying = run([available, down, confirm], inPause()).state;
    expect(run([down, up, confirm, { kind: 'matchOver' }], replaying).state).toEqual(replaying);
  });

  it("setReplayAvailable : bascule le drapeau sur n'importe quel écran", () => {
    expect(run([available]).state.replayAvailable).toBe(true);
    expect(
      run([available, { kind: 'setReplayAvailable', value: false }]).state.replayAvailable,
    ).toBe(false);
    const inOptions = run([down, down, confirm]).state;
    expect(run([available], inOptions).state.replayAvailable).toBe(true);
  });

  it('même valeur : même état (pas de changement inutile)', () => {
    const before = createApp();
    expect(reduce(before, { kind: 'setReplayAvailable', value: false }).state).toBe(before);
  });

  it('retour au titre ou fin de match : le drapeau retombe (nouveau match)', () => {
    const r = run([available, down, down, confirm], inPause());
    expect(r.state.screen).toBe('title');
    expect(r.state.replayAvailable).toBe(false);
    expect(run([available, { kind: 'matchOver' }], inPause()).state.replayAvailable).toBe(false);
  });

  it('les paramètres sont conservés pendant tout le rejeu', () => {
    const custom = { ...DEFAULT_SETTINGS, sfxVolume: 0.2 };
    const start = run([confirm, cancel, available, down, confirm], createApp(custom)).state;
    expect(start.screen).toBe('replay');
    expect(start.settings).toBe(custom);
  });
});
