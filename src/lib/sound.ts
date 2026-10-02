/**
 * The flight's sound, synthesised with Web Audio so nothing is downloaded and every part of it
 * follows the scene. It is meant to sound like open water at night under a very large sky.
 *
 *   pad      five voices, each a sine with a soft octave above, gliding between one chord
 *            per station and breathing on slow incommensurate swells ───────────────────┐
 *   river    brown noise, low-passed, lapping on a slow swell ──────────────────────────┤
 *   air      noise through a band-pass whose pitch and level follow the flight ─────────┼─► dry ──────┐
 *   chimes   glass bells from the chord, sparse on their own, and a droplet for each    │             ├─► compressor ─► out
 *            click on the water, glints where the pointer stirs it ─► ping-pong echo ───┴─► reverb ───┘
 *
 * The reverb's impulse is generated: stereo noise under a five and a half second exponential
 * decay that darkens as it falls, the way a large space swallows the highs first.
 */

/** D2 in hertz, the root every chord is voiced from. */
const ROOT = 73.42;
/**
 * One chord a station, as semitones above the root, each voiced so it shares notes with its
 * neighbours and every voice moves by a step or two. The opening and the end rest on D6/9.
 */
const CHORDS: readonly (readonly number[])[] = [
  [0, 7, 14, 16, 21], // D6/9, the curtain
  [-3, 4, 9, 12, 14], // Bm9
  [-5, 2, 9, 11, 14], // Asus2
  [-7, 4, 9, 11, 16], // Gmaj9♯11
  [-10, 7, 11, 14, 16], // Em9
  [-3, 4, 9, 12, 14], // Bm9, the first pick
  [-7, 4, 9, 11, 16], // Gmaj9♯11
  [-5, 2, 9, 11, 14], // Asus2
  [0, 9, 14, 16, 21], // D6/9, opened up, the finale
];
/** Seconds for a voice to glide to its next note. */
const VOICE_GLIDE = 1.4;
const GLIDE = 0.35;
/** Mean seconds between the chimes that ring on their own, quicker in the finale. */
const CHIME_EVERY = { flight: 4.8, tunnel: 2.4 } as const;

export interface SoundFrame {
  readonly station: number;
  /** Camera speed in world units a second. */
  readonly speed: number;
  /** How far the tunnel has formed, zero to one. */
  readonly tunnel: number;
  /** How far the curtain has opened, zero to one. */
  readonly curtain: number;
  /** Clicks that landed this frame. */
  readonly splashes: number;
  /** How fast the pointer draws through the water, in world units a second. */
  readonly stir: number;
}

const hz = (semitones: number) => ROOT * 2 ** (semitones / 12);

/** A stereo impulse of `seconds`, decaying by sixty decibels and losing its highs as it goes. */
function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: ctx.sampleRate });
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // A one-pole low-pass whose cutoff falls with time darkens the tail.
      const k = 0.6 - 0.5 * t;
      low += (Math.random() * 2 - 1 - low) * k;
      data[i] = low * Math.pow(1e-3, t);
    }
  }
  return buffer;
}

export class Sound {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly bus: GainNode;
  private readonly chimes: GainNode;
  private readonly voices: { readonly root: OscillatorNode; readonly octave: OscillatorNode }[];
  private readonly padFilter: BiquadFilterNode;
  private readonly air: BiquadFilterNode;
  private readonly airGain: GainNode;
  private lastStation = -1;
  private nextChime = 0;
  private nextGlint = 0;
  private lastCurtain = 0;
  private tunnel = 0;

  /** Must be created from a user gesture, which is when browsers allow audio to start. */
  constructor() {
    this.context = new AudioContext();
    const ctx = this.context;
    const compressor = new DynamicsCompressorNode(ctx, { threshold: -20, ratio: 3, attack: 0.02, release: 0.4 });
    this.master = new GainNode(ctx, { gain: 0 });
    compressor.connect(this.master).connect(ctx.destination);

    // Everything goes to the dry path and to the reverb, which is what makes it sound like space.
    this.bus = new GainNode(ctx, { gain: 1 });
    const dry = new GainNode(ctx, { gain: 0.55 });
    const reverb = new ConvolverNode(ctx, { buffer: impulse(ctx, 5.5) });
    const wet = new GainNode(ctx, { gain: 0.62 });
    this.bus.connect(dry).connect(compressor);
    this.bus.connect(reverb).connect(wet).connect(compressor);

    // The pad: each voice a sine and a quiet triangle an octave up, a hair apart in tune, so
    // the chord shimmers slowly, and each voice swells on its own beat.
    this.padFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1100, Q: 0.4 });
    const padGain = new GainNode(ctx, { gain: 0.05 });
    this.padFilter.connect(padGain).connect(this.bus);
    this.voices = CHORDS[0]!.map((step, i) => {
      const swell = new GainNode(ctx, { gain: 0.6 });
      const root = new OscillatorNode(ctx, { type: 'sine', frequency: hz(step), detune: -4 + i * 2 });
      const octave = new OscillatorNode(ctx, { type: 'triangle', frequency: hz(step + 12), detune: 5 - i * 2 });
      const octaveGain = new GainNode(ctx, { gain: 0.18 });
      root.connect(swell);
      octave.connect(octaveGain).connect(swell);
      swell.connect(this.padFilter);
      const lfo = new OscillatorNode(ctx, { frequency: 0.045 + i * 0.017 });
      const depth = new GainNode(ctx, { gain: 0.35 });
      lfo.connect(depth).connect(swell.gain);
      for (const osc of [root, octave, lfo]) osc.start();
      return { root, octave };
    });
    const breath = new OscillatorNode(ctx, { frequency: 0.037 });
    const breathDepth = new GainNode(ctx, { gain: 280 });
    breath.connect(breathDepth).connect(this.padFilter.frequency);
    breath.start();

    // The river: brown noise, the integral of white, low-passed and lapping on a slow swell.
    const brown = new AudioBuffer({ length: ctx.sampleRate * 4, sampleRate: ctx.sampleRate });
    const water = brown.getChannelData(0);
    let level = 0;
    for (let i = 0; i < water.length; i++) {
      level = (level + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      water[i] = level * 3.5;
    }
    const river = new AudioBufferSourceNode(ctx, { buffer: brown, loop: true });
    const riverFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420, Q: 0.5 });
    const riverGain = new GainNode(ctx, { gain: 0.05 });
    const lap = new OscillatorNode(ctx, { frequency: 0.16 });
    const lapDepth = new GainNode(ctx, { gain: 0.03 });
    lap.connect(lapDepth).connect(riverGain.gain);
    river.connect(riverFilter).connect(riverGain).connect(this.bus);
    river.start();
    lap.start();

    // The air rushing by in flight.
    const white = new AudioBuffer({ length: ctx.sampleRate * 2, sampleRate: ctx.sampleRate });
    const noise = white.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
    const rush = new AudioBufferSourceNode(ctx, { buffer: white, loop: true });
    this.air = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 500, Q: 0.8 });
    this.airGain = new GainNode(ctx, { gain: 0 });
    rush.connect(this.air).connect(this.airGain).connect(this.bus);
    rush.start();

    // Chimes ring through a ping-pong echo, its repeats darkening, before the reverb.
    this.chimes = new GainNode(ctx, { gain: 1 });
    const left = new DelayNode(ctx, { delayTime: 0.43 });
    const right = new DelayNode(ctx, { delayTime: 0.61 });
    const feedback = new GainNode(ctx, { gain: 0.38 });
    const dark = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2600 });
    const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    this.chimes.connect(this.bus);
    this.chimes.connect(left);
    left.connect(merger, 0, 0);
    left.connect(right);
    right.connect(merger, 0, 1);
    right.connect(dark).connect(feedback).connect(left);
    merger.connect(new GainNode(ctx, { gain: 0.5 })).connect(this.bus);
  }

  setEnabled(on: boolean): void {
    const now = this.context.currentTime;
    if (on) void this.context.resume();
    this.master.gain.setTargetAtTime(on ? 0.85 : 0, now, on ? 1.2 : GLIDE);
  }

  update({ station, speed, tunnel, curtain, splashes, stir }: SoundFrame): void {
    const ctx = this.context;
    const now = ctx.currentTime;
    if (station !== this.lastStation) {
      this.lastStation = station;
      const chord = CHORDS[Math.min(station, CHORDS.length - 1)]!;
      this.voices.forEach(({ root, octave }, i) => {
        root.frequency.setTargetAtTime(hz(chord[i]!), now, VOICE_GLIDE);
        octave.frequency.setTargetAtTime(hz(chord[i]! + 12), now, VOICE_GLIDE);
      });
    }
    this.tunnel = tunnel;

    // The curtain's opening draws a breath of air and opens the pad, like a room lighting up.
    const opening = Math.max(0, curtain - this.lastCurtain) * 60;
    this.lastCurtain = curtain;
    const flight = Math.min(speed / 6, 1);
    this.air.frequency.setTargetAtTime(420 + flight * 1300 + opening * 900 + tunnel * 500, now, GLIDE);
    this.airGain.gain.setTargetAtTime(0.006 + flight * 0.09 + Math.min(opening, 1) * 0.08, now, GLIDE);
    this.padFilter.frequency.setTargetAtTime(1000 + tunnel * 1400 + curtain * 300, now, 1.5);

    for (let i = 0; i < splashes; i++) this.droplet();
    if (stir > 0.6 && now > this.nextGlint) {
      this.nextGlint = now + 0.22 + Math.random() * 0.25;
      this.chime(this.noteAbove(4), 0.012 + Math.min(stir / 30, 0.02), Math.random() * 1.4 - 0.7, 1.6);
    }
    if (now > this.nextChime) {
      const every = tunnel > 0.5 ? CHIME_EVERY.tunnel : CHIME_EVERY.flight;
      this.nextChime = now + every * (0.6 + Math.random() * 0.8);
      this.chime(this.noteAbove(3), 0.028, Math.random() * 1.2 - 0.6, 3.2);
    }
  }

  /** A note of the current chord, `octaves` above the pad. */
  private noteAbove(octaves: number): number {
    const chord = CHORDS[Math.max(0, Math.min(this.lastStation, CHORDS.length - 1))]!;
    const step = chord[Math.floor(Math.random() * chord.length)]!;
    return hz(step + 12 * octaves - (step > 12 ? 12 : 0));
  }

  /**
   * A glass bell: a sine with a quieter partial at 2.76 times its pitch, the ratio of a struck
   * bar, under a quick strike and a long fall.
   */
  private chime(frequency: number, level: number, pan: number, decay: number): void {
    const ctx = this.context;
    const now = ctx.currentTime;
    const envelope = new GainNode(ctx, { gain: 0 });
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(level, now + 0.012);
    envelope.gain.setTargetAtTime(0, now + 0.012, decay / 4);
    const panner = new StereoPannerNode(ctx, { pan });
    envelope.connect(panner).connect(this.chimes);
    for (const [ratio, gain] of [
      [1, 1],
      [2.76, 0.22],
    ] as const) {
      const osc = new OscillatorNode(ctx, { type: 'sine', frequency: frequency * ratio });
      const partial = new GainNode(ctx, { gain });
      osc.connect(partial).connect(envelope);
      osc.start(now);
      osc.stop(now + decay * 1.6);
    }
  }

  /** A drop into the water: a soft plink that falls in pitch as it lands, then the chord answers. */
  private droplet(): void {
    const ctx = this.context;
    const now = ctx.currentTime;
    const osc = new OscillatorNode(ctx, { type: 'sine', frequency: 1500 });
    osc.frequency.setValueAtTime(1500, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.09);
    const envelope = new GainNode(ctx, { gain: 0 });
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(0.05, now + 0.006);
    envelope.gain.setTargetAtTime(0, now + 0.01, 0.07);
    osc.connect(envelope).connect(this.chimes);
    osc.start(now);
    osc.stop(now + 0.6);
    this.chime(this.noteAbove(this.tunnel > 0.5 ? 4 : 3), 0.03, Math.random() * 0.8 - 0.4, 3.6);
  }

  dispose(): void {
    void this.context.close();
  }
}
