import { describe, expect, it } from 'vitest';
import uiAnimationsJson from '../src/data/ui-animations.json';
import type { UiAnimationsJson } from '../src/data/types.ts';
import { createBattle, stepBattle, type BattleState } from '../src/engine/battle.ts';
import { getAction } from '../src/engine/fighter-data.ts';
import { ActionId, DamageResult } from '../src/engine/types.ts';
import { fightToScreenX, fightToScreenY } from '../src/render/layout.ts';
import { BattleView, SHAKE_REF_PER_UNIT } from '../src/render/view.ts';
import { data } from './helpers/engine.ts';

const clips = (uiAnimationsJson as unknown as UiAnimationsJson).clips;

const damage = (damagedIsPlayerOne: boolean, result: DamageResult, x = 0.5, y = 0.6) =>
  ({ kind: 'damage', damagedIsPlayerOne, x, y, result }) as const;

/** Un tick de vue avec ces événements, sur un combat par ailleurs vierge. */
function viewTick(view: BattleView, b: BattleState, ...events: BattleState['events']): void {
  b.events = events;
  view.onTick(b, data);
}

function fresh(): { view: BattleView; b: BattleState } {
  const b = createBattle();
  stepBattle(b, data, { p1: 0, p2: 0 }); // Stop -> Intro : persos en STAND
  const view = new BattleView(clips);
  b.events = [];
  return { view, b };
}

describe('sprites des combattants', () => {
  it('suivent la motion de la frame courante', () => {
    const { view, b } = fresh();
    viewTick(view, b);
    const stand = getAction(data, ActionId.STAND).motions[0]?.motionID;
    expect(view.motion).toEqual([stand, stand]);
  });

  it("gardent le dernier sprite quand la frame n'a pas de motion (comme le C#)", () => {
    const { view, b } = fresh();
    viewTick(view, b);
    const before = [...view.motion];
    b.fighter1.currentActionFrame = 999; // hors de toutes les motions
    viewTick(view, b);
    expect(view.motion).toEqual(before);
  });

  it("changent avec l'action", () => {
    const { view, b } = fresh();
    viewTick(view, b);
    b.fighter2.currentActionId = ActionId.N_ATTACK;
    b.fighter2.currentActionFrame = 4;
    viewTick(view, b);
    expect(view.motion[1]).toBe(52); // N_ATTACK frames 4-15 : motion 52
  });

  it('tremblement : pixels écran convertis avec la fenêtre web de 960 px', () => {
    const { view } = fresh();
    expect(SHAKE_REF_PER_UNIT).toBeCloseTo(1600 / 960, 10);
    expect(view.shakeOffset(-4)).toBeCloseTo(-4 * (1600 / 960), 10);
    expect(view.shakeOffset(0)).toBe(0);
  });
});

describe("effet d'impact", () => {
  it('démarre à la position du coup, échelle selon le résultat', () => {
    for (const [result, scale] of [
      [DamageResult.Guard, 1],
      [DamageResult.Damage, 2],
      [DamageResult.GuardBreak, 5],
    ] as const) {
      const { view, b } = fresh();
      viewTick(view, b, damage(false, result, 0.5, 0.6));
      expect(view.hitEffect(1)).toEqual({
        sprite: 'HitEffect_0',
        x: fightToScreenX(0.5),
        y: fightToScreenY(0.6),
        scale,
      });
      expect(view.hitEffect(0)).toBeNull();
    }
  });

  it('un résultat sans échelle prévue (Counter) garde la précédente', () => {
    const { view, b } = fresh();
    viewTick(view, b, damage(true, DamageResult.GuardBreak));
    viewTick(view, b, damage(true, DamageResult.Counter));
    expect(view.hitEffect(0)?.scale).toBe(5);
  });

  it("joue les cellules au rythme de 2/60 s puis s'éteint", () => {
    const { view, b } = fresh();
    viewTick(view, b, damage(true, DamageResult.Damage));
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push(view.hitEffect(0)?.sprite ?? '-');
      viewTick(view, b);
    }
    // Ticks de 0,02 s ; cellules de 2/60 s (0, 0,033, 0,067, 0,1, 0,133, 0,167) ; fin à 0,1833 s.
    expect(seen).toEqual([
      'HitEffect_0', // 0,00
      'HitEffect_0', // 0,02
      'HitEffect_1', // 0,04
      'HitEffect_1', // 0,06
      'HitEffect_2', // 0,08
      'HitEffect_3', // 0,10
      'HitEffect_3', // 0,12
      'HitEffect_4', // 0,14
      'HitEffect_4', // 0,16
      'HitEffect_5', // 0,18 : cellule vide, encore dans la durée du clip
      '-', // 0,20 : terminé
      '-',
    ]);
  });

  it("un nouveau coup relance l'effet", () => {
    const { view, b } = fresh();
    viewTick(view, b, damage(true, DamageResult.Damage));
    for (let i = 0; i < 20; i++) viewTick(view, b);
    expect(view.hitEffect(0)).toBeNull();
    viewTick(view, b, damage(true, DamageResult.Guard));
    expect(view.hitEffect(0)?.sprite).toBe('HitEffect_0');
  });
});

describe('ordre de dessin', () => {
  it('au départ : P2 derrière P1, puis boucliers, annonce, impacts (prefab)', () => {
    const { view } = fresh();
    expect(view.order).toEqual([
      'fighter2',
      'fighter1',
      'guard1',
      'guard2',
      'roundUi',
      'hit1',
      'hit2',
    ]);
  });

  it("un coup sur J1 amène J2 (l'attaquant) puis l'impact tout devant", () => {
    const { view, b } = fresh();
    viewTick(view, b, damage(true, DamageResult.Damage));
    expect(view.order.slice(-3)).toEqual(['hit2', 'fighter2', 'hit1']);
    expect(view.order).toHaveLength(7);
  });

  it('un coup sur J2 amène J1', () => {
    const { view, b } = fresh();
    viewTick(view, b, damage(false, DamageResult.Guard));
    expect(view.order.at(-1)).toBe('hit2');
    expect(view.order.at(-2)).toBe('fighter1');
  });
});

describe('annonces de round', () => {
  it('rien avant tout déclencheur', () => {
    expect(fresh().view.announcement()).toBeNull();
  });

  it('roundStart : READY en fondu, vide, puis FIGHT, puis plus rien', () => {
    const { view, b } = fresh();
    viewTick(view, b, { kind: 'roundStart' });
    expect(view.announcement()).toEqual({ sprite: 'UI_0', alpha: 0 });
    for (let i = 0; i < 25; i++) viewTick(view, b); // 0,5 s
    expect(view.announcement()).toEqual({ sprite: 'UI_0', alpha: 1 });
    for (let i = 0; i < 50; i++) viewTick(view, b); // 1,5 s
    expect(view.announcement()?.sprite).toBe('UI_3');
    for (let i = 0; i < 25; i++) viewTick(view, b); // 2,0 s
    expect(view.announcement()?.sprite).toBe('UI_1');
    for (let i = 0; i < 50; i++) viewTick(view, b); // 3,0 s > 2,917 s
    expect(view.announcement()).toBeNull();
  });

  it('roundEnd : K.O. visible, disparaît après 2,5 s', () => {
    const { view, b } = fresh();
    viewTick(view, b, { kind: 'roundEnd' });
    for (let i = 0; i < 25; i++) viewTick(view, b);
    expect(view.announcement()).toEqual({ sprite: 'UI_2', alpha: 1 });
    for (let i = 0; i < 100; i++) viewTick(view, b);
    expect(view.announcement()).toBeNull();
  });
});
