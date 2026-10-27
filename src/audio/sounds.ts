import type { BattleEvent } from '../engine/types.ts';

// Réglages de l'original (MasterScene.unity, SoundManager.cs).
/** Volume de la source de musique (BGM_AudioSource). */
export const BGM_VOLUME = 0.85;
/** Volume des deux sources de bruitages. */
export const SE_VOLUME = 1;
/** `panStereo = posX / 5` (SoundManager.playFighterSE) : l'aire fait 10 unités de large. */
export const PAN_DIVISOR = 5;

/** Une voix de bruitage par joueur : 0 = J1 (source 1), 1 = J2 (source 2). */
export type Voice = 0 | 1;

export interface SoundCommand {
  voice: Voice;
  /** Nom du fichier sans extension (`Attack`, `Guard`...). */
  clip: string;
  /** Panoramique stéréo dans [-1, 1]. */
  pan: number;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Traduit un événement `sound` du moteur en commande de lecture ; null pour les autres événements. */
export function soundCommand(event: BattleEvent): SoundCommand | null {
  if (event.kind !== 'sound') return null;
  return {
    // Le C# passe `isFaceRight` comme `isPlayerOne` : J1 regarde à droite.
    voice: event.playerOne ? 0 : 1,
    clip: event.clip,
    pan: clamp(event.posX / PAN_DIVISOR, -1, 1),
  };
}
