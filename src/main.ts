import f00 from './data/f00.json';
import type { FighterJson } from './data/types.ts';
import { createCpu, cpuInput, cpuObserve } from './ai/cpu.ts';
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

// Provisoire (jusqu'au menu de l'étape 8) : VS CPU par défaut, `?mode=2p` pour deux joueurs,
// `?seed=N` pour rejouer exactement le même CPU.
const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed'));
const seed =
  params.get('seed') !== null && Number.isInteger(seedParam)
    ? seedParam
    : (crypto.getRandomValues(new Uint32Array(1))[0] ?? 1);
const cpu = params.get('mode') === '2p' ? null : createCpu(seed);
if (cpu) console.info(`VS CPU, graine ${seed} (ajouter ?seed=${seed} à l'URL pour rejouer)`);

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
    const sampled = input.sample();
    // Contre le CPU, les touches de J2 sont ignorées (mais `skip` garde le Attack physique).
    stepBattle(battle, data, cpu ? { ...sampled, p2: cpuInput(cpu, battle) } : sampled);
    if (cpu) cpuObserve(cpu, battle.events);
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
