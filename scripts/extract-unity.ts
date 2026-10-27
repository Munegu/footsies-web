// Extraction des données du FOOTSIES original (YAML Unity) vers src/data/.
// Usage : npm run extract   (lit vendor/footsies-original, ne le modifie jamais)
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertDir, hasFfmpeg } from './lib/audio.ts';
import { buildGuidIndex, extractFighter } from './lib/fighter.ts';
import { buildAtlas } from './lib/sprites.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'vendor/footsies-original/Assets');
const out = join(root, 'src/data');

if (!existsSync(assets)) {
  console.error(
    'vendor/footsies-original introuvable. Voir le README : ' +
      'git clone https://github.com/hifight/Footsies vendor/footsies-original',
  );
  process.exit(1);
}

const writeJson = (file: string, data: unknown): void =>
  writeFileSync(join(out, file), JSON.stringify(data, null, 2) + '\n');

mkdirSync(out, { recursive: true });
const guidIndex = buildGuidIndex(assets);

const fighter = extractFighter(assets, guidIndex);
writeJson('f00.json', fighter);
console.log(
  `f00.json : ${Object.keys(fighter.actions).length} actions, ${Object.keys(fighter.attacks).length} attaques`,
);

const atlas = buildAtlas(join(assets, 'Fighter/F00/F00_MotionDataCotainer.asset'), guidIndex);
writeFileSync(join(out, 'f00-atlas.png'), atlas.png);
writeJson('f00-sprites.json', atlas.json);
console.log(
  `f00-sprites.json : ${Object.keys(atlas.json.sprites).length} sprites, atlas ${atlas.json.atlas.width}x${atlas.json.atlas.height}`,
);

// Images de décor et d'effets, reprises telles quelles.
mkdirSync(join(out, 'art'), { recursive: true });
for (const name of ['Battle_BG.png', 'HitEffect.png', 'Guard.png']) {
  copyFileSync(join(assets, 'Art', name), join(out, 'art', name));
}

if (hasFfmpeg()) {
  const se = convertDir(join(assets, 'Sound/SE'), join(out, 'audio/se'));
  const bgm = convertDir(join(assets, 'Sound/BGM'), join(out, 'audio/bgm'));
  console.log(`audio : ${se.length} bruitages, ${bgm.length} musique (.mp3)`);
} else {
  console.warn('ATTENTION : ffmpeg introuvable, audio non converti (brew install ffmpeg).');
}
