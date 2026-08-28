import * as THREE from 'three';

export interface WindowUniforms extends Record<string, THREE.IUniform> {
  uBase: THREE.IUniform<THREE.Vector2>;
  uTop: THREE.IUniform<THREE.Vector2>;
  uHalf: THREE.IUniform<number>;
  uFeather: THREE.IUniform<number>;
  uAspect: THREE.IUniform<number>;
  uAlpha: THREE.IUniform<number>;
}

export function windowUniforms(): WindowUniforms {
  return {
    uBase: { value: new THREE.Vector2() },
    uTop: { value: new THREE.Vector2() },
    uHalf: { value: 0 },
    uFeather: { value: 0.01 },
    uAspect: { value: 1 },
    uAlpha: { value: 0.12 },
  };
}

const GLSL = `
  uniform vec2 uBase; uniform vec2 uTop; uniform float uHalf; uniform float uFeather; uniform float uAspect; uniform float uAlpha;
  varying vec4 vClip; varying float vCut;
  float strataCapsule(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }
  float strataWindow() {
    vec2 ndc = vClip.xy / vClip.w;
    vec2 asp = vec2(uAspect, 1.0);
    float d = strataCapsule(ndc * asp, uBase * asp, uTop * asp);
    return (1.0 - smoothstep(uHalf, uHalf + uFeather, d)) * vCut;
  }`;

/** Patches a material so the window's band discards it (solid) or fades it (shell). */
export function windowed<T extends THREE.Material>(
  material: T,
  uniforms: WindowUniforms,
  shell: boolean,
): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float cut; varying vec4 vClip; varying float vCut;',
      )
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvClip = gl_Position; vCut = cut;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}`)
      .replace(
        '#include <dithering_fragment>',
        shell
          ? '#include <dithering_fragment>\n  { float w = strataWindow(); if (w <= 0.001) discard; gl_FragColor.a *= mix(1.0, uAlpha, w); }'
          : '#include <dithering_fragment>\n  { if (strataWindow() > 0.001) discard; }',
      );
  };
  material.customProgramCacheKey = () => (shell ? 'strata-window-shell' : 'strata-window-solid');
  return material;
}
