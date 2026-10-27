import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import type { SpriteRect, SpritesJson } from '../../src/data/types.ts';
import {
  list,
  num,
  obj,
  parseRef,
  readTextureMeta,
  readUnityFile,
  type Raw,
  type RawObject,
} from './unity.ts';

/** `fileID` Unity d'un sprite : 21300000 + 2n pour le n-ième sprite d'une sheet. */
const SPRITE_FILE_ID_BASE = 21300000;
const ATLAS_WIDTH = 512;

interface SourceSprite {
  png: string;
  /** Rect dans le PNG, origine en haut à gauche. */
  x: number;
  y: number;
  w: number;
  h: number;
  pivotX: number;
  pivotY: number;
  pixelsPerUnit: number;
}

function pivot(value: Raw | undefined, what: string): [number, number] {
  const p = obj(value, what);
  return [num(p['x'], `${what}.x`), num(p['y'], `${what}.y`)];
}

/**
 * Retrouve la zone du PNG désignée par `{fileID, guid}`.
 * `spriteMode` 1 (single) et 3 (polygon) = image entière, 2 = sprite sheet découpée.
 * Dans le `.meta`, le rect a son origine en bas à gauche : on le retourne pour le canvas.
 */
function resolveSprite(
  fileID: number,
  pngPath: string,
  meta: RawObject,
  imageHeight: number,
  imageWidth: number,
): Omit<SourceSprite, 'pixelsPerUnit'> {
  const mode = num(meta['spriteMode'], 'spriteMode');
  if (mode === 1 || mode === 3) {
    if (fileID !== SPRITE_FILE_ID_BASE) throw new Error(`${pngPath} : fileID ${fileID} inattendu`);
    const [pivotX, pivotY] = pivot(meta['spritePivot'], 'spritePivot');
    return { png: pngPath, x: 0, y: 0, w: imageWidth, h: imageHeight, pivotX, pivotY };
  }
  if (mode !== 2) throw new Error(`${pngPath} : spriteMode ${mode} non géré`);

  const n = (fileID - SPRITE_FILE_ID_BASE) / 2;
  const sheet = obj(meta['spriteSheet'], 'spriteSheet');
  const sprite = list(sheet['sprites'])[n];
  if (!Number.isInteger(n) || sprite === undefined) {
    throw new Error(`${pngPath} : sprite ${fileID} introuvable`);
  }
  const s = obj(sprite, 'sprite');
  // Contrôle croisé : le nom du n-ième sprite doit être celui que Unity associe à ce fileID.
  const recycle = obj(meta['fileIDToRecycleName'], 'fileIDToRecycleName');
  if (recycle[String(fileID)] !== s['name']) {
    throw new Error(
      `${pngPath} : fileID ${fileID} ne correspond pas au sprite ${String(s['name'])}`,
    );
  }
  const r = obj(s['rect'], 'rect');
  const w = num(r['width'], 'rect.width');
  const h = num(r['height'], 'rect.height');
  const [pivotX, pivotY] = pivot(s['pivot'], 'pivot');
  return {
    png: pngPath,
    x: num(r['x'], 'rect.x'),
    y: imageHeight - num(r['y'], 'rect.y') - h,
    w,
    h,
    pivotX,
    pivotY,
  };
}

/** Certains PNG d'Unity ont des octets après le chunk IEND, que pngjs refuse : on les ignore. */
function readPng(path: string): PNG {
  const data = readFileSync(path);
  const iend = data.indexOf('IEND');
  return PNG.sync.read(iend === -1 ? data : data.subarray(0, iend + 4 + 4)); // type + CRC
}

export interface Atlas {
  json: SpritesJson;
  png: Buffer;
}

/** Construit l'atlas de tous les `motionID` de F00_MotionDataCotainer. */
export function buildAtlas(containerPath: string, guidIndex: Map<string, string>): Atlas {
  const container = readUnityFile(containerPath);
  const pngs = new Map<string, PNG>();
  const metas = new Map<string, RawObject>();
  const sources = new Map<number, SourceSprite>();

  for (const entry of list(container['motionDataList'])) {
    const e = obj(entry, 'motionData');
    const motionID = num(e['motionID'], 'motionID');
    const { guid, fileID } = parseRef(e['sprite'], `motion ${motionID}`);
    const pngPath = guidIndex.get(guid);
    if (!pngPath) throw new Error(`motion ${motionID} : GUID inconnu ${guid}`);

    let png = pngs.get(pngPath);
    let meta = metas.get(pngPath);
    if (!png || !meta) {
      png = readPng(pngPath);
      meta = readTextureMeta(`${pngPath}.meta`);
      pngs.set(pngPath, png);
      metas.set(pngPath, meta);
    }
    const ppu = num(meta['spritePixelsToUnits'], 'spritePixelsToUnits');
    sources.set(motionID, {
      ...resolveSprite(fileID, pngPath, meta, png.height, png.width),
      pixelsPerUnit: ppu,
    });
  }

  // Dédoublonnage : plusieurs motions peuvent viser la même zone.
  const unique = new Map<string, SourceSprite>();
  for (const s of sources.values()) unique.set(`${s.png}|${s.x}|${s.y}|${s.w}|${s.h}`, s);

  // Packing par étagères, du plus haut au plus bas (ordre stable pour un résultat reproductible).
  const ordered = [...unique.entries()].sort(
    ([ka, a], [kb, b]) => b.h - a.h || b.w - a.w || (ka < kb ? -1 : 1),
  );
  const placed = new Map<string, { x: number; y: number }>();
  let cx = 0;
  let cy = 0;
  let shelfH = 0;
  for (const [key, s] of ordered) {
    if (cx + s.w > ATLAS_WIDTH) {
      cx = 0;
      cy += shelfH;
      shelfH = 0;
    }
    placed.set(key, { x: cx, y: cy });
    cx += s.w;
    shelfH = Math.max(shelfH, s.h);
  }
  const height = cy + shelfH;

  const atlas = new PNG({ width: ATLAS_WIDTH, height });
  for (const [key, s] of unique) {
    const dest = placed.get(key);
    const src = pngs.get(s.png);
    if (!dest || !src) throw new Error('Atlas incohérent');
    PNG.bitblt(src, atlas, s.x, s.y, s.w, s.h, dest.x, dest.y);
  }

  const sprites: Record<string, SpriteRect> = {};
  for (const motionID of [...sources.keys()].sort((a, b) => a - b)) {
    const s = sources.get(motionID);
    const dest = s && placed.get(`${s.png}|${s.x}|${s.y}|${s.w}|${s.h}`);
    if (!s || !dest) throw new Error('Atlas incohérent');
    sprites[String(motionID)] = {
      x: dest.x,
      y: dest.y,
      w: s.w,
      h: s.h,
      pivotX: s.pivotX,
      pivotY: s.pivotY,
      pixelsPerUnit: s.pixelsPerUnit,
    };
  }

  return {
    json: {
      atlas: { file: 'f00-atlas.png', width: ATLAS_WIDTH, height },
      sprites,
    },
    png: PNG.sync.write(atlas),
  };
}
