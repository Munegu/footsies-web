import { join } from 'node:path';
import type {
  ActionData,
  ActionType,
  AttackData,
  FighterJson,
  FrameRange,
  Rect,
} from '../../src/data/types.ts';
import {
  type Raw,
  type RawObject,
  bool,
  buildGuidIndex,
  decodeActionIds,
  list,
  num,
  obj,
  parseRef,
  readUnityFile,
  str,
} from './unity.ts';

const ACTION_TYPES: ActionType[] = ['Movement', 'Attack', 'Damage', 'Guard']; // enum ActionType

function rect(value: Raw | undefined, what: string): Rect {
  const r = obj(value, what);
  return {
    x: num(r['x'], `${what}.x`),
    y: num(r['y'], `${what}.y`),
    width: num(r['width'], `${what}.width`),
    height: num(r['height'], `${what}.height`),
  };
}

function frames(value: Raw | undefined, what: string): FrameRange {
  const v = obj(value, what);
  return [num(v['x'], `${what}.x`), num(v['y'], `${what}.y`)];
}

function items(value: Raw | undefined, what: string): RawObject[] {
  return list(value).map((item, i) => obj(item, `${what}[${i}]`));
}

/** Nom du fichier audio (sans extension) pointé par un `audioClip`, ou null. */
function audioName(
  value: Raw | undefined,
  guidIndex: Map<string, string>,
  what: string,
): string | null {
  if (value === undefined || value === null) return null;
  const { guid, fileID } = parseRef(value, what);
  if (fileID === 0) return null;
  const path = guidIndex.get(guid);
  if (!path) throw new Error(`${what} : GUID audio inconnu ${guid}`);
  return path.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
}

export function parseAction(raw: RawObject, guidIndex: Map<string, string>): ActionData {
  const id = num(raw['actionID'], 'actionID');
  const w = (field: string): string => `action ${id}.${field}`;
  const type = ACTION_TYPES[num(raw['Type'], w('Type'))];
  if (!type) throw new Error(`${w('Type')} inconnu`);

  return {
    actionID: id,
    actionName: str(raw['actionName'], w('actionName')),
    type,
    frameCount: num(raw['frameCount'], w('frameCount')),
    isLoop: raw['isLoop'] === undefined ? false : bool(raw['isLoop'], w('isLoop')),
    loopFromFrame:
      raw['loopFromFrame'] === undefined ? 0 : num(raw['loopFromFrame'], w('loopFromFrame')),
    motions: items(raw['motions'], w('motions')).map((m) => ({
      startEndFrame: frames(m['startEndFrame'], w('motions')),
      motionID: num(m['motionID'], w('motions.motionID')),
    })),
    status: items(raw['status'], w('status')).map((s) => ({
      startEndFrame: frames(s['startEndFrame'], w('status')),
      counterHit: bool(s['counterHit'], w('status.counterHit')),
    })),
    hitboxes: items(raw['hitboxes'], w('hitboxes')).map((h) => ({
      startEndFrame: frames(h['startEndFrame'], w('hitboxes')),
      rect: rect(h['rect'], w('hitboxes.rect')),
      attackID: num(h['attackID'], w('hitboxes.attackID')),
      proximity: bool(h['proximity'], w('hitboxes.proximity')),
    })),
    hurtboxes: items(raw['hurtboxes'], w('hurtboxes')).map((h) => ({
      startEndFrame: frames(h['startEndFrame'], w('hurtboxes')),
      rect: rect(h['rect'], w('hurtboxes.rect')),
      useBaseRect: bool(h['useBaseRect'], w('hurtboxes.useBaseRect')),
    })),
    pushboxes: items(raw['pushboxes'], w('pushboxes')).map((p) => ({
      startEndFrame: frames(p['startEndFrame'], w('pushboxes')),
      rect: rect(p['rect'], w('pushboxes.rect')),
      useBaseRect: bool(p['useBaseRect'], w('pushboxes.useBaseRect')),
    })),
    movements: items(raw['movements'], w('movements')).map((m) => ({
      startEndFrame: frames(m['startEndFrame'], w('movements')),
      velocity_x: num(m['velocity_x'], w('movements.velocity_x')),
    })),
    cancels: items(raw['cancels'], w('cancels')).map((c) => ({
      startEndFrame: frames(c['startEndFrame'], w('cancels')),
      buffer: bool(c['buffer'], w('cancels.buffer')),
      execute: bool(c['execute'], w('cancels.execute')),
      actionID: decodeActionIds(str(c['actionID'], w('cancels.actionID'))),
    })),
    alwaysCancelable: bool(raw['alwaysCancelable'], w('alwaysCancelable')),
    audioClip: audioName(raw['audioClip'], guidIndex, w('audioClip')),
  };
}

function parseAttack(raw: RawObject): AttackData {
  const w = (field: string): string => `attack.${field}`;
  return {
    attackID: num(raw['attackID'], w('attackID')),
    attackName: str(raw['attackName'], w('attackName')),
    damageActionID: num(raw['damageActionID'], w('damageActionID')),
    guardActionID: num(raw['guardActionID'], w('guardActionID')),
    numberOfHit: num(raw['numberOfHit'], w('numberOfHit')),
    vitalHealthDamage: num(raw['vitalHealthDamage'], w('vitalHealthDamage')),
    guardHealthDamage: num(raw['guardHealthDamage'], w('guardHealthDamage')),
    hitStunFrame: num(raw['hitStunFrame'], w('hitStunFrame')),
    guardStunFrame: num(raw['guardStunFrame'], w('guardStunFrame')),
    guardBreakStunFrame: num(raw['guardBreakStunFrame'], w('guardBreakStunFrame')),
  };
}

function sortedById<T>(entries: [number, T][]): Record<string, T> {
  entries.sort(([a], [b]) => a - b);
  const out: Record<string, T> = {};
  for (const [id, value] of entries) {
    if (String(id) in out) throw new Error(`ID en double : ${id}`);
    out[String(id)] = value;
  }
  return out;
}

/** Lit F00.asset et les conteneurs qu'il référence. */
export function extractFighter(assetsDir: string, guidIndex: Map<string, string>): FighterJson {
  const fighterRaw = readUnityFile(join(assetsDir, 'Fighter/F00/F00.asset'));
  const resolve = (field: string): string => {
    const path = guidIndex.get(parseRef(fighterRaw[field], field).guid);
    if (!path) throw new Error(`${field} : GUID inconnu`);
    return path;
  };

  const actionContainer = readUnityFile(resolve('actionDataContainer'));
  const actions = list(actionContainer['actions']).map((ref, i): [number, ActionData] => {
    const path = guidIndex.get(parseRef(ref, `actions[${i}]`).guid);
    if (!path) throw new Error(`actions[${i}] : GUID inconnu`);
    const action = parseAction(readUnityFile(path), guidIndex);
    return [action.actionID, action];
  });

  const attackContainer = readUnityFile(resolve('attackDataContainer'));
  const attacks = list(attackContainer['attackDataList']).map((a, i): [number, AttackData] => {
    const attack = parseAttack(obj(a, `attackDataList[${i}]`));
    return [attack.attackID, attack];
  });

  return {
    fighter: {
      startGuardHealth: num(fighterRaw['startGuardHealth'], 'startGuardHealth'),
      forwardMoveSpeed: num(fighterRaw['forwardMoveSpeed'], 'forwardMoveSpeed'),
      backwardMoveSpeed: num(fighterRaw['backwardMoveSpeed'], 'backwardMoveSpeed'),
      dashAllowFrame: num(fighterRaw['dashAllowFrame'], 'dashAllowFrame'),
      specialAttackHoldFrame: num(fighterRaw['specialAttackHoldFrame'], 'specialAttackHoldFrame'),
      canCancelOnWhiff: bool(fighterRaw['canCancelOnWhiff'], 'canCancelOnWhiff'),
      baseHurtBoxRect: rect(fighterRaw['baseHurtBoxRect'], 'baseHurtBoxRect'),
      basePushBoxRect: rect(fighterRaw['basePushBoxRect'], 'basePushBoxRect'),
    },
    actions: sortedById(actions),
    attacks: sortedById(attacks),
  };
}

export { buildGuidIndex };
