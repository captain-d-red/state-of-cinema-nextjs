import { glsl, hash, header } from './common';

/** Keeps the light above a knee, the part that blooms through the emulsion as halation. */
export const bloomExtractFragment = glsl`${header}
uniform sampler2D uSource;
uniform float uKnee;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 c = texture(uSource, vUv).rgb;
  float m = max(c.r, max(c.g, c.b));
  float keep = max(m - uKnee, 0.0) / max(m, 1e-4);
  fragColor = vec4(c * keep, 1.0);
}
`;

/** Nine taps of a Gaussian along one axis, the two halves of a separable blur. */
export const blurFragment = glsl`${header}
uniform sampler2D uSource;
uniform vec2 uStep;
in vec2 vUv;
out vec4 fragColor;
void main() {
  const float W[5] = float[5](0.2270, 0.1945, 0.1216, 0.0541, 0.0162);
  vec3 c = texture(uSource, vUv).rgb * W[0];
  for (int i = 1; i < 5; i++) {
    c += texture(uSource, vUv + uStep * float(i)).rgb * W[i];
    c += texture(uSource, vUv - uStep * float(i)).rgb * W[i];
  }
  fragColor = vec4(c, 1.0);
}
`;

/**
 * The one place the image is encoded for the screen. Light stays linear until here, where the
 * lens bends and splits it, bloom spreads the brightest glints, a soft shoulder rolls
 * highlights toward white, the grain sits on top and the result is written as sRGB.
 */
export const postFragment = glsl`${header}
${hash}
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uHalation;
uniform float uGrain;
uniform float uFade;
/** Radial chromatic aberration, and barrel distortion as a gain on the squared radius. */
uniform float uAberration;
uniform float uBarrel;
in vec2 vUv;
out vec4 fragColor;

/** Reinhard on the brightest channel, so saturated colours roll off without shifting hue. */
vec3 shoulder(vec3 c) {
  float m = max(max(c.r, c.g), c.b);
  const float knee = 0.7;
  if (m <= knee) return c;
  float over = m - knee;
  float mapped = knee + (1.0 - knee) * over / (over + (1.0 - knee));
  return c * (mapped / m);
}

vec3 encodeSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  // A cheap lens: the image bows outward toward the corners, and red and blue land a little
  // either side of green in proportion to the distance from the centre.
  vec2 centre = vUv - 0.5;
  vec2 uv = centre * (1.0 + uBarrel * dot(centre, centre)) + 0.5;
  vec2 split = (uv - 0.5) * length(uv - 0.5) * uAberration;
  vec3 col = vec3(texture(uScene, uv - split).r, texture(uScene, uv).g, texture(uScene, uv + split).b);
  col += texture(uBloom, uv).rgb * uHalation;
  col *= uExposure;
  vec2 centred = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  col *= 1.0 - 0.38 * smoothstep(0.3, 1.1, length(centred));
  col = shoulder(col) * uFade;
  vec3 srgb = encodeSrgb(col);
  float luma = dot(srgb, vec3(0.2126, 0.7152, 0.0722));
  float grain = hash12(gl_FragCoord.xy * 0.73 + vec2(fract(uTime * 13.1) * 311.0, fract(uTime * 7.7) * 173.0)) - 0.5;
  srgb += grain * uGrain * (1.0 - 0.6 * luma);
  srgb += (hash12(gl_FragCoord.xy + 17.0) + hash12(gl_FragCoord.yx + 41.0) - 1.0) / 255.0;
  fragColor = vec4(srgb, 1.0);
}
`;
