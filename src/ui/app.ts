import { DEFAULT_SETTINGS, type Settings } from '../input/settings.ts';
import { createMenu, moveSelection, selectedId, selectId, type MenuState } from './menu.ts';
import { createOptions, reduceOptions, type OptionsEvent, type OptionsState } from './options.ts';

/** L'écran courant de l'application. */
export type Screen = 'title' | 'options' | 'battle' | 'pause';
export type Mode = 'cpu' | '2p';

/** Ordre de navigation du titre (TitleScene.unity) : VS PL2, VS CPU, puis OPTIONS (à la place d'EXIT) et le son. */
export const TITLE_ITEMS = ['vsPlayer', 'vsCpu', 'options', 'sound'] as const;
export const PAUSE_ITEMS = ['resume', 'quit'] as const;

export interface AppState {
  screen: Screen;
  titleMenu: MenuState;
  pauseMenu: MenuState;
  options: OptionsState;
  /** Réglages du joueur (touches, volumes, son) : conservés d'un écran à l'autre. */
  settings: Settings;
}

export type AppEvent =
  /** Tous les événements de navigation (aussi ceux de l'écran d'options). */
  | OptionsEvent
  /** Le combat est terminé (premier à 3 rounds). */
  | { kind: 'matchOver' };

/** Ce que l'application doit faire en réaction (le reducer reste pur). */
export type AppEffect =
  | { kind: 'startBattle'; mode: Mode }
  | { kind: 'resumeBattle' }
  | { kind: 'quitBattle' }
  /** Joue un son d'essai (réglage du volume). */
  | { kind: 'previewSfx' };

const freshTitle = (): MenuState => createMenu(TITLE_ITEMS, 0); // sélection initiale : VS PL2
const freshPause = (): MenuState => createMenu(PAUSE_ITEMS, 0);

export function createApp(settings: Settings = DEFAULT_SETTINGS): AppState {
  return {
    screen: 'title',
    titleMenu: freshTitle(),
    pauseMenu: freshPause(),
    options: createOptions(),
    settings,
  };
}

interface Result {
  state: AppState;
  effects: AppEffect[];
}

const unchanged = (state: AppState): Result => ({ state, effects: [] });

/** Transitions de l'application : `(état, événement) -> (état, effets)`. */
export function reduce(state: AppState, event: AppEvent): Result {
  if (state.screen === 'options' && event.kind !== 'matchOver')
    return reduceOptionsScreen(state, event);

  switch (event.kind) {
    case 'move':
      if (state.screen === 'title') {
        return unchanged({ ...state, titleMenu: moveSelection(state.titleMenu, event.delta) });
      }
      if (state.screen === 'pause') {
        return unchanged({ ...state, pauseMenu: moveSelection(state.pauseMenu, event.delta) });
      }
      return unchanged(state);

    case 'hover':
      if (state.screen === 'title') {
        return unchanged({ ...state, titleMenu: selectId(state.titleMenu, event.id) });
      }
      if (state.screen === 'pause') {
        return unchanged({ ...state, pauseMenu: selectId(state.pauseMenu, event.id) });
      }
      return unchanged(state);

    case 'activate': {
      const hovered = reduce(state, { kind: 'hover', id: event.id }).state;
      return reduce(hovered, { kind: 'confirm' });
    }

    case 'confirm':
      return confirm(state);

    case 'cancel':
      return cancel(state);

    case 'matchOver':
      if (state.screen === 'battle' || state.screen === 'pause') {
        return { state: createApp(state.settings), effects: [{ kind: 'quitBattle' }] };
      }
      return unchanged(state);

    // Événements propres à l'écran d'options : ignorés ailleurs.
    case 'adjust':
    case 'key':
    case 'setVolume':
      return unchanged(state);
  }
}

/** L'écran d'options délègue à sa propre logique ; `leave` ramène au titre, sur OPTIONS. */
function reduceOptionsScreen(state: AppState, event: OptionsEvent): Result {
  const r = reduceOptions(state.options, state.settings, event);
  const next: AppState = { ...state, options: r.options, settings: r.settings };
  if (r.leave) {
    return { state: { ...next, screen: 'title', options: createOptions() }, effects: r.effects };
  }
  return { state: next, effects: r.effects };
}

function confirm(state: AppState): Result {
  if (state.screen === 'title') {
    switch (selectedId(state.titleMenu)) {
      case 'vsPlayer':
        return {
          state: { ...state, screen: 'battle', pauseMenu: freshPause() },
          effects: [{ kind: 'startBattle', mode: '2p' }],
        };
      case 'vsCpu':
        return {
          state: { ...state, screen: 'battle', pauseMenu: freshPause() },
          effects: [{ kind: 'startBattle', mode: 'cpu' }],
        };
      case 'options':
        return unchanged({ ...state, screen: 'options', options: createOptions() });
      case 'sound':
        return unchanged({
          ...state,
          settings: { ...state.settings, musicEnabled: !state.settings.musicEnabled },
        });
    }
    return unchanged(state);
  }

  if (state.screen === 'pause') {
    if (selectedId(state.pauseMenu) === 'resume') {
      return { state: { ...state, screen: 'battle' }, effects: [{ kind: 'resumeBattle' }] };
    }
    return { state: createApp(state.settings), effects: [{ kind: 'quitBattle' }] };
  }

  // Écran d'options (provisoire) : valider revient au titre.
  if (state.screen === 'options') return unchanged({ ...state, screen: 'title' });
  return unchanged(state);
}

function cancel(state: AppState): Result {
  switch (state.screen) {
    case 'battle':
      return unchanged({ ...state, screen: 'pause', pauseMenu: freshPause() });
    case 'pause':
      return { state: { ...state, screen: 'battle' }, effects: [{ kind: 'resumeBattle' }] };
    case 'options':
      return unchanged(state); // géré par reduceOptionsScreen
    case 'title':
      return unchanged(state);
  }
}
