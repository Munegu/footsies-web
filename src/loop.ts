/** Pas de la logique : 50 ticks par seconde, comme `FixedUpdate` d'Unity (0,02 s). */
export const TICK_MS = 20;

/**
 * Plafond de l'accumulateur. Un onglet en arrière-plan n'est plus rappelé par
 * `requestAnimationFrame` : sans plafond, le retour rejouerait des centaines de ticks d'un coup.
 */
export const MAX_ACCUMULATED_MS = 250;

// Tolérance pour que 1000 ms donnent bien 50 ticks malgré les erreurs d'arrondi des flottants.
const EPSILON_MS = 1e-6;

/**
 * Accumulateur de temps à pas fixe. À chaque frame d'affichage, `advance(now)` dit combien de
 * ticks de logique il faut exécuter pour rattraper le temps réel.
 */
export class FixedStepper {
  private accumulator = 0;
  private last: number | null = null;

  constructor(
    private readonly stepMs = TICK_MS,
    private readonly maxAccumulatedMs = MAX_ACCUMULATED_MS,
  ) {}

  /** `nowMs` : horloge monotone en ms (le timestamp de `requestAnimationFrame`). */
  advance(nowMs: number): number {
    if (this.last === null) {
      this.last = nowMs;
      return 0;
    }
    const elapsed = Math.max(0, nowMs - this.last);
    this.last = nowMs;

    this.accumulator = Math.min(this.accumulator + elapsed, this.maxAccumulatedMs);
    const ticks = Math.floor((this.accumulator + EPSILON_MS) / this.stepMs);
    this.accumulator = Math.max(0, this.accumulator - ticks * this.stepMs);
    return ticks;
  }

  /** À appeler quand l'horloge a été interrompue (onglet caché, pause). */
  reset(): void {
    this.accumulator = 0;
    this.last = null;
  }
}
