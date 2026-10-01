import { ATLAS } from '@/data/atlas';
import { f, glsl, header } from './common';

/**
 * One frame of the reel: a poster set in a strip of film, with the dark rebate down both
 * sides and sprocket holes punched through it. The quad is the whole strip section, and the
 * poster sits inside it with the rebate around it.
 *
 *   ▯ ┌─────────┐ ▯
 *   ▯ │ poster  │ ▯     rebate 16 % of the width each side, holes every 1/8 of the height
 *   ▯ │  2 : 3  │ ▯
 *   ▯ └─────────┘ ▯
 */
export const reelVertex = glsl`${header}
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in vec2 uv;
in mat4 instanceMatrix;
/** Catalogue index of the film in this frame, and how lit it is from zero to one. */
in vec2 aFrame;
/** Opacity of this frame, which fades it in with the tunnel and out at either end of the reel. */
in float aFade;
out vec2 vUv;
out vec2 vCell;
out float vLit;
out float vFade;
void main() {
  vUv = uv;
  float index = aFrame.x;
  vCell = vec2(mod(index, ${f(ATLAS.columns)}), floor(index / ${f(ATLAS.columns)}));
  vLit = aFrame.y;
  vFade = aFade;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

export const reelFragment = glsl`${header}
uniform sampler2D uAtlas;
uniform vec2 uAtlasCells;
uniform vec3 uGlow;
in vec2 vUv;
in vec2 vCell;
in float vLit;
in float vFade;
out vec4 fragColor;

const float REBATE = 0.16;

void main() {
  vec2 p = vUv;
  float inRebate = step(p.x, REBATE) + step(1.0 - REBATE, p.x);
  // Sprocket holes are rounded rectangles centred in each rebate, eight down the frame.
  vec2 hole = vec2(abs(fract(p.x < 0.5 ? p.x / REBATE : (1.0 - p.x) / REBATE) - 0.5), abs(fract(p.y * 8.0) - 0.5));
  vec2 q = max(hole - vec2(0.22, 0.26), 0.0);
  if (inRebate > 0.5 && length(q) < 0.06 && hole.x < 0.32 && hole.y < 0.32) discard;
  vec2 frameUv = vec2((p.x - REBATE) / (1.0 - 2.0 * REBATE), p.y);
  vec2 atlasUv = (vCell + vec2(frameUv.x, 1.0 - frameUv.y)) / uAtlasCells;
  atlasUv.y = 1.0 - atlasUv.y;
  vec3 poster = texture(uAtlas, atlasUv).rgb;
  vec3 film = mix(vec3(0.012, 0.013, 0.016), uGlow * 0.05, 0.4);
  vec3 colour = inRebate > 0.5 ? film : poster * (0.82 + 0.5 * vLit);
  // A lit frame gains a thin rim of the tunnel's light, the way a gate catches the lamp.
  float rim = inRebate > 0.5 ? 0.0 : 1.0 - smoothstep(0.0, 0.02, min(min(frameUv.x, 1.0 - frameUv.x), min(frameUv.y, 1.0 - frameUv.y)));
  colour += uGlow * rim * vLit * 1.4;
  fragColor = vec4(colour, vFade);
}
`;
