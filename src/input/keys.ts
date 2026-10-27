/**
 * Touches qu'on ne peut pas affecter à une action de jeu : Échap (pause / retour) et F1, F2, F12
 * (outils de debug, étape 9).
 */
const RESERVED = new Set(['Escape', 'F1', 'F2', 'F12']);

export const isReservedKey = (code: string): boolean => RESERVED.has(code);

const NAMES: Readonly<Record<string, string>> = {
  Space: 'Espace',
  Enter: 'Entrée',
  NumpadEnter: 'Entrée (pavé)',
  Tab: 'Tab',
  Backspace: 'Retour arrière',
  CapsLock: 'Verr. maj',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ShiftLeft: 'Maj gauche',
  ShiftRight: 'Maj droite',
  ControlLeft: 'Ctrl gauche',
  ControlRight: 'Ctrl droite',
  AltLeft: 'Alt gauche',
  AltRight: 'Alt droite',
  MetaLeft: 'Méta gauche',
  MetaRight: 'Méta droite',
  Insert: 'Inser',
  Delete: 'Suppr',
  Home: 'Début',
  End: 'Fin',
  PageUp: 'Page ↑',
  PageDown: 'Page ↓',
  NumpadAdd: 'Pavé +',
  NumpadSubtract: 'Pavé −',
  NumpadMultiply: 'Pavé ×',
  NumpadDivide: 'Pavé ÷',
  NumpadDecimal: 'Pavé .',
};

/**
 * Nom lisible d'une touche physique (`KeyboardEvent.code`). Si le navigateur donne la disposition
 * du clavier (`navigator.keyboard.getLayoutMap()`), on affiche ce qui est gravé sur la touche :
 * `KeyA` s'affiche « Q » sur un clavier AZERTY.
 */
export function keyLabel(code: string, layout?: ReadonlyMap<string, string> | null): string {
  const named = NAMES[code];
  if (named) return named;
  const printed = layout?.get(code);
  if (printed) return printed.toUpperCase();
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  const pad = /^Numpad([0-9])$/.exec(code);
  if (pad) return `Pavé ${pad[1]}`;
  return code;
}
