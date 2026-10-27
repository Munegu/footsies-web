import { describe, expect, it } from 'vitest';
import { InputState, DEFAULT_BINDINGS } from '../src/input/input-state.ts';
import { InputBit } from '../src/engine/types.ts';

const { Left, Right, Attack } = InputBit;

describe('InputState', () => {
  it('touches par défaut : A / D / Espace pour J1, flèches / Maj droite pour J2', () => {
    expect(DEFAULT_BINDINGS.p1).toEqual({ left: 'KeyA', right: 'KeyD', attack: 'Space' });
    expect(DEFAULT_BINDINGS.p2).toEqual({
      left: 'ArrowLeft',
      right: 'ArrowRight',
      attack: 'ShiftRight',
    });
  });

  it('sans touche : tout à zéro', () => {
    expect(new InputState().sample()).toEqual({ p1: 0, p2: 0, skip: false });
  });

  it("touche tenue : présente à chaque tick jusqu'au relâchement", () => {
    const s = new InputState();
    s.keyDown('KeyD');
    expect(s.sample().p1).toBe(Right);
    expect(s.sample().p1).toBe(Right);
    s.keyUp('KeyD');
    expect(s.sample().p1).toBe(0);
  });

  it("appui plus court qu'un tick : vu pendant exactement un tick", () => {
    const s = new InputState();
    s.keyDown('Space');
    s.keyUp('Space');
    expect(s.sample().p1).toBe(Attack);
    expect(s.sample().p1).toBe(0);
  });

  it("un appui tenu après le premier tick n'est pas compté deux fois comme un nouvel appui", () => {
    const s = new InputState();
    s.keyDown('KeyA');
    s.keyDown('KeyA'); // répétition clavier
    expect(s.sample().p1).toBe(Left);
    s.keyUp('KeyA');
    expect(s.sample().p1).toBe(0);
  });

  it('combine direction et attaque, J1 et J2 indépendants', () => {
    const s = new InputState();
    s.keyDown('KeyD');
    s.keyDown('Space');
    s.keyDown('ArrowLeft');
    expect(s.sample()).toEqual({ p1: Right | Attack, p2: Left, skip: true });
  });

  it("skip : Attack de n'importe quel joueur", () => {
    const s = new InputState();
    s.keyDown('ShiftRight');
    expect(s.sample().skip).toBe(true);
  });

  it('perte de focus : tout est relâché, même un appui non consommé', () => {
    const s = new InputState();
    s.keyDown('KeyD');
    s.keyDown('Space');
    s.releaseAll();
    expect(s.sample()).toEqual({ p1: 0, p2: 0, skip: false });
  });

  it('bindings reconfigurables', () => {
    const s = new InputState();
    s.setBindings({
      p1: { left: 'KeyQ', right: 'KeyE', attack: 'KeyF' },
      p2: DEFAULT_BINDINGS.p2,
    });
    s.keyDown('KeyD');
    s.keyDown('KeyE');
    expect(s.sample().p1).toBe(Right);
  });
});
