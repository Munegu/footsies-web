import { describe, expect, it } from 'vitest';
import {
  overlaps,
  rectOverlaps,
  rectXMax,
  transformToFightRect,
  xMax,
  xMin,
} from '../src/engine/boxes.ts';
import { DT, f32 } from '../src/engine/f32.ts';
import { buildFighterData } from '../src/engine/fighter-data.ts';
import {
  INPUT_RECORD_FRAMES,
  clearInputHistory,
  createInputHistory,
  pushInput,
} from '../src/engine/input-history.ts';
import { InputBit } from '../src/engine/types.ts';
import { data } from './helpers/engine.ts';
import fighterJson from '../src/data/f00.json';
import type { FighterJson } from '../src/data/types.ts';

describe('f32', () => {
  it('DT vaut 0.02 en float 32 bits', () => {
    expect(DT).toBe(Math.fround(0.02));
    expect(DT).not.toBe(0.02);
  });

  it('les données du perso sont converties en float 32 bits', () => {
    expect(data.params.forwardMoveSpeed).toBe(f32(2.2));
    expect(data.params.forwardMoveSpeed).not.toBe(2.2);
    const json = fighterJson as unknown as FighterJson;
    expect(buildFighterData(json).actions.get(100)?.hitboxes[1]?.rect.x).toBe(f32(0.9));
  });
});

describe('historique des inputs', () => {
  it('garde 180 ticks, le plus récent en index 0', () => {
    const h = createInputHistory();
    expect(h.input).toHaveLength(INPUT_RECORD_FRAMES);
    pushInput(h, InputBit.Left);
    pushInput(h, InputBit.Right);
    expect(h.input.slice(0, 3)).toEqual([InputBit.Right, InputBit.Left, 0]);
  });

  it("down = bits qui viennent d'être pressés, up = relâchés (XOR)", () => {
    const h = createInputHistory();
    pushInput(h, InputBit.Right | InputBit.Attack);
    expect([h.down[0], h.up[0]]).toEqual([InputBit.Right | InputBit.Attack, 0]);
    pushInput(h, InputBit.Right);
    expect([h.down[0], h.up[0]]).toEqual([0, InputBit.Attack]);
    pushInput(h, InputBit.Left);
    expect([h.down[0], h.up[0]]).toEqual([InputBit.Left, InputBit.Right]);
    pushInput(h, InputBit.Left);
    expect([h.down[0], h.up[0]]).toEqual([0, 0]);
  });

  it('un input vieux de 180 ticks est oublié', () => {
    const h = createInputHistory();
    pushInput(h, InputBit.Attack);
    for (let i = 0; i < INPUT_RECORD_FRAMES - 1; i++) pushInput(h, 0);
    expect(h.input[INPUT_RECORD_FRAMES - 1]).toBe(InputBit.Attack);
    pushInput(h, 0);
    expect(h.input.every((b) => b === 0)).toBe(true);
  });

  it('clear remet tout à zéro', () => {
    const h = createInputHistory();
    pushInput(h, InputBit.Attack);
    clearInputHistory(h);
    expect([...h.input, ...h.down, ...h.up].every((b) => b === 0)).toBe(true);
  });
});

describe('boxes', () => {
  const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

  it('x est le centre : xMin / xMax', () => {
    expect(xMin(box(1, 0, 2, 1))).toBe(0);
    expect(xMax(box(1, 0, 2, 1))).toBe(2);
  });

  it('Overlaps (BoxBase) : bornes inclusives', () => {
    expect(overlaps(box(0, 0, 2, 1), box(2, 0, 2, 1))).toBe(true); // se touchent en x = 1
    expect(overlaps(box(0, 0, 2, 1), box(2.01, 0, 2, 1))).toBe(false);
    expect(overlaps(box(0, 0, 2, 1), box(0, 1, 2, 1))).toBe(true); // se touchent en y = 1
    expect(overlaps(box(0, 0, 2, 1), box(0, 1.01, 2, 1))).toBe(false);
  });

  it('Rect.Overlaps (Unity) : x est le bord gauche, bornes strictes', () => {
    expect(rectXMax(box(1, 0, 2, 1))).toBe(3);
    // [0,2] et [2,4] se touchent seulement : pas de chevauchement strict
    expect(rectOverlaps(box(0, 0, 2, 1), box(2, 0, 2, 1))).toBe(false);
    expect(rectOverlaps(box(0, 0, 2, 1), box(1.99, 0, 2, 1))).toBe(true);
  });

  it('transformToFightRect miroite x selon le sens, pas la largeur', () => {
    const rel = box(1.5, f32(0.2), 3, f32(0.4));
    expect(transformToFightRect(rel, -2, 0, true)).toEqual(box(-0.5, f32(0.2), 3, f32(0.4)));
    expect(transformToFightRect(rel, 2, 0, false)).toEqual(box(0.5, f32(0.2), 3, f32(0.4)));
  });
});
