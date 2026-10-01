import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  RawShaderMaterial,
  RGBAFormat,
  Scene,
  WebGLRenderTarget,
  type IUniform,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { fullscreenVertex } from './shaders/common';

/** One triangle that covers the screen, the standard for screen passes. */
export function createFullscreenGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return geometry;
}

export function createScreenPass(
  geometry: BufferGeometry,
  fragmentShader: string,
  uniforms: Record<string, IUniform>,
): Mesh<BufferGeometry, RawShaderMaterial> {
  const mesh = new Mesh(
    geometry,
    new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: fullscreenVertex,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

export interface TargetOptions {
  readonly filter?: 'linear' | 'nearest';
  readonly depthBuffer?: boolean;
  readonly samples?: number;
}

/** A linear half-float target, so light and simulation values can leave the zero to one range. */
export function createHalfFloatTarget(width: number, height: number, options: TargetOptions = {}): WebGLRenderTarget {
  const filter = options.filter === 'nearest' ? NearestFilter : LinearFilter;
  return new WebGLRenderTarget(width, height, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: filter,
    magFilter: filter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer: options.depthBuffer ?? false,
    stencilBuffer: false,
    samples: options.samples ?? 0,
  });
}

/**
 * Two targets that take turns as source and destination, for state that is advanced by
 * reading last step's values. One screen pass reads `uniform` from the front target and
 * writes the back one, then they swap.
 */
export class PingPong {
  private readonly targets: [WebGLRenderTarget, WebGLRenderTarget];
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private front = 0;

  constructor(
    width: number,
    height: number,
    geometry: BufferGeometry,
    fragmentShader: string,
    readonly uniforms: Record<string, IUniform>,
    private readonly sourceUniform: string,
    options: TargetOptions = {},
  ) {
    this.targets = [createHalfFloatTarget(width, height, options), createHalfFloatTarget(width, height, options)];
    this.scene.add(createScreenPass(geometry, fragmentShader, uniforms));
  }

  get texture(): Texture {
    return this.targets[this.front]!.texture;
  }

  step(renderer: WebGLRenderer): void {
    const source = this.targets[this.front]!;
    const destination = this.targets[1 - this.front]!;
    this.uniforms[this.sourceUniform]!.value = source.texture;
    renderer.setRenderTarget(destination);
    renderer.render(this.scene, this.camera);
    this.front = 1 - this.front;
  }

  /** Fills both targets with one value, the way a fresh sheet of paper starts at zero. */
  clear(renderer: WebGLRenderer): void {
    for (const target of this.targets) {
      renderer.setRenderTarget(target);
      renderer.clear(true, false, false);
    }
  }

  dispose(): void {
    for (const target of this.targets) target.dispose();
    this.scene.traverse((o) => (o as Mesh).material && ((o as Mesh).material as RawShaderMaterial).dispose());
  }
}
