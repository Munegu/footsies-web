import { join } from 'node:path';
import type { AnimationClipJson, CurveKeyJson } from '../../src/data/types.ts';
import { list, num, obj, parseRef, readUnityFile, str, type Raw, type RawObject } from './unity.ts';

/** Une pente Unity infinie (courbe en escalier) devient `null` : JSON n'a pas d'Infinity. */
const slope = (value: Raw | undefined, what: string): number | null => {
  const n = Number(str(value, what));
  return Number.isFinite(n) ? n : null;
};

/**
 * Lit un `.anim` Unity : durée, courbe d'alpha (`m_Color.a`) et piste de sprites (`m_Sprite`).
 * `namesByRef` retrouve le nom d'un sprite depuis `{fileID, guid}`.
 */
export function extractClip(
  path: string,
  guidIndex: Map<string, string>,
  namesByRef: Map<string, string>,
): AnimationClipJson {
  const raw = readUnityFile(path);
  const settings = obj(raw['m_AnimationClipSettings'], 'm_AnimationClipSettings');

  let alpha: CurveKeyJson[] | null = null;
  for (const entry of list(raw['m_FloatCurves'])) {
    const e = obj(entry, 'm_FloatCurves');
    if (e['attribute'] !== 'm_Color.a') continue;
    const curve = obj(e['curve'], 'curve');
    alpha = list(curve['m_Curve']).map((k, i) => {
      const key = obj(k, `m_Curve[${i}]`);
      return {
        time: num(key['time'], 'time'),
        value: num(key['value'], 'value'),
        inSlope: slope(key['inSlope'], 'inSlope'),
        outSlope: slope(key['outSlope'], 'outSlope'),
      };
    });
  }

  let sprites: AnimationClipJson['sprites'] = [];
  for (const entry of list(raw['m_PPtrCurves'])) {
    const e = obj(entry, 'm_PPtrCurves');
    if (e['attribute'] !== 'm_Sprite') continue;
    sprites = list(e['curve']).map((k, i) => {
      const key = obj(k, `m_PPtrCurves[${i}]`);
      const { fileID, guid } = parseRef(key['value'], 'sprite');
      const png = guidIndex.get(guid);
      const name = png && namesByRef.get(`${png.slice(png.lastIndexOf('/') + 1)}|${fileID}`);
      if (!name) throw new Error(`${path} : sprite ${fileID} (${guid}) inconnu de l'atlas`);
      return { time: num(key['time'], 'time'), sprite: name };
    });
  }

  return { length: num(settings['m_StopTime'], 'm_StopTime'), alpha, sprites };
}

export const CLIP_NAMES = [
  'EmptyRoundUI',
  'HitEffect',
  'HitEffectOff',
  'RoundEndAnimation',
  'RoundStartAnimation',
];

export function extractClips(
  assetsDir: string,
  guidIndex: Map<string, string>,
  namesByRef: Map<string, string>,
): Record<string, AnimationClipJson> {
  const out: Record<string, AnimationClipJson> = {};
  for (const name of CLIP_NAMES) {
    out[name] = extractClip(join(assetsDir, `Animation/${name}.anim`), guidIndex, namesByRef);
  }
  return out;
}

export type { RawObject };
