import type { ActionData, AttackData, FighterJson, FighterParams, Rect } from '../data/types.ts';
import { f32 } from './f32.ts';

/** Données du personnage prêtes pour le moteur (nombres en float 32 bits, accès par ID). */
export interface FighterData {
  params: FighterParams;
  actions: ReadonlyMap<number, ActionData>;
  attacks: ReadonlyMap<number, AttackData>;
}

const rect32 = (r: Rect): Rect => ({
  x: f32(r.x),
  y: f32(r.y),
  width: f32(r.width),
  height: f32(r.height),
});

function action32(a: ActionData): ActionData {
  return {
    ...a,
    hitboxes: a.hitboxes.map((h) => ({ ...h, rect: rect32(h.rect) })),
    hurtboxes: a.hurtboxes.map((h) => ({ ...h, rect: rect32(h.rect) })),
    pushboxes: a.pushboxes.map((p) => ({ ...p, rect: rect32(p.rect) })),
    movements: a.movements.map((m) => ({ ...m, velocity_x: f32(m.velocity_x) })),
  };
}

/** Équivalent de `FighterData.setupDictionary` (FighterData.cs). */
export function buildFighterData(json: FighterJson): FighterData {
  const p = json.fighter;
  return {
    params: {
      ...p,
      forwardMoveSpeed: f32(p.forwardMoveSpeed),
      backwardMoveSpeed: f32(p.backwardMoveSpeed),
      baseHurtBoxRect: rect32(p.baseHurtBoxRect),
      basePushBoxRect: rect32(p.basePushBoxRect),
    },
    actions: new Map(Object.entries(json.actions).map(([id, a]) => [Number(id), action32(a)])),
    attacks: new Map(Object.entries(json.attacks).map(([id, a]) => [Number(id), a])),
  };
}

export function getAction(data: FighterData, id: number): ActionData {
  const action = data.actions.get(id);
  if (!action) throw new Error(`Action ${id} inconnue`);
  return action;
}
