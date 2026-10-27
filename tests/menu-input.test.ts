import { describe, expect, it } from 'vitest';
import { InputState } from '../src/input/input-state.ts';
import { BUTTON, type PadSnapshot } from '../src/input/gamepad.ts';
import {
  mergeMenuInput,
  padMenuInput,
  padStartPressed,
  sampleMenuInput,
} from '../src/ui/menu-input.ts';

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

describe('manette 1 dans les menus', () => {
  const padWith = (pressed: number[], x = 0, y = 0): PadSnapshot => {
    const buttons = new Array<boolean>(17).fill(false);
    for (const i of pressed) buttons[i] = true;
    return { index: 0, id: 'pad', connected: true, buttons, axes: [x, y, 0, 0] };
  };

  it('croix ou stick : haut / bas et gauche / droite', () => {
    expect(padMenuInput(null, padWith([BUTTON.UP]))).toMatchObject({ dir: -1, hdir: 0 });
    expect(padMenuInput(null, padWith([], 0, 0.9))).toMatchObject({ dir: 1, hdir: 0 });
    expect(padMenuInput(null, padWith([BUTTON.LEFT]))).toMatchObject({ dir: 0, hdir: -1 });
    expect(padMenuInput(null, padWith([], 0.9))).toMatchObject({ hdir: 1 });
  });

  it("A valide, B et Start annulent : seulement sur appui, pas tant que c'est tenu", () => {
    const idle = padWith([]);
    expect(padMenuInput(idle, padWith([BUTTON.A]))).toMatchObject({ confirm: true, cancel: false });
    expect(padMenuInput(padWith([BUTTON.A]), padWith([BUTTON.A])).confirm).toBe(false);
    expect(padMenuInput(idle, padWith([BUTTON.B])).cancel).toBe(true);
    expect(padMenuInput(idle, padWith([BUTTON.START])).cancel).toBe(true);
    expect(padMenuInput(padWith([BUTTON.B]), padWith([BUTTON.B])).cancel).toBe(false);
  });

  it('pas de manette : rien', () => {
    expect(padMenuInput(null, null)).toEqual({ dir: 0, hdir: 0, confirm: false, cancel: false });
  });

  it('premier tick avec A déjà tenu (prev null) : compte comme un appui', () => {
    expect(padMenuInput(null, padWith([BUTTON.A])).confirm).toBe(true);
  });

  it("Start ouvre la pause à l'appui seulement", () => {
    expect(padStartPressed(padWith([]), padWith([BUTTON.START]))).toBe(true);
    expect(padStartPressed(padWith([BUTTON.START]), padWith([BUTTON.START]))).toBe(false);
    expect(padStartPressed(null, null)).toBe(false);
  });

  it("fusion clavier + manette : le clavier l'emporte pour la direction, le reste s'additionne", () => {
    const kb = { dir: -1, hdir: 0, confirm: false, cancel: false } as const;
    const pd = { dir: 1, hdir: 1, confirm: true, cancel: false } as const;
    expect(mergeMenuInput(kb, pd)).toEqual({ dir: -1, hdir: 1, confirm: true, cancel: false });
    expect(mergeMenuInput({ dir: 0, hdir: 0, confirm: false, cancel: true }, pd)).toEqual({
      dir: 1,
      hdir: 1,
      confirm: true,
      cancel: true,
    });
  });
});
