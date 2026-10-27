import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export function hasFfmpeg(): boolean {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

/** Convertit tous les .wav d'un dossier en .mp3 (LAME) ; `bitexact` pour un résultat reproductible. */
export function convertDir(srcDir: string, destDir: string): string[] {
  mkdirSync(destDir, { recursive: true });
  const done: string[] = [];
  for (const name of readdirSync(srcDir).sort()) {
    if (!name.endsWith('.wav')) continue;
    const base = name.slice(0, -'.wav'.length);
    const result = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-i',
        join(srcDir, name),
        '-map_metadata',
        '-1',
        '-fflags',
        '+bitexact',
        '-flags:a',
        '+bitexact',
        '-c:a',
        'libmp3lame',
        '-q:a',
        '4',
        join(destDir, `${base}.mp3`),
      ],
      { encoding: 'utf8' },
    );
    if (result.status !== 0) throw new Error(`ffmpeg a échoué sur ${name} : ${result.stderr}`);
    done.push(base);
  }
  return done;
}
