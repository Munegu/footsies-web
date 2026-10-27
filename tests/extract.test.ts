import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import fighterJson from '../src/data/f00.json';
import spritesJson from '../src/data/f00-sprites.json';
import type { FighterJson, SpritesJson } from '../src/data/types.ts';
import { decodeActionIds, parseUnityYaml } from '../scripts/lib/unity.ts';

const data = fighterJson as unknown as FighterJson;
const sprites = spritesJson as unknown as SpritesJson;
const action = (id: number) => {
  const a = data.actions[String(id)];
  if (!a) throw new Error(`action ${id} absente`);
  return a;
};

describe('décodage', () => {
  it('actionID hexadécimal int32 little-endian', () => {
    expect(decodeActionIds('6e000000')).toEqual([110]);
    expect(decodeActionIds('6e00000073000000')).toEqual([110, 115]);
    expect(decodeActionIds('')).toEqual([]);
    expect(() => decodeActionIds('6e00')).toThrow();
  });

  it('garde les valeurs comme 6e000000 en chaîne (pas le flottant 6e0)', () => {
    const doc = parseUnityYaml(
      '%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!114 &1\nM:\n  actionID: 6e000000\n',
    );
    expect(doc['actionID']).toBe('6e000000');
  });
});

describe('f00.json : perso', () => {
  it('reprend les paramètres de F00.asset', () => {
    expect(data.fighter).toMatchObject({
      startGuardHealth: 3,
      forwardMoveSpeed: 2.2,
      backwardMoveSpeed: 1.8,
      dashAllowFrame: 9,
      specialAttackHoldFrame: 60,
      canCancelOnWhiff: false,
    });
    expect(data.fighter.baseHurtBoxRect).toEqual({ x: 0, y: 0, width: 1.5, height: 1.2 });
    expect(data.fighter.basePushBoxRect).toEqual({ x: 0, y: 0, width: 1.4, height: 1 });
  });

  it('contient les 17 actions et les 4 attaques', () => {
    expect(Object.keys(data.actions).map(Number)).toEqual([
      0, 1, 2, 10, 11, 100, 105, 110, 115, 200, 301, 305, 306, 310, 350, 500, 510,
    ]);
    expect(Object.keys(data.attacks).map(Number)).toEqual([1, 2, 10, 11]);
  });
});

describe('f00.json : frame data (SPECS 4.7)', () => {
  it('N_ATTACK : 22 ticks, hitbox active 4-5, cancel vers 110', () => {
    const a = action(100);
    expect(a.frameCount).toBe(22);
    const real = a.hitboxes.filter((h) => !h.proximity);
    expect(real.map((h) => h.startEndFrame)).toEqual([[4, 5]]);
    expect(a.hitboxes.filter((h) => h.proximity).map((h) => h.startEndFrame)).toEqual([[0, 5]]);
    expect(a.cancels).toEqual([
      { startEndFrame: [1, 3], buffer: true, execute: false, actionID: [110] },
      { startEndFrame: [4, 5], buffer: false, execute: true, actionID: [110] },
    ]);
    expect(a.status).toEqual([{ startEndFrame: [0, 4], counterHit: true }]);
  });

  it('B_ATTACK, N_SPECIAL, B_SPECIAL : durées et hitboxes actives', () => {
    const active = (id: number) =>
      action(id)
        .hitboxes.filter((h) => !h.proximity)
        .map((h) => h.startEndFrame);
    expect(action(105).frameCount).toBe(21);
    expect(active(105)).toEqual([[3, 5]]);
    expect(action(110).frameCount).toBe(44);
    expect(active(110)).toEqual([[11, 14]]);
    expect(action(115).frameCount).toBe(55);
    expect(active(115)).toEqual([[2, 7]]);
  });

  it('actions toujours annulables, boucle et types', () => {
    for (const id of [0, 1, 2, 350]) expect(action(id).alwaysCancelable).toBe(true);
    expect(action(510)).toMatchObject({ isLoop: true, frameCount: 33 });
    expect(action(350).type).toBe('Guard');
    expect(action(100).type).toBe('Attack');
    expect(action(500).frameCount).toBe(500);
  });

  it('attaques : valeurs du tableau 4.6', () => {
    const attack = (id: number) => {
      const a = data.attacks[String(id)];
      if (!a) throw new Error(`attaque ${id} absente`);
      return a;
    };
    expect(attack(1)).toMatchObject({
      vitalHealthDamage: 0,
      guardHealthDamage: 1,
      hitStunFrame: 12,
      guardStunFrame: 12,
      guardBreakStunFrame: 30,
      damageActionID: 200,
      guardActionID: 306,
    });
    expect(attack(2)).toMatchObject({ guardActionID: 305, hitStunFrame: 12 });
    expect(attack(10)).toMatchObject({
      vitalHealthDamage: 1,
      hitStunFrame: 0,
      guardStunFrame: 15,
      damageActionID: 500,
      guardActionID: 301,
    });
    expect(attack(11)).toMatchObject({
      vitalHealthDamage: 1,
      guardStunFrame: 15,
      guardActionID: 301,
    });
  });
});

describe('cohérence des références', () => {
  it('toute hitbox vise une attaque existante, tout cancel une action existante', () => {
    for (const a of Object.values(data.actions)) {
      for (const h of a.hitboxes) expect(data.attacks[String(h.attackID)]).toBeDefined();
      for (const c of a.cancels)
        for (const id of c.actionID) expect(data.actions[String(id)]).toBeDefined();
    }
    for (const atk of Object.values(data.attacks)) {
      expect(data.actions[String(atk.damageActionID)]).toBeDefined();
      expect(data.actions[String(atk.guardActionID)]).toBeDefined();
    }
  });

  it("toute motion utilisée a une sprite dans l'atlas, dans ses bornes", () => {
    const { width, height } = sprites.atlas;
    for (const a of Object.values(data.actions)) {
      for (const m of a.motions) {
        const s = sprites.sprites[String(m.motionID)];
        expect(s, `motion ${m.motionID} (action ${a.actionID})`).toBeDefined();
        if (!s) continue;
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x + s.w).toBeLessThanOrEqual(width);
        expect(s.y + s.h).toBeLessThanOrEqual(height);
      }
    }
  });

  it('chaque action est couverte de la frame 0 à frameCount-1 par des motions', () => {
    for (const a of Object.values(data.actions)) {
      if (a.motions.length === 0) continue;
      for (let f = 0; f < Math.min(a.frameCount, 60); f++) {
        const covered = a.motions.some((m) => f >= m.startEndFrame[0] && f <= m.startEndFrame[1]);
        expect(covered, `action ${a.actionID} frame ${f}`).toBe(true);
      }
    }
  });
});

describe('atlas', () => {
  it('le PNG a les dimensions annoncées et 77 sprites', () => {
    const png = PNG.sync.read(readFileSync(new URL('../src/data/f00-atlas.png', import.meta.url)));
    expect(png.width).toBe(sprites.atlas.width);
    expect(png.height).toBe(sprites.atlas.height);
    expect(Object.keys(sprites.sprites)).toHaveLength(77);
  });

  it('pivot et échelle viennent des .meta (jambes sur la ligne, ppu 10)', () => {
    const attack0 = sprites.sprites['50'];
    expect(attack0).toMatchObject({ w: 60, h: 50, pivotX: 0.5, pivotY: 0, pixelsPerUnit: 10 });
  });
});

describe('audio', () => {
  it('chaque son référencé par une action existe en .mp3', () => {
    for (const a of Object.values(data.actions)) {
      if (a.audioClip === null) continue;
      const file = new URL(`../src/data/audio/se/${a.audioClip}.mp3`, import.meta.url);
      expect(existsSync(file), `${a.audioClip}.mp3`).toBe(true);
    }
  });

  it('la musique est présente', () => {
    expect(existsSync(new URL('../src/data/audio/bgm/Footsies.mp3', import.meta.url))).toBe(true);
  });
});
