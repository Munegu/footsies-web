import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { buildOptionsLabel, LABEL_HEIGHT, LABEL_WIDTH } from './labels.ts';
import type { SpriteRect, SpritesJson } from '../../src/data/types.ts';
import {
  list,
  num,
  obj,
  parseRef,
  readTextureMeta,
  readUnityFile,
  str,
  type Raw,
  type RawObject,
} from './unity.ts';

/** `fileID` Unity d'un sprite : 21300000 + 2n pour le n-ième sprite d'une sheet. */
const SPRITE_FILE_ID_BASE = 21300000;
const ATLAS_WIDTH = 512;
/** Marge transparente autour de chaque sprite : évite de lire un voisin quand l'échelle n'est pas entière. */
const PADDING = 1;

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
  for (const s of sources.values()) unique.set(spriteKey(s), s);

  const packed = pack(unique, pngs);

  const sprites: Record<string, SpriteRect> = {};
  for (const motionID of [...sources.keys()].sort((a, b) => a - b)) {
    const s = sources.get(motionID);
    if (!s) throw new Error('Atlas incohérent');
    sprites[String(motionID)] = placedRect(s, packed.placed);
  }

  return {
    json: {
      atlas: { file: 'f00-atlas.png', width: ATLAS_WIDTH, height: packed.height },
      sprites,
    },
    png: packed.png,
  };
}

const spriteKey = (s: SourceSprite): string => `${s.png}|${s.x}|${s.y}|${s.w}|${s.h}`;

function placedRect(s: SourceSprite, placed: Map<string, { x: number; y: number }>): SpriteRect {
  const dest = placed.get(spriteKey(s));
  if (!dest) throw new Error('Atlas incohérent');
  return {
    x: dest.x,
    y: dest.y,
    w: s.w,
    h: s.h,
    pivotX: s.pivotX,
    pivotY: s.pivotY,
    pixelsPerUnit: s.pixelsPerUnit,
  };
}

/**
 * Packing par étagères, du plus haut au plus bas (ordre stable pour un résultat reproductible),
 * avec `PADDING` pixels transparents autour de chaque sprite.
 */
function pack(
  unique: Map<string, SourceSprite>,
  pngs: Map<string, PNG>,
): { placed: Map<string, { x: number; y: number }>; png: Buffer; height: number } {
  const ordered = [...unique.entries()].sort(
    ([ka, a], [kb, b]) => b.h - a.h || b.w - a.w || (ka < kb ? -1 : 1),
  );
  const placed = new Map<string, { x: number; y: number }>();
  let cx = 0;
  let cy = 0;
  let shelfH = 0;
  for (const [key, s] of ordered) {
    const cellW = s.w + 2 * PADDING;
    const cellH = s.h + 2 * PADDING;
    if (cx + cellW > ATLAS_WIDTH) {
      cx = 0;
      cy += shelfH;
      shelfH = 0;
    }
    placed.set(key, { x: cx + PADDING, y: cy + PADDING });
    cx += cellW;
    shelfH = Math.max(shelfH, cellH);
  }
  const height = cy + shelfH;

  const atlas = new PNG({ width: ATLAS_WIDTH, height });
  for (const [key, s] of unique) {
    const dest = placed.get(key);
    const src = pngs.get(s.png);
    if (!dest || !src) throw new Error('Atlas incohérent');
    PNG.bitblt(src, atlas, s.x, s.y, s.w, s.h, dest.x, dest.y);
  }
  return { placed, png: PNG.sync.write(atlas), height };
}

/** Images d'interface de combat (BattleCanvas.prefab), par ordre alphabétique de fichier. */
const UI_FILES = [
  'Art/BG.png',
  'Art/Battle_Window.png',
  'Art/Guard.png',
  'Art/HitEffect.png',
  'Art/Logo.png',
  'Art/Menu.png',
  'Art/MenuButton.png',
  'Art/PlayerLabel.png',
  'Art/Round.png',
  'Art/Sound.png',
  'Art/UI.png',
  'Art/CreatedBy.png',
  'Art/Version.png',
];

export interface UiAtlas {
  json: SpritesJson;
  png: Buffer;
  /** `UI.png|21300006` -> `UI_3` : retrouve le nom d'un sprite depuis une référence Unity. */
  namesByRef: Map<string, string>;
}

/**
 * Atlas nommé de l'interface de combat. Une image simple garde le nom de son fichier (`BG`),
 * une sprite sheet donne un sprite par entrée de son `.meta` (`HitEffect_0`...).
 */
export function buildUiAtlas(assetsDir: string): UiAtlas {
  const pngs = new Map<string, PNG>();
  const named = new Map<string, SourceSprite>();
  const namesByRef = new Map<string, string>();

  for (const rel of UI_FILES) {
    const pngPath = join(assetsDir, rel);
    const file = rel.slice(rel.lastIndexOf('/') + 1);
    const png = readPng(pngPath);
    const meta = readTextureMeta(`${pngPath}.meta`);
    pngs.set(pngPath, png);
    const ppu = num(meta['spritePixelsToUnits'], 'spritePixelsToUnits');
    const mode = num(meta['spriteMode'], 'spriteMode');

    const add = (name: string, fileID: number): void => {
      if (named.has(name)) throw new Error(`Nom de sprite en double : ${name}`);
      named.set(name, {
        ...resolveSprite(fileID, pngPath, meta, png.height, png.width),
        pixelsPerUnit: ppu,
      });
      namesByRef.set(`${file}|${fileID}`, name);
    };

    if (mode === 2) {
      list(obj(meta['spriteSheet'], 'spriteSheet')['sprites']).forEach((sprite, n) => {
        add(str(obj(sprite, 'sprite')['name'], 'sprite.name'), SPRITE_FILE_ID_BASE + 2 * n);
      });
    } else {
      add(file.replace(/\.png$/, ''), SPRITE_FILE_ID_BASE);
    }
  }

  // Libellé OPTIONS : n'existe pas dans l'original, généré depuis Menu.png.
  const menuPng = pngs.get(join(assetsDir, 'Art/Menu.png'));
  if (!menuPng) throw new Error('Menu.png non chargé');
  const generated = 'generated/Menu_Options.png';
  pngs.set(generated, buildOptionsLabel(menuPng));
  named.set('Menu_Options', {
    png: generated,
    x: 0,
    y: 0,
    w: LABEL_WIDTH,
    h: LABEL_HEIGHT,
    pivotX: 0,
    pivotY: 0,
    pixelsPerUnit: 10,
  });

  const unique = new Map<string, SourceSprite>();
  for (const s of named.values()) unique.set(spriteKey(s), s);
  const packed = pack(unique, pngs);

  const sprites: Record<string, SpriteRect> = {};
  for (const name of [...named.keys()].sort()) {
    const s = named.get(name);
    if (!s) throw new Error('Atlas incohérent');
    sprites[name] = placedRect(s, packed.placed);
  }

  return {
    json: { atlas: { file: 'ui-atlas.png', width: ATLAS_WIDTH, height: packed.height }, sprites },
    png: packed.png,
    namesByRef,
  };
}
