import { describe, expect, it } from 'vitest';
import { itemAt } from '../src/ui/hit-test.ts';
import { PANEL_RECT, PAUSE_RECTS, pauseItemAt } from '../src/ui/pause.ts';
import { clientToRef } from '../src/ui/pointer.ts';
import {
  BUTTON_RECTS,
  CREATED_BY_RECT,
  LOGO_RECT,
  SOUND_HIT_RECT,
  SOUND_ICON_RECT,
  VERSION_RECT,
  titleItemAt,
} from '../src/ui/title.ts';

const center = (r: { x: number; y: number; w: number; h: number }) =>
  [r.x + r.w / 2, r.y + r.h / 2] as const;

describe('mise en page du titre (TitleScene.unity)', () => {
  it('trois boutons 500x110 empilés sans espace, centrés à x = 800, panneau centré à y = 600', () => {
    const { vsPlayer, vsCpu, options } = BUTTON_RECTS;
    expect([vsPlayer.y, vsCpu.y, options.y]).toEqual([435, 545, 655]);
    for (const r of [vsPlayer, vsCpu, options])
      expect([r.x + r.w / 2, r.w, r.h]).toEqual([800, 500, 110]);
    // Panneau de 330 de haut centré à 600 : de 435 à 765.
    expect(vsPlayer.y).toBe(600 - 165);
    expect(options.y + options.h).toBe(600 + 165);
  });

  it('logo 1000x300 centré en (800, 250) ; crédits et version en bas', () => {
    expect(center(LOGO_RECT)).toEqual([800, 250]);
    expect([LOGO_RECT.w, LOGO_RECT.h]).toEqual([1000, 300]);
    expect(center(CREATED_BY_RECT)).toEqual([800, 850]);
    expect(center(VERSION_RECT)).toEqual([1450, 850]);
  });

  it('case son : zone de 150x150 en haut à droite, icône de 110x110 au centre', () => {
    expect(center(SOUND_HIT_RECT)).toEqual([1525, 75]);
    expect([SOUND_HIT_RECT.w, SOUND_HIT_RECT.h]).toEqual([150, 150]);
    expect(center(SOUND_ICON_RECT)).toEqual([1525, 75]);
    expect([SOUND_ICON_RECT.w, SOUND_ICON_RECT.h]).toEqual([110, 110]);
  });
});

describe('quel élément sous la souris ?', () => {
  it('le centre de chaque bouton', () => {
    for (const id of ['vsPlayer', 'vsCpu', 'options'] as const) {
      const [x, y] = center(BUTTON_RECTS[id]);
      expect(titleItemAt(x, y)).toBe(id);
    }
  });

  it('bords inclus à gauche/haut, exclus à droite/bas', () => {
    const r = BUTTON_RECTS.vsCpu;
    expect(titleItemAt(r.x, r.y)).toBe('vsCpu');
    expect(titleItemAt(r.x + r.w - 0.01, r.y + r.h - 0.01)).toBe('vsCpu');
    expect(titleItemAt(r.x + r.w, r.y + 10)).toBeNull();
    expect(titleItemAt(r.x - 1, r.y + 10)).toBeNull();
  });

  it('les boutons ne se chevauchent pas : la frontière appartient au bouton du dessous', () => {
    expect(titleItemAt(800, 545 - 0.01)).toBe('vsPlayer');
    expect(titleItemAt(800, 545)).toBe('vsCpu');
  });

  it('la case son, y compris au-delà de son icône', () => {
    expect(titleItemAt(1525, 75)).toBe('sound');
    expect(titleItemAt(1455, 5)).toBe('sound');
    expect(titleItemAt(1440, 75)).toBeNull();
  });

  it('le vide ne renvoie rien (le titre garde sa sélection)', () => {
    expect(titleItemAt(100, 100)).toBeNull();
    expect(titleItemAt(800, 250)).toBeNull(); // le logo
  });

  it('pause : Reprendre, Rejeu du dernier round et Retour au titre', () => {
    expect(pauseItemAt(...center(PAUSE_RECTS.resume))).toBe('resume');
    expect(pauseItemAt(...center(PAUSE_RECTS.replay))).toBe('replay');
    expect(pauseItemAt(...center(PAUSE_RECTS.quit))).toBe('quit');
    expect(pauseItemAt(10, 10)).toBeNull();
  });

  it("les trois éléments de la pause sont dans l'ordre, sans chevauchement, dans le panneau", () => {
    const { resume, replay, quit } = PAUSE_RECTS;
    expect(resume.y + resume.h).toBeLessThanOrEqual(replay.y);
    expect(replay.y + replay.h).toBeLessThanOrEqual(quit.y);
    expect(quit.y + quit.h).toBeLessThanOrEqual(PANEL_RECT.y + PANEL_RECT.h);
    expect(resume.y).toBeGreaterThan(PANEL_RECT.y);
  });

  it("itemAt dépend de l'écran", () => {
    const [x, y] = center(BUTTON_RECTS.vsCpu);
    expect(itemAt('title', x, y)).toBe('vsCpu');
    expect(itemAt('battle', x, y)).toBeNull();
    expect(itemAt('options', x, y)).toBeNull();
    expect(itemAt('pause', ...center(PAUSE_RECTS.quit))).toBe('quit');
  });
});

describe('position de la souris -> repère de référence', () => {
  it('canvas plein écran en 1600x900', () => {
    expect(clientToRef({ left: 0, top: 0, width: 1600, height: 900 }, 800, 450)).toEqual({
      x: 800,
      y: 450,
    });
  });

  it("canvas réduit et décalé (bandes noires) : mise à l'échelle et décalage", () => {
    const rect = { left: 40, top: 10, width: 800, height: 450 };
    expect(clientToRef(rect, 40, 10)).toEqual({ x: 0, y: 0 });
    expect(clientToRef(rect, 440, 235)).toEqual({ x: 800, y: 450 });
    expect(clientToRef(rect, 840, 460)).toEqual({ x: 1600, y: 900 });
  });
});
