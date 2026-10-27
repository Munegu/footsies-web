import { describe, expect, it } from 'vitest';
import { isReservedKey, keyLabel } from '../src/input/keys.ts';

describe('touches réservées', () => {
  it('Échap et les touches de debug ne sont pas affectables', () => {
    for (const code of ['Escape', 'F1', 'F2', 'F12']) expect(isReservedKey(code)).toBe(true);
  });

  it('les touches de jeu par défaut ne le sont pas', () => {
    for (const code of [
      'KeyA',
      'KeyD',
      'Space',
      'ArrowLeft',
      'ArrowRight',
      'ShiftRight',
      'Enter',
    ]) {
      expect(isReservedKey(code)).toBe(false);
    }
  });
});

describe('keyLabel', () => {
  it('touches nommées', () => {
    expect(keyLabel('Space')).toBe('Espace');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('ShiftRight')).toBe('Maj droite');
    expect(keyLabel('Enter')).toBe('Entrée');
  });

  it('lettres, chiffres et pavé numérique sans disposition connue', () => {
    expect(keyLabel('KeyA')).toBe('A');
    expect(keyLabel('Digit5')).toBe('5');
    expect(keyLabel('Numpad3')).toBe('Pavé 3');
  });

  it('avec la disposition du clavier : ce qui est gravé sur la touche (AZERTY)', () => {
    const azerty = new Map([
      ['KeyA', 'q'],
      ['KeyQ', 'a'],
      ['KeyW', 'z'],
      ['Semicolon', 'm'],
    ]);
    expect(keyLabel('KeyA', azerty)).toBe('Q');
    expect(keyLabel('KeyW', azerty)).toBe('Z');
    expect(keyLabel('Semicolon', azerty)).toBe('M');
  });

  it("les noms spéciaux l'emportent sur la disposition", () => {
    expect(keyLabel('Space', new Map([['Space', ' ']]))).toBe('Espace');
  });

  it('code inconnu : renvoyé tel quel', () => {
    expect(keyLabel('IntlRo')).toBe('IntlRo');
  });
});
