// Menu de pause et écran d'options provisoire. L'original n'a ni l'un ni l'autre (Échap y
// renvoie directement au titre) : texte dessiné au canvas, en police monospace du système.
import type { Rect } from '../render/hud-layout.ts';
import { REF_HEIGHT, REF_WIDTH } from '../render/layout.ts';
import type { MenuState } from './menu.ts';
import { selectedId } from './menu.ts';

export const PANEL_RECT: Rect = { x: 450, y: 230, w: 700, h: 470 };

export const PAUSE_RECTS: Readonly<Record<'resume' | 'replay' | 'quit', Rect>> = {
  resume: { x: 500, y: 370, w: 600, h: 90 },
  replay: { x: 500, y: 480, w: 600, h: 90 },
  quit: { x: 500, y: 590, w: 600, h: 90 },
};

const PAUSE_LABELS = {
  resume: 'Reprendre',
  replay: 'Rejeu du dernier round',
  quit: 'Retour au titre',
} as const;

const inside = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Quel élément du menu de pause se trouve sous ce point ? */
export function pauseItemAt(x: number, y: number): string | null {
  for (const id of ['resume', 'replay', 'quit'] as const) {
    if (inside(PAUSE_RECTS[id], x, y)) return id;
  }
  return null;
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
  ctx.fillText(title, REF_WIDTH / 2, PANEL_RECT.y + 70);
}

/** À dessiner par-dessus le combat figé. */
export function drawPause(
  ctx: CanvasRenderingContext2D,
  scale: number,
  menu: MenuState,
  replayAvailable: boolean,
): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawPanel(ctx, 'PAUSE');

  const selected = selectedId(menu);
  for (const id of ['resume', 'replay', 'quit'] as const) {
    const r = PAUSE_RECTS[id];
    const isSelected = id === selected;
    const disabled = id === 'replay' && !replayAvailable;
    ctx.fillStyle = isSelected ? '#000000' : '#ffffff';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = disabled ? '#999999' : isSelected ? '#ffffff' : '#000000';
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      disabled ? `${PAUSE_LABELS[id]} (aucun)` : PAUSE_LABELS[id],
      r.x + r.w / 2,
      r.y + r.h / 2,
    );
  }
}
