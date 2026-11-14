/**
 * Small GLSL programs for the globe. Kept here so the scene components stay readable.
 */

/** Fresnel rim glow on a slightly larger back-facing sphere; brighter on the sunlit side. */
export const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

export const atmosphereFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;
  void main() {
    // Back faces: dot(n, v) runs from about -0.45 just outside the planet's limb to 0 at the outer edge.
    float rim = clamp(-dot(vNormal, vViewDir) / 0.45, 0.0, 1.0);
    float glow = pow(rim, 2.2);
    float day = smoothstep(-0.35, 0.6, dot(vWorldNormal, uSunDir));
    gl_FragColor = vec4(uColor * glow * uIntensity * (0.25 + 0.75 * day), glow);
  }
`;

/** City lights that only show on the night side of Earth (additive). */
export const nightVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const nightFragment = /* glsl */ `
  uniform sampler2D uNight;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    float night = smoothstep(0.08, -0.22, dot(vWorldNormal, uSunDir));
    vec3 lights = texture2D(uNight, vUv).rgb;
    gl_FragColor = vec4(lights * night * 1.35, 1.0);
  }
`;
