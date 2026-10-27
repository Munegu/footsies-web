import type { InputState } from './input-state.ts';

/** Touches dont l'action par défaut du navigateur (défilement) gênerait le jeu. */
const PREVENT_DEFAULT = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'F12',
  'F1',
  'F2',
]);

/**
 * Branche les événements clavier sur un `InputState`.
 * `onKeyDown` reçoit les appuis hors répétition automatique (touches de debug, menus...).
 * Renvoie une fonction qui débranche tout.
 */
export function attachKeyboard(state: InputState, onKeyDown?: (code: string) => void): () => void {
  const down = (e: KeyboardEvent): void => {
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    state.keyDown(e.code);
    onKeyDown?.(e.code);
  };
  const up = (e: KeyboardEvent): void => state.keyUp(e.code);
  const release = (): void => state.releaseAll();
  const visibility = (): void => {
    if (document.hidden) state.releaseAll();
  };

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', release);
    document.removeEventListener('visibilitychange', visibility);
  };
}
