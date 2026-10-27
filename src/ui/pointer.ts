import { REF_HEIGHT, REF_WIDTH } from '../render/layout.ts';

export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Position de la souris (pixels de la page) -> repère de référence 1600x900 du jeu. */
export function clientToRef(
  rect: ClientRect,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / rect.width) * REF_WIDTH,
    y: ((clientY - rect.top) / rect.height) * REF_HEIGHT,
  };
}
