import { glsl, header } from './common';

/**
 * A wall of rounded glass tiles with a poster held in it, each tile carrying its own cell of
 * the image. Tiles are instanced, and the cell comes from the tile's place in the grid plus
 * where the fragment sits on the tile's face before the tile is turned.
 */
export const glassVertex = glsl`${header}
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec2 uGrid;
uniform vec2 uCell;
in vec3 position;
in vec3 normal;
in mat4 instanceMatrix;
in vec2 aTile;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out float vFace;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vUv = (aTile + clamp(position.xy / uCell + 0.5, 0.0, 1.0)) / uGrid;
  vFace = normal.z;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * The tile's glass. The poster is lit from inside, so it reads as a screen behind the glass.
 * Where the bevel tilts the surface, the image is pulled sideways in proportion to the tilt,
 * further for blue than for red, the dispersion a thick edge gives. A key light held high
 * and to the left catches the bevels, and the faces seen edge-on pick up a Fresnel sheen.
 */
export const glassFragment = glsl`${header}
uniform sampler2D uPoster;
uniform vec3 uCamPos;
uniform vec3 uTint;
uniform float uOpacity;
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in float vFace;
out vec4 fragColor;

const vec3 KEY = normalize(vec3(-0.6, 0.55, 0.6));

void main() {
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 v = normalize(uCamPos - vWorld);
  float facing = max(dot(n, v), 0.0);
  vec2 bend = n.xy * (1.0 - facing) * 0.06;
  vec3 poster = vec3(
    texture(uPoster, vUv + bend * 1.0).r,
    texture(uPoster, vUv + bend * 1.25).g,
    texture(uPoster, vUv + bend * 1.5).b
  );
  // The back and sides of a turned tile show the glass, not the image behind it.
  float front = smoothstep(0.2, 0.9, vFace);
  vec3 body = mix(uTint * 0.05 + poster * 0.08, poster * 0.92, front);
  float key = pow(max(dot(reflect(-v, n), KEY), 0.0), 8.5) * 0.55 + pow(max(dot(reflect(-v, n), KEY), 0.0), 140.0) * 1.6;
  float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
  vec3 colour = body + vec3(key) + mix(uTint, vec3(1.0), 0.5) * fresnel * 0.35;
  // A soft roll-off keeps the poster's highlights bright without clipping them to white.
  colour = 1.0 - exp(-colour * 1.5);
  fragColor = vec4(colour, uOpacity);
}
`;
