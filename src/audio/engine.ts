import { noteToFreq } from '../midi/notes';
import { clamp, clamp01 } from '../core/math';
import { load, save } from '../core/storage';
import { DRUM_SPECS, type DrumVoice } from './drums';
import { CAB, HALL, HALL_LITE, boardImpulse, roomImpulse, type RoomSpec, type Samples } from './rooms';
import {
  NO_TRACK, humanize, keyFactors, makeRng, stretchCents, unisonDetunes, velocityPeak,
  type Humanized, type KeyFactors,
} from './shaping';
import { REGISTERS, registerOf, spectrum, spectrumKey, type Register, type SpectrumRef } from './spectra';
import {
  DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE, findBedVoice, findLeadVoice, noises,
  type BedSpec, type VoiceLayer, type VoiceNoise, type VoiceSpec,
} from './voices';

export interface AudioSettings {
  master: number;
  music: number;
  effects: number;
  /** Off-scale notes are snapped into the table's key. */
  assist: boolean;
  /** The rhythmic backing bed. */
  bed: boolean;
  /** How much of the room is heard, 0..1. */
  reverb: number;
  /** Pitch-bend travel at full wheel, in semitones. */
  bendRange: number;
  /** What the mod wheel moves. */
  modTarget: ModTarget;
}

/**
 * Vibrato moves the pitch, colour opens and closes the filter. Most players
 * expect the first; the second is what makes a held chord breathe.
 */
export type ModTarget = 'vibrato' | 'colour' | 'both';

/** Whether the keys sound as an instrument or as the backing layer itself. */
export type KeyVoicing = 'lead' | 'bed';

export const DEFAULT_AUDIO: AudioSettings = {
  master: 0.85,
  music: 0.6,
  effects: 0.9,
  assist: true,
  bed: true,
  reverb: 0.5,
  bendRange: 2,
  modTarget: 'both',
};

const AUDIO_STORAGE_KEY = 'audio';
const LEGACY_ASSIST_STORAGE_KEY = 'audioAssist';

/** Character of an impact, chosen by the surface the ball struck. */
interface ImpactProfile {
  freq: number;
  q: number;
  decay: number;
  tone: number;
  gain: number;
}

const IMPACTS: Record<string, ImpactProfile> = {
  wood:    { freq: 340,  q: 2.4, decay: 0.10, tone: 0.15, gain: 0.55 },
  rail:    { freq: 900,  q: 4.5, decay: 0.09, tone: 0.30, gain: 0.5  },
  metal:   { freq: 2100, q: 9,   decay: 0.28, tone: 0.62, gain: 0.42 },
  rubber:  { freq: 210,  q: 1.6, decay: 0.13, tone: 0.05, gain: 0.7  },
  plastic: { freq: 1300, q: 5,   decay: 0.08, tone: 0.35, gain: 0.5  },
  bumper:  { freq: 620,  q: 3.2, decay: 0.22, tone: 0.5,  gain: 0.75 },
  key:     { freq: 480,  q: 2.2, decay: 0.11, tone: 0.25, gain: 0.5  },
  glass:   { freq: 2800, q: 12,  decay: 0.34, tone: 0.7,  gain: 0.34 },
  silent:  { freq: 400,  q: 1,   decay: 0.01, tone: 0,    gain: 0    },
};

const MAX_VOICES = 48;

/**
 * A one-shot placed on the audio clock, which can still be taken back.
 *
 * A sound scheduled ahead belongs to the graph the moment it is asked for,
 * and outlives whatever asked for it: a mode that leaves within a flourish
 * would otherwise hear its last notes land over the next one. Cancelling
 * cuts the sound loose from the buses, whether it has started yet or not.
 */
export interface Scheduled {
  cancel(): void;
}

/** What a one-shot that never reached the graph hands back. */
const NOTHING: Scheduled = { cancel() {} };

/**
 * Shape of a key played as the bed, in seconds.
 *
 * The attack is the number that matters and it is a compromise: a pad that
 * swells the way the backing does would land audibly after the beat, and the
 * chord role is still judged on timing. Thirty-five milliseconds reads as a
 * swell rather than a strike while staying well inside the perfect window,
 * which is 55.
 */
const BED_KEY_ATTACK = 0.035;
/** Long enough that letting a chord go sounds like a decision, not a cut. */
const BED_KEY_RELEASE = 0.85;
/** How long the filter takes to settle back while the key is still down. */
const BED_KEY_SETTLE = 1.6;
/** Pads sit further back in the room than struck notes do. */
const BED_KEY_REVERB = 0.42;

/** Hall wet gain at a full reverb setting. Half of it is the original fixed value. */
const REVERB_MAX = 1.7;
/** Cabinet wet gain at a full reverb setting: the table's box, under the same knob. */
const CAB_MAX = 0.9;

/**
 * How far a played note is allowed towards either speaker.
 *
 * The keys span the whole width of the table, but a piano played across the
 * room does not swing from ear to ear. The table's own sounds keep the full
 * width, which is what puts the instrument in front of the machine.
 */
const LEAD_WIDTH = 0.6;
const MALLET_WIDTH = 0.8;

/** How far the bed dips under a struck note, how long it stays there, and how it comes back. */
const DUCK_FLOOR = 0.8;
const DUCK_HOLD = 0.06;
const DUCK_RETURN = 0.22;

/** The rooms are rendered from noise; one fixed seed makes them the same rooms on every load. */
const ROOM_SEED = 0x50a7;

/** How much of the soundboard is heard under a note, and how much once the pedal is down. */
const BODY_IDLE = 0.35;
const BODY_PEDAL = 1;

/** Longest delay the node can hold, which caps how slow a tempo it can follow. */
const DELAY_MAX = 2;

const dottedEighth = (bpm: number) => clamp((60 / bpm) * 0.75, 0.02, DELAY_MAX);

/** A source with a pitch to bend: an oscillator today, a rendered string later. */
type Pitched = OscillatorNode;

interface KeyVoice {
  note: number;
  startedAt: number;
  /**
   * Every source the voice owns, layers and FM operators alike. They are one
   * list because expression has to reach all of them: an operator sits at a
   * ratio to its carrier, and bending only the carrier would slide the two
   * apart and detune the timbre instead of transposing the note.
   */
  sources: Pitched[];
  filter: BiquadFilterNode;
  amp: GainNode;
  /** Where the voice reaches the buses. The damper's thud goes out through it too. */
  panner: StereoPannerNode;
  freq: number;
  /** What the amplifier was asked to reach, so the release can tell how much of the note is left. */
  peak: number;
  k: KeyFactors;
  /**
   * Taken from the spec at the moment the key went down, not read back off the
   * engine at release. That is what lets the player change instrument with
   * notes still held: a note finishes as the voice it was struck as.
   */
  release: number;
  damper?: VoiceNoise;
  releasing: boolean;
}

/** The nodes every pitched voice shares, whatever its layers are made of. */
interface Chain {
  filter: BiquadFilterNode;
  amp: GainNode;
  panner: StereoPannerNode;
}

/** Send levels a chain is built with. Zero leaves that send out altogether. */
interface Sends {
  hall: number;
  cab: number;
  delay: number;
  body?: number;
}

/**
 * How much of the small random drift every note gets, before a voice scales
 * it. Nobody plays a note twice the same way — the pitch, the attack and the
 * level of each strike all move a hair — and it is the absence of that which
 * makes repeated notes sound like a machine gun. Organs and synths set their
 * own scale to zero: there the drift reads as a fault.
 */
const HUMANIZE = 1;
/** Beds drift less than the keys under a hand. */
const BED_HUMANIZE = 0.5;

/** What a spectrum layer that names no table falls back to: a sawtooth, by partials. */
const DEFAULT_SPECTRUM: SpectrumRef = { gen: 'saw' };

/**
 * The whole sound of the game.
 *
 * Built directly on Web Audio rather than a library: every voice is scheduled
 * against `ctx.currentTime` with no lookahead queue, which is what keeps the
 * gap between pressing a key and hearing it as short as the hardware allows.
 */
export class AudioEngine {
  settings: AudioSettings;
  ctx: AudioContext | null = null;
  /** The graph has been built. Says nothing about whether it is audible. */
  ready = false;
  error: string | null = null;
  /** Fired whenever the context starts or stops running, so the UI can react. */
  onStateChange: (() => void) | null = null;

  private master!: GainNode;
  private glue!: DynamicsCompressorNode;
  private clip!: WaveShaperNode;
  private musicBus!: GainNode;
  /**
   * Everything the chord bed makes, on its own fader.
   *
   * Pads are one-shot oscillators rather than tracked voices, so there is no
   * note to release when the bed is switched off. Giving them a bus means the
   * bed can actually stop — and stop its own reverb tail with it — without
   * touching a single note the player is holding.
   */
  private padBus!: GainNode;
  /**
   * The pads currently allowed to ring, as one swappable node in front of the
   * bus. A pad is fire-and-forget — it schedules its own stop and is never
   * tracked — so there is nothing to release when a chord has to be cut short.
   * Fading this and putting a fresh one in its place ends every pad already
   * sounding, in one operation, without touching what comes next.
   */
  private padGen!: GainNode;
  private fxBus!: GainNode;
  /** The bed's own path in front of `padBus`: carved, widened, then dipped under the player. */
  private padCarve!: BiquadFilterNode;
  private padDuck!: GainNode;
  private ensembleWet!: GainNode;
  private ensembleDry!: GainNode;
  /** Slow oscillators shared by everything that moves at the same rate. */
  private lfos = new Map<number, OscillatorNode>();
  /** Two rooms: the hall the music plays in, and the cabinet the ball rolls in. */
  private hallSend!: GainNode;
  private hallWet!: GainNode;
  private hallConv!: ConvolverNode;
  private cabSend!: GainNode;
  private cabWet!: GainNode;
  /** The soundboard: a plate every note can be sent through and answered by. */
  private bodySend!: GainNode;
  private bodyWet!: GainNode;
  private delaySend!: GainNode;
  /**
   * Whether the machine has been found wanting. The shell sets this when it
   * sheds the rendering's own effects; the sound sheds its most expensive
   * ones in step, and takes them back the same way.
   */
  private lite = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 4;
  /** Held so the repeats can be retuned when the tempo changes. */
  private delayNode!: DelayNode;
  private noise!: AudioBuffer;
  /**
   * Expression, as two always-running control sources rather than per-frame
   * JavaScript. `detune` and `frequency` are AudioParams, so connecting these
   * to every live voice sums them sample-accurately and costs nothing to hold.
   */
  private bendSource!: ConstantSourceNode;
  private lfoVibrato!: GainNode;
  private lfoColour!: GainNode;
  private bendValue = 0;
  private modValue = 0;
  /** What the tempo-locked effects are currently tuned to. */
  private tempo = 96;
  private voices = new Map<number, KeyVoice>();
  private active: KeyVoice[] = [];
  /** Every periodic wave built so far, by spectrum and register. */
  private waves = new Map<string, PeriodicWave>();
  private sustained = new Set<number>();
  private sustainOn = false;

  /**
   * Which instrument the keys and the bed are currently using.
   *
   * Deliberately not part of `AudioSettings` and never written to storage: a
   * mode sets these on the way in and puts them back on the way out, so one
   * mode's choice of sound cannot follow the player into another. Freestyle is
   * the only mode that touches them, and it remembers its own preference.
   */
  private leadId = DEFAULT_LEAD_VOICE;
  private bedId = DEFAULT_BED_VOICE;
  private leadSpec: VoiceSpec = findLeadVoice(DEFAULT_LEAD_VOICE).spec;
  private bedSpec: BedSpec = findBedVoice(DEFAULT_BED_VOICE).spec;
  /** The bed instrument the keys take while `keyVoicing` is `bed`. */
  private keyBedId = DEFAULT_BED_VOICE;
  private keyBedSpec: BedSpec = findBedVoice(DEFAULT_BED_VOICE).spec;
  private keyVoicingMode: KeyVoicing = 'lead';

  constructor() {
    const stored = load<Partial<AudioSettings>>(AUDIO_STORAGE_KEY, {});
    this.settings = {
      ...DEFAULT_AUDIO,
      ...stored,
      // Keep the one setting older builds already remembered.
      assist: stored.assist ?? load(LEGACY_ASSIST_STORAGE_KEY, DEFAULT_AUDIO.assist),
    };
  }

  /**
   * True only when audio can actually be heard right now.
   *
   * Browsers hand out a *suspended* context to code that has not yet seen a
   * real user gesture, and suspend a running one when the tab is hidden or the
   * output device changes. Treating "context exists" as "sound works" is how a
   * game ends up silently silent, so everything checks this instead.
   */
  get running(): boolean {
    return this.ready && this.ctx !== null && this.ctx.state === 'running';
  }

  /**
   * Create or resume the context. Safe to call repeatedly and from anywhere;
   * it only succeeds when the browser has granted an audio gesture, so the
   * caller should keep trying on every interaction rather than assume once.
   */
  async start(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext
          ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) { this.error = 'This browser has no Web Audio.'; return false; }
        const ctx = new Ctor({ latencyHint: 'interactive' });
        this.ctx = ctx;
        ctx.onstatechange = () => this.onStateChange?.();
        this.build(ctx);
        this.ready = true;
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
      this.onStateChange?.();
      return this.ctx.state === 'running';
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  private build(ctx: AudioContext): void {
    // The master chain. One compressor, and only one: Chromium's carries six
    // milliseconds of look-ahead, which this chain already pays once, and a
    // second would put another six between a key and its note. So it is tuned
    // as glue rather than as a wall — slow, gentle, a few decibels at most —
    // and the ceiling is a soft clipper instead, which costs nothing in time.
    this.glue = ctx.createDynamicsCompressor();
    this.glue.threshold.value = -16;
    this.glue.knee.value = 10;
    this.glue.ratio.value = 2.5;
    this.glue.attack.value = 0.02;
    this.glue.release.value = 0.25;
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 9000;
    air.gain.value = 1.5;
    this.clip = ctx.createWaveShaper();
    this.clip.curve = softClip(2048);
    this.clip.oversample = this.lite ? 'none' : '2x';
    this.glue.connect(air).connect(this.clip).connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.settings.master;
    this.master.connect(this.glue);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.settings.music;
    this.musicBus.connect(this.master);

    this.fxBus = ctx.createGain();
    this.fxBus.gain.value = this.settings.effects;
    this.fxBus.connect(this.master);

    // Two rooms, both rendered rather than recorded (see `rooms.ts`). The
    // music plays in a hall; the ball rolls inside a cabinet, whose whole tail
    // is over in a third of a second. One knob opens both, and half travel
    // reproduces the fixed 0.85 the old room had, so the default is where the
    // sound has always been.
    this.hallConv = ctx.createConvolver();
    this.hallConv.buffer = this.room(this.lite ? HALL_LITE : HALL);
    this.hallWet = ctx.createGain();
    this.hallWet.gain.value = REVERB_MAX * this.settings.reverb;
    this.hallConv.connect(this.hallWet).connect(this.master);
    this.hallSend = ctx.createGain();
    this.hallSend.gain.value = 1;
    this.hallSend.connect(this.hallConv);

    const cab = ctx.createConvolver();
    cab.buffer = this.room(CAB);
    this.cabWet = ctx.createGain();
    this.cabWet.gain.value = CAB_MAX * this.settings.reverb;
    cab.connect(this.cabWet).connect(this.master);
    this.cabSend = ctx.createGain();
    this.cabSend.gain.value = 1;
    this.cabSend.connect(cab);

    // The soundboard, a plate with a dozen modes (see `rooms.ts`). A note sent
    // through it comes back with the board's own ring under it, and with the
    // pedal down the send opens up, which is what a piano does when its
    // dampers lift: every other string answers the one that was struck.
    const board = ctx.createConvolver();
    board.buffer = this.plate();
    this.bodyWet = ctx.createGain();
    this.bodyWet.gain.value = BODY_IDLE;
    board.connect(this.bodyWet).connect(this.musicBus);
    this.bodySend = ctx.createGain();
    this.bodySend.gain.value = 1;
    this.bodySend.connect(board);

    // Dotted-eighth delay, darkened on each pass so repeats sit behind the mix.
    const delay = ctx.createDelay(DELAY_MAX);
    this.delayNode = delay;
    delay.delayTime.value = dottedEighth(this.tempo);
    const feedback = ctx.createGain();
    feedback.gain.value = 0.34;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2400;
    delay.connect(damp).connect(feedback).connect(delay);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.6;
    damp.connect(delayOut).connect(this.master);
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 1;
    this.delaySend.connect(delay);

    // The bed's path. Carved first — nothing under 100 Hz, and a shelf off
    // the top — so it never sits on the same ground as the player's notes;
    // dipped under each struck note after that; and only then the fader the
    // bed is muted by, so the duck and the mute never fight over one gain.
    this.padCarve = ctx.createBiquadFilter();
    this.padCarve.type = 'highpass';
    this.padCarve.frequency.value = 100;
    this.padCarve.Q.value = 0.7;
    const padShelf = ctx.createBiquadFilter();
    padShelf.type = 'highshelf';
    padShelf.frequency.value = 6000;
    padShelf.gain.value = -3;
    this.padDuck = ctx.createGain();
    this.padDuck.gain.value = 1;
    this.padBus = ctx.createGain();
    this.padBus.gain.value = 1;
    this.padCarve.connect(padShelf);
    this.padDuck.connect(this.padBus).connect(this.musicBus);

    // The ensemble. Two short delays a few milliseconds apart, each swept by
    // its own slow oscillator and sent to one ear, alongside the dry path:
    // the string machine's chorus, which is what turns two saws into a
    // section. Between the carve and the duck, so the hall is sent the
    // widened bed and the duck dips all of it. How much of it is heard is
    // the bed voice's to say, through `ensemble`.
    const mono = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = 'explicit';
    const merge = ctx.createChannelMerger(2);
    for (const [ear, base, rate] of [[0, 0.012, 0.7], [1, 0.017, 0.53]] as const) {
      const line = ctx.createDelay(0.05);
      line.delayTime.value = base;
      const sweep = ctx.createGain();
      sweep.gain.value = 0.0022;
      this.lfoAt(rate).connect(sweep).connect(line.delayTime);
      mono.connect(line).connect(merge, 0, ear);
    }
    this.ensembleWet = ctx.createGain();
    this.ensembleWet.gain.value = 0;
    this.ensembleDry = ctx.createGain();
    this.ensembleDry.gain.value = 1;
    padShelf.connect(mono);
    merge.connect(this.ensembleWet).connect(this.padDuck);
    padShelf.connect(this.ensembleDry).connect(this.padDuck);
    const padReverb = ctx.createGain();
    padReverb.gain.value = 0.6;
    this.padBus.connect(padReverb).connect(this.hallSend);
    this.padGen = ctx.createGain();
    this.padGen.connect(this.padCarve);

    this.noise = makeNoise(ctx, 1.2);

    // Pitch bend, in cents, fanned out to every voice's detune.
    this.bendSource = ctx.createConstantSource();
    this.bendSource.offset.value = this.bendValue * this.settings.bendRange * 100;
    this.bendSource.start();

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5.2;
    this.lfoVibrato = ctx.createGain();
    this.lfoColour = ctx.createGain();
    this.lfoVibrato.gain.value = 0;
    this.lfoColour.gain.value = 0;
    lfo.connect(this.lfoVibrato);
    lfo.connect(this.lfoColour);
    lfo.start();
    this.applyMod();

    // The graph is built inside the first gesture, and so are the tables the
    // current instruments will want, so the first note pays for none of it.
    this.ready = true;
    this.warm(this.leadSpec);
    this.warm(this.bedSpec);
    this.warm(this.keyBedSpec);
    this.setEnsemble(this.bedSpec.ensemble ?? 0);
  }

  /**
   * A slow oscillator at this rate, shared by everything that asks for it.
   *
   * Motion is cheap to give a voice when the oscillator already exists — a
   * depth tap is one gain node — where an oscillator per note would be a
   * source per note on top of the ones that make the sound. Keyed to a
   * hundredth of a hertz, so two voices that move at nearly the same rate
   * move together.
   */
  private lfoAt(rate: number): OscillatorNode {
    const key = Math.round(rate * 100);
    let lfo = this.lfos.get(key);
    if (!lfo) {
      lfo = this.ctx!.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = key / 100;
      lfo.start();
      this.lfos.set(key, lfo);
    }
    return lfo;
  }

  /** How much of the bed goes through the ensemble. Ramped: a bed changes mid-chord. */
  private setEnsemble(mix: number): void {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    const m = clamp01(mix);
    this.ensembleWet.gain.setTargetAtTime(m, t, 0.1);
    // The dry path gives a little way as the wet comes up, or a wide bed is a louder bed.
    this.ensembleDry.gain.setTargetAtTime(1 - m * 0.5, t, 0.1);
  }

  setSettings(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    save(AUDIO_STORAGE_KEY, this.settings);
    if (!this.ready) return;
    this.master.gain.value = this.settings.master;
    this.musicBus.gain.value = this.settings.music;
    this.fxBus.gain.value = this.settings.effects;
    this.hallWet.gain.value = REVERB_MAX * this.settings.reverb;
    this.cabWet.gain.value = CAB_MAX * this.settings.reverb;
    if (patch.bendRange !== undefined) this.setBend(this.bendValue);
    if (patch.modTarget !== undefined) this.applyMod();
  }

  /**
   * Pitch bend, -1..1. Ramped rather than set, so a fast wheel sweep does not
   * zipper. The chord bed deliberately does not follow: only what the player is
   * holding bends.
   */
  setBend(value: number): void {
    this.bendValue = clamp(value, -1, 1);
    if (!this.ready || !this.ctx) return;
    this.bendSource.offset.setTargetAtTime(
      this.bendValue * this.settings.bendRange * 100, this.ctx.currentTime, 0.015);
  }

  /** Modulation depth, 0..1. */
  setMod(depth: number): void {
    this.modValue = clamp01(depth);
    this.applyMod();
  }

  get bend(): number { return this.bendValue; }
  get mod(): number { return this.modValue; }

  /** Centre the wheels. Leaving a mode must not leave the next one detuned. */
  resetExpression(): void {
    this.setBend(0);
    this.setMod(0);
  }

  private applyMod(): void {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    const target = this.settings.modTarget;
    const vibrato = target === 'colour' ? 0 : this.modValue * 42;
    const colour = target === 'vibrato' ? 0 : this.modValue * 900;
    this.lfoVibrato.gain.setTargetAtTime(vibrato, t, 0.02);
    this.lfoColour.gain.setTargetAtTime(colour, t, 0.02);
  }

  resetSettings(): void { this.setSettings(DEFAULT_AUDIO); }

  // ------------------------------------------------------------ instrument ---

  /**
   * Which instrument the keys play, and which the bed plays under them.
   *
   * Both take effect on the next note: anything already sounding finishes as
   * the voice it was struck as, which is what makes changing instrument
   * mid-phrase sound like a change rather than a glitch. An unknown id falls
   * back to the default rather than throwing, so dropping a voice from the
   * bank cannot strand a saved preference.
   */
  setLeadVoice(id: string): void {
    const voice = findLeadVoice(id);
    this.leadId = voice.id;
    this.leadSpec = voice.spec;
    this.warm(voice.spec);
  }

  setBedVoice(id: string): void {
    const voice = findBedVoice(id);
    this.bedId = voice.id;
    this.bedSpec = voice.spec;
    this.warm(voice.spec);
    this.setEnsemble(voice.spec.ensemble ?? 0);
  }

  /**
   * The instrument the keys take when they are voiced as a bed.
   *
   * Its own setting rather than `bedVoice`, because when the player is the one
   * holding the chords both parts are bed voices at once: this is what is under
   * their hands, `bedVoice` is what the game is playing against them, and the
   * two have to be different sounds or neither can be picked out.
   */
  setKeyBedVoice(id: string): void {
    const voice = findBedVoice(id);
    this.keyBedId = voice.id;
    this.keyBedSpec = voice.spec;
    this.warm(voice.spec);
  }

  /**
   * Whether a pressed key sounds like an instrument or like the bed.
   *
   * PlayTune's chord role is the reason this exists. The player there is not
   * playing notes that happen to be a chord, they are playing the layer the
   * game plays everywhere else — so it should be that layer, swelling and
   * sustaining, rather than a lead struck three times at once.
   */
  setKeyVoicing(mode: KeyVoicing): void { this.keyVoicingMode = mode; }

  get leadVoice(): string { return this.leadId; }
  get bedVoice(): string { return this.bedId; }
  get keyBedVoice(): string { return this.keyBedId; }
  get keyVoicing(): KeyVoicing { return this.keyVoicingMode; }

  /**
   * Point the tempo-locked effects at a new tempo.
   *
   * Only the delay cares so far, but it cares a lot: a dotted eighth is a
   * musical delay at one tempo and a smear at another, and it used to be
   * nailed to 96 bpm because nothing could change the tempo. Ramped rather
   * than set, because moving a delay line's length abruptly is a click.
   */
  setTempo(bpm: number): void {
    this.tempo = clamp(bpm, 20, 400);
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.delayNode.delayTime.setTargetAtTime(dottedEighth(this.tempo), t, 0.05);
  }

  /**
   * Fade the chord bed in or out. A fade rather than a cut, because a pad
   * stopping dead sounds like a fault rather than like a decision.
   */
  /**
   * End every pad already sounding, without silencing the ones to come.
   *
   * A mode that hands the bed back on its way out has only changed which voice
   * the *next* chord is built from; the one in the air keeps its own timbre for
   * the rest of its bar, which is how a nylon guitar ends up ringing over a
   * pinball table. Short enough not to click, quick enough to be gone before
   * the next mode has drawn a frame.
   */
  stopPads(fade = 0.12): void {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    const old = this.padGen;
    old.gain.cancelScheduledValues(t);
    old.gain.setValueAtTime(old.gain.value, t);
    old.gain.linearRampToValueAtTime(0.0001, t + fade);
    // The faded node is left to its sources, which stop themselves; what
    // matters is that nothing new is put through it.
    this.padGen = this.ctx.createGain();
    this.padGen.connect(this.padCarve);
  }

  setBedAudible(on: boolean): void {
    if (!this.ready || !this.ctx) return;
    this.padBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.08);
  }

  /**
   * Dip the bed under a note the player has just struck.
   *
   * A backing that stays at one level buries whatever is played over it, and
   * a compressor with a side-chain — the way a mix would do this — is not a
   * node the browser has. So the bed's own gain is nudged instead: a couple
   * of decibels down in a few milliseconds, held for the attack, and back
   * over a fifth of a second, which is under the ear's notice and enough to
   * keep the player on top of the band.
   */
  private duck(t: number): void {
    const g = this.padDuck.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(DUCK_FLOOR, t, 0.008);
    g.setTargetAtTime(1, t + DUCK_HOLD, DUCK_RETURN);
  }

  /**
   * Shed the sound's most expensive effects, or take them back.
   *
   * Follows the shell's adaptive quality: a machine that cannot keep the frame
   * budget with bloom on is not one to hand a two-and-a-half second hall and
   * an oversampled clipper. The hall is swapped for a shorter one in place —
   * a convolver takes a new response at any time — and the clipper drops its
   * oversampling.
   */
  setLite(on: boolean): void {
    if (this.lite === on) return;
    this.lite = on;
    if (!this.ready || !this.ctx) return;
    this.hallConv.buffer = this.room(on ? HALL_LITE : HALL);
    this.clip.oversample = on ? 'none' : '2x';
  }

  get isLite(): boolean { return this.lite; }

  /** A room, rendered at this context's sample rate, as a buffer the convolver takes. */
  private room(spec: RoomSpec): AudioBuffer {
    const ctx = this.ctx!;
    const [l, r] = roomImpulse(spec, ctx.sampleRate, makeRng(ROOM_SEED));
    return this.stereo(l, r);
  }

  /** The soundboard, rendered the same way. */
  private plate(): AudioBuffer {
    const ctx = this.ctx!;
    const [l, r] = boardImpulse(ctx.sampleRate, makeRng(ROOM_SEED + 1));
    return this.stereo(l, r);
  }

  private stereo(l: Samples, r: Samples): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(2, l.length, ctx.sampleRate);
    buf.copyToChannel(l, 0);
    buf.copyToChannel(r, 1);
    return buf;
  }

  get now(): number { return this.ctx ? this.ctx.currentTime : 0; }

  /** Measured round trip, for the diagnostics panel. */
  get latencyMs(): number {
    if (!this.ctx) return 0;
    const base = this.ctx.baseLatency ?? 0;
    const out = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return (base + out) * 1000;
  }

  // --------------------------------------------------------- key voices ---

  /** A pressed key. Velocity drives loudness *and* brightness. */
  noteOn(note: number, velocity: number, pan = 0): void {
    if (!this.running || !this.ctx) return;
    if (this.keyVoicingMode === 'bed') { this.bedKeyOn(note, velocity, pan); return; }
    const t = this.ctx.currentTime;
    this.noteOff(note, true);

    const v = clamp01(velocity);
    const freq = noteToFreq(note);
    const spec = this.leadSpec;
    // Everything about this strike that is arithmetic rather than a node.
    const k = keyFactors(spec.keyTrack, note);
    const h = humanize(Math.random, HUMANIZE * (spec.humanize ?? 1));
    const register = registerOf(note);
    const stretch = stretchCents(spec.stretch, note);
    const detunes = unisonDetunes(this.lite ? 1 : spec.unison?.voices ?? 1, spec.unison?.cents ?? 0);

    // Harder notes go wetter, whatever the instrument's own send level is.
    const chain = this.makeChain(pan, LEAD_WIDTH, {
      hall: spec.reverb * (1 + v * 0.7), cab: 0, delay: spec.delay * (1 + v * 1.4), body: spec.body,
    }, this.musicBus);
    const sources: Pitched[] = [];
    for (const layer of spec.layers) {
      sources.push(...this.addLayer(chain.filter, layer, freq, v, t, k, h, register, detunes, stretch));
    }
    // Breath, or the knock of the key itself: a slice of the shared buffer,
    // the same layer the drums are mostly made of.
    for (const n of noises(spec.noise)) this.addNoise(chain.filter, n, freq, v, t, k);
    this.attachExpression(sources, chain.filter);
    const peak = velocityPeak(v, spec.velDb) * spec.gain * k.level * h.level;
    this.applyEnvelope(chain, spec, freq, v, t, k, h, peak);
    this.duck(t);

    const voice: KeyVoice = {
      note, startedAt: t, sources, filter: chain.filter, amp: chain.amp, panner: chain.panner,
      freq, peak, k, release: spec.env.release * k.release, damper: spec.damper, releasing: false,
    };
    this.voices.set(note, voice);
    this.active.push(voice);
    this.cull();
  }

  /**
   * A pressed key, voiced as the bed rather than as an instrument.
   *
   * A `pad` is fire-and-forget: it is handed a length up front, which is right
   * for a scheduler and useless for a key, because nobody knows how long the
   * key will be down. So this builds the same oscillators out of the same
   * `BedSpec` but as a tracked voice — it swells in, holds, and releases when
   * the finger lifts, and it goes into `voices`/`active` alongside every other
   * key so culling, the sustain pedal and `allNotesOff` reach it unchanged.
   *
   * On `musicBus` and not `padBus` on purpose. The pad bus is what the backing
   * is muted and faded by, and the player's own hands are not the backing.
   */
  private bedKeyOn(note: number, velocity: number, pan: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noteOff(note, true);

    const v = clamp01(velocity);
    const freq = noteToFreq(note);
    const spec = this.keyBedSpec;
    const cut = spec.filter;
    const h = humanize(Math.random, HUMANIZE * BED_HUMANIZE);
    const detunes = unisonDetunes(this.lite ? 1 : spec.unison?.voices ?? 1, spec.unison?.cents ?? 0);

    // A pad lives further back in the room than a struck note does.
    const chain = this.makeChain(pan, LEAD_WIDTH, {
      hall: BED_KEY_REVERB * (1 + v * 0.5), cab: 0, delay: 0,
    }, this.musicBus);
    const sources: Pitched[] = [];
    for (const layer of spec.layers) {
      sources.push(...this.addLayer(chain.filter, layer, freq, v, t, NO_TRACK, h, registerOf(note), detunes, 0));
    }
    this.attachExpression(sources, chain.filter);

    // Swelled, not struck — but only just. A real pad attack would put the
    // sound behind the beat it was played on, and this is a rhythm game: the
    // press still has to be audible where the finger put it. Harder presses
    // arrive sooner, so playing into the key is how you sharpen it.
    const attack = BED_KEY_ATTACK * (1 - v * 0.45);
    const peak = (0.035 + v * 0.06) * spec.gain;
    const { amp, filter } = chain;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + attack);
    // A plucked bed voice is a plucked thing whoever is holding the key: a harp
    // that sustained until release would not be a harp.
    if (spec.pluck) amp.gain.exponentialRampToValueAtTime(0.0001, t + spec.pluck);

    filter.frequency.setValueAtTime(cut.start, t);
    filter.frequency.linearRampToValueAtTime(cut.peak * (0.55 + v * 0.6), t + attack + 0.12);
    // Settling part of the way back rather than all the way to `end`: the note
    // is still being held, so it darkens without going out.
    filter.frequency.linearRampToValueAtTime(
      cut.end + (cut.peak - cut.end) * 0.35, t + BED_KEY_SETTLE);
    filter.Q.value = cut.q;
    this.duck(t);

    const voice: KeyVoice = {
      note, startedAt: t, sources, filter, amp, panner: chain.panner,
      freq, peak, k: NO_TRACK, release: BED_KEY_RELEASE, releasing: false,
    };
    this.voices.set(note, voice);
    this.active.push(voice);
    this.cull();
  }

  // ------------------------------------------------------- voice builders ---

  /**
   * The nodes every pitched voice shares: one lowpass, one amplifier, one
   * panner, and whichever sends it was given. Layers are added in front of
   * the filter; the envelope is written onto the amplifier afterwards.
   */
  private makeChain(pan: number, width: number, sends: Sends, into: AudioNode): Chain {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const amp = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1) * width;
    filter.connect(amp).connect(panner);
    panner.connect(into);
    const send = (level: number, to: AudioNode) => {
      if (level <= 0) return;
      const g = ctx.createGain();
      g.gain.value = level;
      panner.connect(g).connect(to);
    };
    send(sends.hall, this.hallSend);
    send(sends.cab, this.cabSend);
    send(sends.delay, this.delaySend);
    send(sends.body ?? 0, this.bodySend);
    return { filter, amp, panner };
  }

  /**
   * One layer of a voice: its oscillator, its operator if it has one, and a
   * gain that is the layer's own envelope. Unison turns it into several
   * oscillators a few cents apart, each at a share of the level, so that the
   * sum lands where one oscillator did and only the width has changed.
   *
   * The only place the engine asks what a layer is made of. A basic wave is
   * the oscillator's own; a spectrum is a table from the cache.
   */
  private addLayer(
    into: AudioNode, layer: VoiceLayer, freq: number, v: number, t: number,
    k: KeyFactors, h: Humanized, register: Register, detunes: readonly number[], stretch: number,
  ): Pitched[] {
    const ctx = this.ctx!;
    const out: Pitched[] = [];
    const curve = layer.velCurve ? Math.pow(v, layer.velCurve) : 1;
    const level = Math.max(
      0.0001, ((layer.level + v * (layer.velLevel ?? 0)) * curve * h.level) / Math.sqrt(detunes.length));
    const attack = layer.attack ?? 0;
    const hold = layer.hold ?? 0;
    for (const d of detunes) {
      const osc = ctx.createOscillator();
      if (layer.type === 'spectrum') osc.setPeriodicWave(this.wave(layer.spectrum ?? DEFAULT_SPECTRUM, register));
      else osc.type = layer.type;
      osc.frequency.setValueAtTime(freq * layer.ratio, t);
      osc.detune.setValueAtTime((layer.detune ?? 0) + d + h.detune + stretch, t);

      if (layer.fm) {
        // Bright at the strike and gone a moment later, which is what turns a
        // sine into a tine. `ping` has always done this; here it is a field.
        const mod = ctx.createOscillator();
        mod.type = 'sine';
        mod.frequency.value = freq * layer.fm.ratio;
        const modGain = ctx.createGain();
        modGain.gain.setValueAtTime(freq * layer.fm.index, t);
        modGain.gain.exponentialRampToValueAtTime(1, t + layer.fm.decay);
        mod.connect(modGain).connect(osc.frequency);
        mod.start(t);
        out.push(mod);
      }

      const g = ctx.createGain();
      if (attack > 0) {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(level, t + attack);
      } else {
        g.gain.setValueAtTime(level, t);
      }
      if (hold > 0) g.gain.setValueAtTime(level, t + attack + hold);
      // A layer given a decay of its own dies before the note does: the
      // difference between a bell's strike and the tone left ringing under it.
      if (layer.decay) g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + layer.decay * k.decay);
      osc.connect(g).connect(into);
      osc.start(t);
      out.push(osc);
    }
    return out;
  }

  /**
   * A slice of the shared noise buffer under a note: breath, or a hammer.
   * Its band can follow the pitch, which is how a hammer's knock stays a
   * knock up the keyboard rather than turning into a hiss.
   */
  private addNoise(into: AudioNode, n: VoiceNoise, freq: number, v: number, t: number, k: KeyFactors): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = clamp(n.pitchTrack ? freq * n.pitchTrack : n.freq, 40, 16000);
    bp.Q.value = n.q;
    const g = ctx.createGain();
    const start = t + (n.delay ?? 0);
    const attack = n.attack ?? 0.002;
    const curve = n.velCurve ? Math.pow(v, n.velCurve) : 1;
    const level = Math.max(0.0001, n.gain * (0.5 + v * 0.5) * curve * k.noise);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(level, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + n.decay);
    src.connect(bp).connect(g).connect(into);
    src.start(start, Math.random() * 0.9, attack + n.decay + 0.02);
  }

  /**
   * The note's own envelope, on the amplifier and the filter together.
   *
   * Brightness tracks how hard the key was hit — most of why a synth reads as
   * an instrument rather than a beep — and closes as the note decays, the way
   * a struck string does. `decay` is measured from the strike, not from the
   * top of the attack, so a slow swell and a fast one still arrive at the
   * same place.
   */
  private applyEnvelope(
    chain: Chain, spec: VoiceSpec, freq: number, v: number, t: number,
    k: KeyFactors, h: Humanized, peak: number,
  ): void {
    const { filter: f, env } = spec;
    const attack = Math.max(0.001, env.attack * (1 - (spec.attackVel ?? 0) * v) * h.attack);
    const open = clamp(freq * (f.base + v * v * f.track) * k.bright * h.bright, 180, 15000);
    chain.filter.frequency.setValueAtTime(open, t);
    chain.filter.Q.value = f.q + v * f.qVel;
    chain.amp.gain.setValueAtTime(0.0001, t);
    chain.amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
    chain.amp.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, peak * env.sustain), t + Math.max(attack + 0.001, env.decay * k.decay));
    chain.filter.frequency.exponentialRampToValueAtTime(
      clamp(freq * (f.settle + v * f.settleVel) * k.bright, 160, 12000), t + f.settleTime);
  }

  /**
   * Expression rides on top of whatever the envelopes are doing, and it
   * reaches the operators too. Cents are a ratio, so detuning carrier and
   * operator by the same amount slides the whole spectrum together and keeps
   * the ratio the timbre is made of.
   */
  private attachExpression(sources: readonly Pitched[], filter: BiquadFilterNode): void {
    for (const s of sources) {
      this.bendSource.connect(s.detune);
      this.lfoVibrato.connect(s.detune);
    }
    this.lfoColour.connect(filter.frequency);
  }

  /** The wave for a spectrum layer in a register: built on the first request, kept after. */
  private wave(ref: SpectrumRef, register: Register): PeriodicWave {
    const key = spectrumKey(ref, register);
    let w = this.waves.get(key);
    if (!w) {
      const ctx = this.ctx!;
      const { real, imag } = spectrum(ref, register, ctx.sampleRate);
      w = ctx.createPeriodicWave(real, imag);
      this.waves.set(key, w);
    }
    return w;
  }

  /**
   * Build every table a voice will ask for, now rather than on its first note.
   * A periodic wave is a few dozen band-limited tables and a millisecond or
   * two to make, which is a millisecond or two the note path does not have.
   */
  private warm(spec: { layers: readonly VoiceLayer[] }): void {
    if (!this.ready) return;
    for (const layer of spec.layers) {
      if (layer.type !== 'spectrum') continue;
      for (const r of REGISTERS) this.wave(layer.spectrum ?? DEFAULT_SPECTRUM, r);
    }
  }

  noteOff(note: number, immediate = false): void {
    if (!this.running || !this.ctx) return;
    if (this.sustainOn && !immediate) { this.sustained.add(note); return; }
    const voice = this.voices.get(note);
    if (!voice || voice.releasing) return;
    this.release(voice, immediate ? 0.02 : voice.release, !immediate);
    this.voices.delete(note);
  }

  /**
   * Let a voice go. `damp` says whether a finger lifted: a damper falling
   * onto a string makes a sound of its own, but a note cut to make room for
   * another, or silenced with everything else on the way out of a mode, is
   * not a finger lifting, and forty-eight thuds at once would be absurd.
   */
  private release(voice: KeyVoice, seconds: number, damp = true): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    voice.releasing = true;
    if (damp && voice.damper && !this.lite) {
      // As loud as what is left of the note: a string that has already died
      // away has little for the damper to stop.
      const left = clamp01(voice.amp.gain.value / Math.max(0.0001, voice.peak));
      this.addNoise(voice.panner, voice.damper, voice.freq, left, t, voice.k);
    }
    voice.amp.gain.cancelScheduledValues(t);
    voice.amp.gain.setValueAtTime(Math.max(0.0001, voice.amp.gain.value), t);
    voice.amp.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    const stop = t + seconds + 0.02;
    for (const s of voice.sources) s.stop(stop);
    // The expression sources are permanent and hold a reference to every param
    // they feed, so a voice that is not explicitly unhooked never goes away.
    for (const s of voice.sources) {
      this.bendSource.disconnect(s.detune);
      this.lfoVibrato.disconnect(s.detune);
    }
    this.lfoColour.disconnect(voice.filter.frequency);
    const idx = this.active.indexOf(voice);
    if (idx >= 0) this.active.splice(idx, 1);
  }

  setSustain(on: boolean): void {
    this.sustainOn = on;
    // The pedal lifts every damper, and the board answers with all its strings.
    if (this.ready && this.ctx) {
      this.bodyWet.gain.setTargetAtTime(on ? BODY_PEDAL : BODY_IDLE, this.ctx.currentTime, 0.05);
    }
    if (on) return;
    for (const note of this.sustained) this.noteOff(note);
    this.sustained.clear();
  }

  /** Oldest-first voice stealing, so a two-handed run never runs out. */
  private cull(): void {
    while (this.active.length > MAX_VOICES) {
      const oldest = this.active[0];
      this.voices.delete(oldest.note);
      this.release(oldest, 0.05, false);
    }
  }

  allNotesOff(): void {
    for (const note of [...this.voices.keys()]) this.noteOff(note, true);
    this.sustained.clear();
  }

  // ------------------------------------------------------- one-shot hits ---

  /**
   * A tuned strike: what a scoring element sounds like when the ball hits it.
   * Mallet body plus a short noise transient, which is what makes it read as
   * something being struck rather than a note being played.
   *
   * `at` is an audio-clock time, like `drum`'s and `pad`'s: the table plays a
   * run of these — an objective's flourish, the bonus count at the end of a
   * ball — and a run has to be placed ahead rather than fired from a timer.
   * What is placed ahead can be taken back through the handle returned, which
   * is what lets a mode leave without its last flourish following it out.
   */
  mallet(note: number, gain = 0.5, pan = 0, bright = 0.5, at = 0): Scheduled {
    if (!this.running || !this.ctx) return NOTHING;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, at || ctx.currentTime);
    const freq = noteToFreq(note);
    const decay = 0.42 + bright * 0.5;

    const out = ctx.createGain();
    const pannerNode = ctx.createStereoPanner();
    pannerNode.pan.value = clamp(pan, -1, 1) * MALLET_WIDTH;
    out.connect(pannerNode);
    pannerNode.connect(this.musicBus);
    const rev = ctx.createGain(); rev.gain.value = 0.34;
    pannerNode.connect(rev).connect(this.hallSend);
    // A struck element is part of the machine as well as of the music.
    const box = ctx.createGain(); box.gain.value = 0.18;
    pannerNode.connect(box).connect(this.cabSend);
    const dly = ctx.createGain(); dly.gain.value = 0.2;
    pannerNode.connect(dly).connect(this.delaySend);

    for (const [mult, level, dec] of [[1, 1, 1], [2.01, 0.36, 0.62], [3.02, 0.14, 0.4]] as const) {
      const osc = ctx.createOscillator();
      osc.type = mult === 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq * mult, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * level * 0.5, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay * dec);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + decay * dec + 0.05);
    }

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = clamp(freq * 5, 400, 9000);
    bp.Q.value = 1.6;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.4, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(bp).connect(ng).connect(out);
    src.start(t, Math.random() * 0.8, 0.06);
    // Everything above reaches the buses through the panner, so cutting it
    // loose silences the strike whether it has started yet or not.
    return { cancel: () => pannerNode.disconnect() };
  }

  /** Ball meeting a surface. Loudness and brightness follow the impact energy. */
  impact(tag: string, energy: number, pan = 0, note: number | null = null): void {
    if (!this.running || !this.ctx) return;
    const profile = IMPACTS[tag] ?? IMPACTS.wood;
    if (profile.gain <= 0) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const e = clamp01(energy / 1500);
    const level = profile.gain * (0.1 + e * 0.9) * 0.6;
    if (level < 0.004) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.45;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(profile.freq * (0.85 + e * 0.7), t);
    bp.Q.value = profile.q;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 120;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + profile.decay * (0.6 + e * 0.8));
    const pannerNode = ctx.createStereoPanner();
    pannerNode.pan.value = clamp(pan, -1, 1);
    src.connect(bp).connect(hp).connect(g).connect(pannerNode);
    pannerNode.connect(this.fxBus);
    // Mostly the box, a little of the hall: the ball is inside the machine.
    const rev = ctx.createGain(); rev.gain.value = 0.12;
    pannerNode.connect(rev).connect(this.hallSend);
    const box = ctx.createGain(); box.gain.value = 0.55;
    pannerNode.connect(box).connect(this.cabSend);
    src.start(t, Math.random() * 0.9, 0.4);

    // Metallic surfaces also ring at a pitch, so even incidental sounds carry
    // the table's tuning.
    if (note !== null && profile.tone > 0.4) {
      this.ping(noteToFreq(note), level * 0.5, pan, profile.decay * 2.5);
    }
  }

  /**
   * A drum hit, from the voice bank in `drums.ts`.
   *
   * `at` is an audio-clock time, like `pad`'s and `mallet`'s — the three
   * schedulable voices in the engine. Everything else here plays the instant
   * it is called, because everything else is a reaction to something the
   * player just did; a drum machine is the opposite, and has to place a hit
   * on a step that has not arrived yet.
   */
  drum(voice: DrumVoice, gain = 1, at = 0): Scheduled {
    if (!this.running || !this.ctx) return NOTHING;
    const spec = DRUM_SPECS[voice];
    const level = spec.gain * clamp01(gain);
    if (level < 0.004) return NOTHING;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, at || ctx.currentTime);

    const out = ctx.createStereoPanner();
    out.pan.value = clamp(spec.pan, -1, 1);
    out.connect(this.musicBus);
    const rev = ctx.createGain();
    rev.gain.value = spec.reverb;
    out.connect(rev).connect(this.hallSend);
    const box = ctx.createGain();
    box.gain.value = 0.18;
    out.connect(box).connect(this.cabSend);
    const handle: Scheduled = { cancel: () => out.disconnect() };

    if (spec.noiseFreq > 0) {
      // A handclap is several bursts a few milliseconds apart; every other
      // voice is one. Same code either way.
      for (let b = 0; b < spec.bursts; b++) {
        const start = t + b * spec.burstGap;
        // The last burst carries the tail; the flams before it are shorter.
        const decay = b === spec.bursts - 1 ? spec.noiseDecay : spec.burstGap * 1.4;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.playbackRate.value = 0.85 + Math.random() * 0.3;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = spec.noiseFreq;
        bp.Q.value = spec.noiseQ;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = spec.noiseHp;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(level * spec.noiseGain, start + spec.noiseAttack);
        g.gain.exponentialRampToValueAtTime(0.0001, start + spec.noiseAttack + decay);
        src.connect(bp).connect(hp).connect(g).connect(out);
        src.start(start, Math.random() * 0.9, spec.noiseAttack + decay + 0.02);
      }
    }

    if (spec.tone.length === 0) return handle;
    let toneIn: AudioNode = out;
    if (spec.toneBp > 0) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = spec.toneBp;
      bp.Q.value = spec.toneBpQ;
      bp.connect(out);
      toneIn = bp;
    }
    for (const [freq, share, decayShare, type] of spec.tone) {
      const osc = ctx.createOscillator();
      osc.type = type;
      // The fall from `pitchDrop` down to the pitch is what turns a sine into
      // a kick drum: the ear hears the drop as the head, not as a note.
      osc.frequency.setValueAtTime(freq * spec.pitchDrop, t);
      if (spec.pitchDrop !== 1) {
        osc.frequency.exponentialRampToValueAtTime(freq, t + spec.pitchTime);
      }
      const decay = spec.toneDecay * decayShare;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level * share, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(g).connect(toneIn);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
    return handle;
  }

  /** Short FM ping used for chrome and wire. */
  ping(freq: number, gain: number, pan: number, decay: number): void {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * 2.41;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 2.4, t);
    modGain.gain.exponentialRampToValueAtTime(1, t + decay * 0.5);
    mod.connect(modGain).connect(carrier.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const pannerNode = ctx.createStereoPanner();
    pannerNode.pan.value = clamp(pan, -1, 1);
    carrier.connect(g).connect(pannerNode);
    pannerNode.connect(this.fxBus);
    const rev = ctx.createGain(); rev.gain.value = 0.3;
    pannerNode.connect(rev).connect(this.hallSend);
    const box = ctx.createGain(); box.gain.value = 0.3;
    pannerNode.connect(box).connect(this.cabSend);
    carrier.start(t); mod.start(t);
    carrier.stop(t + decay + 0.05); mod.stop(t + decay + 0.05);
  }

  /** Filtered-noise swell, for drains and multiball. */
  swell(up: boolean, seconds = 1.1, gain = 0.34): void {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(up ? 260 : 2600, t);
    bp.frequency.exponentialRampToValueAtTime(up ? 3400 : 180, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + seconds * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(bp).connect(g).connect(this.fxBus);
    const rev = ctx.createGain(); rev.gain.value = 0.5;
    g.connect(rev).connect(this.hallSend);
    const box = ctx.createGain(); box.gain.value = 0.3;
    g.connect(box).connect(this.cabSend);
    src.start(t);
    src.stop(t + seconds + 0.05);
  }

  /**
   * A chord from the backing bed. `at` is an audio-clock time, so a scheduler
   * with a lookahead can place one on a downbeat that has not arrived yet.
   *
   * `attack` is what makes this one voice serve both jobs the bed has: left at
   * its default the chord swells, which is the sustained bed; shortened to a
   * few milliseconds the same voice is a struck chord, which is what an
   * accompaniment pattern comps with. A separate percussive voice would have
   * meant a second timbre, and `mallet` in particular feeds a delay whose time
   * is pinned to the tempo.
   *
   * One filter and one envelope per note, in front of every layer. The layers
   * used to carry one each, all identical — and a sum of identical linear
   * filters is the same signal through a single one, at a third of the cost.
   */
  pad(notes: readonly number[], seconds: number, gain = 0.1, at = 0, attack = seconds * 0.35): void {
    if (!this.running || !this.ctx || !this.settings.bed) return;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, at || ctx.currentTime);
    const rise = clamp(attack, 0.004, seconds * 0.9);
    const spec = this.bedSpec;
    // A plucked thing is struck by definition, whatever attack it was handed:
    // the string is already moving before the pad it replaced had begun.
    const fall = spec.pluck ? Math.max(0.02, Math.min(spec.pluck, seconds)) : 0;
    // A struck chord opens brighter and faster than a swell; without this the
    // filter is still on its way up by the time a short stab has gone.
    const struck = fall > 0 || rise < seconds * 0.2;
    const cut = spec.filter;
    const share = (gain / notes.length) * spec.gain;
    const detunes = unisonDetunes(this.lite ? 1 : spec.unison?.voices ?? 1, spec.unison?.cents ?? 0);
    for (let i = 0; i < notes.length; i++) {
      const freq = noteToFreq(notes[i]);
      const h = humanize(Math.random, HUMANIZE * BED_HUMANIZE);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(struck ? cut.startStruck : cut.start, t);
      f.frequency.linearRampToValueAtTime(
        struck ? cut.peakStruck : cut.peak,
        t + (fall ? Math.min(fall * 0.1, 0.02) : struck ? Math.min(seconds * 0.9, rise + 0.03) : seconds * 0.5),
      );
      // Brightness dies with the note, not with the bar it was given.
      f.frequency.linearRampToValueAtTime(cut.end, t + (fall || seconds));
      f.Q.value = cut.q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      if (fall) {
        // Struck and left to ring. The caller still owns how long the note
        // occupies — a plucked voice only decides what happens inside it.
        g.gain.exponentialRampToValueAtTime(share, t + Math.min(0.006, fall * 0.2));
        g.gain.exponentialRampToValueAtTime(0.0001, t + fall);
      } else {
        g.gain.linearRampToValueAtTime(share, t + rise);
        g.gain.linearRampToValueAtTime(0.0001, t + seconds);
      }
      const pannerNode = ctx.createStereoPanner();
      pannerNode.pan.value = (i / Math.max(1, notes.length - 1) - 0.5) * 0.7;
      f.connect(g).connect(pannerNode);
      pannerNode.connect(this.padGen);
      for (const layer of spec.layers) {
        for (const s of this.addLayer(f, layer, freq, 0.5, t, NO_TRACK, h, registerOf(notes[i]), detunes, 0)) {
          s.stop(t + seconds + 0.1);
        }
      }
    }
  }
}

/**
 * The ceiling: a hyperbolic tangent, unity through the middle and rounding
 * off towards full scale. Everything the game makes sums into this, so the
 * loudest multiball leans on it rather than on the converter's hard edge.
 */
function softClip(points: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) curve[i] = Math.tanh((i / (points - 1)) * 2 - 1);
  return curve;
}

function makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
