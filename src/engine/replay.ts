// Enregistrement et rejeu d'un round (outil de debug de l'original : BattleCore.RecordInput,
// CopyLastRoundInput, StartPlayLastRoundInput). Contrairement à l'original, dont le rejeu démarre
// pendant l'Intro avec des inputs enregistrés depuis le début du combat (donc décalé), on garde
// un instantané complet de l'état au début du round : le moteur étant pur, restaurer l'instantané
// et rejouer les inputs reproduit le round bit à bit. Le hash de chaque tick le vérifie.
import { RoundState, stepBattle, type BattleInput, type BattleState } from './battle.ts';
import type { FighterData } from './fighter-data.ts';
import { hashBattle } from './hash.ts';

/** `maxRecordingInputFrame` (BattleCore.cs:68) : 60 * 60 * 5 ticks. */
export const MAX_RECORDING_TICKS = 60 * 60 * 5;

export interface RoundRecording {
  /** État au début du round (juste après l'entrée en Intro), événements compris. */
  start: BattleState;
  /** Entrées de chaque tick suivant (CPU compris). */
  inputs: BattleInput[];
  /** Hash de l'état après chaque tick (même longueur que `inputs`). */
  hashes: string[];
  /** Le round est allé jusqu'à son terme (retour à Stop, ou fin de match). */
  complete: boolean;
  /** L'enregistrement a dépassé `MAX_RECORDING_TICKS` et a été abandonné. */
  truncated: boolean;
}

/** Instantané du début d'un round : à appeler juste après le tick qui émet `roundStart`. */
export function startRecording(b: BattleState): RoundRecording {
  return { start: structuredClone(b), inputs: [], hashes: [], complete: false, truncated: false };
}

/** Enregistre un tick : les entrées passées à `stepBattle` et l'état obtenu. */
export function recordTick(
  rec: RoundRecording,
  input: BattleInput,
  b: BattleState,
  maxTicks = MAX_RECORDING_TICKS,
): void {
  if (rec.complete || rec.truncated) return;
  if (rec.inputs.length >= maxTicks) {
    rec.truncated = true;
    return;
  }
  rec.inputs.push({ p1: input.p1, p2: input.p2, skip: input.skip === true });
  rec.hashes.push(hashBattle(b));
  // Le round se termine au retour à Stop (aussi pour le dernier round d'un match).
  if (b.roundState === RoundState.Stop) rec.complete = true;
}

/**
 * Suit les rounds d'un match : un nouvel enregistrement à chaque `roundStart`, et le dernier
 * round terminé est gardé pour le rejeu.
 */
export class RoundRecorder {
  /** Round en cours d'enregistrement. */
  current: RoundRecording | null = null;
  /** Dernier round terminé (rejouable). */
  last: RoundRecording | null = null;

  constructor(private readonly maxTicks = MAX_RECORDING_TICKS) {}

  /** À appeler après chaque `stepBattle`. Renvoie true si un round vient de se terminer. */
  observe(input: BattleInput, b: BattleState): boolean {
    if (b.events.some((e) => e.kind === 'roundStart')) {
      // Le tick qui entre en Intro n'est pas enregistré : l'instantané est pris après lui.
      this.current = startRecording(b);
      return false;
    }
    const rec = this.current;
    if (!rec) return false;
    recordTick(rec, input, b, this.maxTicks);
    if (rec.complete) {
      this.last = rec;
      this.current = null;
      return true;
    }
    if (rec.truncated) this.current = null;
    return false;
  }

  /** Nouveau match : on oublie tout. */
  reset(): void {
    this.current = null;
    this.last = null;
  }
}

export interface ReplayState {
  /** Copie de l'instantané, que le rejeu fait avancer. */
  battle: BattleState;
  /** Nombre de ticks rejoués. */
  tick: number;
  /** Premier tick (à partir de 0) dont l'état diffère de l'enregistrement, ou null. */
  divergedAt: number | null;
  done: boolean;
}

export function createReplay(rec: RoundRecording): ReplayState {
  return {
    battle: structuredClone(rec.start),
    tick: 0,
    divergedAt: null,
    done: rec.inputs.length === 0,
  };
}

/** Rejoue un tick. Renvoie false si le rejeu était déjà terminé. */
export function stepReplay(r: ReplayState, rec: RoundRecording, data: FighterData): boolean {
  const input = rec.inputs[r.tick];
  if (r.done || !input) return false;
  stepBattle(r.battle, data, input);
  if (r.divergedAt === null && hashBattle(r.battle) !== rec.hashes[r.tick]) r.divergedAt = r.tick;
  r.tick++;
  if (r.tick >= rec.inputs.length) r.done = true;
  return true;
}

/** Le rejeu est terminé et n'a divergé nulle part. */
export const isIdentical = (r: ReplayState): boolean => r.done && r.divergedAt === null;

/** Rejoue un round en entier (tests, vérification). */
export function runReplay(rec: RoundRecording, data: FighterData): ReplayState {
  const r = createReplay(rec);
  while (stepReplay(r, rec, data)) {
    // chaque appel avance d'un tick
  }
  return r;
}
