import { noteToFreq } from '../midi/notes';
import { clamp, clamp01 } from '../core/math';
import { load, save } from '../core/storage';

export interface AudioSettings {
  master: number;
  music: number;
  effects: number;
  /** Off-scale notes are snapped into the table's key. */
  assist: boolean;
  /** The rhythmic backing bed. */
  bed: boolean;
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

interface KeyVoice {
  note: number;
  startedAt: number;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  sub: OscillatorNode;
  filter: BiquadFilterNode;
  amp: GainNode;
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
  private fxBus!: GainNode;
  private reverbSend!: GainNode;
  private delaySend!: GainNode;
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
  private voices = new Map<number, KeyVoice>();
  private active: KeyVoice[] = [];
  private sustained = new Set<number>();
  private sustainOn = false;

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
    const wet = ctx.createGain();
    wet.gain.value = 0.85;
    convolver.connect(wet).connect(this.master);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(convolver);

    // Dotted-eighth delay, darkened on each pass so repeats sit behind the mix.
    const delay = ctx.createDelay(2);
    delay.delayTime.value = (60 / 96) * 0.75;
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

    const amp = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Brightness tracks how hard the key was hit: this is most of why a synth
    // reads as an instrument rather than a beep.
    filter.frequency.setValueAtTime(clamp(freq * (1.6 + v * v * 11), 180, 15000), t);
    filter.Q.value = 3.2 + v * 3;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, t);
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(freq, t);
    osc2.detune.setValueAtTime(7.5, t);
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(freq / 2, t);

    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.18 + v * 0.2;
    const g3 = ctx.createGain(); g3.gain.value = 0.24;
    osc1.connect(g1).connect(filter);
    osc2.connect(g2).connect(filter);
    sub.connect(g3).connect(filter);

    // Expression rides on top of whatever the envelopes below are doing.
    for (const osc of [osc1, osc2, sub]) {
      this.bendSource.connect(osc.detune);
      this.lfoVibrato.connect(osc.detune);
    }
    this.lfoColour.connect(filter.frequency);

    const pannerNode = ctx.createStereoPanner();
    pannerNode.pan.value = clamp(pan, -1, 1);
    filter.connect(amp).connect(pannerNode);
    pannerNode.connect(this.musicBus);

    const rev = ctx.createGain(); rev.gain.value = 0.2 + v * 0.14;
    const dly = ctx.createGain(); dly.gain.value = 0.1 + v * 0.14;
    pannerNode.connect(rev).connect(this.reverbSend);
    pannerNode.connect(dly).connect(this.delaySend);

    const peak = 0.06 + v * 0.3;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.34), t + 0.16);
    // The filter closes as the note decays, the way a struck string does.
    filter.frequency.exponentialRampToValueAtTime(
      clamp(freq * (1.1 + v * 2.4), 160, 12000), t + 0.35);

    osc1.start(t); osc2.start(t); sub.start(t);

    const voice: KeyVoice = { note, startedAt: t, osc1, osc2, sub, filter, amp, releasing: false };
    this.voices.set(note, voice);
    this.active.push(voice);
    this.cull();
  }

  noteOff(note: number, immediate = false): void {
    if (!this.running || !this.ctx) return;
    if (this.sustainOn && !immediate) { this.sustained.add(note); return; }
    const voice = this.voices.get(note);
    if (!voice || voice.releasing) return;
    this.release(voice, immediate ? 0.02 : 0.22);
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
    voice.osc1.stop(stop); voice.osc2.stop(stop); voice.sub.stop(stop);
    // The expression sources are permanent and hold a reference to every param
    // they feed, so a voice that is not explicitly unhooked never goes away.
    for (const osc of [voice.osc1, voice.osc2, voice.sub]) {
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

  /** Pad for the backing bed: long, soft, and behind everything else. */
  /**
   * A sustained chord. `at` is an audio-clock time, so a scheduler with a
   * lookahead can place a chord on a downbeat that has not arrived yet.
   */
  pad(notes: readonly number[], seconds: number, gain = 0.1, at = 0): void {
    if (!this.running || !this.ctx || !this.settings.bed) return;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, at || ctx.currentTime);
    for (let i = 0; i < notes.length; i++) {
      const freq = noteToFreq(notes[i]);
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(420, t);
        f.frequency.linearRampToValueAtTime(1100, t + seconds * 0.5);
        f.frequency.linearRampToValueAtTime(500, t + seconds);
        f.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain / notes.length, t + seconds * 0.35);
        g.gain.linearRampToValueAtTime(0.0001, t + seconds);
        const pannerNode = ctx.createStereoPanner();
        pannerNode.pan.value = (i / Math.max(1, notes.length - 1) - 0.5) * 0.7;
        osc.connect(f).connect(g).connect(pannerNode);
        pannerNode.connect(this.musicBus);
        const rev = ctx.createGain(); rev.gain.value = 0.6;
        pannerNode.connect(rev).connect(this.reverbSend);
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
