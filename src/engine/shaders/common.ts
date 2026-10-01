/**
 * GLSL shared by every pass. Shaders are TypeScript template strings, so chunks compose with
 * plain interpolation and every constant stays in one typed place.
 */

/** Identity tag that lets editor tooling highlight GLSL inside template strings. */
export const glsl = (strings: TemplateStringsArray, ...values: (string | number)[]): string =>
  strings.reduce((out, s, i) => out + s + (i < values.length ? String(values[i]) : ''), '');

/** Formats a number as a GLSL float literal, so `2` becomes `2.0` and never an int. */
export const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));

/** Three adds `#version 300 es` itself for materials created with `glslVersion: GLSL3`. */
export const header = glsl`
precision highp float;
precision highp int;
precision highp sampler2D;
`;

export const hash = glsl`
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
`;

/** One triangle covering the screen, with its texture coordinate. */
export const fullscreenVertex = glsl`${header}
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Standard mesh vertex, passing world position, normal and texture coordinate on. */
export const meshVertex = glsl`${header}
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in vec3 normal;
in vec2 uv;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;
