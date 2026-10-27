import type { AudioClips } from './game-audio.ts';

// Vite remplace ces appels par les URL des fichiers (empaquetés au build).
const seUrls = import.meta.glob('../data/audio/se/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const bgmUrls = import.meta.glob('../data/audio/bgm/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const nameOf = (path: string): string =>
  path.slice(path.lastIndexOf('/') + 1).replace(/\.mp3$/, '');

async function decode(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
  return ctx.decodeAudioData(await response.arrayBuffer());
}

/**
 * Décode tous les sons en mémoire (PCM) pour les lancer sans latence. Un fichier qui échoue est
 * ignoré : le jeu doit démarrer même si un son manque.
 */
export async function loadAudio(ctx: AudioContext): Promise<AudioClips> {
  const se = new Map<string, AudioBuffer>();
  let bgm: AudioBuffer | null = null;

  await Promise.all([
    ...Object.entries(seUrls).map(async ([path, url]) => {
      try {
        se.set(nameOf(path), await decode(ctx, url));
      } catch (e) {
        console.warn(`Son ${nameOf(path)} non chargé`, e);
      }
    }),
    ...Object.entries(bgmUrls).map(async ([path, url]) => {
      try {
        if (nameOf(path) === 'Footsies') bgm = await decode(ctx, url);
      } catch (e) {
        console.warn('Musique non chargée', e);
      }
    }),
  ]);

  return { se, bgm };
}
