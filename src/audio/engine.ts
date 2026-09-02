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
import { Lru, renderString, velocityBucket, type Bucket, type StringSpec } from './strings';
import {
  MECHS, SURFACES, ShotBudget, modeQ, type Click, type MechName, type Sweep, type Thump,
} from './surfaces';
import type { SoundTag } from '../physics/colliders';
import {
  DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE, findBedVoice, findLeadVoice, noises,
  type BedSpec, type VoiceLayer, type VoiceLfo, type VoiceNoise, type VoiceSpec,
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

/**
 * A source with a pitch to bend: an oscillator, or a rendered string. Both
 * carry `detune` in cents, which is what lets one bend reach either.
 */
type Pitched = OscillatorNode | AudioBufferSourceNode;

const isOscillator = (s: Pitched): s is OscillatorNode => 'frequency' in s;

/** Which rendered string a layer plays: the voice it belongs to, and the note and pluck. */
interface StringAt {
  id: string;
  spec: StringSpec;
  note: number;
  bucket: Bucket;
}

/**
 * A ball's rolling sound, alive for as long as the ball is. Fed once a
 * frame; smoothed on the audio side, so a frame's worth of change is a slope
 * rather than a step.
 */
export interface RollHandle {
  /** `speed` in table units a second, `contact` how much of the ball is on the table, 0..1. */
  update(speed: number, contact: number, pan: number, depth: number): void;
  stop(): void;
}

/** A roll that never reached the graph. */
const NO_ROLL: RollHandle = { update() {}, stop() {} };

/** Speed at which a roll is as loud as it gets, and how loud that is. */
const ROLL_FULL = 1800;
const ROLL_GAIN = 0.12;
/** Sliding speed at which a scrape is as loud as it gets, and how loud that is. */
const SCRAPE_FULL = 1800;
const SCRAPE_GAIN = 0.25;

/** Where a hit is placed and how it landed. All optional: a bare hit is square, near and centred. */
interface HitOptions {
  pan?: number;
  /** How far up the table, 0 at the keys and 1 at the far wall. */
  depth?: number;
  /** How square the hit was: 1 head-on, 0 a graze. */
  glance?: number;
  /** The struck element's note, for surfaces that ring at it. */
  note?: number | null;
  at?: number;
}

/** Closing speed that counts as a full-strength hit, in table units per second. */
const IMPACT_FULL = 1500;
/** How much quieter the softest hit that still sounds is than the hardest. */
const HIT_RANGE_DB = 24;
/** Sends for the table's sounds: mostly the box, a little of the hall. The ball is inside the machine. */
const HIT_HALL = 0.12;
const HIT_CAB = 0.55;
const MECH_HALL = 0.1;
const MECH_CAB = 0.5;
/** How long a mechanism holds its place in the budget. */
const MECH_SECONDS = 0.5;
/** Table one-shots allowed at once, and on a machine that has been found wanting. */
const MAX_SHOTS = 14;
const MAX_SHOTS_LITE = 8;

/** Fade a one-shot out in a few milliseconds when the budget takes its place back. */
function cutShort(out: GainNode, now: number): void {
  out.gain.cancelScheduledValues(now);
  out.gain.setValueAtTime(out.gain.value, now);
  out.gain.linearRampToValueAtTime(0, now + 0.01);
}

/**
 * How much harder a narrow resonator has to be driven. A narrow band takes
 * little of a burst's energy and rings quietly for it; the square root is
 * the middle ground between an impulse's response and a steady one's, and
 * the cap keeps a glass mode from being a whistle.
 */
const ringGain = (q: number) => Math.min(12, Math.sqrt(Math.max(1, q)));

/** Most rendered strings kept, and their weight: half a megabyte a second at 48 kHz. */
const STRING_ENTRIES = 120;
const STRING_BYTES = 24 * 1024 * 1024;
/** Notes a string voice is rendered for on the way in, and how many per idle turn. */
const WARM_FROM = 48;
const WARM_TO = 84;
const WARM_CHUNK = 8;

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
  /** The voice's motion, tapped off the shared oscillators. Unhooked on release. */
  taps: Tap[];
  releasing: boolean;
}

/** One connection from a pooled oscillator to a voice, through its own depth. */
interface Tap {
  lfo: OscillatorNode;
  gain: GainNode;
}

/** The nodes every pitched voice shares, whatever its layers are made of. */
interface Chain {
  filter: BiquadFilterNode;
  amp: GainNode;
  panner: StereoPannerNode;
  /** A gain after the amplifier for tremolo to move, when the voice has any. */
  trem: GainNode | null;
}

/** Seconds a delayed motion takes to come up once its delay has passed. */
const MOTION_RISE = 0.4;
/** Cents of vibrato a rotary's horn adds at full depth. */
const ROTARY_CENTS = 9;
/** How far a rotary swings the note between the ears. */
const ROTARY_SWING = 0.45;

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
  /** Rendered strings, by voice, note and pluck. */
  private strings = new Lru<AudioBuffer>(STRING_ENTRIES, STRING_BYTES);
  /** The table's one-shots sounding now, so a multiball never turns to noise. */
  private shots = new ShotBudget(MAX_SHOTS);
  /** Which warm-up is current; an older one finding this changed stops. */
  private warming = 0;
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
    if (voice.spec.string) this.warmStrings(voice.id, voice.spec.string);
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
    this.shots.max = on ? MAX_SHOTS_LITE : MAX_SHOTS;
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
    const str = spec.string && { id: this.leadId, spec: spec.string, note, bucket: velocityBucket(v) };

    // Harder notes go wetter, whatever the instrument's own send level is.
    const moves = spec.lfo?.target === 'tremolo' || spec.lfo?.target === 'rotary';
    const chain = this.makeChain(pan, LEAD_WIDTH, {
      hall: spec.reverb * (1 + v * 0.7), cab: 0, delay: spec.delay * (1 + v * 1.4), body: spec.body,
    }, this.musicBus, moves);
    const sources: Pitched[] = [];
    for (const layer of spec.layers) {
      sources.push(...this.addLayer(chain.filter, layer, freq, v, t, k, h, register, detunes, stretch, str));
    }
    // Breath, or the knock of the key itself: a slice of the shared buffer,
    // the same layer the drums are mostly made of.
    for (const n of noises(spec.noise)) this.addNoise(chain.filter, n, freq, v, t, k);
    const taps = this.attachExpression(sources, chain, spec.lfo, t);
    const peak = velocityPeak(v, spec.velDb) * spec.gain * k.level * h.level;
    this.applyEnvelope(chain, spec, freq, v, t, k, h, peak);
    this.duck(t);

    const voice: KeyVoice = {
      note, startedAt: t, sources, filter: chain.filter, amp: chain.amp, panner: chain.panner,
      freq, peak, k, release: spec.env.release * k.release, damper: spec.damper, taps, releasing: false,
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
    const str = spec.string && { id: this.keyBedId, spec: spec.string, note, bucket: velocityBucket(v) };

    // A pad lives further back in the room than a struck note does.
    const chain = this.makeChain(pan, LEAD_WIDTH, {
      hall: BED_KEY_REVERB * (1 + v * 0.5), cab: 0, delay: 0,
    }, this.musicBus);
    const sources: Pitched[] = [];
    for (const layer of spec.layers) {
      sources.push(...this.addLayer(chain.filter, layer, freq, v, t, NO_TRACK, h, registerOf(note), detunes, 0, str));
    }
    this.attachExpression(sources, chain, undefined, t);

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
      freq, peak, k: NO_TRACK, release: BED_KEY_RELEASE, taps: [], releasing: false,
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
  private makeChain(pan: number, width: number, sends: Sends, into: AudioNode, moves = false): Chain {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const amp = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1) * width;
    // Tremolo wants a gain of its own to swing about one: summed onto the
    // amplifier it would ride the envelope instead of multiplying it, and be
    // all that was left once the note had died away.
    let trem: GainNode | null = null;
    if (moves) {
      trem = ctx.createGain();
      trem.gain.value = 1;
      filter.connect(amp).connect(trem).connect(panner);
    } else {
      filter.connect(amp).connect(panner);
    }
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
    return { filter, amp, panner, trem };
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
    str?: StringAt,
  ): Pitched[] {
    const ctx = this.ctx!;
    const out: Pitched[] = [];
    const curve = layer.velCurve ? Math.pow(v, layer.velCurve) : 1;
    const level = Math.max(
      0.0001, ((layer.level + v * (layer.velLevel ?? 0)) * curve * h.level) / Math.sqrt(detunes.length));
    const attack = layer.attack ?? 0;
    const hold = layer.hold ?? 0;
    for (const d of detunes) {
      let osc: Pitched;
      if (layer.type === 'string' && str) {
        // Rendered at the note itself; a layer set above it plays the same
        // render faster, which is near enough for an octave.
        const src = ctx.createBufferSource();
        src.buffer = this.stringBuffer(str);
        if (layer.ratio !== 1) src.playbackRate.value = layer.ratio;
        osc = src;
      } else {
        const o = ctx.createOscillator();
        if (layer.type === 'spectrum') o.setPeriodicWave(this.wave(layer.spectrum ?? DEFAULT_SPECTRUM, register));
        else if (layer.type !== 'string') o.type = layer.type;
        o.frequency.setValueAtTime(freq * layer.ratio, t);
        osc = o;
      }
      osc.detune.setValueAtTime((layer.detune ?? 0) + d + h.detune + stretch, t);

      if (layer.fm && isOscillator(osc)) {
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
   *
   * A voice's own motion is wired the same way, from the shared oscillator
   * at its rate through a depth of its own — one gain node, whatever it
   * moves. Delayed motion holds that depth at nothing until the delay has
   * passed and then brings it up over a moment, which is how a real vibrato
   * arrives: on the held note, never on the attack.
   */
  private attachExpression(
    sources: readonly Pitched[], chain: Chain, lfo: VoiceLfo | undefined, t: number,
  ): Tap[] {
    for (const s of sources) {
      this.bendSource.connect(s.detune);
      this.lfoVibrato.connect(s.detune);
    }
    this.lfoColour.connect(chain.filter.frequency);
    const taps: Tap[] = [];
    if (!lfo) return taps;
    const ctx = this.ctx!;
    const tap = (rate: number, depth: number, to: readonly AudioParam[]) => {
      const gain = ctx.createGain();
      const delay = lfo.delay ?? 0;
      if (delay > 0) {
        gain.gain.setValueAtTime(0, t);
        gain.gain.setValueAtTime(0, t + delay);
        gain.gain.linearRampToValueAtTime(depth, t + delay + MOTION_RISE);
      } else {
        gain.gain.value = depth;
      }
      const osc = this.lfoAt(rate);
      osc.connect(gain);
      for (const param of to) gain.connect(param);
      taps.push({ lfo: osc, gain });
    };
    const detunes = sources.map((s) => s.detune);
    switch (lfo.target) {
      case 'tremolo':
        if (chain.trem) tap(lfo.rate, lfo.depth, [chain.trem.gain]);
        break;
      case 'vibrato':
        tap(lfo.rate, lfo.depth, detunes);
        break;
      case 'filter':
        tap(lfo.rate, lfo.depth, [chain.filter.frequency]);
        break;
      case 'rotary':
        // The horn: its level and, through the Doppler of its spin, its
        // pitch, both at the rotor's rate. The cabinet: the sound swung
        // slowly between the ears.
        if (chain.trem) tap(lfo.rate, lfo.depth, [chain.trem.gain]);
        tap(lfo.rate, lfo.depth * ROTARY_CENTS, detunes);
        tap(lfo.rate2 ?? lfo.rate / 8, ROTARY_SWING, [chain.panner.pan]);
        break;
    }
    return taps;
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

  /**
   * The rendered string a layer asks for, from the cache or from scratch.
   *
   * A miss costs about a millisecond, which the note path can afford once;
   * the same note rendered again comes out the same, because its noise is
   * seeded by the note, so the cache forgetting an entry is not a change of
   * sound. Pads are placed ahead of time and never notice a miss at all.
   */
  private stringBuffer(at: StringAt): AudioBuffer {
    const key = `${at.id}:${at.note}:${at.bucket}`;
    let buf = this.strings.get(key);
    if (!buf) {
      const ctx = this.ctx!;
      const data = renderString(at.spec, at.note, at.bucket, ctx.sampleRate, makeRng(at.note * 8 + at.bucket));
      buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.copyToChannel(data, 0);
      this.strings.set(key, buf, data.length * 4);
    }
    return buf;
  }

  /**
   * Render the middle of the keyboard for a string voice on the way in, a
   * few notes per idle turn, so the first phrase played on it hits nothing
   * but the cache. A newer voice arriving stops an older warm-up.
   */
  private warmStrings(id: string, spec: StringSpec): void {
    if (!this.ready) return;
    const token = ++this.warming;
    const todo: StringAt[] = [];
    for (let note = WARM_FROM; note <= WARM_TO; note++) {
      for (const bucket of [2, 3] as const) todo.push({ id, spec, note, bucket });
    }
    const step = () => {
      if (token !== this.warming || !this.ready) return;
      for (const at of todo.splice(0, WARM_CHUNK)) this.stringBuffer(at);
      if (todo.length) setTimeout(step, 0);
    };
    setTimeout(step, 0);
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
    // The pooled oscillators are permanent too, and hold every tap they feed.
    for (const { lfo, gain } of voice.taps) {
      lfo.disconnect(gain);
      gain.disconnect();
    }
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

  // ------------------------------------------------------------ the table ---

  /**
   * The ball meeting a surface: the surface's own modes, rung.
   *
   * A short burst of noise — shorter and brighter the harder the hit — is put
   * through a bank of resonators at the surface's modes, each ringing for its
   * own time (see `surfaces.ts`). Rubber thumps, wood knocks, a post rings.
   * `glance` is how square the hit was, one being head-on; `depth` how far up
   * the table, one being the far wall, and a far hit is quieter and duller.
   * Metal and glass also ring at the element's note when it has one, so even
   * the incidental sounds carry the table's tuning.
   */
  hit(tag: SoundTag, energy: number, opts: HitOptions = {}): void {
    if (!this.running || !this.ctx) return;
    const s = SURFACES[tag];
    if (!s || s.gain <= 0) return;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, opts.at ?? 0);
    const e = clamp01(energy / IMPACT_FULL);
    const square = clamp01(opts.glance ?? 1);
    const depth = clamp01(opts.depth ?? 0);
    const level = s.gain * Math.pow(10, ((e - 1) * HIT_RANGE_DB) / 20) * (0.6 + 0.4 * square) * (1 - 0.35 * depth);
    if (level < 0.003) return;
    const ring = s.modes.reduce((m, [, , t60]) => Math.max(m, t60), 0);
    const out = ctx.createGain();
    const prio = tag === 'bumper' || tag === 'key' ? 2 : 1;
    if (!this.shots.admit(t, prio, t + ring + 0.05, () => cutShort(out, ctx.currentTime))) return;

    // The excitation: a few milliseconds of noise, dulled by a soft hit and
    // sharpened by a glancing one.
    const burst = (s.burst / 1000) * (1.4 - 0.8 * e);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const exc = ctx.createBiquadFilter();
    exc.type = 'lowpass';
    exc.frequency.value = Math.min(18000, (s.bright + (s.velBright - s.bright) * e) * (1 + 0.5 * (1 - square)));
    const drive = ctx.createGain();
    drive.gain.setValueAtTime(level, t);
    drive.gain.exponentialRampToValueAtTime(0.0001, t + burst);
    src.connect(exc).connect(drive);

    // The modes: one resonator each, a harder hit pushing the bank up a little.
    const sum = ctx.createGain();
    const base = s.base * (0.95 + 0.1 * e);
    for (const [ratio, gain, t60] of s.modes) {
      const f = Math.min(18000, base * ratio);
      const q = modeQ(f, t60);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain * ringGain(q);
      drive.connect(bp).connect(g).connect(sum);
    }
    // Distance: the far end of the table is duller as well as quieter.
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 12000 * Math.pow(2, -depth);
    sum.connect(dark).connect(out);
    if (s.thump) this.thump(out, s.thump, level, t);
    this.place(out, opts.pan ?? 0, HIT_HALL, HIT_CAB);
    src.start(t, Math.random() * 0.9, burst + 0.02);

    if (opts.note != null && s.tuned) this.ping(noteToFreq(opts.note), level * 0.4, opts.pan ?? 0, ring);
  }

  /**
   * The machine itself: a flipper's solenoid, the plunger's spring, a target
   * dropping, a switch closing under a rollover. Each is a few of the same
   * primitives — a pitch-dropping thump, a click of noise, a sweep, a surface
   * rung — put together in `surfaces.ts`. Schedulable like a drum, because a
   * spinner's ticks are placed ahead as it slows, and cancellable like one.
   */
  mech(name: MechName, gain = 1, pan = 0, at = 0): Scheduled {
    if (!this.running || !this.ctx) return NOTHING;
    const m = MECHS[name];
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, at || ctx.currentTime);
    const level = clamp01(gain);
    if (level < 0.01) return NOTHING;
    const out = ctx.createGain();
    if (!this.shots.admit(t, 3, t + MECH_SECONDS, () => cutShort(out, ctx.currentTime))) return NOTHING;
    if (m.thump) this.thump(out, m.thump, level, t + (m.thump.delay ?? 0));
    if (m.click) this.burst(out, m.click, level, t + (m.click.delay ?? 0));
    if (m.rattle) this.burst(out, m.rattle, level, t + (m.rattle.delay ?? 0));
    if (m.sweep) this.sweep(out, m.sweep, level, t);
    this.place(out, pan, MECH_HALL, MECH_CAB);
    if (m.surface) this.hit(m.surface.tag, m.surface.energy * IMPACT_FULL * level, { pan, at: t });
    return { cancel: () => out.disconnect() };
  }

  /**
   * The ball rolling: noise, banded by its speed, under every ball on the
   * table. A roll is a state rather than an event, so it is a handle the
   * mode feeds once a frame rather than a call, and it is gone the moment
   * the ball is. Every parameter is ramped, so a frame's worth of change
   * never zips.
   */
  roll(): RollHandle {
    if (!this.running || !this.ctx) return NO_ROLL;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 120;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0;
    const panner = ctx.createStereoPanner();
    src.connect(hp).connect(bp).connect(g).connect(panner);
    panner.connect(this.fxBus);
    const box = ctx.createGain();
    box.gain.value = 0.4;
    panner.connect(box).connect(this.cabSend);
    src.start();
    let stopped = false;
    return {
      update: (speed, contact, pan, depth) => {
        if (stopped) return;
        const t = ctx.currentTime;
        const s = clamp01(speed / ROLL_FULL);
        const level = Math.pow(s, 1.3) * clamp01(contact) * ROLL_GAIN * (1 - 0.35 * clamp01(depth));
        g.gain.setTargetAtTime(level, t, 0.05);
        bp.frequency.setTargetAtTime(300 + 1500 * s, t, 0.08);
        panner.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.05);
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(0, t, 0.03);
        src.stop(t + 0.2);
      },
    };
  }

  /** The ball grazing a surface: a short scrape, brighter and longer the faster it slid. */
  scrape(slide: number, pan = 0, depth = 0): void {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const s = clamp01(slide / SCRAPE_FULL);
    const level = Math.pow(s, 1.2) * SCRAPE_GAIN * (1 - 0.35 * clamp01(depth));
    if (level < 0.003) return;
    const t = ctx.currentTime;
    const seconds = 0.04 + 0.08 * s;
    const out = ctx.createGain();
    if (!this.shots.admit(t, 0, t + seconds, () => cutShort(out, ctx.currentTime))) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(12000, 800 + 0.8 * slide);
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(bp).connect(g).connect(out);
    this.place(out, pan, HIT_HALL, HIT_CAB);
    src.start(t, Math.random() * 0.9, seconds + 0.02);
  }

  /** A one-shot's way out: through a panner to the effects bus and the two rooms. */
  private place(out: AudioNode, pan: number, hall: number, cab: number): void {
    const ctx = this.ctx!;
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    out.connect(panner);
    panner.connect(this.fxBus);
    const rev = ctx.createGain();
    rev.gain.value = hall;
    panner.connect(rev).connect(this.hallSend);
    const box = ctx.createGain();
    box.gain.value = cab;
    panner.connect(box).connect(this.cabSend);
  }

  /** A sine falling onto its pitch: the body of a thump, the recipe a kick drum uses. */
  private thump(into: AudioNode, th: Thump, level: number, t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(th.freq * th.drop, t);
    osc.frequency.exponentialRampToValueAtTime(th.freq, t + th.decay * 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * th.gain), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + th.decay);
    osc.connect(g).connect(into);
    osc.start(t);
    osc.stop(t + th.decay + 0.05);
  }

  /** A slice of noise through a bandpass: a click, a rattle, a knock. */
  private burst(into: AudioNode, c: Click, level: number, t: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = c.freq;
    bp.Q.value = c.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0001, level * c.gain), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + c.decay);
    src.connect(bp).connect(g).connect(into);
    src.start(t, Math.random() * 0.9, c.decay + 0.02);
  }

  /** A sine sliding between two pitches and dying: a spring letting go. */
  private sweep(into: AudioNode, sw: Sweep, level: number, t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(sw.from, t);
    osc.frequency.exponentialRampToValueAtTime(sw.to, t + sw.time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * sw.gain), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sw.decay);
    osc.connect(g).connect(into);
    osc.start(t);
    osc.stop(t + sw.decay + 0.05);
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
    const v = clamp01(gain);
    const level = spec.gain * v;
    if (level < 0.004) return NOTHING;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, at || ctx.currentTime);
    // A soft hit is a shorter, duller one: a ghost note is over almost before
    // it has begun, and a hard one opens the head up.
    const shorten = 1 - (spec.velDecay ?? 0) * (1 - v);
    const brighten = Math.pow(2, (spec.velBright ?? 0) * (v - 0.5));

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
        const decay = (b === spec.bursts - 1 ? spec.noiseDecay : spec.burstGap * 1.4) * shorten;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.playbackRate.value = 0.85 + Math.random() * 0.3;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = Math.min(18000, spec.noiseFreq * brighten);
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

    if (spec.wires) {
      // The snare's wires: their own noise, higher and looser, ringing on
      // after the shell has stopped.
      const w = spec.wires;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(18000, w.freq * brighten);
      bp.Q.value = w.q;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = w.hp;
      const g = ctx.createGain();
      const decay = w.decay * shorten;
      g.gain.setValueAtTime(level * w.gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      src.connect(bp).connect(hp).connect(g).connect(out);
      src.start(t, Math.random() * 0.9, decay + 0.02);
    }

    if (spec.click) {
      // The beater on the head: a blip too short to have a pitch.
      const c = spec.click;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = c.freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(level * c.gain * (0.5 + v * 0.5), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + c.decay);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + c.decay + 0.02);
    }

    if (spec.metal) {
      // A cymbal: square waves at ratios that share no harmonics, and only
      // what passes a high band of them. Four of the six on a machine that
      // has been found wanting.
      const m = spec.metal;
      const ratios = this.lite ? m.ratios.slice(0, 4) : m.ratios;
      const sum = ctx.createGain();
      sum.gain.value = 1 / ratios.length;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(18000, m.bp * Math.pow(2, m.velBright * (v - 0.5)));
      bp.Q.value = m.bpQ;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = m.hp;
      const g = ctx.createGain();
      const decay = m.decay * shorten;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level * m.gain, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      sum.connect(bp).connect(hp).connect(g).connect(out);
      for (const ratio of ratios) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = m.freq * ratio;
        osc.connect(sum);
        osc.start(t);
        osc.stop(t + decay + 0.05);
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
      const decay = spec.toneDecay * decayShare * shorten;
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
      // A bed has no velocity; its strings are plucked at one middling strength.
      const str = spec.string && { id: this.bedId, spec: spec.string, note: notes[i], bucket: 2 as const };
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
        for (const s of this.addLayer(f, layer, freq, 0.5, t, NO_TRACK, h, registerOf(notes[i]), detunes, 0, str)) {
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
