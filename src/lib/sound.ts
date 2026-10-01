/**
 * The flight's sound, synthesised with Web Audio so nothing is downloaded and every part of
 * it follows the scene. A low drone sits under the whole flight and moves through a minor
 * chord as the stations pass, and a band of filtered noise is the air rushing by, rising in
 * pitch and level with the camera's speed.
 *
 *   drone:  two detuned saws ─► low-pass, cutoff breathing on a slow LFO ─┐
 *   air:    looped noise ─► band-pass, centre and level from speed ───────┼─► master ─► out
 */

/** Root of the drone in hertz, and the minor-chord steps it walks through station by station. */
const ROOT = 55;
const STEPS = [0, 3, 7, 10, 12, 7, 3, 5, 0];
/** Seconds for a level or pitch to settle when the scene asks for a new one. */
const GLIDE = 0.35;

export interface SoundFrame {
  readonly station: number;
  /** Camera speed in world units a second. */
  readonly speed: number;
  /** How far the tunnel has formed, zero to one. */
  readonly tunnel: number;
}

export class Sound {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly drones: OscillatorNode[];
  private readonly droneFilter: BiquadFilterNode;
  private readonly air: BiquadFilterNode;
  private readonly airGain: GainNode;
  private lastStation = -1;

  /** Must be created from a user gesture, which is when browsers allow audio to start. */
  constructor() {
    this.context = new AudioContext();
    const ctx = this.context;
    this.master = new GainNode(ctx, { gain: 0 });
    this.master.connect(ctx.destination);

    this.droneFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420, Q: 0.7 });
    const droneGain = new GainNode(ctx, { gain: 0.05 });
    this.droneFilter.connect(droneGain).connect(this.master);
    this.drones = [-6, 7].map((detune) => {
      const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: ROOT, detune });
      osc.connect(this.droneFilter);
      osc.start();
      return osc;
    });
    const lfo = new OscillatorNode(ctx, { frequency: 0.07 });
    const depth = new GainNode(ctx, { gain: 160 });
    lfo.connect(depth).connect(this.droneFilter.frequency);
    lfo.start();

    const noise = new AudioBuffer({ length: ctx.sampleRate * 2, sampleRate: ctx.sampleRate });
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = new AudioBufferSourceNode(ctx, { buffer: noise, loop: true });
    this.air = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 400, Q: 0.9 });
    this.airGain = new GainNode(ctx, { gain: 0 });
    source.connect(this.air).connect(this.airGain).connect(this.master);
    source.start();
  }

  setEnabled(on: boolean): void {
    const now = this.context.currentTime;
    if (on) void this.context.resume();
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, now, GLIDE);
  }

  update({ station, speed, tunnel }: SoundFrame): void {
    const now = this.context.currentTime;
    if (station !== this.lastStation) {
      this.lastStation = station;
      const step = STEPS[station % STEPS.length] ?? 0;
      const frequency = ROOT * 2 ** (step / 12);
      for (const osc of this.drones) osc.frequency.setTargetAtTime(frequency, now, GLIDE * 3);
    }
    const rush = Math.min(speed / 6, 1);
    this.air.frequency.setTargetAtTime(380 + rush * 1500 + tunnel * 600, now, GLIDE);
    this.airGain.gain.setTargetAtTime(0.012 + rush * 0.17 + tunnel * 0.03, now, GLIDE);
    this.droneFilter.Q.setTargetAtTime(0.7 + tunnel * 5, now, GLIDE);
  }

  dispose(): void {
    void this.context.close();
  }
}
