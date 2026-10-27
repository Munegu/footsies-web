// Forme des JSON générés par `npm run extract` (scripts/extract-unity.ts).
// Les noms de champs suivent ceux du C# d'origine (ActionData.cs, AttackData.cs, FighterData.cs).

/** Rectangle Unity : x = centre horizontal, y = bas, relatif au personnage. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Intervalle de frames, bornes incluses : [début, fin]. */
export type FrameRange = [number, number];

export type ActionType = 'Movement' | 'Attack' | 'Damage' | 'Guard';

export interface MotionFrameData {
  startEndFrame: FrameRange;
  motionID: number;
}

export interface StatusData {
  startEndFrame: FrameRange;
  counterHit: boolean;
}

export interface HitboxData {
  startEndFrame: FrameRange;
  rect: Rect;
  attackID: number;
  proximity: boolean;
}

export interface HurtboxData {
  startEndFrame: FrameRange;
  rect: Rect;
  useBaseRect: boolean;
}

export interface PushboxData {
  startEndFrame: FrameRange;
  rect: Rect;
  useBaseRect: boolean;
}

export interface MovementData {
  startEndFrame: FrameRange;
  /** Unités monde par seconde. */
  velocity_x: number;
}

export interface CancelData {
  startEndFrame: FrameRange;
  buffer: boolean;
  execute: boolean;
  actionID: number[];
}

export interface ActionData {
  actionID: number;
  actionName: string;
  type: ActionType;
  frameCount: number;
  isLoop: boolean;
  loopFromFrame: number;
  motions: MotionFrameData[];
  status: StatusData[];
  hitboxes: HitboxData[];
  hurtboxes: HurtboxData[];
  pushboxes: PushboxData[];
  movements: MovementData[];
  cancels: CancelData[];
  alwaysCancelable: boolean;
  /** Nom du son (sans extension) dans src/data/audio/se/, ou null. */
  audioClip: string | null;
}

export interface AttackData {
  attackID: number;
  attackName: string;
  damageActionID: number;
  guardActionID: number;
  numberOfHit: number;
  vitalHealthDamage: number;
  guardHealthDamage: number;
  hitStunFrame: number;
  guardStunFrame: number;
  guardBreakStunFrame: number;
}

export interface FighterParams {
  startGuardHealth: number;
  forwardMoveSpeed: number;
  backwardMoveSpeed: number;
  dashAllowFrame: number;
  specialAttackHoldFrame: number;
  canCancelOnWhiff: boolean;
  baseHurtBoxRect: Rect;
  basePushBoxRect: Rect;
}

/** src/data/f00.json */
export interface FighterJson {
  fighter: FighterParams;
  actions: Record<string, ActionData>;
  attacks: Record<string, AttackData>;
}

export interface SpriteRect {
  /** Position dans l'atlas, origine en haut à gauche (convention canvas). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Pivot normalisé 0..1, origine en bas à gauche (convention Unity). */
  pivotX: number;
  pivotY: number;
  /** `spritePixelsToUnits` du .meta : 10 pour la plupart, 100 pour Idle_1..4 (à examiner à l'étape 5). */
  pixelsPerUnit: number;
}

/** src/data/f00-sprites.json */
export interface SpritesJson {
  atlas: { file: string; width: number; height: number };
  /** motionID -> rect dans l'atlas. */
  sprites: Record<string, SpriteRect>;
}

/** Clé d'une courbe d'animation Unity (interpolation de Hermite ; pente `null` = escalier). */
export interface CurveKeyJson {
  time: number;
  value: number;
  inSlope: number | null;
  outSlope: number | null;
}

/** Un clip d'animation Unity (.anim) réduit à ce que l'interface utilise. */
export interface AnimationClipJson {
  /** Durée en secondes (`m_StopTime`). */
  length: number;
  /** Courbe de l'alpha de l'image (`m_Color.a`), ou null si le clip ne l'anime pas. */
  alpha: CurveKeyJson[] | null;
  /** Sprite affiché à partir de chaque instant (piste en escalier). */
  sprites: { time: number; sprite: string }[];
}

/** src/data/ui-animations.json */
export interface UiAnimationsJson {
  clips: Record<string, AnimationClipJson>;
}
