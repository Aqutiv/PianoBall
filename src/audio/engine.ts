import { noteToFreq } from '../midi/notes';
import { clamp, clamp01 } from '../core/math';
import { load, save } from '../core/storage';
import { DRUM_SPECS, type DrumVoice } from './drums';
import {
  DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE, findBedVoice, findLeadVoice,
  type BedSpec, type VoiceSpec,
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

/** Wet gain at a full reverb setting. Half of it is the original fixed value. */
const REVERB_MAX = 1.7;

/** Longest delay the node can hold, which caps how slow a tempo it can follow. */
const DELAY_MAX = 2;

const dottedEighth = (bpm: number) => clamp((60 / bpm) * 0.75, 0.02, DELAY_MAX);

interface KeyVoice {
  note: number;
  startedAt: number;
  /** Every oscillator the voice owns: its layers first, then any FM operator. */
  oscs: OscillatorNode[];
  /**
   * Only the layer oscillators, which are the ones expression is wired into.
   * An FM operator runs at its own ratio and must not be bent with them.
   */
  voiced: OscillatorNode[];
  filter: BiquadFilterNode;
  amp: GainNode;
  /**
   * Taken from the spec at the moment the key went down, not read back off the
   * engine at release. That is what lets the player change instrument with
   * notes still held: a note finishes as the voice it was struck as.
   */
  release: number;
  releasing: boolean;
}

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
  private limiter!: DynamicsCompressorNode;
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
  private fxBus!: GainNode;
  private reverbSend!: GainNode;
  private reverbWet!: GainNode;
  private delaySend!: GainNode;
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
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 9;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.16;
    this.limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.settings.master;
    this.master.connect(this.limiter);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.settings.music;
    this.musicBus.connect(this.master);

    this.fxBus = ctx.createGain();
    this.fxBus.gain.value = this.settings.effects;
    this.fxBus.connect(this.master);

    // Reverb from a procedurally generated impulse: noise shaped by an
    // exponential decay, with the high end rolling off faster than the low.
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 2.1, 2.6);
    // Half travel reproduces the fixed 0.85 the room used to have, so the
    // default is where the sound has always been.
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = REVERB_MAX * this.settings.reverb;
    convolver.connect(this.reverbWet).connect(this.master);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(convolver);

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

    this.padBus = ctx.createGain();
    this.padBus.gain.value = 1;
    this.padBus.connect(this.musicBus);
    const padReverb = ctx.createGain();
    padReverb.gain.value = 0.6;
    this.padBus.connect(padReverb).connect(this.reverbSend);

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
  }

  setSettings(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    save(AUDIO_STORAGE_KEY, this.settings);
    if (!this.ready) return;
    this.master.gain.value = this.settings.master;
    this.musicBus.gain.value = this.settings.music;
    this.fxBus.gain.value = this.settings.effects;
    this.reverbWet.gain.value = REVERB_MAX * this.settings.reverb;
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
  }

  setBedVoice(id: string): void {
    const voice = findBedVoice(id);
    this.bedId = voice.id;
    this.bedSpec = voice.spec;
  }

  get leadVoice(): string { return this.leadId; }
  get bedVoice(): string { return this.bedId; }

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
  setBedAudible(on: boolean): void {
    if (!this.ready || !this.ctx) return;
    this.padBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.08);
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
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.noteOff(note, true);

    const v = clamp01(velocity);
    const freq = noteToFreq(note);
    const spec = this.leadSpec;
    const { filter: f, env } = spec;

    const amp = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Brightness tracks how hard the key was hit: this is most of why a synth
    // reads as an instrument rather than a beep.
    filter.frequency.setValueAtTime(clamp(freq * (f.base + v * v * f.track), 180, 15000), t);
    filter.Q.value = f.q + v * f.qVel;

    // Every layer of the instrument, and every operator modulating one. The
    // two lists differ only in what expression is allowed to bend.
    const oscs: OscillatorNode[] = [];
    const voiced: OscillatorNode[] = [];
    for (const layer of spec.layers) {
      const osc = ctx.createOscillator();
      osc.type = layer.type;
      osc.frequency.setValueAtTime(freq * layer.ratio, t);
      if (layer.detune) osc.detune.setValueAtTime(layer.detune, t);

      if (layer.fm) {
        // Bright at the strike and gone a moment later, which is what turns a
        // sine into a tine. `ping` has always done this; now it is a field.
        const mod = ctx.createOscillator();
        mod.type = 'sine';
        mod.frequency.value = freq * layer.fm.ratio;
        const modGain = ctx.createGain();
        modGain.gain.setValueAtTime(freq * layer.fm.index, t);
        modGain.gain.exponentialRampToValueAtTime(1, t + layer.fm.decay);
        mod.connect(modGain).connect(osc.frequency);
        mod.start(t);
        oscs.push(mod);
      }

      const g = ctx.createGain();
      g.gain.setValueAtTime(layer.level + v * (layer.velLevel ?? 0), t);
      // A layer given a decay of its own dies before the note does: the
      // difference between a bell's strike and the tone left ringing under it.
      if (layer.decay) g.gain.exponentialRampToValueAtTime(0.0001, t + layer.decay);
      osc.connect(g).connect(filter);
      osc.start(t);
      oscs.push(osc);
      voiced.push(osc);
    }

    // Breath, or the knock of the key itself: a slice of the shared buffer,
    // the same layer the drums are mostly made of.
    if (spec.noise) {
      const n = spec.noise;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = n.freq;
      bp.Q.value = n.q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(n.gain * (0.5 + v * 0.5), t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + n.decay);
      src.connect(bp).connect(g).connect(filter);
      src.start(t, Math.random() * 0.9, n.decay + 0.02);
    }

    // Expression rides on top of whatever the envelopes below are doing. Only
    // the layers: an operator runs at its own ratio and bending it would move
    // the timbre rather than the pitch.
    for (const osc of voiced) {
      this.bendSource.connect(osc.detune);
      this.lfoVibrato.connect(osc.detune);
    }
    this.lfoColour.connect(filter.frequency);

    const pannerNode = ctx.createStereoPanner();
    pannerNode.pan.value = clamp(pan, -1, 1);
    filter.connect(amp).connect(pannerNode);
    pannerNode.connect(this.musicBus);

    // Harder notes go wetter, whatever the instrument's own send level is.
    const rev = ctx.createGain(); rev.gain.value = spec.reverb * (1 + v * 0.7);
    const dly = ctx.createGain(); dly.gain.value = spec.delay * (1 + v * 1.4);
    pannerNode.connect(rev).connect(this.reverbSend);
    pannerNode.connect(dly).connect(this.delaySend);

    const peak = (0.06 + v * 0.3) * spec.gain;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + env.attack);
    // `decay` is measured from the strike, not from the top of the attack, so
    // a slow swell and a fast one still arrive at the same place.
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * env.sustain), t + env.decay);
    // The filter closes as the note decays, the way a struck string does.
    filter.frequency.exponentialRampToValueAtTime(
      clamp(freq * (f.settle + v * f.settleVel), 160, 12000), t + f.settleTime);

    const voice: KeyVoice = {
      note, startedAt: t, oscs, voiced, filter, amp, release: env.release, releasing: false,
    };
    this.voices.set(note, voice);
    this.active.push(voice);
    this.cull();
  }

  noteOff(note: number, immediate = false): void {
    if (!this.running || !this.ctx) return;
    if (this.sustainOn && !immediate) { this.sustained.add(note); return; }
    const voice = this.voices.get(note);
    if (!voice || voice.releasing) return;
    this.release(voice, immediate ? 0.02 : voice.release);
    this.voices.delete(note);
  }

  private release(voice: KeyVoice, seconds: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    voice.releasing = true;
    voice.amp.gain.cancelScheduledValues(t);
    voice.amp.gain.setValueAtTime(Math.max(0.0001, voice.amp.gain.value), t);
    voice.amp.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    const stop = t + seconds + 0.02;
    for (const osc of voice.oscs) osc.stop(stop);
    // The expression sources are permanent and hold a reference to every param
    // they feed, so a voice that is not explicitly unhooked never goes away.
    // Only what was hooked up: an FM operator was never wired to either.
    for (const osc of voice.voiced) {
      this.bendSource.disconnect(osc.detune);
      this.lfoVibrato.disconnect(osc.detune);
    }
    this.lfoColour.disconnect(voice.filter.frequency);
    const idx = this.active.indexOf(voice);
    if (idx >= 0) this.active.splice(idx, 1);
  }

  setSustain(on: boolean): void {
    this.sustainOn = on;
    if (on) return;
    for (const note of this.sustained) this.noteOff(note);
    this.sustained.clear();
  }

  /** Oldest-first voice stealing, so a two-handed run never runs out. */
  private cull(): void {
    while (this.active.length > MAX_VOICES) {
      const oldest = this.active[0];
      this.voices.delete(oldest.note);
      this.release(oldest, 0.05);
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
   */
  mallet(note: number, gain = 0.5, pan = 0, bright = 0.5): void {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const freq = noteToFreq(note);
    const decay = 0.42 + bright * 0.5;

    const out = ctx.createGain();
    const pannerNode = ctx.createStereoPanner();
    pannerNode.pan.value = clamp(pan, -1, 1);
    out.connect(pannerNode);
    pannerNode.connect(this.musicBus);
    const rev = ctx.createGain(); rev.gain.value = 0.34;
    pannerNode.connect(rev).connect(this.reverbSend);
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
    const rev = ctx.createGain(); rev.gain.value = 0.18 + profile.tone * 0.2;
    pannerNode.connect(rev).connect(this.reverbSend);
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
   * `at` is an audio-clock time, like `pad`'s — the two schedulable voices in
   * the engine. Everything else here plays the instant it is called, because
   * everything else is a reaction to something the player just did; a drum
   * machine is the opposite, and has to place a hit on a step that has not
   * arrived yet.
   */
  drum(voice: DrumVoice, gain = 1, at = 0): void {
    if (!this.running || !this.ctx) return;
    const spec = DRUM_SPECS[voice];
    const level = spec.gain * clamp01(gain);
    if (level < 0.004) return;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, at || ctx.currentTime);

    const out = ctx.createStereoPanner();
    out.pan.value = clamp(spec.pan, -1, 1);
    out.connect(this.musicBus);
    const rev = ctx.createGain();
    rev.gain.value = spec.reverb;
    out.connect(rev).connect(this.reverbSend);

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

    if (spec.tone.length === 0) return;
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
    pannerNode.connect(rev).connect(this.reverbSend);
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
    g.connect(rev).connect(this.reverbSend);
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
   * is pinned to 96 bpm.
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
    for (let i = 0; i < notes.length; i++) {
      const freq = noteToFreq(notes[i]);
      for (const layer of spec.layers) {
        const osc = ctx.createOscillator();
        osc.type = layer.type;
        osc.frequency.value = freq * layer.ratio;
        osc.detune.value = layer.detune ?? 0;
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
        const peak = share * layer.level;
        g.gain.setValueAtTime(0.0001, t);
        if (fall) {
          // Struck and left to ring. The caller still owns how long the note
          // occupies — a plucked voice only decides what happens inside it.
          g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.006, fall * 0.2));
          g.gain.exponentialRampToValueAtTime(0.0001, t + fall);
        } else {
          g.gain.linearRampToValueAtTime(peak, t + rise);
          g.gain.linearRampToValueAtTime(0.0001, t + seconds);
        }
        const pannerNode = ctx.createStereoPanner();
        pannerNode.pan.value = (i / Math.max(1, notes.length - 1) - 0.5) * 0.7;
        osc.connect(f).connect(g).connect(pannerNode);
        pannerNode.connect(this.padBus);
        osc.start(t);
        osc.stop(t + seconds + 0.1);
      }
    }
  }
}

/** Exponentially decaying noise: a convincing hall without shipping an IR file. */
function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // A short build-up before the decay reads as a room rather than a gate.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * Math.min(1, t * 240);
    }
  }
  return buf;
}

function makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
