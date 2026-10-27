// Menu de pause et écran d'options provisoire. L'original n'a ni l'un ni l'autre (Échap y
// renvoie directement au titre) : texte dessiné au canvas, en police monospace du système.
import type { Atlas } from '../render/assets.ts';
import { BG_RECT, type Rect } from '../render/hud-layout.ts';
import { REF_HEIGHT, REF_WIDTH } from '../render/layout.ts';
import { drawSprite } from '../render/render.ts';
import type { MenuState } from './menu.ts';
import { selectedId } from './menu.ts';

export const PANEL_RECT: Rect = { x: 450, y: 250, w: 700, h: 400 };

export const PAUSE_RECTS: Readonly<Record<'resume' | 'quit', Rect>> = {
  resume: { x: 500, y: 390, w: 600, h: 90 },
  quit: { x: 500, y: 500, w: 600, h: 90 },
};

const PAUSE_LABELS = { resume: 'Reprendre', quit: 'Retour au titre' } as const;

const inside = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Quel élément du menu de pause se trouve sous ce point ? */
export function pauseItemAt(x: number, y: number): string | null {
  if (inside(PAUSE_RECTS.resume, x, y)) return 'resume';
  return inside(PAUSE_RECTS.quit, x, y) ? 'quit' : null;
}

function drawPanel(ctx: CanvasRenderingContext2D, title: string): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, REF_WIDTH, REF_HEIGHT);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(PANEL_RECT.x, PANEL_RECT.y, PANEL_RECT.w, PANEL_RECT.h);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 10;
  ctx.strokeRect(PANEL_RECT.x, PANEL_RECT.y, PANEL_RECT.w, PANEL_RECT.h);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 64px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, REF_WIDTH / 2, PANEL_RECT.y + 80);
}

/** À dessiner par-dessus le combat figé. */
export function drawPause(ctx: CanvasRenderingContext2D, scale: number, menu: MenuState): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawPanel(ctx, 'PAUSE');

  const selected = selectedId(menu);
  for (const id of ['resume', 'quit'] as const) {
    const r = PAUSE_RECTS[id];
    const isSelected = id === selected;
    ctx.fillStyle = isSelected ? '#000000' : '#ffffff';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = isSelected ? '#ffffff' : '#000000';
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(PAUSE_LABELS[id], r.x + r.w / 2, r.y + r.h / 2);
  }
}

/** Écran d'options provisoire (remplacé à l'étape 8b). */
export function drawOptionsStub(ctx: CanvasRenderingContext2D, scale: number, ui: Atlas): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawSprite(ctx, ui, 'BG', BG_RECT);
  drawPanel(ctx, 'OPTIONS');
  ctx.fillStyle = '#000000';
  ctx.font = '40px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Bientôt : touches, volume, manettes', REF_WIDTH / 2, 430);
  ctx.fillText('Entrée / Échap : retour', REF_WIDTH / 2, 520);
}
