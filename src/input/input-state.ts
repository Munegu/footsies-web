import type { BattleInput } from '../engine/battle.ts';
import { InputBit } from '../engine/types.ts';

/** Touches physiques (`KeyboardEvent.code`) d'un joueur. */
export interface PlayerBinding {
  left: string;
  right: string;
  attack: string;
}

export interface Bindings {
  p1: PlayerBinding;
  p2: PlayerBinding;
}

/** Touches par défaut de l'original (ProjectSettings/InputManager.asset). */
export const DEFAULT_BINDINGS: Bindings = {
  p1: { left: 'KeyA', right: 'KeyD', attack: 'Space' },
  p2: { left: 'ArrowLeft', right: 'ArrowRight', attack: 'ShiftRight' },
};

/**
 * État du clavier, sans DOM : touches tenues et appuis survenus depuis le dernier tick.
 * Un appui plus court qu'un tick (20 ms) serait raté par un simple « la touche est-elle
 * enfoncée maintenant ? » : on le mémorise (SPECS §9).
 */
export class InputState {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor(private bindings: Bindings = DEFAULT_BINDINGS) {}

  setBindings(bindings: Bindings): void {
    this.bindings = bindings;
  }

  keyDown(code: string): void {
    if (!this.held.has(code)) this.pressed.add(code);
    this.held.add(code);
  }

  keyUp(code: string): void {
    this.held.delete(code);
  }

  /** Perte de focus : plus aucune touche n'est considérée enfoncée. */
  releaseAll(): void {
    this.held.clear();
    this.pressed.clear();
  }

  private isDown(code: string): boolean {
    return this.held.has(code) || this.pressed.has(code);
  }

  private bitsOf(b: PlayerBinding): number {
    return (
      (this.isDown(b.left) ? InputBit.Left : 0) |
      (this.isDown(b.right) ? InputBit.Right : 0) |
      (this.isDown(b.attack) ? InputBit.Attack : 0)
    );
  }

  /** Les entrées du prochain tick. Efface la mémoire des appuis courts. */
  sample(): BattleInput {
    const p1 = this.bitsOf(this.bindings.p1);
    const p2 = this.bitsOf(this.bindings.p2);
    this.pressed.clear();
    // IsKOSkipButtonPressed : Attack de l'un ou l'autre joueur (BattleCore.cs:352-361).
    return { p1, p2, skip: ((p1 | p2) & InputBit.Attack) !== 0 };
  }
}
