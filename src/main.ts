import f00 from './data/f00.json';
import type { FighterJson } from './data/types.ts';
import { createBattle, stepBattle } from './engine/battle.ts';
import { buildFighterData } from './engine/fighter-data.ts';
import { attachKeyboard } from './input/keyboard.ts';
import { InputState } from './input/input-state.ts';
import { FixedStepper } from './loop.ts';
import { loadAssets } from './render/assets.ts';
import { renderFrame } from './render/render.ts';
import { BattleView } from './render/view.ts';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, REF_WIDTH, integerScale } from './render/layout.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D indisponible');

const data = buildFighterData(f00 as unknown as FighterJson);
let battle = createBattle();
const assets = await loadAssets();
let view = new BattleView(assets.clips);
let showDebug = false; // F12, comme dans l'original

const input = new InputState();
attachKeyboard(input, (code) => {
  if (code === 'F12') showDebug = !showDebug;
});

/**
 * Canvas de 160x90 x S pixels (S entier) : les pixels du pixel art restent tous identiques.
 * On tient compte de devicePixelRatio : sur un écran Retina un pixel CSS = 2 pixels physiques.
 */
function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const s = integerScale(window.innerWidth * dpr, window.innerHeight * dpr);
  canvas.width = INTERNAL_WIDTH * s;
  canvas.height = INTERNAL_HEIGHT * s;
  canvas.style.width = `${canvas.width / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;
}
window.addEventListener('resize', resize);
resize();

const stepper = new FixedStepper();
document.addEventListener('visibilitychange', () => stepper.reset());

/**
 * Boucle : `requestAnimationFrame` suit la cadence de l'écran ; la logique, elle, avance par
 * pas fixes de 20 ms (50 Hz) grâce à l'accumulateur. Le rendu lit le dernier état calculé.
 */
function frame(now: number): void {
  const ticks = stepper.advance(now);
  for (let i = 0; i < ticks; i++) {
    stepBattle(battle, data, input.sample());
    view.onTick(battle, data);
    // En attendant l'écran titre (étape 8) : on relance un match à la fin de celui-ci.
    if (battle.matchOver) {
      battle = createBattle();
      view = new BattleView(assets.clips);
    }
  }

  renderFrame(
    ctx as CanvasRenderingContext2D,
    canvas.width / REF_WIDTH,
    view,
    battle,
    data,
    assets,
    {
      showDebug,
    },
  );
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
