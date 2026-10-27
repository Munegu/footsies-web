// État visuel du combat : tout ce que l'écran montre et que le moteur ne connaît pas
// (dernier sprite, animations d'impact et d'annonce, ordre de dessin). Mis à jour une fois par
// tick avec l'état et les événements du moteur, qu'il lit sans jamais les modifier.
import type { AnimationClipJson } from '../data/types.ts';
import type { BattleState } from '../engine/battle.ts';
import { getAction, type FighterData } from '../engine/fighter-data.ts';
import type { DeepReadonly } from '../engine/readonly.ts';
import { DamageResult } from '../engine/types.ts';
import { TICK_SECONDS, isFinished, sampleClip, sampleSprite } from './animation.ts';
import { REF_WIDTH, fightToScreenX, fightToScreenY } from './layout.ts';

/**
 * `spriteShakePosition` est ajouté à la position du sprite en pixels ÉCRAN (BattleGUI.cs). On
 * le convertit avec la fenêtre web par défaut de l'original (960 px de large, ProjectSettings).
 */
export const SHAKE_REF_PER_UNIT = REF_WIDTH / 960;

/** Éléments dessinés à l'ordre variable (frères dans la hiérarchie Unity), de l'arrière vers l'avant. */
export type Layer = 'fighter1' | 'fighter2' | 'guard1' | 'guard2' | 'roundUi' | 'hit1' | 'hit2';

/** Ordre initial des enfants de BattleCanvas.prefab : P2, P1, boucliers, annonce, impacts. */
const INITIAL_ORDER: readonly Layer[] = [
  'fighter2',
  'fighter1',
  'guard1',
  'guard2',
  'roundUi',
  'hit1',
  'hit2',
];

/** Échelle de l'effet d'impact selon le résultat (BattleGUI.RequestHitEffect). */
const HIT_SCALE: Partial<Record<DamageResult, number>> = {
  [DamageResult.Guard]: 1,
  [DamageResult.Damage]: 2,
  [DamageResult.GuardBreak]: 5,
};

interface HitEffect {
  /** Tick de départ de l'animation, ou null si inactive. */
  startTick: number | null;
  /** Centre de l'effet, en repère de référence. */
  x: number;
  y: number;
  scale: number;
}

type AnnounceClip = 'RoundStartAnimation' | 'RoundEndAnimation';

export interface HitEffectView {
  sprite: string;
  x: number;
  y: number;
  scale: number;
}

export interface AnnounceView {
  sprite: string;
  alpha: number;
}

export class BattleView {
  /** Compteur de ticks de cette vue (sert d'horloge aux animations). */
  tick = 0;
  order: Layer[] = [...INITIAL_ORDER];
  /** Dernier motionID affiché par combattant : conservé quand une frame n'a pas de motion. */
  readonly motion: [number | null, number | null] = [null, null];
  private readonly hit: [HitEffect, HitEffect] = [
    { startTick: null, x: 0, y: 0, scale: 1 },
    { startTick: null, x: 0, y: 0, scale: 1 },
  ];
  private announce: { clip: AnnounceClip; startTick: number } | null = null;

  constructor(private readonly clips: Readonly<Record<string, AnimationClipJson>>) {}

  private clip(name: string): AnimationClipJson {
    const clip = this.clips[name];
    if (!clip) throw new Error(`Clip d'animation inconnu : ${name}`);
    return clip;
  }

  private elapsed(startTick: number): number {
    return (this.tick - startTick) * TICK_SECONDS;
  }

  private moveToEnd(layer: Layer): void {
    this.order = [...this.order.filter((l) => l !== layer), layer];
  }

  /** À appeler une fois après chaque `stepBattle`, avec l'état et ses événements. */
  onTick(b: DeepReadonly<BattleState>, data: FighterData): void {
    this.tick++;

    // BattleGUI.UpdateSprite : le sprite suit la motion de la frame courante, s'il y en a une.
    [b.fighter1, b.fighter2].forEach((f, i) => {
      const action = getAction(data, f.currentActionId);
      const m = action.motions.find(
        (x) =>
          f.currentActionFrame >= x.startEndFrame[0] && f.currentActionFrame <= x.startEndFrame[1],
      );
      if (m) this.motion[i] = m.motionID;
    });

    for (const e of b.events) {
      if (e.kind === 'damage') this.onDamage(e);
      else if (e.kind === 'roundStart')
        this.announce = { clip: 'RoundStartAnimation', startTick: this.tick };
      else if (e.kind === 'roundEnd')
        this.announce = { clip: 'RoundEndAnimation', startTick: this.tick };
    }
  }

  /** `BattleGUI.OnDamageHandler` : l'attaquant passe devant, puis l'effet d'impact démarre. */
  private onDamage(e: {
    damagedIsPlayerOne: boolean;
    x: number;
    y: number;
    result: DamageResult;
  }): void {
    this.moveToEnd(e.damagedIsPlayerOne ? 'fighter2' : 'fighter1');

    const effect = this.hit[e.damagedIsPlayerOne ? 0 : 1];
    effect.startTick = this.tick;
    effect.x = fightToScreenX(e.x);
    effect.y = fightToScreenY(e.y);
    effect.scale = HIT_SCALE[e.result] ?? effect.scale;
    this.moveToEnd(e.damagedIsPlayerOne ? 'hit1' : 'hit2');
  }

  /** Décalage horizontal du sprite d'un combattant, en pixels de référence. */
  shakeOffset(shakePosition: number): number {
    return shakePosition * SHAKE_REF_PER_UNIT;
  }

  /** Effet d'impact visible sur le combattant `index` (0 = J1), ou null. */
  hitEffect(index: 0 | 1): HitEffectView | null {
    const effect = this.hit[index];
    if (effect.startTick === null) return null;
    const clip = this.clip('HitEffect');
    const t = this.elapsed(effect.startTick);
    if (isFinished(clip, t)) return null;
    const sprite = sampleSprite(clip.sprites, t);
    if (sprite === null) return null;
    return { sprite, x: effect.x, y: effect.y, scale: effect.scale };
  }

  /** Annonce de round (READY / FIGHT / K.O.) à afficher, ou null (état EmptyRoundUI). */
  announcement(): AnnounceView | null {
    if (!this.announce) return null;
    const clip = this.clip(this.announce.clip);
    const t = this.elapsed(this.announce.startTick);
    if (isFinished(clip, t)) return null;
    const { sprite, alpha } = sampleClip(clip, t);
    return sprite === null ? null : { sprite, alpha };
  }
}
