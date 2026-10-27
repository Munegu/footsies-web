import { describe, expect, it } from 'vitest';
import {
  AREA_BOTTOM,
  SCALE_X,
  SCALE_Y,
  fightBoxToScreen,
  fightToScreenX,
  fightToScreenY,
  integerScale,
} from '../src/render/layout.ts';

describe('layout de combat (BattleGUI)', () => {
  it('échelles : 145 px/u en horizontal, 285 px/u en vertical', () => {
    expect(SCALE_X).toBe(145);
    expect(SCALE_Y).toBe(285);
  });

  it("x = 0 au centre, x = ±5 aux bords de l'aire", () => {
    expect(fightToScreenX(0)).toBe(800);
    expect(fightToScreenX(-5)).toBe(75);
    expect(fightToScreenX(5)).toBe(1525);
  });

  it("y = 0 sur le sol (630 depuis le haut), 2 unités = haut de l'aire (60)", () => {
    expect(fightToScreenY(0)).toBe(AREA_BOTTOM);
    expect(fightToScreenY(0)).toBe(630);
    expect(fightToScreenY(2)).toBe(60);
  });

  it("hurtbox de base (1,5 x 1,2) d'un perso en x = 0 : centrée, posée sur le sol", () => {
    const r = fightBoxToScreen({ x: 0, y: 0, width: 1.5, height: 1.2 });
    expect(r).toEqual({ x: 691.25, y: 288, width: 217.5, height: 342 });
  });

  it('une box en hauteur : y mesure depuis le bas de la box', () => {
    const r = fightBoxToScreen({ x: -2, y: 0.8, width: 3, height: 0.2 });
    expect(r.y).toBe(630 - 0.8 * 285 - 0.2 * 285);
    expect(r.x + r.width / 2).toBe(fightToScreenX(-2));
  });
});

describe('échelle entière', () => {
  it.each([
    [1920, 1080, 12],
    [960, 600, 6],
    [1366, 768, 8],
    [320, 180, 2],
    [100, 50, 1], // jamais moins de 1
  ])('%i x %i -> x%i', (w, h, expected) => {
    expect(integerScale(w, h)).toBe(expected);
  });
});
