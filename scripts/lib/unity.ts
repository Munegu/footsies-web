import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

/** Valeur brute lue dans un YAML Unity : le schéma `failsafe` ne produit que des chaînes. */
export type Raw = string | Raw[] | { [key: string]: Raw } | null;
export type RawObject = { [key: string]: Raw };

/**
 * Parse un fichier YAML Unity.
 * Les en-têtes `%YAML`, `%TAG` et `--- !u!114 &…` ne sont pas du YAML standard : on les retire.
 * Schéma `failsafe` : tout reste une chaîne. Sinon `actionID: 6e000000` serait lu comme le
 * flottant 6e0 ; on convertit nous-mêmes avec `num` / `bool`.
 */
export function parseUnityYaml(text: string): RawObject {
  const cleaned = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('%'))
    .map((line) => (line.startsWith('--- ') ? '---' : line))
    .join('\n');
  const doc = parse(cleaned, { schema: 'failsafe' }) as RawObject;
  // Un .asset a une clé racine unique (MonoBehaviour…) ; un .meta a plusieurs clés au premier niveau.
  const keys = Object.keys(doc);
  const only = keys.length === 1 ? doc[keys[0] as string] : undefined;
  if (only !== null && typeof only === 'object' && !Array.isArray(only)) return only;
  return doc;
}

export function readUnityFile(path: string): RawObject {
  return parseUnityYaml(readFileSync(path, 'utf8'));
}

export function obj(value: Raw | undefined, what: string): RawObject {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Objet attendu pour ${what}`);
  }
  return value;
}

export function list(value: Raw | undefined): Raw[] {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) throw new Error('Liste attendue');
  return value;
}

export function num(value: Raw | undefined, what: string): number {
  if (typeof value !== 'string' || value.trim() === '' || Number.isNaN(Number(value))) {
    throw new Error(`Nombre attendu pour ${what} (reçu ${JSON.stringify(value)})`);
  }
  return Number(value);
}

export function str(value: Raw | undefined, what: string): string {
  if (typeof value !== 'string') throw new Error(`Chaîne attendue pour ${what}`);
  return value;
}

/** Les booléens Unity sont sérialisés en 0 / 1. */
export function bool(value: Raw | undefined, what: string): boolean {
  return num(value, what) !== 0;
}

/**
 * `actionID` d'un cancel : suite d'entiers 32 bits little-endian en hexadécimal.
 * `6e000000` -> [110]. Une liste de plusieurs IDs est concaténée (8 caractères par ID).
 */
export function decodeActionIds(hex: string): number[] {
  if (hex.length % 8 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new Error(`actionID hexadécimal invalide : ${JSON.stringify(hex)}`);
  }
  const ids: number[] = [];
  for (let i = 0; i < hex.length; i += 8) {
    const bytes = Buffer.from(hex.slice(i, i + 8), 'hex');
    ids.push(bytes.readInt32LE(0));
  }
  return ids;
}

/** Index guid -> chemin du fichier (le `.meta` est à côté, avec le même nom + `.meta`). */
export function buildGuidIndex(assetsDir: string): Map<string, string> {
  const index = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith('.meta')) {
        const match = /^guid: ([0-9a-f]{32})$/m.exec(readFileSync(full, 'utf8'));
        if (match?.[1]) index.set(match[1], full.slice(0, -'.meta'.length));
      }
    }
  };
  walk(assetsDir);
  return index;
}

/** Référence Unity `{fileID: …, guid: …, type: …}`. */
export function parseRef(value: Raw | undefined, what: string): { fileID: number; guid: string } {
  const ref = obj(value, what);
  return { fileID: num(ref['fileID'], `${what}.fileID`), guid: str(ref['guid'], `${what}.guid`) };
}

/** Lit le `.meta` d'une texture : les réglages sont sous la clé `TextureImporter`. */
export function readTextureMeta(path: string): RawObject {
  return obj(readUnityFile(path)['TextureImporter'], `TextureImporter de ${path}`);
}
