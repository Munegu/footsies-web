import f00AtlasUrl from '../data/f00-atlas.png';
import f00Sprites from '../data/f00-sprites.json';
import uiAnimations from '../data/ui-animations.json';
import uiAtlasUrl from '../data/ui-atlas.png';
import uiSprites from '../data/ui-sprites.json';
import type { SpritesJson, UiAnimationsJson } from '../data/types.ts';

/** Un atlas chargé : l'image et le découpage des sprites. */
export interface Atlas {
  image: CanvasImageSource;
  sprites: SpritesJson['sprites'];
}

export interface GameAssets {
  /** Sprites du combattant, indexés par motionID. */
  fighter: Atlas;
  /** Interface de combat, indexée par nom (`BG`, `Guard`, `HitEffect_0`...). */
  ui: Atlas;
  clips: UiAnimationsJson['clips'];
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/** Charge les atlas avant de démarrer le jeu (le chargement d'une image est asynchrone). */
export async function loadAssets(): Promise<GameAssets> {
  const [fighterImage, uiImage] = await Promise.all([
    loadImage(f00AtlasUrl),
    loadImage(uiAtlasUrl),
  ]);
  return {
    fighter: { image: fighterImage, sprites: (f00Sprites as unknown as SpritesJson).sprites },
    ui: { image: uiImage, sprites: (uiSprites as unknown as SpritesJson).sprites },
    clips: (uiAnimations as unknown as UiAnimationsJson).clips,
  };
}
