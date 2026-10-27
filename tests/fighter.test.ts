import { describe, expect, it } from 'vitest';
import { DT, f32 } from '../src/engine/f32.ts';
import {
  applyPositionChange,
  getAttackData,
  getHitStunFrame,
  incrementActionFrame,
  notifyAttackHit,
  notifyDamaged,
  notifyInProximityGuardRange,
  requestWinAction,
  setHitStun,
  setSpriteShakeFrame,
} from '../src/engine/fighter.ts';
import { ActionId, DamageResult, InputBit } from '../src/engine/types.ts';
import { newFighter, repeat, run, tick } from './helpers/engine.ts';

const { Left, Right, Attack } = InputBit;

describe('démarrage', () => {
  it('J1 à gauche tourné à droite, garde 3, STAND', () => {
    const { f } = newFighter(true);
    expect(f).toMatchObject({
      x: -2,
      y: 0,
      isFaceRight: true,
      vitalHealth: 1,
      guardHealth: 3,
      currentActionId: ActionId.STAND,
      currentActionFrame: 0,
    });
  });

  it('J2 à droite tourné à gauche', () => {
    const { f } = newFighter(false);
    expect(f).toMatchObject({ x: 2, isFaceRight: false });
  });
});

describe('déplacements', () => {
  it('marche avant : 2,2 u/s * DT par tick, en float 32 bits', () => {
    const t = newFighter(true);
    tick(t, Right);
    expect(t.f.currentActionId).toBe(ActionId.FORWARD);
    expect(t.f.x).toBe(f32(-2 + f32(f32(2.2) * DT)));
    tick(t, Right);
    expect(t.f.x).toBeGreaterThan(-2 + 2 * 0.044 - 1e-6);
  });

  it('marche arrière : 1,8 u/s', () => {
    const t = newFighter(true);
    tick(t, Left);
    expect(t.f.currentActionId).toBe(ActionId.BACKWARD);
    expect(t.f.x).toBe(f32(-2 - f32(f32(1.8) * DT)));
  });

  it('J2 (tourné à gauche) avance avec Gauche, en réduisant x', () => {
    const t = newFighter(false);
    tick(t, Left);
    expect(t.f.currentActionId).toBe(ActionId.FORWARD);
    expect(t.f.x).toBeLessThan(2);
  });

  it('avant + arrière en même temps : STAND, pas de mouvement', () => {
    const t = newFighter(true);
    tick(t, Left | Right);
    expect(t.f.currentActionId).toBe(ActionId.STAND);
    expect(t.f.x).toBe(-2);
  });
});

describe('attaque normale', () => {
  it("Attack sans direction : N_ATTACK dès le tick de l'appui", () => {
    const t = newFighter(true);
    tick(t, Attack);
    expect(t.f.currentActionId).toBe(ActionId.N_ATTACK);
    expect(t.f.currentActionFrame).toBe(0);
  });

  it('Attack avec une direction (avant ou arrière) : B_ATTACK', () => {
    const a = newFighter(true);
    tick(a, Attack | Right);
    expect(a.f.currentActionId).toBe(ActionId.B_ATTACK);
    const b = newFighter(true);
    tick(b, Attack | Left);
    expect(b.f.currentActionId).toBe(ActionId.B_ATTACK);
  });

  it("émet le son de l'action avec le côté et la position", () => {
    const t = newFighter(true);
    tick(t, Attack);
    expect(t.events).toEqual([{ kind: 'sound', clip: 'Attack', playerOne: true, posX: -2 }]);
  });

  it('les boxes suivent le sens et la frame (hitbox active frames 4-5)', () => {
    const t = newFighter(true);
    run(t, [Attack, 0, 0, 0]);
    expect(t.f.currentActionFrame).toBe(3);
    expect(t.f.hitboxes.map((h) => h.proximity)).toEqual([true]);
    tick(t, 0); // frame 4
    expect(t.f.hitboxes).toHaveLength(2);
    const real = t.f.hitboxes.find((h) => !h.proximity);
    expect(real).toEqual({
      x: f32(-2 + f32(0.9)),
      y: 0,
      width: f32(1.8),
      height: f32(0.3),
      proximity: false,
      attackID: 1,
    });
    expect(t.f.hurtboxes).toHaveLength(2); // base + jambe avancée (frames 4-15)
  });

  it('J2 : les hitboxes sont miroitées', () => {
    const t = newFighter(false);
    run(t, [Attack, 0, 0, 0, 0]);
    const real = t.f.hitboxes.find((h) => !h.proximity);
    expect(real?.x).toBe(f32(2 - f32(0.9)));
  });
});

describe('spécial (charge et relâchement)', () => {
  it('tenir Attack 59 ticks puis relâcher : N_SPECIAL', () => {
    const t = newFighter(true);
    run(t, [...repeat(Attack, 59), 0]);
    expect(t.f.currentActionId).toBe(ActionId.N_SPECIAL);
  });

  it('58 ticks ne suffisent pas', () => {
    const t = newFighter(true);
    run(t, [...repeat(Attack, 58), 0]);
    expect(t.f.currentActionId).not.toBe(ActionId.N_SPECIAL);
  });

  it('avec une direction tenue au relâchement : B_SPECIAL', () => {
    const t = newFighter(true);
    run(t, [...repeat(Attack | Left, 59), Left]);
    expect(t.f.currentActionId).toBe(ActionId.B_SPECIAL);
  });
});

describe('cancel normal -> spécial', () => {
  /** N_ATTACK frame 3 puis nouvel appui : demande N_SPECIAL (fenêtre de buffer 1-3). */
  function attackThenRepress() {
    const t = newFighter(true);
    run(t, [Attack, 0, 0, Attack]);
    return t;
  }

  it("le second appui est mis en buffer, sans changer l'action", () => {
    const t = attackThenRepress();
    expect(t.f.currentActionId).toBe(ActionId.N_ATTACK);
    expect(t.f.bufferActionId).toBe(ActionId.N_SPECIAL);
  });

  it("whiff : le cancel ne s'exécute jamais (canCancelOnWhiff = false)", () => {
    const t = attackThenRepress();
    run(t, repeat(0, 10));
    expect(t.f.currentActionId).toBe(ActionId.N_ATTACK);
  });

  it("touché (ou gardé) : le cancel s'exécute au tick suivant", () => {
    const t = attackThenRepress();
    notifyAttackHit(t.f);
    tick(t, 0);
    expect(t.f.currentActionId).toBe(ActionId.N_SPECIAL);
    expect(t.f.currentActionFrame).toBe(0);
  });

  it('pendant le hitstop, le buffer attend la fin du gel', () => {
    const t = attackThenRepress();
    notifyAttackHit(t.f);
    setHitStun(t.f, 2);
    tick(t, 0);
    expect(t.f.currentActionId).toBe(ActionId.N_ATTACK);
    tick(t, 0);
    expect(t.f.currentActionId).toBe(ActionId.N_SPECIAL);
  });

  it('hors fenêtre de cancel (après la frame 5), la demande est ignorée', () => {
    const t = newFighter(true);
    run(t, [Attack, ...repeat(0, 8), Attack]); // frame 9
    expect(t.f.bufferActionId).toBe(-1);
  });
});

describe('dash', () => {
  it('double appui avant avec un tick neutre : DASH_FORWARD', () => {
    const t = newFighter(true);
    run(t, [Right, 0, Right]);
    expect(t.f.currentActionId).toBe(ActionId.DASH_FORWARD);
  });

  it('double appui arrière : DASH_BACKWARD', () => {
    const t = newFighter(true);
    run(t, [Left, 0, Left]);
    expect(t.f.currentActionId).toBe(ActionId.DASH_BACKWARD);
  });

  it('J2 : le dash avant se fait avec Gauche', () => {
    const t = newFighter(false);
    run(t, [Left, 0, Left]);
    expect(t.f.currentActionId).toBe(ActionId.DASH_FORWARD);
  });

  it('sans tick neutre (touche tenue) : pas de dash', () => {
    const t = newFighter(true);
    run(t, [Right, Right, Right]);
    expect(t.f.currentActionId).toBe(ActionId.FORWARD);
  });

  it('fenêtre de 9 ticks : 7 ticks neutres passent, 8 non', () => {
    const ok = newFighter(true);
    run(ok, [Right, ...repeat(0, 7), Right]);
    expect(ok.f.currentActionId).toBe(ActionId.DASH_FORWARD);

    const late = newFighter(true);
    run(late, [Right, ...repeat(0, 8), Right]);
    expect(late.f.currentActionId).toBe(ActionId.FORWARD);
  });

  it('un appui arrière entre les deux appuis annule le dash', () => {
    const t = newFighter(true);
    run(t, [Right, Left, Right]);
    expect(t.f.currentActionId).toBe(ActionId.FORWARD);
  });

  it("le dash déplace le perso selon les movements de l'action", () => {
    const t = newFighter(true);
    run(t, [Right, 0, Right]);
    const before = t.f.x;
    run(t, repeat(0, 5));
    expect(t.f.currentActionId).toBe(ActionId.DASH_FORWARD);
    expect(t.f.x).toBeGreaterThan(before);
  });
});

describe('dégâts, garde et guard break', () => {
  const atk = (t: ReturnType<typeof newFighter>, id: number) => getAttackData(t.ctx, id);

  it("en BACKWARD : garde automatique, action de garde de l'attaque", () => {
    const t = newFighter(true);
    tick(t, Left);
    expect(notifyDamaged(t.f, t.ctx, atk(t, 1))).toBe(DamageResult.Guard);
    expect(t.f.currentActionId).toBe(ActionId.GUARD_CROUCH);
    expect(t.f.guardHealth).toBe(2);
    expect(t.f.vitalHealth).toBe(1);
  });

  it('debout (STAND) : touché, et la garde baisse quand même', () => {
    const t = newFighter(true);
    expect(notifyDamaged(t.f, t.ctx, atk(t, 1))).toBe(DamageResult.Damage);
    expect(t.f.currentActionId).toBe(ActionId.DAMAGE);
    expect(t.f.guardHealth).toBe(2);
    expect(t.f.vitalHealth).toBe(1);
  });

  it('un spécial qui touche tue : DEAD', () => {
    const t = newFighter(true);
    expect(notifyDamaged(t.f, t.ctx, atk(t, 10))).toBe(DamageResult.Damage);
    expect(t.f.vitalHealth).toBe(0);
    expect(t.f.currentActionId).toBe(ActionId.DEAD);
  });

  it('guard break au 4e coup gardé, action GUARD_BREAK réservée', () => {
    const t = newFighter(true);
    tick(t, Left);
    const results = [1, 2, 3, 4].map(() => notifyDamaged(t.f, t.ctx, atk(t, 1)));
    expect(results).toEqual([
      DamageResult.Guard,
      DamageResult.Guard,
      DamageResult.Guard,
      DamageResult.GuardBreak,
    ]);
    expect(t.f.guardHealth).toBe(0);
    expect(t.f.currentActionId).toBe(ActionId.GUARD_CROUCH);
    expect(t.f.reserveDamageActionId).toBe(ActionId.GUARD_BREAK);
  });

  it("GUARD_BREAK : son à l'impact (pas au changement d'action), action jouée après le gel", () => {
    const t = newFighter(true);
    tick(t, Left);
    for (let i = 0; i < 4; i++) notifyDamaged(t.f, t.ctx, atk(t, 1));
    const sounds = t.events.filter((e) => e.kind === 'sound' && e.clip === 'GuardBreak_1');
    expect(sounds).toHaveLength(1);

    setHitStun(t.f, getHitStunFrame(t.ctx, DamageResult.GuardBreak, 1));
    expect(t.f.currentHitStunFrame).toBe(30);
    run(t, repeat(0, 29));
    expect(t.f.currentActionId).toBe(ActionId.GUARD_CROUCH);
    tick(t, 0);
    expect(t.f.currentActionId).toBe(ActionId.GUARD_BREAK);
    expect(t.events.filter((e) => e.kind === 'sound' && e.clip === 'GuardBreak_1')).toHaveLength(1);
  });

  it('valeurs de hitstop : 12 / 12 / 30 pour un normal, 0 / 15 / 30 pour un spécial', () => {
    const t = newFighter(true);
    const stun = (r: DamageResult, id: number) => getHitStunFrame(t.ctx, r, id);
    expect(
      [DamageResult.Damage, DamageResult.Guard, DamageResult.GuardBreak].map((r) => stun(r, 1)),
    ).toEqual([12, 12, 30]);
    expect(
      [DamageResult.Damage, DamageResult.Guard, DamageResult.GuardBreak].map((r) => stun(r, 10)),
    ).toEqual([0, 15, 30]);
  });
});

describe('hitstop', () => {
  it('frame figée n ticks, mouvement figé n-1 ticks (compteur décrémenté avant UpdateMovement)', () => {
    const t = newFighter(true);
    setHitStun(t.f, 3);
    const x = t.f.x;
    tick(t, Right); // compteur 2 : tout est gelé
    tick(t, Right); // compteur 1
    expect(t.f.currentHitStunFrame).toBe(1);
    expect(t.f.x).toBe(x);
    expect(t.f.currentActionFrame).toBe(0);
    tick(t, Right); // compteur 0 : la frame reste à 0 mais le perso bouge déjà
    expect(t.f.currentHitStunFrame).toBe(0);
    expect(t.f.currentActionFrame).toBe(0);
    expect(t.f.x).toBeGreaterThan(x);
    tick(t, Right);
    expect(t.f.currentActionFrame).toBe(1);
  });

  it('tremblement du sprite : n/3 plafonné à 6, alterné +/- à chaque tick', () => {
    const a = newFighter(true);
    setSpriteShakeFrame(a.f, 4);
    expect(a.f.spriteShakePosition).toBe(-4);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      incrementActionFrame(a.f, a.ctx);
      seen.push(a.f.spriteShakePosition);
    }
    expect(seen).toEqual([3, -2, 1, 0]);

    const b = newFighter(false);
    setSpriteShakeFrame(b.f, 10);
    expect(b.f.spriteShakePosition).toBe(6);
    setSpriteShakeFrame(b.f, 0);
    expect(Object.is(b.f.spriteShakePosition, 0)).toBe(true);
  });
});

describe('garde de proximité', () => {
  it("arrière tenu à portée d'une hitbox de proximité : GUARD_PROXIMITY au lieu de BACKWARD", () => {
    const t = newFighter(true);
    tick(t, Left);
    expect(t.f.currentActionId).toBe(ActionId.BACKWARD);
    notifyInProximityGuardRange(t.f);
    const x = t.f.x;
    tick(t, Left);
    expect(t.f.currentActionId).toBe(ActionId.GUARD_PROXIMITY);
    expect(t.f.x).toBe(x);
    tick(t, Left); // plus à portée : on recule à nouveau
    expect(t.f.currentActionId).toBe(ActionId.BACKWARD);
  });

  it('sans arrière tenu, la proximité est ignorée', () => {
    const t = newFighter(true);
    tick(t, 0);
    notifyInProximityGuardRange(t.f);
    tick(t, Left);
    expect(t.f.currentActionId).toBe(ActionId.BACKWARD);
  });
});

describe('divers', () => {
  it('WIN boucle à loopFromFrame', () => {
    const t = newFighter(true);
    requestWinAction(t.f);
    tick(t, 0);
    expect(t.f.currentActionId).toBe(ActionId.WIN);
    run(t, repeat(0, 100));
    expect(t.f.currentActionId).toBe(ActionId.WIN);
    expect(t.f.currentActionFrame).toBeLessThan(33);
  });

  it('applyPositionChange déplace la position et toutes les boxes', () => {
    const t = newFighter(true);
    run(t, [Attack, 0, 0, 0, 0]);
    const before = [...t.f.hitboxes, ...t.f.hurtboxes, t.f.pushbox].map((b) => b.x);
    const x = t.f.x;
    applyPositionChange(t.f, 0.5, 0);
    expect(t.f.x).toBe(f32(x + 0.5));
    const after = [...t.f.hitboxes, ...t.f.hurtboxes, t.f.pushbox].map((b) => b.x);
    expect(after).toEqual(before.map((v) => f32(v + 0.5)));
  });

  it('un état de combattant se clone et se sérialise tel quel', () => {
    const t = newFighter(true);
    run(t, [Attack, 0, 0]);
    expect(structuredClone(t.f)).toEqual(t.f);
    expect(JSON.parse(JSON.stringify(t.f))).toEqual(t.f);
  });
});
