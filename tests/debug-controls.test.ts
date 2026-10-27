import { describe, expect, it } from 'vitest';
import { createDebugControls, updateDebugControls } from '../src/debug/debug-controls.ts';
import { RoundState } from '../src/engine/battle.ts';

const { Stop, Intro, Fight, KO, End } = RoundState;

describe('pause et pas à pas de debug (F1 / F2)', () => {
  it('sans appui, le combat avance', () => {
    const d = createDebugControls();
    expect(updateDebugControls(d, Fight, false, false)).toBe(true);
    expect(d.paused).toBe(false);
  });

  it('F1 fige le combat', () => {
    const d = createDebugControls();
    expect(updateDebugControls(d, Fight, true, false)).toBe(false);
    expect(d.paused).toBe(true);
    expect(updateDebugControls(d, Fight, false, false)).toBe(false);
  });

  it("F2 en pause avance d'un tick, puis le jeu se fige de nouveau", () => {
    const d = createDebugControls();
    updateDebugControls(d, Fight, true, false);
    expect(updateDebugControls(d, Fight, false, true)).toBe(true);
    expect(updateDebugControls(d, Fight, false, false)).toBe(false);
    expect(d.paused).toBe(true);
  });

  it('F2 hors pause ne fait rien de plus', () => {
    const d = createDebugControls();
    expect(updateDebugControls(d, Fight, false, true)).toBe(true);
    expect(d.paused).toBe(false);
  });

  it('F1 une seconde fois reprend', () => {
    const d = createDebugControls();
    updateDebugControls(d, Fight, true, false);
    expect(updateDebugControls(d, Fight, true, false)).toBe(true);
    expect(d.paused).toBe(false);
  });

  it("F1 et F2 le même tick : la pause s'active et F2 avance ce tick", () => {
    const d = createDebugControls();
    expect(updateDebugControls(d, Fight, true, true)).toBe(true);
    expect(d.paused).toBe(true);
  });

  it('hors phase de combat (Stop, Intro, KO, End) : jamais de pause, F1 / F2 ignorés', () => {
    for (const state of [Stop, Intro, KO, End]) {
      const d = createDebugControls();
      expect(updateDebugControls(d, state, true, true)).toBe(true);
      expect(d.paused).toBe(false);
    }
  });
});
