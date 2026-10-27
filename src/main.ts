import f00 from './data/f00.json';
import type { FighterJson } from './data/types.ts';
import { createCpu, cpuInput, cpuObserve, type CpuPlayer } from './ai/cpu.ts';
import { GameAudio } from './audio/game-audio.ts';
import { loadAudio } from './audio/loader.ts';
import { createBattle, stepBattle, type BattleState } from './engine/battle.ts';
import { buildFighterData } from './engine/fighter-data.ts';
import { attachKeyboard } from './input/keyboard.ts';
import { InputState } from './input/input-state.ts';
import { loadSettings, saveSettings, type Settings } from './input/settings.ts';
import { FixedStepper } from './loop.ts';
import { loadAssets } from './render/assets.ts';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, REF_WIDTH, integerScale } from './render/layout.ts';
import { renderFrame } from './render/render.ts';
import { BattleView } from './render/view.ts';
import { createApp, reduce, type AppEffect, type AppEvent, type Mode } from './ui/app.ts';
import { hitAt } from './ui/hit-test.ts';
import { createRepeater, stepRepeater } from './ui/menu.ts';
import { sampleMenuInput } from './ui/menu-input.ts';
import { drawOptions } from './ui/options-screen.ts';
import { drawPause } from './ui/pause.ts';
import { clientToRef } from './ui/pointer.ts';
import { drawTitle } from './ui/title.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const credits = document.getElementById('credits') as HTMLElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D indisponible');

const data = buildFighterData(f00 as unknown as FighterJson);
const assets = await loadAssets();
let showDebug = false; // F12, comme dans l'original

// Réglages sauvegardés (touches, volumes, son). `localStorage` peut être indisponible.
const storage = ((): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

// Disposition réelle du clavier (Chrome) : affiche ce qui est gravé sur les touches.
let keyboardLayout: ReadonlyMap<string, string> | null = null;
try {
  const kb = (
    navigator as unknown as { keyboard?: { getLayoutMap(): Promise<ReadonlyMap<string, string>> } }
  ).keyboard;
  void kb
    ?.getLayoutMap()
    .then((m) => (keyboardLayout = m))
    .catch(() => undefined);
} catch {
  // API absente : on affiche les noms par défaut.
}

// Option de debug : `?seed=N` rejoue exactement le même CPU (sinon graine aléatoire).
const seedParam = new URLSearchParams(window.location.search).get('seed');
const fixedSeed =
  seedParam !== null && Number.isInteger(Number(seedParam)) ? Number(seedParam) : null;
const nextSeed = (): number => fixedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;

// Audio : le contexte est créé tout de suite (suspendu), le son démarre à la première interaction.
let audio: GameAudio | null = null;
try {
  const audioContext = new AudioContext();
  audio = new GameAudio(audioContext, await loadAudio(audioContext));
  audioContext.addEventListener('statechange', () => console.info(`Audio : ${audioContext.state}`));
} catch (e) {
  console.warn('Audio indisponible', e);
}
const unlockAudio = (): void => audio?.unlock();
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);
document.addEventListener('visibilitychange', () =>
  document.hidden ? audio?.suspend() : audio?.wake(),
);

const initialSettings = loadSettings(storage);
const input = new InputState(initialSettings.bindings);
attachKeyboard(input, (code) => {
  if (code === 'F12') showDebug = !showDebug;
  // Écran d'options : la touche appuyée est celle qu'on veut affecter.
  if (app.screen === 'options' && app.options.capturing) {
    dispatch({ kind: 'key', code });
    input.releaseAll(); // la touche ne doit pas aussi naviguer ou valider au tick suivant
  }
});

/** Applique les réglages au jeu : touches, volumes, son. */
function applySettings(s: Settings): void {
  input.setBindings(s.bindings);
  audio?.setMasterVolume(s.masterVolume);
  audio?.setMusicVolume(s.musicVolume);
  audio?.setSfxVolume(s.sfxVolume);
  audio?.setMusicEnabled(s.musicEnabled);
}

const stepper = new FixedStepper();
document.addEventListener('visibilitychange', () => stepper.reset());

// --- Application : écran courant et combat en cours ---------------------------------------

let app = createApp(initialSettings);
applySettings(initialSettings);
let battle: BattleState | null = null;
let view: BattleView | null = null;
let cpu: CpuPlayer | null = null;
let pressedId: string | null = null;
const repeater = createRepeater();
const hRepeater = createRepeater();

function startBattle(mode: Mode): void {
  battle = createBattle();
  view = new BattleView(assets.clips);
  if (mode === 'cpu') {
    const seed = nextSeed();
    cpu = createCpu(seed);
    console.info(`VS CPU, graine ${seed} (ajouter ?seed=${seed} à l'URL pour rejouer)`);
  } else {
    cpu = null;
  }
  // Une touche encore enfoncée (Entrée, Espace) ne doit pas déclencher d'action en combat.
  input.releaseAll();
  stepper.reset();
  audio?.playMenuSelect(); // GameManager.LoadBattleScene
}

function apply(effect: AppEffect): void {
  switch (effect.kind) {
    case 'startBattle':
      startBattle(effect.mode);
      break;
    case 'resumeBattle':
      input.releaseAll();
      stepper.reset();
      break;
    case 'quitBattle':
      battle = null;
      view = null;
      cpu = null;
      break;
    case 'previewSfx':
      audio?.playMenuSelect();
      break;
  }
}

function dispatch(event: AppEvent): void {
  const previous = app.settings;
  const result = reduce(app, event);
  app = result.state;
  if (app.settings !== previous) {
    applySettings(app.settings);
    saveSettings(storage, app.settings);
  }
  result.effects.forEach(apply);
}

// Souris : survol = sélection, clic = activation (UIEventAction.cs).
const toRef = (e: MouseEvent): { x: number; y: number } =>
  clientToRef(canvas.getBoundingClientRect(), e.clientX, e.clientY);

canvas.addEventListener('mousemove', (e) => {
  const p = toRef(e);
  const hit = hitAt(app.screen, p.x, p.y);
  canvas.style.cursor = hit ? 'pointer' : 'default';
  if (hit && !(app.screen === 'options' && app.options.capturing)) {
    dispatch({ kind: 'hover', id: hit.id });
  }
});
canvas.addEventListener('mousedown', (e) => {
  const p = toRef(e);
  pressedId = hitAt(app.screen, p.x, p.y)?.id ?? null;
});
canvas.addEventListener('mouseup', (e) => {
  const p = toRef(e);
  const hit = hitAt(app.screen, p.x, p.y);
  if (hit && hit.id === pressedId && !(app.screen === 'options' && app.options.capturing)) {
    if (
      hit.value !== undefined &&
      (hit.id === 'master' || hit.id === 'music' || hit.id === 'sfx')
    ) {
      dispatch({ kind: 'hover', id: hit.id });
      dispatch({ kind: 'setVolume', id: hit.id, value: hit.value });
    } else {
      dispatch({ kind: 'activate', id: hit.id });
    }
  }
  pressedId = null;
});

/** Un tick de logique (50 Hz) : le combat, ou la navigation des menus. */
function tick(): void {
  if (app.screen === 'battle' && battle && view) {
    // Échap ouvre la pause (l'original revenait directement au titre).
    if (input.wasPressed('Escape')) {
      input.clearPressed();
      dispatch({ kind: 'cancel' });
      return;
    }
    const sampled = input.sample();
    // Contre le CPU, les touches de J2 sont ignorées (mais `skip` garde le Attack physique).
    stepBattle(battle, data, cpu ? { ...sampled, p2: cpuInput(cpu, battle) } : sampled);
    if (cpu) cpuObserve(cpu, battle.events);
    audio?.playEvents(battle.events);
    view.onTick(battle, data);
    if (battle.matchOver) dispatch({ kind: 'matchOver' }); // retour au titre
    return;
  }

  if (app.screen === 'pause' || app.screen === 'title' || app.screen === 'options') {
    // Pendant la capture d'une touche, seul l'événement clavier compte.
    if (app.screen === 'options' && app.options.capturing) {
      input.clearPressed();
      return;
    }
    const m = sampleMenuInput(input);
    const fired = stepRepeater(repeater, m.dir);
    if (fired !== 0) dispatch({ kind: 'move', delta: fired });
    const adjust = stepRepeater(hRepeater, app.screen === 'options' ? m.hdir : 0);
    if (adjust !== 0) dispatch({ kind: 'adjust', delta: adjust });
    if (m.confirm) dispatch({ kind: 'confirm' });
    if (m.cancel) dispatch({ kind: 'cancel' });
  }
}

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

function draw(): void {
  const context = ctx as CanvasRenderingContext2D;
  const scale = canvas.width / REF_WIDTH;
  credits.hidden = app.screen !== 'title';

  switch (app.screen) {
    case 'title':
      drawTitle(context, scale, assets.ui, app.titleMenu, {
        pressedId,
        musicOn: app.settings.musicEnabled,
      });
      break;
    case 'options':
      drawOptions(context, scale, assets.ui, app.options, app.settings, keyboardLayout);
      break;
    case 'battle':
    case 'pause':
      if (battle && view) {
        renderFrame(context, scale, view, battle, data, assets, { showDebug });
        if (app.screen === 'pause') drawPause(context, scale, app.pauseMenu);
      }
      break;
  }
}

/**
 * Boucle : `requestAnimationFrame` suit la cadence de l'écran ; la logique, elle, avance par
 * pas fixes de 20 ms (50 Hz) grâce à l'accumulateur. Le rendu lit le dernier état calculé.
 */
function frame(now: number): void {
  const ticks = stepper.advance(now);
  for (let i = 0; i < ticks; i++) tick();
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
