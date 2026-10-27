import { describe, expect, it } from 'vitest';
import { GameAudio, type AudioClips } from '../src/audio/game-audio.ts';
import { BGM_VOLUME, PAN_DIVISOR, SE_VOLUME, soundCommand } from '../src/audio/sounds.ts';
import type { BattleEvent } from '../src/engine/types.ts';
import { FakeContext, type FakeSource } from './helpers/fake-audio.ts';

const buf = (name: string) => ({ name }) as unknown as AudioBuffer;
const CLIPS: AudioClips = {
  se: new Map(['Attack', 'Guard', 'Normal_Hit', 'MenuSelect'].map((n) => [n, buf(n)])),
  bgm: buf('Footsies'),
};

const sound = (clip: string, playerOne: boolean, posX = 0): BattleEvent => ({
  kind: 'sound',
  clip,
  playerOne,
  posX,
});

function setup(clips: AudioClips = CLIPS, options = {}) {
  const ctx = new FakeContext();
  const audio = new GameAudio(ctx as unknown as AudioContext, clips, options);
  const nodes = audio.nodes as unknown as {
    master: { gain: { value: number }; connections: unknown[] };
    music: { gain: { value: number }; connections: unknown[] };
    sfx: { gain: { value: number }; connections: unknown[] };
    panners: [
      { pan: { value: number }; connections: unknown[] },
      { pan: { value: number }; connections: unknown[] },
    ];
  };
  return { ctx, audio, nodes };
}

/** Un contexte déjà actif (après interaction). */
async function running(clips?: AudioClips, options = {}) {
  const t = setup(clips, options);
  t.audio.unlock();
  await Promise.resolve();
  await Promise.resolve();
  return t;
}

const sourcesWith = (ctx: FakeContext, name: string): FakeSource[] =>
  ctx.sources.filter((s) => (s.buffer as { name: string } | null)?.name === name);

describe('soundCommand', () => {
  it("constantes de l'original : musique 0,85, bruitages 1, pan = x / 5", () => {
    expect([BGM_VOLUME, SE_VOLUME, PAN_DIVISOR]).toEqual([0.85, 1, 5]);
  });

  it('J1 -> voix 0, J2 -> voix 1', () => {
    expect(soundCommand(sound('Attack', true))?.voice).toBe(0);
    expect(soundCommand(sound('Attack', false))?.voice).toBe(1);
  });

  it('pan = posX / 5, borné à [-1, 1]', () => {
    expect(soundCommand(sound('Attack', true, -2))?.pan).toBeCloseTo(-0.4, 10);
    expect(soundCommand(sound('Attack', false, 2))?.pan).toBeCloseTo(0.4, 10);
    expect(soundCommand(sound('Attack', true, 0))?.pan).toBe(0);
    expect(soundCommand(sound('Attack', true, 5))?.pan).toBe(1);
    expect(soundCommand(sound('Attack', true, -9))?.pan).toBe(-1);
  });

  it('garde le nom du clip ; ignore les autres événements', () => {
    expect(soundCommand(sound('Normal_Hit', false))?.clip).toBe('Normal_Hit');
    expect(soundCommand({ kind: 'roundStart' })).toBeNull();
    expect(soundCommand({ kind: 'roundEnd' })).toBeNull();
  });
});

describe('graphe audio', () => {
  it('voix -> pan -> bruitages -> général -> sortie ; musique -> général', () => {
    const { ctx, nodes } = setup();
    expect(nodes.master.connections).toEqual([ctx.destination]);
    expect(nodes.music.connections).toEqual([nodes.master]);
    expect(nodes.sfx.connections).toEqual([nodes.master]);
    for (const p of nodes.panners) expect(p.connections).toEqual([nodes.sfx]);
  });

  it('volumes initiaux : musique 0,85, bruitages 1, général 1', () => {
    const { nodes } = setup();
    expect(nodes.music.gain.value).toBe(0.85);
    expect(nodes.sfx.gain.value).toBe(1);
    expect(nodes.master.gain.value).toBe(1);
  });
});

describe("politique d'autoplay", () => {
  it('avant interaction : aucun son, pas de musique', () => {
    const { ctx, audio } = setup();
    audio.playEvents([sound('Attack', true)]);
    expect(ctx.sources).toHaveLength(0);
  });

  it('unlock : reprend le contexte et lance la musique en boucle', async () => {
    const { ctx, audio, nodes } = await running();
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.state).toBe('running');
    const music = sourcesWith(ctx, 'Footsies');
    expect(music).toHaveLength(1);
    expect(music[0]).toMatchObject({ started: true, loop: true });
    expect(music[0]?.connections).toEqual([nodes.music]);
    expect(audio.isRunning).toBe(true);
  });

  it('unlock répété : une seule reprise, une seule musique', async () => {
    const { ctx, audio } = await running();
    audio.unlock();
    audio.unlock();
    expect(ctx.resumeCalls).toBe(1);
    expect(sourcesWith(ctx, 'Footsies')).toHaveLength(1);
  });

  it('reprise lente : les sons sont abandonnés tant que le contexte ne tourne pas', async () => {
    const { ctx, audio } = setup();
    let release: () => void = () => undefined;
    ctx.resumeGate = new Promise<void>((r) => (release = r));
    audio.unlock();
    audio.playEvents([sound('Attack', true)]);
    expect(sourcesWith(ctx, 'Attack')).toHaveLength(0);
    release();
    await ctx.resumeGate;
    await Promise.resolve();
    audio.playEvents([sound('Attack', true)]);
    expect(sourcesWith(ctx, 'Attack')).toHaveLength(1);
  });

  it("reprise refusée (geste invalide) : pas d'erreur, nouvel essai au geste suivant", async () => {
    const { ctx, audio } = setup();
    ctx.resumeFails = true;
    audio.unlock();
    await Promise.resolve();
    ctx.resumeFails = false;
    audio.unlock();
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.resumeCalls).toBe(2);
    expect(ctx.state).toBe('running');
  });

  it('sans musique chargée : aucune erreur', async () => {
    const { ctx } = await running({ se: CLIPS.se, bgm: null });
    expect(ctx.sources).toHaveLength(0);
  });

  it('points de boucle de la musique si fournis', async () => {
    const { ctx } = await running(CLIPS, { musicLoop: { start: 0.025, end: 44.5 } });
    expect(sourcesWith(ctx, 'Footsies')[0]).toMatchObject({ loopStart: 0.025, loopEnd: 44.5 });
  });
});

describe('bruitages', () => {
  it('un événement joue le bon buffer, branché sur le pan de la voix, avec le bon pan', async () => {
    const { ctx, audio, nodes } = await running();
    audio.playEvents([sound('Guard', false, 2)]);
    const [s] = sourcesWith(ctx, 'Guard');
    expect(s?.started).toBe(true);
    expect(s?.connections).toEqual([nodes.panners[1]]);
    expect(nodes.panners[1].pan.value).toBeCloseTo(0.4, 10);
    expect(nodes.panners[0].pan.value).toBe(0);
  });

  it("un nouveau son d'un joueur coupe le précédent du même joueur", async () => {
    const { ctx, audio } = await running();
    audio.playEvents([sound('Attack', true, -1)]);
    audio.playEvents([sound('Normal_Hit', true, -1)]);
    expect(sourcesWith(ctx, 'Attack')[0]?.stopped).toBe(true);
    expect(sourcesWith(ctx, 'Normal_Hit')[0]?.stopped).toBe(false);
  });

  it('J1 et J2 ne se coupent pas', async () => {
    const { ctx, audio } = await running();
    audio.playEvents([sound('Attack', true), sound('Guard', false)]);
    expect(sourcesWith(ctx, 'Attack')[0]?.stopped).toBe(false);
    expect(sourcesWith(ctx, 'Guard')[0]?.stopped).toBe(false);
  });

  it('plusieurs sons dans un même tick : le dernier de chaque joueur reste', async () => {
    const { ctx, audio } = await running();
    audio.playEvents([sound('Attack', true), sound('Guard', true), sound('Normal_Hit', true)]);
    expect(sourcesWith(ctx, 'Attack')[0]?.stopped).toBe(true);
    expect(sourcesWith(ctx, 'Guard')[0]?.stopped).toBe(true);
    expect(sourcesWith(ctx, 'Normal_Hit')[0]?.stopped).toBe(false);
  });

  it("un son terminé n'est pas « coupé » par le suivant", async () => {
    const { ctx, audio } = await running();
    audio.playEvents([sound('Attack', true)]);
    const first = sourcesWith(ctx, 'Attack')[0];
    first?.onended?.();
    audio.playEvents([sound('Guard', true)]);
    expect(first?.stopped).toBe(false);
  });

  it('MenuSelect passe par la voix de J1, au centre, et coupe son son en cours', async () => {
    const { ctx, audio, nodes } = await running();
    audio.playEvents([sound('Attack', true, -3)]);
    audio.playMenuSelect();
    expect(sourcesWith(ctx, 'Attack')[0]?.stopped).toBe(true);
    expect(sourcesWith(ctx, 'MenuSelect')[0]?.connections).toEqual([nodes.panners[0]]);
    expect(nodes.panners[0].pan.value).toBe(0);
  });

  it('clip inconnu : ignoré sans erreur, et sans couper la voix', async () => {
    const { ctx, audio } = await running();
    audio.playEvents([sound('Attack', true)]);
    audio.playEvents([sound('Inconnu', true)]);
    expect(sourcesWith(ctx, 'Attack')[0]?.stopped).toBe(false);
  });
});

describe('réglages de volume', () => {
  it('toggleMusic : gain 0 puis 0,85, la musique continue de jouer', async () => {
    const { ctx, audio, nodes } = await running();
    expect(audio.toggleMusic()).toBe(false);
    expect(nodes.music.gain.value).toBe(0);
    expect(audio.isMusicEnabled).toBe(false);
    expect(sourcesWith(ctx, 'Footsies')[0]?.stopped).toBe(false);
    expect(audio.toggleMusic()).toBe(true);
    expect(nodes.music.gain.value).toBe(0.85);
  });

  it('volumes composés : général, musique, bruitages', async () => {
    const { audio, nodes } = await running();
    audio.setMasterVolume(0.5);
    audio.setMusicVolume(0.5);
    audio.setSfxVolume(0.25);
    expect(nodes.master.gain.value).toBe(0.5);
    expect(nodes.music.gain.value).toBeCloseTo(0.85 * 0.5, 10);
    expect(nodes.sfx.gain.value).toBe(0.25);
  });

  it('couper la musique garde le volume choisi pour son retour', async () => {
    const { audio, nodes } = await running();
    audio.setMusicVolume(0.4);
    audio.setMusicEnabled(false);
    audio.setMusicVolume(0.6);
    expect(nodes.music.gain.value).toBe(0);
    audio.setMusicEnabled(true);
    expect(nodes.music.gain.value).toBeCloseTo(0.85 * 0.6, 10);
  });

  it('les volumes sont bornés à [0, 1]', async () => {
    const { audio, nodes } = await running();
    audio.setMasterVolume(3);
    expect(nodes.master.gain.value).toBe(1);
    audio.setMasterVolume(-1);
    expect(nodes.master.gain.value).toBe(0);
  });
});

describe('onglet caché', () => {
  it('suspend coupe le son, wake le rétablit', async () => {
    const { ctx, audio } = await running();
    audio.suspend();
    await Promise.resolve();
    expect(ctx.state).toBe('suspended');
    audio.playEvents([sound('Attack', true)]);
    expect(sourcesWith(ctx, 'Attack')).toHaveLength(0);
    audio.wake();
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.state).toBe('running');
    audio.playEvents([sound('Attack', true)]);
    expect(sourcesWith(ctx, 'Attack')).toHaveLength(1);
  });

  it('wake sans suspension préalable ne reprend rien', async () => {
    const { ctx, audio } = setup();
    audio.wake();
    expect(ctx.resumeCalls).toBe(0);
  });

  it('suspend sur un contexte pas encore actif ne fait rien', () => {
    const { ctx, audio } = setup();
    audio.suspend();
    expect(ctx.suspendCalls).toBe(0);
  });
});
