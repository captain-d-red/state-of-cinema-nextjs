import {
  OrthographicCamera,
  Scene,
  Vector2,
  type BufferGeometry,
  type Camera,
  type IUniform,
  type Object3D,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { createHalfFloatTarget, createScreenPass } from './gl';
import { bloomExtractFragment, blurFragment, postFragment } from './shaders/post';

/**
 * Everything between the scene and the screen. The scene renders into a half-float target
 * with four-sample antialiasing, its brightest light is pulled out and blurred at a quarter of
 * the resolution, and one final pass bends, splits, blooms, grades and encodes the image.
 *
 *   scene ─► HDR MSAA   ─┬────────────────────────────────────────► post ─► screen
 *                         └─► extract ─► blur x ─► blur y (¼ res) ──┘
 */
export class Lens {
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly sceneTarget: WebGLRenderTarget;
  private readonly bloom: readonly [WebGLRenderTarget, WebGLRenderTarget];
  private readonly passes = { extract: new Scene(), blurX: new Scene(), blurY: new Scene(), post: new Scene() };
  private readonly steps: { x: IUniform<Vector2>; y: IUniform<Vector2> };
  private readonly post: Record<string, IUniform>;

  constructor(screen: BufferGeometry, samples: number) {
    this.sceneTarget = createHalfFloatTarget(1, 1, { depthBuffer: true, samples });
    this.bloom = [createHalfFloatTarget(1, 1), createHalfFloatTarget(1, 1)];
    this.steps = { x: { value: new Vector2() }, y: { value: new Vector2() } };
    this.passes.extract.add(
      createScreenPass(screen, bloomExtractFragment, {
        uSource: { value: this.sceneTarget.texture },
        uKnee: { value: 0.55 },
      }),
    );
    this.passes.blurX.add(
      createScreenPass(screen, blurFragment, { uSource: { value: this.bloom[0].texture }, uStep: this.steps.x }),
    );
    this.passes.blurY.add(
      createScreenPass(screen, blurFragment, { uSource: { value: this.bloom[1].texture }, uStep: this.steps.y }),
    );
    this.post = {
      uScene: { value: this.sceneTarget.texture },
      uBloom: { value: this.bloom[0].texture },
      uResolution: { value: new Vector2(1, 1) },
      uTime: { value: 0 },
      uExposure: { value: 1 },
      uHalation: { value: 0.4 },
      uGrain: { value: 0.03 },
      uFade: { value: 0 },
      uAberration: { value: 0.0055 },
      uBarrel: { value: -0.5 },
    };
    this.passes.post.add(createScreenPass(screen, postFragment, this.post));
  }

  /** Sizes every target to a drawing buffer of `width` by `height` pixels. */
  resize(width: number, height: number): void {
    this.sceneTarget.setSize(width, height);
    const bw = Math.ceil(width / 4);
    const bh = Math.ceil(height / 4);
    for (const target of this.bloom) target.setSize(bw, bh);
    this.steps.x.value.set(1.5 / bw, 0);
    this.steps.y.value.set(0, 1.5 / bh);
    (this.post.uResolution!.value as Vector2).set(width, height);
  }

  /** Renders the scene through the lens. `fade` brings the image up from black as the scene boots. */
  render(renderer: WebGLRenderer, scene: Object3D, camera: Camera, time: number, fade: number): void {
    this.post.uTime!.value = time;
    this.post.uFade!.value = fade;
    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(scene, camera);
    const [a, b] = this.bloom;
    renderer.setRenderTarget(a);
    renderer.render(this.passes.extract, this.camera);
    renderer.setRenderTarget(b);
    renderer.render(this.passes.blurX, this.camera);
    renderer.setRenderTarget(a);
    renderer.render(this.passes.blurY, this.camera);
    renderer.setRenderTarget(null);
    renderer.render(this.passes.post, this.camera);
  }

  dispose(): void {
    this.sceneTarget.dispose();
    for (const target of this.bloom) target.dispose();
    for (const scene of Object.values(this.passes)) {
      scene.traverse((o) => (o as { material?: { dispose(): void } }).material?.dispose());
    }
  }
}
