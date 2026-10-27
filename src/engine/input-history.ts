/** Historique des inputs d'un combattant : 180 ticks (`inputRecordFrame`, Fighter.cs:98). */
export const INPUT_RECORD_FRAMES = 180;

export interface InputHistory {
  /** Index 0 = tick courant. */
  input: number[];
  /** Bits qui viennent d'être pressés. */
  down: number[];
  /** Bits qui viennent d'être relâchés. */
  up: number[];
}

export function createInputHistory(): InputHistory {
  return {
    input: new Array<number>(INPUT_RECORD_FRAMES).fill(0),
    down: new Array<number>(INPUT_RECORD_FRAMES).fill(0),
    up: new Array<number>(INPUT_RECORD_FRAMES).fill(0),
  };
}

/** `Fighter.UpdateInput` (Fighter.cs:172-188). */
export function pushInput(h: InputHistory, bits: number): void {
  for (let i = INPUT_RECORD_FRAMES - 1; i >= 1; i--) {
    h.input[i] = h.input[i - 1] ?? 0;
    h.down[i] = h.down[i - 1] ?? 0;
    h.up[i] = h.up[i - 1] ?? 0;
  }
  const previous = h.input[1] ?? 0;
  h.input[0] = bits;
  h.down[0] = (bits ^ previous) & bits;
  h.up[0] = (bits ^ previous) & ~bits;
}

/** `Fighter.ClearInput` (Fighter.cs:521-529). */
export function clearInputHistory(h: InputHistory): void {
  h.input.fill(0);
  h.down.fill(0);
  h.up.fill(0);
}
