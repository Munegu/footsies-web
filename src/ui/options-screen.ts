// Dessin et zones cliquables de l'écran d'options (canvas, police monospace du système).
import type { Atlas } from '../render/assets.ts';
import { BG_RECT, type Rect } from '../render/hud-layout.ts';
import { REF_WIDTH } from '../render/layout.ts';
import { drawSprite } from '../render/render.ts';
import { keyLabel } from '../input/keys.ts';
import type { Settings } from '../input/settings.ts';
import { selectedId } from './menu.ts';
import {
  BINDING_IDS,
  OPTION_ITEMS,
  VOLUME_IDS,
  bindingOf,
  volumeOf,
  type BindingId,
  type OptionId,
  type OptionsMessage,
  type OptionsState,
  type VolumeId,
} from './options.ts';

// Géométrie, en repère de référence 1600x900.
const ROW_X = 300;
const ROW_W = 1000;
const ROW_H = 56;
const ROW_Y0 = 150;
const ROW_STEP = 60;
/** Curseur de volume : 10 cases de 42 de large, 4 d'écart. */
const SLIDER_X = 800;
const CELL_W = 42;
const CELL_STEP = 46;
const SLIDER_W = CELL_STEP * 10 - (CELL_STEP - CELL_W);
const CELL_H = 28;

export const rowRect = (index: number): Rect => ({
  x: ROW_X,
  y: ROW_Y0 + index * ROW_STEP,
  w: ROW_W,
  h: ROW_H,
});

const LABELS: Readonly<Record<OptionId, string>> = {
  p1Left: 'J1  Gauche',
  p1Right: 'J1  Droite',
  p1Attack: 'J1  Attaque',
  p2Left: 'J2  Gauche',
  p2Right: 'J2  Droite',
  p2Attack: 'J2  Attaque',
  master: 'Volume général',
  music: 'Volume musique',
  sfx: 'Volume bruitages',
  sound: 'Musique',
  reset: 'Réinitialiser les touches',
  back: 'Retour',
};

export interface OptionsHit {
  id: string;
  /** Pour un curseur de volume : la valeur visée par le clic, sinon undefined. */
  value?: number;
}

const inside = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Quelle ligne (et quelle valeur de curseur) se trouve sous ce point ? */
export function optionsHitAt(x: number, y: number): OptionsHit | null {
  for (const [i, id] of OPTION_ITEMS.entries()) {
    if (!inside(rowRect(i), x, y)) continue;
    if ((VOLUME_IDS as readonly string[]).includes(id)) {
      // À gauche du curseur (marge de 40) : 0 % ; sur une case : (n + 1) / 10.
      if (x >= SLIDER_X - 40 && x < SLIDER_X) return { id, value: 0 };
      if (x >= SLIDER_X && x < SLIDER_X + SLIDER_W) {
        return { id, value: Math.min(10, Math.floor((x - SLIDER_X) / CELL_STEP) + 1) / 10 };
      }
    }
    return { id };
  }
  return null;
}

/** Texte du message sous le titre. */
export function messageText(
  message: OptionsMessage,
  layout?: ReadonlyMap<string, string> | null,
): string {
  if (!message) return '↑↓ choisir · ←→ régler · Entrée valider · Échap retour';
  switch (message.kind) {
    case 'capture':
      return `${LABELS[message.id]} : appuyez sur une touche (Échap pour annuler)`;
    case 'assigned': {
      const base = `${LABELS[message.id]} : ${keyLabel(message.code, layout)}`;
      return message.swappedWith ? `${base} (échangée avec ${LABELS[message.swappedWith]})` : base;
    }
    case 'reserved':
      return `${keyLabel(message.code, layout)} est réservée, choisissez une autre touche`;
    case 'reset':
      return 'Touches réinitialisées';
  }
}

export function drawOptions(
  ctx: CanvasRenderingContext2D,
  scale: number,
  ui: Atlas,
  options: OptionsState,
  settings: Settings,
  layout: ReadonlyMap<string, string> | null,
  padStatus: string,
): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  drawSprite(ctx, ui, 'BG', BG_RECT);

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 64px monospace';
  ctx.fillText('OPTIONS', REF_WIDTH / 2, 60);
  ctx.font = '28px monospace';
  ctx.fillText(messageText(options.message, layout), REF_WIDTH / 2, 112);

  // État des manettes, sous la dernière ligne.
  ctx.fillStyle = '#000000';
  ctx.font = '24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(padStatus, REF_WIDTH / 2, 886);

  const selected = selectedId(options.menu);
  for (const [i, id] of OPTION_ITEMS.entries()) {
    const r = rowRect(i);
    const isSelected = id === selected;
    const fg = isSelected ? '#ffffff' : '#000000';
    ctx.fillStyle = isSelected ? '#000000' : '#ffffff';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    ctx.fillStyle = fg;
    ctx.font = 'bold 34px monospace';
    ctx.textBaseline = 'middle';
    const cy = r.y + r.h / 2;

    if (id === 'reset' || id === 'back') {
      ctx.textAlign = 'center';
      ctx.fillText(LABELS[id], r.x + r.w / 2, cy);
      continue;
    }

    ctx.textAlign = 'left';
    ctx.fillText(LABELS[id], r.x + 30, cy);

    if ((BINDING_IDS as readonly string[]).includes(id)) {
      const bindingId = id as BindingId;
      ctx.textAlign = 'right';
      ctx.fillText(
        options.capturing === bindingId
          ? 'Appuyez sur une touche…'
          : keyLabel(bindingOf(settings.bindings, bindingId), layout),
        r.x + r.w - 30,
        cy,
      );
    } else if (id === 'sound') {
      ctx.textAlign = 'right';
      ctx.fillText(settings.musicEnabled ? 'OUI' : 'NON', r.x + r.w - 30, cy);
    } else {
      drawSlider(ctx, volumeOf(settings, id as VolumeId), r.y + (r.h - CELL_H) / 2, fg);
    }
  }
}

function drawSlider(ctx: CanvasRenderingContext2D, value: number, y: number, color: string): void {
  const filled = Math.round(value * 10);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  for (let i = 0; i < 10; i++) {
    const x = SLIDER_X + i * CELL_STEP;
    if (i < filled) ctx.fillRect(x, y, CELL_W, CELL_H);
    else ctx.strokeRect(x + 1.5, y + 1.5, CELL_W - 3, CELL_H - 3);
  }
}
