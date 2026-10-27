// Logique de l'écran d'options : touches à reconfigurer, volumes, son, réinitialisation.
// Pure : `(options, réglages, événement) -> (options, réglages, effets)`. L'original n'a pas cet
// écran (voir SPECS §7) : c'est un ajout du portage.
import { DEFAULT_BINDINGS, type Bindings } from '../input/input-state.ts';
import { isReservedKey } from '../input/keys.ts';
import type { Settings } from '../input/settings.ts';
import { createMenu, moveSelection, selectId, selectedId, type MenuState } from './menu.ts';

export const BINDING_IDS = [
  'p1Left',
  'p1Right',
  'p1Attack',
  'p2Left',
  'p2Right',
  'p2Attack',
] as const;
export type BindingId = (typeof BINDING_IDS)[number];

export const VOLUME_IDS = ['master', 'music', 'sfx'] as const;
export type VolumeId = (typeof VOLUME_IDS)[number];

/** Les lignes de l'écran, de haut en bas (navigation circulaire). */
export const OPTION_ITEMS = [...BINDING_IDS, ...VOLUME_IDS, 'sound', 'reset', 'back'] as const;
export type OptionId = (typeof OPTION_ITEMS)[number];

/** Ce que l'écran affiche sous le titre (le texte est composé au dessin, avec le clavier réel). */
export type OptionsMessage =
  | { kind: 'capture'; id: BindingId }
  | { kind: 'assigned'; id: BindingId; code: string; swappedWith: BindingId | null }
  | { kind: 'reserved'; code: string }
  | { kind: 'reset' }
  | null;

export interface OptionsState {
  menu: MenuState;
  /** La touche à affecter à cette action est attendue : le prochain appui la définit. */
  capturing: BindingId | null;
  message: OptionsMessage;
}

export type OptionsEvent =
  | { kind: 'move'; delta: -1 | 1 }
  | { kind: 'adjust'; delta: -1 | 1 }
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'hover'; id: string }
  | { kind: 'activate'; id: string }
  /** Une touche vient d'être enfoncée (utilisée pendant la capture). */
  | { kind: 'key'; code: string }
  /** Clic sur un curseur de volume. */
  | { kind: 'setVolume'; id: VolumeId; value: number };

export type OptionsEffect = { kind: 'previewSfx' };

export interface OptionsResult {
  options: OptionsState;
  settings: Settings;
  effects: OptionsEffect[];
  /** Retour au titre. */
  leave: boolean;
}

export const createOptions = (): OptionsState => ({
  menu: createMenu(OPTION_ITEMS, 0),
  capturing: null,
  message: null,
});

const isBindingId = (id: string): id is BindingId =>
  (BINDING_IDS as readonly string[]).includes(id);
const isVolumeId = (id: string): id is VolumeId => (VOLUME_IDS as readonly string[]).includes(id);

/** Touche affectée à une action. */
export function bindingOf(bindings: Bindings, id: BindingId): string {
  const player = id.startsWith('p1') ? bindings.p1 : bindings.p2;
  if (id.endsWith('Left')) return player.left;
  if (id.endsWith('Right')) return player.right;
  return player.attack;
}

function withBinding(bindings: Bindings, id: BindingId, code: string): Bindings {
  const key = id.endsWith('Left') ? 'left' : id.endsWith('Right') ? 'right' : 'attack';
  const player = id.startsWith('p1') ? 'p1' : 'p2';
  return { ...bindings, [player]: { ...bindings[player], [key]: code } };
}

/**
 * Affecte `code` à `id`. Si une autre action avait déjà cette touche, elles échangent leurs
 * touches (on ne peut jamais avoir deux actions sur la même touche).
 */
export function assignKey(
  bindings: Bindings,
  id: BindingId,
  code: string,
): { bindings: Bindings; swappedWith: BindingId | null } {
  const previous = bindingOf(bindings, id);
  if (previous === code) return { bindings, swappedWith: null };
  const other = BINDING_IDS.find((b) => b !== id && bindingOf(bindings, b) === code) ?? null;
  let next = withBinding(bindings, id, code);
  if (other) next = withBinding(next, other, previous);
  return { bindings: next, swappedWith: other };
}

/** Un cran de volume (0,1), sans dérive de flottants. */
export const stepVolume = (v: number, delta: -1 | 1): number =>
  Math.min(1, Math.max(0, Math.round((v + delta * 0.1) * 10) / 10));

const VOLUME_FIELD = {
  master: 'masterVolume',
  music: 'musicVolume',
  sfx: 'sfxVolume',
} as const;

export const volumeOf = (s: Settings, id: VolumeId): number => s[VOLUME_FIELD[id]];

function withVolume(r: OptionsResult, id: VolumeId, value: number): OptionsResult {
  if (volumeOf(r.settings, id) === value) return r;
  const settings = { ...r.settings, [VOLUME_FIELD[id]]: value };
  // Les bruitages (et le volume général) s'entendent : un son d'essai confirme le réglage.
  const effects: OptionsEffect[] = id === 'music' ? [] : [{ kind: 'previewSfx' }];
  return { ...r, settings, effects };
}

export function reduceOptions(
  options: OptionsState,
  settings: Settings,
  event: OptionsEvent,
): OptionsResult {
  const base: OptionsResult = { options, settings, effects: [], leave: false };

  // Pendant la capture, seules les touches comptent.
  if (options.capturing) return reduceCapture(options, settings, event, base);

  switch (event.kind) {
    case 'move':
      return { ...base, options: { ...options, menu: moveSelection(options.menu, event.delta) } };

    case 'hover':
      return { ...base, options: { ...options, menu: selectId(options.menu, event.id) } };

    case 'adjust': {
      const id = selectedId(options.menu);
      if (isVolumeId(id))
        return withVolume(base, id, stepVolume(volumeOf(settings, id), event.delta));
      if (id === 'sound') return toggleSound(base);
      return base;
    }

    case 'setVolume':
      return withVolume(
        base,
        event.id,
        Math.min(1, Math.max(0, Math.round(event.value * 10) / 10)),
      );

    case 'activate':
      return confirm({ ...base, options: { ...options, menu: selectId(options.menu, event.id) } });

    case 'confirm':
      return confirm(base);

    case 'cancel':
      return { ...base, leave: true };

    case 'key':
      return base;
  }
}

function toggleSound(r: OptionsResult): OptionsResult {
  return { ...r, settings: { ...r.settings, musicEnabled: !r.settings.musicEnabled } };
}

function confirm(r: OptionsResult): OptionsResult {
  const id = selectedId(r.options.menu);
  if (isBindingId(id)) {
    return { ...r, options: { ...r.options, capturing: id, message: { kind: 'capture', id } } };
  }
  if (id === 'sound') return toggleSound(r);
  if (id === 'reset') {
    return {
      ...r,
      settings: { ...r.settings, bindings: DEFAULT_BINDINGS },
      options: { ...r.options, message: { kind: 'reset' } },
    };
  }
  if (id === 'back') return { ...r, leave: true };
  return r;
}

function reduceCapture(
  options: OptionsState,
  settings: Settings,
  event: OptionsEvent,
  base: OptionsResult,
): OptionsResult {
  const id = options.capturing;
  if (id === null) return base;

  // Échap annule la capture (aussi bien comme touche que comme événement d'annulation).
  if (event.kind === 'cancel' || (event.kind === 'key' && event.code === 'Escape')) {
    return { ...base, options: { ...options, capturing: null, message: null } };
  }
  if (event.kind !== 'key') return base;

  if (isReservedKey(event.code)) {
    return { ...base, options: { ...options, message: { kind: 'reserved', code: event.code } } };
  }
  const { bindings, swappedWith } = assignKey(settings.bindings, id, event.code);
  return {
    ...base,
    settings: bindings === settings.bindings ? settings : { ...settings, bindings },
    options: {
      ...options,
      capturing: null,
      message: { kind: 'assigned', id, code: event.code, swappedWith },
    },
  };
}
