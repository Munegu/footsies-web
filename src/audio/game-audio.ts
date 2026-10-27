// Audio du jeu sur Web Audio. Port de SoundManager.cs : une source de musique en boucle et
// deux sources de bruitages (une par joueur). Graphe :
//
//   musique ─► gain musique ─┐
//   voix J1 ─► pan ─┐        ├─► gain général ─► sortie
//   voix J2 ─► pan ─┴► gain bruitages ─┘
import { BGM_VOLUME, SE_VOLUME, soundCommand, type SoundCommand, type Voice } from './sounds.ts';
import type { BattleEvent } from '../engine/types.ts';

/** Sons décodés : bruitages par nom, et la musique. */
export interface AudioClips {
  se: ReadonlyMap<string, AudioBuffer>;
  bgm: AudioBuffer | null;
}

export interface GameAudioOptions {
  /** Points de boucle de la musique (secondes), si le début ou la fin du fichier décodé gênent. */
  musicLoop?: { start: number; end: number };
}

/** Durée du glissement vers un nouveau volume : évite les craquements d'un saut brutal. */
const RAMP_SECONDS = 0.01;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

interface VoiceSlot {
  source: AudioBufferSourceNode | null;
  panner: StereoPannerNode;
}

export class GameAudio {
  /** Les nœuds du graphe (exposés pour les tests). */
  readonly nodes: {
    master: GainNode;
    music: GainNode;
    sfx: GainNode;
    panners: readonly [StereoPannerNode, StereoPannerNode];
  };

  private readonly voices: readonly [VoiceSlot, VoiceSlot];
  private musicSource: AudioBufferSourceNode | null = null;
  private suspendedByUs = false;

  private masterVolume = 1;
  private musicVolume = 1;
  private sfxVolume = 1;
  private musicEnabled = true;

  constructor(
    private readonly ctx: AudioContext,
    private readonly clips: AudioClips,
    private readonly options: GameAudioOptions = {},
  ) {
    const master = ctx.createGain();
    const music = ctx.createGain();
    const sfx = ctx.createGain();
    master.connect(ctx.destination);
    music.connect(master);
    sfx.connect(master);

    const panners = [ctx.createStereoPanner(), ctx.createStereoPanner()] as const;
    for (const p of panners) p.connect(sfx);

    this.nodes = { master, music, sfx, panners };
    this.voices = [
      { source: null, panner: panners[0] },
      { source: null, panner: panners[1] },
    ];
    // Valeurs initiales directes (pas de glissement : rien ne joue encore).
    master.gain.value = this.masterVolume;
    music.gain.value = BGM_VOLUME * this.musicVolume;
    sfx.gain.value = SE_VOLUME * this.sfxVolume;
  }

  get isRunning(): boolean {
    return this.ctx.state === 'running';
  }

  /**
   * À appeler à chaque interaction de l'utilisateur (touche, clic) : un navigateur refuse tout
   * son avant (SPECS §9). Reprend le contexte s'il ne tourne pas encore et lance la musique.
   */
  unlock(): void {
    if (this.ctx.state !== 'running') {
      // Hors geste utilisateur valide la promesse reste en attente : on réessaiera au suivant.
      void Promise.resolve(this.ctx.resume()).catch(() => undefined);
    }
    this.startMusic();
  }

  /** Joue les événements `sound` d'un tick du moteur. */
  playEvents(events: readonly BattleEvent[]): void {
    for (const e of events) {
      const command = soundCommand(e);
      if (command) this.play(command);
    }
  }

  /** `playSE(menuSelectAudioClip)` : voix de J1, au centre (GameManager.LoadBattleScene). */
  playMenuSelect(): void {
    this.play({ voice: 0, clip: 'MenuSelect', pan: 0 });
  }

  /**
   * `playFighterSE` : un nouveau son d'un joueur COUPE celui que sa source jouait encore.
   * Sans contexte actif (pas d'interaction, onglet caché) le son est abandonné.
   */
  private play(command: SoundCommand): void {
    if (!this.isRunning) return;
    const buffer = this.clips.se.get(command.clip);
    if (!buffer) return;

    const slot = this.voices[command.voice as Voice];
    this.stopVoice(slot);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    slot.panner.pan.value = command.pan;
    source.connect(slot.panner);
    source.onended = () => {
      if (slot.source === source) slot.source = null;
    };
    source.start();
    slot.source = source;
  }

  private stopVoice(slot: VoiceSlot): void {
    if (!slot.source) return;
    try {
      slot.source.stop();
    } catch {
      // Déjà terminée.
    }
    slot.source = null;
  }

  private startMusic(): void {
    const buffer = this.clips.bgm;
    if (!buffer || this.musicSource) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    if (this.options.musicLoop) {
      source.loopStart = this.options.musicLoop.start;
      source.loopEnd = this.options.musicLoop.end;
    }
    source.connect(this.nodes.music);
    source.start();
    this.musicSource = source;
  }

  // --- Réglages -------------------------------------------------------------------------

  /** `toggleBGM` : coupe / rétablit le volume, la musique continue de jouer en silence. */
  toggleMusic(): boolean {
    this.setMusicEnabled(!this.musicEnabled);
    return this.musicEnabled;
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    this.applyMusicGain();
  }

  get isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = clamp01(volume);
    this.ramp(this.nodes.master.gain, this.masterVolume);
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = clamp01(volume);
    this.applyMusicGain();
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = clamp01(volume);
    this.ramp(this.nodes.sfx.gain, SE_VOLUME * this.sfxVolume);
  }

  private applyMusicGain(): void {
    this.ramp(this.nodes.music.gain, this.musicEnabled ? BGM_VOLUME * this.musicVolume : 0);
  }

  private ramp(param: AudioParam, target: number): void {
    param.setTargetAtTime(target, this.ctx.currentTime, RAMP_SECONDS);
  }

  // --- Onglet caché -----------------------------------------------------------------------

  /** Onglet caché : la logique du jeu est figée, le son aussi. */
  suspend(): void {
    if (this.ctx.state !== 'running') return;
    this.suspendedByUs = true;
    void Promise.resolve(this.ctx.suspend()).catch(() => undefined);
  }

  /** Onglet de retour : reprend seulement si c'est nous qui avions suspendu. */
  wake(): void {
    if (!this.suspendedByUs) return;
    this.suspendedByUs = false;
    void Promise.resolve(this.ctx.resume()).catch(() => undefined);
  }
}
