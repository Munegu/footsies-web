import { describe, expect, it } from 'vitest';
import { TITLE_ITEMS, createApp, reduce, type AppEvent, type AppState } from '../src/ui/app.ts';
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

  it('valider le son : bascule la musique sans quitter le titre', () => {
    const r = run([up, confirm]);
    expect(r.state.screen).toBe('title');
    expect(r.effects).toEqual(['toggleMusic']);
  });

  it('Échap sur le titre : rien', () => {
    expect(run([cancel]).state).toEqual(createApp());
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
    expect(r.effects).toEqual(['toggleMusic']);
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
    const r = run([cancel, down, confirm], inBattle());
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
