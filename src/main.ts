import f00 from './data/f00.json';
import type { FighterJson } from './data/types.ts';
import { createCpu, cpuInput, cpuObserve, type CpuPlayer } from './ai/cpu.ts';
import { GameAudio } from './audio/game-audio.ts';
import { loadAudio } from './audio/loader.ts';
import { createDebugControls, updateDebugControls } from './debug/debug-controls.ts';
import { RoundState, createBattle, stepBattle, type BattleState } from './engine/battle.ts';
import { buildFighterData } from './engine/fighter-data.ts';
import {
  RoundRecorder,
  createReplay,
  isIdentical,
  stepReplay,
  type ReplayState,
  type RoundRecording,
} from './engine/replay.ts';
import {
  BUTTON,
  GamepadPoller,
  assignPads,
  mergePadInput,
  padOfSlot,
  padStatusText,
  type PadSlots,
  type PadSnapshot,
} from './input/gamepad.ts';
import { attachKeyboard } from './input/keyboard.ts';
import { InputState } from './input/input-state.ts';
import { loadSettings, saveSettings, type Settings } from './input/settings.ts';
import { FixedStepper } from './loop.ts';
import { loadAssets } from './render/assets.ts';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, REF_WIDTH, integerScale } from './render/layout.ts';
import { drawBanner, renderFrame } from './render/render.ts';
import { BattleView } from './render/view.ts';
import { createApp, reduce, type AppEffect, type AppEvent, type Mode } from './ui/app.ts';
import { hitAt } from './ui/hit-test.ts';
import { createRepeater, stepRepeater } from './ui/menu.ts';
import { mergeMenuInput, padMenuInput, padStartPressed, sampleMenuInput } from './ui/menu-input.ts';
import { drawOptions } from './ui/options-screen.ts';
import { drawPause } from './ui/pause.ts';
import { clientToRef } from './ui/pointer.ts';
import { drawTitle } from './ui/title.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;
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

// Outils de debug : enregistrement du round, pause F1 / pas à pas F2, rejeu du dernier round.
const recorder = new RoundRecorder();
const debug = createDebugControls();
interface ReplaySession {
  rec: RoundRecording;
  state: ReplayState;
  view: BattleView;
}
let replay: ReplaySession | null = null;

// Manettes : lues à chaque tick ; attribuées à J1 puis J2 dans l'ordre de connexion.
const gamepads = new GamepadPoller(() => navigator.getGamepads());
let padSlots: PadSlots = [null, null];
let pads: PadSnapshot[] = [];
let prevPad: [PadSnapshot | null, PadSnapshot | null] = [null, null];
const padAttackBlocked: [boolean, boolean] = [false, false];
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
  recorder.reset();
  debug.paused = false;
  // Une touche encore enfoncée (Entrée, Espace) ne doit pas déclencher d'action en combat.
  input.releaseAll();
  stepper.reset();
  padAttackBlocked[0] = padAttackBlocked[1] = true;
  audio?.playMenuSelect(); // GameManager.LoadBattleScene
}

/** Rejeu du dernier round terminé, dans une session à part : le match en cours n'est pas touché. */
function startReplay(): void {
  const rec = recorder.last;
  if (!rec) return;
  const state = createReplay(rec);
  const replayView = new BattleView(assets.clips);
  replayView.onTick(state.battle, data); // l'instantané contient l'événement roundStart
  replay = { rec, state, view: replayView };
  debug.paused = false;
  stepper.reset();
}

function apply(effect: AppEffect): void {
  switch (effect.kind) {
    case 'startBattle':
      startBattle(effect.mode);
      break;
    case 'resumeBattle':
      input.releaseAll();
      stepper.reset();
      padAttackBlocked[0] = padAttackBlocked[1] = true;
      break;
    case 'quitBattle':
      battle = null;
      view = null;
      cpu = null;
      replay = null;
      debug.paused = false;
      break;
    case 'startReplay':
      startReplay();
      break;
    case 'stopReplay':
      replay = null;
      debug.paused = false;
      stepper.reset();
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

/** Lit les manettes et met à jour leur attribution (J1, J2) : une lecture par tick. */
function readPads(): { pad1: PadSnapshot | null; pad2: PadSnapshot | null } {
  pads = gamepads.poll();
  padSlots = assignPads(padSlots, pads);
  return { pad1: padOfSlot(padSlots, 0, pads), pad2: padOfSlot(padSlots, 1, pads) };
}

/**
 * Le bouton A tenu au moment d'entrer en combat (celui qui a validé « VS CPU ») ne doit pas être
 * pris pour une attaque : on l'ignore jusqu'à son relâchement.
 */
function withoutHeldAttack(pad: PadSnapshot | null, slot: 0 | 1): PadSnapshot | null {
  if (!pad || !padAttackBlocked[slot]) return pad;
  if (pad.buttons[BUTTON.A] !== true) {
    padAttackBlocked[slot] = false;
    return pad;
  }
  return { ...pad, buttons: pad.buttons.map((pressed, i) => (i === BUTTON.A ? false : pressed)) };
}

/** Un tick de logique (50 Hz) : le combat, ou la navigation des menus. */
function tick(): void {
  const { pad1, pad2 } = readPads();
  try {
    tickScreen(pad1, pad2);
  } finally {
    prevPad = [pad1, pad2];
  }
}

function tickScreen(pad1: PadSnapshot | null, pad2: PadSnapshot | null): void {
  if (app.screen === 'battle' && battle && view) {
    // Échap ou Start ouvre la pause (l'original revenait directement au titre).
    if (
      input.wasPressed('Escape') ||
      padStartPressed(prevPad[0], pad1) ||
      padStartPressed(prevPad[1], pad2)
    ) {
      input.clearPressed();
      dispatch({ kind: 'cancel' });
      return;
    }
    // F1 fige le combat, F2 avance d'un tick (seulement en phase de combat, comme l'original).
    const f1 = input.consumePressed('F1');
    const f2 = input.consumePressed('F2');
    if (!updateDebugControls(debug, battle.roundState, f1, f2)) return;

    // Clavier et manettes se combinent ; contre le CPU, J2 est piloté par l'IA (mais `skip`
    // garde le Attack physique des deux joueurs).
    const sampled = mergePadInput(
      input.sample(),
      withoutHeldAttack(pad1, 0),
      withoutHeldAttack(pad2, 1),
    );
    const stepInput = cpu ? { ...sampled, p2: cpuInput(cpu, battle) } : sampled;
    stepBattle(battle, data, stepInput);
    if (cpu) cpuObserve(cpu, battle.events);
    audio?.playEvents(battle.events);
    view.onTick(battle, data);
    // Un round terminé devient rejouable (menu de pause).
    if (recorder.observe(stepInput, battle)) dispatch({ kind: 'setReplayAvailable', value: true });
    if (battle.matchOver) dispatch({ kind: 'matchOver' }); // retour au titre
    return;
  }

  if (app.screen === 'replay' && replay) {
    const f1 = input.consumePressed('F1');
    const f2 = input.consumePressed('F2');
    // Échap, B ou Start : retour au menu de pause.
    const m = mergeMenuInput(sampleMenuInput(input), padMenuInput(prevPad[0], pad1));
    if (m.cancel) {
      dispatch({ kind: 'cancel' });
      return;
    }
    if (replay.state.done) return;
    // F1 / F2 valent aussi pour le rejeu.
    if (!updateDebugControls(debug, replay.state.battle.roundState, f1, f2)) return;
    stepReplay(replay.state, replay.rec, data);
    audio?.playEvents(replay.state.battle.events);
    replay.view.onTick(replay.state.battle, data);
    return;
  }

  if (app.screen === 'pause' || app.screen === 'title' || app.screen === 'options') {
    // Pendant la capture d'une touche, seul l'événement clavier compte.
    if (app.screen === 'options' && app.options.capturing) {
      input.clearPressed();
      return;
    }
    // Seule la manette 1 pilote les menus (InputManager.cs).
    const m = mergeMenuInput(sampleMenuInput(input), padMenuInput(prevPad[0], pad1));
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
 * L'espace disponible est celui de #stage (la fenêtre moins le footer des crédits).
 */
function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const s = integerScale(stage.clientWidth * dpr, stage.clientHeight * dpr);
  canvas.width = INTERNAL_WIDTH * s;
  canvas.height = INTERNAL_HEIGHT * s;
  canvas.style.width = `${canvas.width / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;
}
// ResizeObserver plutôt que l'évènement `resize` : la taille de #stage change aussi quand le
// footer est affiché/masqué (écran titre), sans que la fenêtre ne bouge.
new ResizeObserver(resize).observe(stage);
resize();

function replayBannerText(state: ReplayState, rec: RoundRecording): string {
  if (!state.done) return `REJEU  tick ${state.tick} / ${rec.inputs.length}   Échap : retour`;
  if (isIdentical(state))
    return `REJEU TERMINÉ : identique ✓ (${rec.inputs.length} ticks)   Échap : retour`;
  return `REJEU TERMINÉ : DIVERGENCE au tick ${(state.divergedAt ?? 0) + 1} ✗   Échap : retour`;
}

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
      drawOptions(
        context,
        scale,
        assets.ui,
        app.options,
        app.settings,
        keyboardLayout,
        padStatusText(padSlots, pads, gamepads.isDisabled),
      );
      break;
    case 'battle':
    case 'pause':
      if (battle && view) {
        renderFrame(context, scale, view, battle, data, assets, {
          showDebug,
          debugPaused: debug.paused && battle.roundState === RoundState.Fight,
        });
        if (app.screen === 'pause') {
          drawPause(context, scale, app.pauseMenu, app.replayAvailable);
        }
      }
      break;
    case 'replay':
      if (replay) {
        const { state, rec, view: replayView } = replay;
        renderFrame(context, scale, replayView, state.battle, data, assets, {
          showDebug,
          debugPaused: debug.paused && state.battle.roundState === RoundState.Fight,
        });
        drawBanner(context, replayBannerText(state, rec), 96);
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
