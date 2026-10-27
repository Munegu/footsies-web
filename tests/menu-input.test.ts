import { describe, expect, it } from 'vitest';
import { InputState } from '../src/input/input-state.ts';
import { sampleMenuInput } from '../src/ui/menu-input.ts';

describe('touches de menu (InputManager.asset)', () => {
  it('haut : flèche haut ou W ; bas : flèche bas ou S', () => {
    for (const [code, dir] of [
      ['ArrowUp', -1],
      ['KeyW', -1],
      ['ArrowDown', 1],
      ['KeyS', 1],
    ] as const) {
      const s = new InputState();
      s.keyDown(code);
      expect(sampleMenuInput(s).dir).toBe(dir);
    }
  });

  it('haut et bas ensemble : aucune direction', () => {
    const s = new InputState();
    s.keyDown('ArrowUp');
    s.keyDown('ArrowDown');
    expect(sampleMenuInput(s).dir).toBe(0);
  });

  it('une direction tenue reste présente aux ticks suivants', () => {
    const s = new InputState();
    s.keyDown('KeyS');
    expect(sampleMenuInput(s).dir).toBe(1);
    expect(sampleMenuInput(s).dir).toBe(1);
    s.keyUp('KeyS');
    expect(sampleMenuInput(s).dir).toBe(0);
  });

  it('un appui court (relâché avant le tick) est quand même vu une fois', () => {
    const s = new InputState();
    s.keyDown('ArrowDown');
    s.keyUp('ArrowDown');
    expect(sampleMenuInput(s).dir).toBe(1);
    expect(sampleMenuInput(s).dir).toBe(0);
  });

  it('valider : Entrée, Entrée du pavé ou Espace, une seule fois par appui', () => {
    for (const code of ['Enter', 'NumpadEnter', 'Space']) {
      const s = new InputState();
      s.keyDown(code);
      expect(sampleMenuInput(s).confirm).toBe(true);
      expect(sampleMenuInput(s).confirm).toBe(false); // tenue : pas de nouvel appui
    }
  });

  it('annuler : Échap, une seule fois par appui', () => {
    const s = new InputState();
    s.keyDown('Escape');
    expect(sampleMenuInput(s).cancel).toBe(true);
    expect(sampleMenuInput(s).cancel).toBe(false);
  });

  it('gauche / droite (réglage des curseurs) : flèches ou A / D, sans effet sur haut / bas', () => {
    for (const [code, hdir] of [
      ['ArrowLeft', -1],
      ['KeyA', -1],
      ['ArrowRight', 1],
      ['KeyD', 1],
    ] as const) {
      const s = new InputState();
      s.keyDown(code);
      expect(sampleMenuInput(s)).toEqual({ dir: 0, hdir, confirm: false, cancel: false });
    }
  });

  it('gauche et droite ensemble : aucune direction horizontale', () => {
    const s = new InputState();
    s.keyDown('ArrowLeft');
    s.keyDown('ArrowRight');
    expect(sampleMenuInput(s).hdir).toBe(0);
  });
});
