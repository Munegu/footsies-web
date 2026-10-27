import { describe, expect, it } from 'vitest';
import {
  ANNOUNCE_RECT,
  FIGHTER_TOP,
  LABEL_RECTS,
  LOGO_RECT,
  ROUND_RECTS,
  SHIELD_RECTS,
  WINDOW_RECT,
  type Rect,
} from '../src/render/hud-layout.ts';

const centerX = (r: Rect) => r.x + r.w / 2;
const centerY = (r: Rect) => r.y + r.h / 2;

describe("positions de l'interface (BattleCanvas.prefab)", () => {
  it('boucliers : J1 à gauche (150/275/400), J2 à droite (1450/1325/1200), 100x100', () => {
    expect(SHIELD_RECTS[0].map(centerX)).toEqual([150, 275, 400]);
    expect(SHIELD_RECTS[1].map(centerX)).toEqual([1450, 1325, 1200]);
    for (const r of [...SHIELD_RECTS[0], ...SHIELD_RECTS[1]]) {
      expect([r.w, r.h, centerY(r)]).toEqual([100, 100, 135]);
    }
  });

  it('les boucliers de J1 et J2 sont symétriques par rapport au centre', () => {
    SHIELD_RECTS[0].forEach((r, i) => {
      expect(centerX(r) + centerX(SHIELD_RECTS[1][i] as Rect)).toBe(1600);
    });
  });

  it('pastilles de rounds : 80x80, y = 735, la première la plus proche du centre', () => {
    expect(ROUND_RECTS[0].map(centerX)).toEqual([460, 360, 260]);
    expect(ROUND_RECTS[1].map(centerX)).toEqual([1140, 1240, 1340]);
    for (const r of [...ROUND_RECTS[0], ...ROUND_RECTS[1]]) {
      expect([r.w, r.h, centerY(r)]).toEqual([80, 80, 735]);
    }
  });

  it('labels P1 / P2 : 100x70, sous les pastilles', () => {
    expect([LABEL_RECTS[0].w, LABEL_RECTS[0].h]).toEqual([100, 70]);
    expect([centerX(LABEL_RECTS[0]), centerY(LABEL_RECTS[0])]).toEqual([447.5, 832.5]);
    expect([centerX(LABEL_RECTS[1]), centerY(LABEL_RECTS[1])]).toEqual([1152.5, 832.5]);
  });

  it("fenêtre, logo et annonce : tailles de l'original x10, centrés", () => {
    expect(WINDOW_RECT).toEqual({ x: 25, y: 25, w: 1550, h: 650 });
    expect(LOGO_RECT).toEqual({ x: 550, y: 674, w: 500, h: 150 });
    expect(ANNOUNCE_RECT).toEqual({ x: 550, y: 85, w: 500, h: 100 });
  });

  it('un combattant (500 de haut) est posé sur le sol (y = 630)', () => {
    expect(FIGHTER_TOP).toBe(130);
  });
});
