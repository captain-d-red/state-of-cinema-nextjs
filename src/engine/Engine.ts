import {
  Color,
  LinearSRGBColorSpace,
  NoToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type IUniform,
  type WebGLRenderTarget,
} from 'three';
import type { Catalogue } from '@/data/catalogue';
import type { Station } from '@/data/story';
import { hexToLinear } from '@/lib/color';
import { clamp, damp, lerp, smoothstep } from '@/lib/math';
import { GlassWall } from './GlassWall';
import { createFullscreenGeometry, createHalfFloatTarget, createScreenPass } from './gl';
import { Numbers } from './Numbers';
import { between, dwell } from './scroll';
import { RING_SLOTS } from './shaders/field';
import { bloomExtractFragment, blurFragment, postFragment } from './shaders/post';
import { Valley } from './Valley';
import { CAMERA, cameraZ, stationZ } from './world';

export interface EngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly catalogue: Catalogue;
  readonly story: readonly Station[];
  readonly fontFamily: string;
  readonly reducedMotion: boolean;
  readonly onError: (error: unknown) => void;
}

export interface EngineInput {
  /** Continuous station position from the scroll, before the dwell is applied. */
  readonly position: number;
  /** Pointer in normalised device coordinates, from -1 to 1 on both axes. */
  readonly pointerX: number;
  readonly pointerY: number;
  readonly pointerActive: boolean;
  /** Presses since the last frame, each one a ring sent across the dunes. */
  readonly clicks: number;
}

export interface EngineFrame {
  readonly position: number;
  /** Station nearest the camera. */
  readonly station: number;
}

/** Keeps the drawing buffer near 4K worth of pixels however dense the display is. */
const PIXEL_BUDGET = 9_000_000;
/** Seconds the scene takes to grow out of the dark on load. */
const INTRO_SECONDS = 3.5;
const BACKGROUND = '#08090d';
/**
 * A fast flick kicks the lens: the camera rolls and the field of view widens, in proportion
 * to how far the speed jumps above its own running average, then both relax.
 */
const KICK = { roll: 0.12, fov: 24, gain: 0.18 } as const;

export class Engine {
  private readonly renderer: WebGLRenderer;
  private readonly camera = new PerspectiveCamera(CAMERA.fov, 1, 0.1, 80);
  private readonly screenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly scene = new Scene();
  private readonly postScene = new Scene();
  private readonly bloomScenes = { extract: new Scene(), blurX: new Scene(), blurY: new Scene() };
  private readonly screen: BufferGeometry;
  private readonly sceneTarget: WebGLRenderTarget;
  private readonly bloomTargets: readonly [WebGLRenderTarget, WebGLRenderTarget];
  private readonly blur: { x: Record<string, IUniform>; y: Record<string, IUniform> };
  private readonly postPass: Record<string, IUniform>;
  private readonly valley: Valley;
  private readonly numbers: Numbers;
  private readonly walls: GlassWall[];
  /** Pointer in normalised device coordinates and how present it is, shared with the figures. */
  private readonly cursor = { value: new Vector3() };
  private readonly story: readonly Station[];
  private readonly tints: Vector3[];
  private readonly reducedMotion: boolean;
  private readonly raycaster = new Raycaster();
  private readonly ground = new Plane(new Vector3(0, 1, 0), 0);
  private readonly hit = new Vector3();
  private readonly look = new Vector3();
  private readonly orbit = new Vector2();
  private readonly tint = new Vector3();

  private aspect = 1;
  private startTime: number | null = null;
  private lastTime = 0;
  private lastCameraZ: number | null = null;
  private speedMean = 0;
  private kick = 0;
  private hover = 0;
  private nextRing = 0;

  constructor({ canvas, catalogue, story, fontFamily, reducedMotion, onError }: EngineOptions) {
    this.story = story;
    this.reducedMotion = reducedMotion;
    this.tints = story.map((s) => new Vector3(...hexToLinear(s.tint)));
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    const background = hexToLinear(BACKGROUND);
    this.renderer.setClearColor(new Color(...background), 1);

    this.screen = createFullscreenGeometry();
    this.sceneTarget = createHalfFloatTarget(1, 1, { depthBuffer: true, samples: 4 });
    this.bloomTargets = [createHalfFloatTarget(1, 1), createHalfFloatTarget(1, 1)];
    this.blur = {
      x: { uSource: { value: this.bloomTargets[0].texture }, uStep: { value: new Vector2() } },
      y: { uSource: { value: this.bloomTargets[1].texture }, uStep: { value: new Vector2() } },
    };
    this.bloomScenes.extract.add(
      createScreenPass(this.screen, bloomExtractFragment, {
        uSource: { value: this.sceneTarget.texture },
        uKnee: { value: 0.55 },
      }),
    );
    this.bloomScenes.blurX.add(createScreenPass(this.screen, blurFragment, this.blur.x));
    this.bloomScenes.blurY.add(createScreenPass(this.screen, blurFragment, this.blur.y));
    this.postPass = {
      uScene: { value: this.sceneTarget.texture },
      uBloom: { value: this.bloomTargets[0].texture },
      uResolution: { value: new Vector2(1, 1) },
      uTime: { value: 0 },
      uExposure: { value: 1 },
      uHalation: { value: 0.4 },
      uGrain: { value: 0.03 },
      uFade: { value: 0 },
      uAberration: { value: 0.0055 },
      uBarrel: { value: -0.5 },
    };
    this.postScene.add(createScreenPass(this.screen, postFragment, this.postPass));

    this.valley = new Valley(this.screen);
    this.valley.uniforms.uBackground.value.set(...background);
    this.scene.add(this.valley.group);

    const bySlug = new Map(catalogue.films.map((f) => [f.slug, f]));
    this.numbers = new Numbers(
      story.flatMap((s, i) =>
        s.kind === 'stat'
          ? [{ value: s.value, z: stationZ(i), tint: s.tint, films: s.films.flatMap((slug) => bySlug.get(slug) ?? []) }]
          : [],
      ),
      this.valley.uniforms,
      this.cursor,
      fontFamily,
    );
    this.scene.add(this.numbers.group);
    this.walls = story.flatMap((s, i) =>
      s.kind === 'pick' ? [new GlassWall(s.film, stationZ(i), this.valley.uniforms.uCamPos, onError)] : [],
    );
    for (const wall of this.walls) this.scene.add(wall.group);
  }

  /** Sizes the drawing buffer to the canvas, trading pixel ratio for a fixed pixel budget. */
  resize(width: number, height: number, devicePixelRatio: number): void {
    const w0 = Math.max(1, width);
    const h0 = Math.max(1, height);
    this.aspect = w0 / h0;
    let dpr = Math.min(devicePixelRatio, 2);
    while (dpr > 1 && w0 * h0 * dpr * dpr > PIXEL_BUDGET) dpr -= 0.125;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w0, h0, false);
    const w = Math.round(w0 * dpr);
    const h = Math.round(h0 * dpr);
    this.sceneTarget.setSize(w, h);
    const bw = Math.ceil(w / 4);
    const bh = Math.ceil(h / 4);
    for (const target of this.bloomTargets) target.setSize(bw, bh);
    (this.blur.x.uStep!.value as Vector2).set(1.5 / bw, 0);
    (this.blur.y.uStep!.value as Vector2).set(0, 1.5 / bh);
    (this.postPass.uResolution!.value as Vector2).set(w, h);
    // Dots are sized in drawing-buffer pixels with a gentle lift on dense screens, so they stay
    // fine specks on a Retina display instead of doubling into beads.
    this.valley.uniforms.uPointScale.value = Math.sqrt(dpr);
    this.camera.aspect = this.aspect;
  }

  frame(timeMs: number, input: EngineInput): EngineFrame {
    const time = timeMs / 1000;
    this.startTime ??= time;
    const dt = clamp(time - (this.lastTime || time), 1 / 240, 1 / 20);
    this.lastTime = time;
    const age = time - this.startTime;
    const linear = this.reducedMotion ? 1 : clamp(age / INTRO_SECONDS, 0, 1);
    const intro = 1 - (1 - linear) ** 3;

    const count = this.story.length;
    const position = dwell(clamp(input.position, 0, count - 1));
    const { from, to, t } = between(position, count);
    const z = lerp(cameraZ(from), cameraZ(to), t);

    this.placeCamera(z, intro, input, dt);
    this.touchGround(input, time, dt);

    const u = this.valley.uniforms;
    u.uTime.value = time;
    u.uIntro.value = intro;
    u.uCamPos.value.copy(this.camera.position);
    u.uFocus.value.set(0, z - CAMERA.lookAhead + 0.4);
    this.tint.copy(this.tints[from]!).lerp(this.tints[to]!, smoothstep(0, 1, t));
    this.applyTint(this.tint);
    // The flight turns into a tunnel between the last pick and the outro.
    u.uTunnel.value = smoothstep(cameraZ(count - 2) - 1.5, cameraZ(count - 1) + 1, z);
    this.valley.update(this.renderer, z);
    this.numbers.update(z, dt, this.reducedMotion);
    for (const wall of this.walls) wall.update(z, this.camera, this.cursor.value, dt, this.reducedMotion);

    this.postPass.uTime!.value = time;
    this.postPass.uFade!.value = this.reducedMotion ? 1 : smoothstep(0, 0.8, age);
    this.render();
    return { position, station: Math.round(position) };
  }

  /**
   * The valley's three colours come from one tint. The floor glows at the tint itself, the
   * backlight is the tint pushed to full brightness, and the dots are that light warmed a
   * little toward white so they read as specks of light rather than paint.
   */
  private applyTint(tint: Vector3): void {
    const u = this.valley.uniforms;
    const peak = Math.max(tint.x, tint.y, tint.z, 1e-4);
    u.uBase.value.copy(tint).multiplyScalar(0.72);
    u.uGlow.value.copy(tint).multiplyScalar(1 / peak);
    u.uDot.value.copy(u.uGlow.value).lerp(new Vector3(1, 1, 1), 0.18);
  }

  private placeCamera(z: number, intro: number, input: EngineInput, dt: number): void {
    const follow = this.reducedMotion || !input.pointerActive ? 0 : 1;
    this.orbit.set(
      damp(this.orbit.x, input.pointerX * follow, 3, dt),
      damp(this.orbit.y, input.pointerY * follow, 3, dt),
    );
    // The camera drops out of the sky as the scene boots, and leans toward the pointer.
    const drop = (1 - intro) * 8;
    this.camera.position.set(this.orbit.x * 0.22, CAMERA.height + drop + this.orbit.y * 0.1, z);
    this.look.set(this.orbit.x * 0.06, CAMERA.lookHeight, z - CAMERA.lookAhead);
    this.camera.lookAt(this.look);

    const speed = this.lastCameraZ === null ? 0 : Math.abs(z - this.lastCameraZ) / dt;
    this.lastCameraZ = z;
    this.speedMean = damp(this.speedMean, speed, 2.4, dt);
    const impulse = this.reducedMotion ? 0 : 1 - Math.exp(-KICK.gain * Math.max(0, speed - this.speedMean));
    this.kick = damp(this.kick, impulse, impulse > this.kick ? 5.4 : 2.4, dt);
    this.camera.rotateZ(this.kick * KICK.roll);
    const base = this.aspect < 0.8 ? CAMERA.fovTall : CAMERA.fov;
    this.camera.fov = base + this.kick * KICK.fov;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /** The pointer raises a soft bump where it rests on the dunes, and a press sends a ring out. */
  private touchGround(input: EngineInput, time: number, dt: number): void {
    let over = false;
    if (input.pointerActive && !this.reducedMotion) {
      this.raycaster.setFromCamera(new Vector2(input.pointerX, input.pointerY), this.camera);
      over = this.raycaster.ray.intersectPlane(this.ground, this.hit) !== null;
    }
    this.hover = damp(this.hover, over ? 1 : 0, 3, dt);
    const active = input.pointerActive && !this.reducedMotion ? 1 : 0;
    const c = this.cursor.value;
    c.set(damp(c.x, input.pointerX, 14, dt), damp(c.y, input.pointerY, 14, dt), damp(c.z, active, 6, dt));
    const h = this.valley.uniforms.uHover.value;
    if (over) h.set(damp(h.x, this.hit.x, 3, dt), damp(h.y, this.hit.z, 3, dt), this.hover);
    else h.z = this.hover;
    for (let i = 0; i < input.clicks && over; i++) {
      this.valley.uniforms.uRings.value[this.nextRing]!.set(this.hit.x, this.hit.z, time);
      this.nextRing = (this.nextRing + 1) % RING_SLOTS;
    }
  }

  private render(): void {
    const r = this.renderer;
    r.setRenderTarget(this.sceneTarget);
    r.render(this.scene, this.camera);
    const [bloomA, bloomB] = this.bloomTargets;
    r.setRenderTarget(bloomA);
    r.render(this.bloomScenes.extract, this.screenCamera);
    r.setRenderTarget(bloomB);
    r.render(this.bloomScenes.blurX, this.screenCamera);
    r.setRenderTarget(bloomA);
    r.render(this.bloomScenes.blurY, this.screenCamera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.screenCamera);
  }

  dispose(): void {
    this.valley.dispose();
    this.numbers.dispose();
    for (const wall of this.walls) wall.dispose();
    this.sceneTarget.dispose();
    for (const target of this.bloomTargets) target.dispose();
    this.screen.dispose();
    for (const scene of [this.postScene, ...Object.values(this.bloomScenes)]) {
      scene.traverse((o) => (o as { material?: { dispose(): void } }).material?.dispose());
    }
    this.renderer.dispose();
  }
}
