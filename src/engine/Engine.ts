import {
  Color,
  LinearSRGBColorSpace,
  NoToneMapping,
  PerspectiveCamera,
  Plane,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type IUniform,
} from 'three';
import { ATLAS } from '@/data/atlas';
import type { Catalogue } from '@/data/catalogue';
import type { Station } from '@/data/story';
import { hexToLinear, linearSrgbToOklab, mixOklch, type Vec3 } from '@/lib/color';
import { clamp, damp, lerp, smoothstep } from '@/lib/math';
import { Banner } from './Banner';
import { Curtain } from './Curtain';
import type { Grip } from './hand';
import { createFullscreenGeometry } from './gl';
import { Lens } from './Lens';
import { Mirror } from './Mirror';
import { FrameGovernor, type Quality } from './quality';
import type { CurtainCopy } from './print';
import { Numbers } from './Numbers';
import { Reel } from './Reel';
import { between, dwell } from './scroll';
import { Valley } from './Valley';
import { CAMERA, RIVER, cameraZ, stationZ, valleyCentre } from './world';

export interface EngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly catalogue: Catalogue;
  readonly story: readonly Station[];
  readonly fontFamily: string;
  /** What the opening's curtain is printed with. */
  readonly curtain: CurtainCopy;
  readonly reducedMotion: boolean;
  /** How much work each frame may do, picked for the device. */
  readonly quality: Quality;
  readonly onError: (error: unknown) => void;
}

export interface EngineInput {
  /** Continuous station position from the scroll, before the dwell is applied. */
  readonly position: number;
  /** Pointer in normalised device coordinates, from -1 to 1 on both axes. */
  readonly pointerX: number;
  readonly pointerY: number;
  readonly pointerActive: boolean;
  /** Whether the pointer's button is held, for pinching the cloth. */
  readonly pointerDown: boolean;
  /** Taps and clicks since the last frame, in normalised device coordinates, each one a ring sent across the dunes. */
  readonly taps: readonly { readonly x: number; readonly y: number }[];
}

export interface EngineFrame {
  readonly position: number;
  /** Station nearest the camera. */
  readonly station: number;
  /** Catalogue index of the reel frame under the pointer, once the tunnel has formed. */
  readonly hoveredFilm: number | null;
  /** Camera speed in world units a second, and how far the tunnel has formed. */
  readonly speed: number;
  readonly tunnel: number;
  /** Share of the images that have arrived, the atlas and every pick poster, zero to one. */
  readonly loaded: number;
  /** Whether the intro has begun, the moment the loader should step aside. */
  readonly started: boolean;
  /** Distance from the eye to the point on the water under the pointer, or null when it is off the water. */
  readonly focus: number | null;
  /** How far the opening's curtain has opened, zero to one. */
  readonly curtain: number;
  /** Clicks that landed this frame, on the water or among the finale's stars. */
  readonly splashes: number;
  /** How fast the pointer is drawing through the water, in world units a second. */
  readonly stir: number;
  /** What the pointer is doing to the cloth: nothing, hovering it, or holding it. */
  readonly grip: Grip;
}

/** Keeps the drawing buffer near 4K worth of pixels however dense the display is. */
const PIXEL_BUDGET = 9_000_000;
/** Seconds the scene takes to grow out of the dark on load. */
const INTRO_SECONDS = 3.5;
/** Seconds to wait for the images before starting the intro without them. */
const LOAD_PATIENCE = 8;
const BACKGROUND = '#08090d';
/**
 * A fast flick kicks the lens: the camera rolls and the field of view widens, in proportion
 * to how far the speed jumps above its own running average, then both relax.
 */
const KICK = { roll: 0.12, fov: 24, gain: 0.18 } as const;
/**
 * The opening's first scroll, as shares of the way from the opening to the first figure: the
 * curtain starts to open a little in, and the camera holds until it is open.
 */
const OPENING = { start: 0.03, hold: 0.3 } as const;
/** Roll per unit of lateral acceleration, and the most the camera may lean into a bend, in radians. */
const BANK = { gain: 0.012, max: 0.09 } as const;

export class Engine {
  private readonly renderer: WebGLRenderer;
  private readonly camera = new PerspectiveCamera(CAMERA.fov, 1, 0.1, 80);
  private readonly scene = new Scene();
  private readonly screen: BufferGeometry;
  private readonly lens: Lens;
  private readonly mirror: Mirror;
  private readonly quality: Quality;
  private readonly governor: FrameGovernor;
  private deviceRatio = 1;
  private width = 1;
  private height = 1;
  private readonly valley: Valley;
  private readonly numbers: Numbers;
  private readonly banners: Banner[];
  private readonly curtain: Curtain;
  private readonly reel: Reel;
  /** Pointer in normalised device coordinates and how present it is, shared with the figures. */
  private readonly cursor = { value: new Vector3() };
  /** The raw pointer for picking, in normalised device coordinates with presence in z. */
  private readonly pick = new Vector3();
  private readonly story: readonly Station[];
  /** Station tints in OKLab, blended through OKLCh so the valley stays saturated between stations. */
  private readonly tints: Vec3[];
  /** Station films, as optical path difference, spread and strength, blended linearly. */
  private readonly films: Vector3[];
  private readonly atlas: IUniform<Texture | null> = { value: null };
  private readonly abort = new AbortController();
  private readonly reducedMotion: boolean;
  private readonly raycaster = new Raycaster();
  private readonly ground = new Plane(new Vector3(0, 1, 0), 0);
  private readonly hit = new Vector3();
  private readonly tapHit = new Vector3();
  private readonly look = new Vector3();
  private readonly orbit = new Vector2();
  private readonly tint = new Vector3();

  private aspect = 1;
  private firstTime: number | null = null;
  private startTime: number | null = null;
  private lastTime = 0;
  private lastCameraZ: number | null = null;
  private speed = 0;
  private speedMean = 0;
  private kick = 0;
  private bank = 0;
  private hover = 0;
  private lastHit: Vector3 | null = null;
  private focus: number | null = null;
  private splashes = 0;
  private grip: Grip = 'none';
  private stir = 0;
  /** The pointer's path over the water this frame, from where it was to where it is. */
  private readonly path: [number, number, number, number] = [0, 0, 0, 0];

  constructor({ canvas, catalogue, story, fontFamily, curtain, reducedMotion, quality, onError }: EngineOptions) {
    this.quality = quality;
    this.governor = new FrameGovernor(quality.maxPixelRatio);
    this.mirror = new Mirror(RIVER.level, quality.mirrorScale);
    this.story = story;
    this.reducedMotion = reducedMotion;
    this.tints = story.map((s) => linearSrgbToOklab(hexToLinear(s.tint)));
    this.films = story.map((s) => new Vector3(s.sheen.opd, s.sheen.spread, s.sheen.strength));
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
    this.lens = new Lens(this.screen, quality.samples);

    this.valley = new Valley(this.screen, this.mirror, this.cursor, quality.dust);
    this.valley.uniforms.uBackground.value.set(...background);
    this.scene.add(this.valley.group);

    const indexOf = new Map(catalogue.films.map((f, i) => [f.slug, i]));
    this.numbers = new Numbers(
      story.flatMap((s, i) =>
        s.kind === 'stat'
          ? [{ value: s.value, z: stationZ(i), posters: s.films.flatMap((slug) => indexOf.get(slug) ?? []) }]
          : [],
      ),
      this.valley.uniforms,
      this.cursor,
      this.atlas,
      fontFamily,
    );
    this.scene.add(this.numbers.group);
    this.banners = story.flatMap((s, i) =>
      s.kind === 'pick' ? [new Banner(s.film, stationZ(i), this.valley.uniforms, onError)] : [],
    );
    for (const banner of this.banners) this.scene.add(banner.group);
    this.curtain = new Curtain(cameraZ(0), this.valley.uniforms, curtain, fontFamily);
    this.scene.add(this.curtain.group);
    this.reel = new Reel(catalogue.films.length, this.valley.uniforms.uGlow, this.atlas);
    this.scene.add(this.reel.mesh);
    this.loadAtlas(onError);
  }

  /** Every poster as one cell of a single texture, shared by the figures and the reel. */
  private loadAtlas(onError: (error: unknown) => void): void {
    fetch(ATLAS.src, { signal: this.abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`${ATLAS.src} failed with ${response.status}`);
        return response.blob();
      })
      .then((blob) => createImageBitmap(blob, { imageOrientation: 'flipY' }))
      .then((bitmap) => {
        const texture = new Texture(bitmap);
        texture.flipY = false;
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        texture.needsUpdate = true;
        this.atlas.value = texture;
      })
      .catch((error: unknown) => {
        if (!this.abort.signal.aborted) onError(error);
      });
  }

  /** The pixel ratio the scene is drawn at, after the profile, the budget and the governor. */
  get renderRatio(): number {
    return this.renderer.getPixelRatio();
  }

  /** Sizes the drawing buffer to the canvas, trading pixel ratio for a fixed pixel budget. */
  resize(width: number, height: number, devicePixelRatio: number): void {
    const w0 = Math.max(1, width);
    const h0 = Math.max(1, height);
    this.aspect = w0 / h0;
    this.width = width;
    this.height = height;
    this.deviceRatio = devicePixelRatio;
    let dpr = Math.min(devicePixelRatio, this.governor.pixelRatio);
    while (dpr > 1 && w0 * h0 * dpr * dpr > PIXEL_BUDGET) dpr -= 0.125;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w0, h0, false);
    this.lens.resize(Math.round(w0 * dpr), Math.round(h0 * dpr));
    this.mirror.resize(Math.round(w0 * dpr), Math.round(h0 * dpr));
    // Dots are sized in drawing-buffer pixels with a gentle lift on dense screens, so they stay
    // fine specks on a Retina display instead of doubling into beads.
    this.valley.uniforms.uPointScale.value = Math.sqrt(dpr);
    this.camera.aspect = this.aspect;
    this.valley.aspect.value = this.aspect;
  }

  frame(timeMs: number, input: EngineInput): EngineFrame {
    const time = timeMs / 1000;
    this.firstTime ??= time;
    const interval = time - (this.lastTime || time);
    const dt = clamp(interval, 1 / 240, 1 / 20);
    this.lastTime = time;
    // The intro waits for the images, so it plays out in front of the visitor instead of under
    // the loader. A missing image must never strand anyone, so it starts anyway after a while.
    const images = 1 + this.banners.length;
    const arrived = (this.atlas.value ? 1 : 0) + this.banners.filter((b) => b.ready).length;
    const loaded = arrived / images;
    if (this.startTime === null && (loaded >= 1 || time - this.firstTime > LOAD_PATIENCE)) {
      this.startTime = time;
      this.warm();
    }
    const age = this.startTime === null ? 0 : time - this.startTime;
    const linear = this.reducedMotion ? 1 : clamp(age / INTRO_SECONDS, 0, 1);
    const intro = 1 - (1 - linear) ** 3;
    // Once the intro has played, the governor watches the frame rate and lowers the density
    // if this device cannot hold it.
    if (intro >= 1 && this.governor.sample(interval * 1000, timeMs) !== null) {
      this.resize(this.width, this.height, this.deviceRatio);
    }

    const count = this.story.length;
    const position = dwell(clamp(input.position, 0, count - 1));
    const { from, to, t } = between(position, count);
    // Leaving the opening, the first stretch of scroll opens the curtain while the camera
    // holds, and only then does the flight begin, so the eye never meets closed cloth.
    const opening = from === 0 && to === 1 ? t : position >= 1 ? 1 : 0;
    const travel = from === 0 ? smoothstep(OPENING.hold, 1, t) : t;
    const z = lerp(cameraZ(from), cameraZ(to), travel);

    // The tunnel forms around the eye line, so the view levels out to look straight down it.
    const tunnel = smoothstep(cameraZ(count - 2) - 1.5, cameraZ(count - 1) + 1, z);
    this.placeCamera(z, intro, tunnel, input, dt);
    this.touchGround(input, dt);

    const u = this.valley.uniforms;
    u.uTime.value = time;
    u.uIntro.value = intro;
    u.uCamPos.value.copy(this.camera.position);
    const focusZ = z - CAMERA.lookAhead + 0.4;
    u.uFocus.value.set(valleyCentre(focusZ), focusZ);
    const blend = smoothstep(0, 1, t);
    this.tint.set(...mixOklch(this.tints[from]!, this.tints[to]!, blend));
    this.applyTint(this.tint);
    u.uFilm.value.lerpVectors(this.films[from]!, this.films[to]!, blend);
    u.uTunnel.value = tunnel;
    this.valley.update(this.renderer, z, dt, this.path, this.hover);
    this.numbers.update(z, dt, this.reducedMotion);
    // Picking a film is navigation, so the reel reads the raw pointer even under reduced motion,
    // where the cursor that pushes particles and presses the banners is held still. The hand
    // that pinches the cloth reads the raw pointer too, so the cloth stays under the fingers.
    this.pick.set(input.pointerX, input.pointerY, input.pointerActive ? 1 : 0);
    const hand = { pointer: this.pick, down: input.pointerDown };
    const grips = this.banners.map((banner) =>
      banner.update(time, z, this.speed, this.camera, this.cursor.value, hand, dt, this.reducedMotion),
    );
    grips.push(
      this.curtain.update(
        time,
        z,
        smoothstep(OPENING.start, OPENING.hold, opening),
        intro,
        this.camera,
        this.cursor.value,
        hand,
        dt,
        this.reducedMotion,
      ),
    );
    this.grip = grips.includes('held') ? 'held' : grips.includes('over') ? 'over' : 'none';
    this.lightWater();
    const hoveredFilm = this.reel.update(time, this.camera, this.pick, tunnel, dt, this.reducedMotion);

    // The reflection is lit from the mirrored eye, so view-dependent light lands where it would in water.
    this.mirror.place(this.camera);
    u.uCamPos.value.copy(this.mirror.position);
    u.uHazeSteps.value = this.quality.mirrorHazeSteps;
    this.mirror.render(this.renderer, this.scene, this.valley.river);
    u.uCamPos.value.copy(this.camera.position);
    u.uHazeSteps.value = this.quality.hazeSteps;
    this.lens.render(this.renderer, this.scene, this.camera, time, this.reducedMotion ? 1 : smoothstep(0, 0.8, age));
    return {
      position,
      station: Math.round(position),
      hoveredFilm,
      speed: this.speed,
      tunnel,
      loaded,
      started: this.startTime !== null,
      focus: this.focus,
      curtain: this.curtain.openness,
      splashes: this.splashes,
      stir: this.stir,
      grip: this.grip,
    };
  }

  /** Hands the brightest banner's uplights to the water, which only ever has one pair near it. */
  private lightWater(): void {
    const u = this.valley.uniforms;
    u.uLampPower.value = 0;
    for (const lit of [this.curtain, ...this.banners]) {
      const { positions, power } = lit.lamps;
      if (power <= u.uLampPower.value) continue;
      u.uLampPower.value = power;
      for (let i = 0; i < positions.length; i++) u.uLampPos.value[i]!.copy(positions[i]!);
    }
  }

  /**
   * Compiles every material and uploads every image while the loader still covers the page, so
   * the first sight of a banner or the reel never stalls a frame. Hidden objects are shown for
   * the compile, since the renderer only prepares what is visible.
   */
  private warm(): void {
    const hidden: { visible: boolean }[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    this.renderer.compile(this.scene, this.camera);
    for (const o of hidden) o.visible = false;
    for (const texture of [this.atlas.value, this.curtain.texture, ...this.banners.map((b) => b.texture)]) {
      if (texture) this.renderer.initTexture(texture);
    }
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

  private placeCamera(z: number, intro: number, tunnel: number, input: EngineInput, dt: number): void {
    const follow = this.reducedMotion || !input.pointerActive ? 0 : 1;
    this.orbit.set(
      damp(this.orbit.x, input.pointerX * follow, 3, dt),
      damp(this.orbit.y, input.pointerY * follow, 3, dt),
    );
    // The camera drops out of the sky as the scene boots, and leans toward the pointer.
    const drop = (1 - intro) * 8;
    // The camera rides the valley's centre line and looks down it to where the line will be.
    const here = valleyCentre(z);
    const ahead = valleyCentre(z - CAMERA.lookAhead);
    const tallOpening = smoothstep(cameraZ(1), cameraZ(0), z);
    const back = this.aspect < 0.8 ? CAMERA.openingStepBackTall * tallOpening * tallOpening : 0;
    this.camera.position.set(here + this.orbit.x * 0.22, CAMERA.height + drop + this.orbit.y * 0.1, z + back);
    const tall = this.aspect < 0.8;
    const opening = smoothstep(cameraZ(1), cameraZ(0), z);
    const river = tall ? CAMERA.lookHeightTall : CAMERA.lookHeight;
    const level = tall ? CAMERA.openingLookHeightTall : CAMERA.openingLookHeight;
    const lookY = lerp(lerp(river, level, opening * opening), CAMERA.height, tunnel);
    // The tunnel is wound around the camera's own axis, so the view turns to look straight down
    // it, and its vanishing point sits in the middle of the frame instead of off toward the bend.
    const lookX = lerp(ahead + this.orbit.x * 0.06, this.camera.position.x, tunnel);
    this.look.set(lookX, lookY, z - CAMERA.lookAhead);
    this.camera.lookAt(this.look);

    const speed = this.lastCameraZ === null ? 0 : Math.abs(z - this.lastCameraZ) / dt;
    this.speed = damp(this.speed, speed, 8, dt);
    this.lastCameraZ = z;
    this.speedMean = damp(this.speedMean, speed, 2.4, dt);
    const impulse = this.reducedMotion ? 0 : 1 - Math.exp(-KICK.gain * Math.max(0, speed - this.speedMean));
    this.kick = damp(this.kick, impulse, impulse > this.kick ? 5.4 : 2.4, dt);
    this.camera.rotateZ(this.kick * KICK.roll);
    // Banking into a bend: the lateral acceleration on a path x(z) flown at speed v is v²·x″,
    // and the camera rolls toward the inside of the turn in proportion, then levels when parked.
    const h = 0.5;
    const curvature = (valleyCentre(z - h) - 2 * valleyCentre(z) + valleyCentre(z + h)) / (h * h);
    const lean = this.reducedMotion ? 0 : clamp(curvature * this.speed * this.speed * BANK.gain, -BANK.max, BANK.max);
    this.bank = damp(this.bank, lean, 3, dt);
    this.camera.rotateZ(this.bank);
    const base = tall ? CAMERA.fovTall : CAMERA.fov;
    this.camera.fov = base + this.kick * KICK.fov;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /**
   * The pointer stirs the water where it rests, and a tap drops a ring where it lands. Both
   * are found by casting the pointer's ray onto the water's plane.
   */
  private touchGround(input: EngineInput, dt: number): void {
    const active = input.pointerActive && !this.reducedMotion;
    let over = false;
    if (active) {
      this.raycaster.setFromCamera(new Vector2(input.pointerX, input.pointerY), this.camera);
      over = this.raycaster.ray.intersectPlane(this.ground, this.hit) !== null;
    }
    this.hover = damp(this.hover, over ? 1 : 0, 3, dt);
    this.focus = over ? this.camera.position.distanceTo(this.hit) : null;
    const c = this.cursor.value;
    c.set(damp(c.x, input.pointerX, 14, dt), damp(c.y, input.pointerY, 14, dt), damp(c.z, active ? 1 : 0, 6, dt));
    const from = this.lastHit ?? this.hit;
    this.stir = over ? Math.hypot(this.hit.x - from.x, this.hit.z - from.z) / dt : 0;
    this.path[0] = from.x;
    this.path[1] = from.z;
    this.path[2] = this.hit.x;
    this.path[3] = this.hit.z;
    this.lastHit = over ? (this.lastHit ?? new Vector3()).copy(this.hit) : null;
    this.valley.uniforms.uHover.value.set(this.hit.x, this.hit.z, this.hover);
    this.splashes = 0;
    if (this.reducedMotion) return;
    for (const tap of input.taps) {
      this.splashes += 1;
      // In the tunnel there is no water left to stir, so a click sends its ring through the stars.
      if (this.valley.uniforms.uTunnel.value > 0.5) {
        this.valley.pulse.set(tap.x, tap.y, this.valley.uniforms.uTime.value);
        continue;
      }
      this.raycaster.setFromCamera(new Vector2(tap.x, tap.y), this.camera);
      if (this.raycaster.ray.intersectPlane(this.ground, this.tapHit))
        this.valley.wake.drop(this.tapHit.x, this.tapHit.z);
    }
  }

  dispose(): void {
    this.abort.abort();
    this.atlas.value?.dispose();
    this.valley.dispose();
    this.numbers.dispose();
    for (const banner of this.banners) banner.dispose();
    this.curtain.dispose();
    this.reel.dispose();
    this.lens.dispose();
    this.mirror.dispose();
    this.screen.dispose();
    this.renderer.dispose();
  }
}
