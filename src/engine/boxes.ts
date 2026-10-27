import { f32 } from './f32.ts';

/** Rectangle : `x` est le CENTRE horizontal, `y` le bas (convention des données, `BoxBase`). */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HitboxState extends Box {
  proximity: boolean;
  attackID: number;
}

// BoxBase (Fighter.cs:8-26)
export const xMin = (b: Box): number => f32(b.x - f32(b.width / 2));
export const xMax = (b: Box): number => f32(b.x + f32(b.width / 2));
export const yMin = (b: Box): number => b.y;
export const yMax = (b: Box): number => f32(b.y + b.height);

/** `BoxBase.Overlaps` : bornes inclusives. */
export function overlaps(a: Box, other: Box): boolean {
  return (
    xMax(other) >= xMin(a) &&
    xMin(other) <= xMax(a) &&
    yMax(other) >= yMin(a) &&
    yMin(other) <= yMax(a)
  );
}

// UnityEngine.Rect : ici `x` est le bord GAUCHE. BattleCore.UpdatePushCharacterVsCharacter
// appelle ces membres sur le `Rect` brut des pushboxes (dont `x` est pourtant le centre).
export const rectXMin = (r: Box): number => r.x;
export const rectXMax = (r: Box): number => f32(r.x + r.width);
const rectYMin = (r: Box): number => r.y;
const rectYMax = (r: Box): number => f32(r.y + r.height);

/** `UnityEngine.Rect.Overlaps` : bornes strictes. */
export function rectOverlaps(a: Box, other: Box): boolean {
  return (
    rectXMax(other) > rectXMin(a) &&
    rectXMin(other) < rectXMax(a) &&
    rectYMax(other) > rectYMin(a) &&
    rectYMin(other) < rectYMax(a)
  );
}

/** `TransformToFightRect` (Fighter.cs:706-717) : rect relatif -> rect en monde, miroité. */
export function transformToFightRect(
  rect: Box,
  baseX: number,
  baseY: number,
  isFaceRight: boolean,
): Box {
  const sign = isFaceRight ? 1 : -1;
  return {
    x: f32(baseX + f32(rect.x * sign)),
    y: f32(baseY + rect.y),
    width: rect.width,
    height: rect.height,
  };
}
