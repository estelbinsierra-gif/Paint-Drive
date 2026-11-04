import * as THREE from 'three';

/**
 * Capa de pintura del mapa (modo 2 jugadores).
 *
 *  - Un <canvas> 2D guarda lo que se ve (las huellas de pintura).
 *  - Ese canvas se proyecta "desde arriba" sobre el mapa con un pequeño añadido al shader de sus materiales
 *    (así NO depende de que el mapa tenga UV desplegado; solo se pinta en suelo llano accesible).
 *  - Una rejilla de "quién ha pintado cada celda" sirve para el marcador (porcentajes) sin leer píxeles.
 */
export class PaintLayer {
  /**
   * @param {{nav:import('./NavGrid.js').NavGrid, bounds:object}} map
   * @param {{1:string,2:string}} colors  colores CSS por jugador
   * @param {number} scale píxeles de canvas por celda de rejilla
   */
  constructor(map, colors, scale = 2) {
    const { nav, bounds } = map;
    this.nav = nav;
    this.bounds = bounds;
    this.colors = colors;

    this.canvas = document.createElement('canvas');
    this.canvas.width = nav.w * scale;
    this.canvas.height = nav.h * scale;
    this.ctx = this.canvas.getContext('2d');
    this.pxPerUnit = this.canvas.width / bounds.sx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false;
    this.texture.premultiplyAlpha = true;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Máscara: 255 donde se puede pintar
    const mask = new Uint8Array(nav.w * nav.h);
    for (let i = 0; i < mask.length; i++) mask[i] = nav.paintable[i] ? 255 : 0;
    this.maskTexture = new THREE.DataTexture(mask, nav.w, nav.h, THREE.RedFormat, THREE.UnsignedByteType);
    this.maskTexture.unpackAlignment = 1;
    this.maskTexture.minFilter = THREE.LinearFilter;
    this.maskTexture.magFilter = THREE.LinearFilter;
    this.maskTexture.needsUpdate = true;

    this.uniforms = {
      uPaint: { value: this.texture },
      uMask: { value: this.maskTexture },
      uBounds: { value: new THREE.Vector4(bounds.x0, bounds.z0, bounds.sx, bounds.sz) },
    };

    this.owner = new Uint8Array(nav.w * nav.h); // 0 = nadie, 1 = J1, 2 = J2
    this.counts = [0, 0, 0];
    this.total = Math.max(1, nav.paintableCount);
    this.dirty = false;
    this._patched = new Map();
  }

  /** Añade la pintura a los materiales del mapa. */
  attach(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const patch = (m) => {
        if (m.transparent) return m; // cristales, decals...: sin pintura
        let c = this._patched.get(m);
        if (!c) {
          c = m.clone();
          this._patch(c);
          this._patched.set(m, c);
        }
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(patch) : patch(o.material);
    });
  }

  _patch(mat) {
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uPaint = u.uPaint;
      shader.uniforms.uMask = u.uMask;
      shader.uniforms.uBounds = u.uBounds;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPaintWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaintWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vPaintWorld;\nuniform sampler2D uPaint;\nuniform sampler2D uMask;\nuniform vec4 uBounds;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec3 pdN = normalize(cross(dFdx(vPaintWorld), dFdy(vPaintWorld)));
            float pdUp = smoothstep(0.5, 0.8, abs(pdN.y));
            vec2 pdUv = (vPaintWorld.xz - uBounds.xy) / uBounds.zw;
            float pdIn = step(0.0, pdUv.x) * step(pdUv.x, 1.0) * step(0.0, pdUv.y) * step(pdUv.y, 1.0);
            vec2 pdC = clamp(pdUv, 0.0, 1.0);
            float pdM = texture2D(uMask, pdC).r * pdUp * pdIn;
            vec4 pdP = texture2D(uPaint, pdC);
            diffuseColor.rgb = diffuseColor.rgb * (1.0 - pdP.a * pdM) + pdP.rgb * pdM;
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'paintdrive-paint-v1';
    mat.needsUpdate = true;
  }

  /** Huella circular de `owner` en (x, z) con radio r (unidades de mapa). */
  stamp(x, z, r, owner) {
    const { bounds, nav, ctx } = this;
    ctx.fillStyle = this.colors[owner];
    ctx.beginPath();
    ctx.arc((x - bounds.x0) * this.pxPerUnit, (z - bounds.z0) * this.pxPerUnit, r * this.pxPerUnit, 0, Math.PI * 2);
    ctx.fill();
    this.dirty = true;

    // rejilla de propietarios (para el marcador)
    const { w, h, cell } = nav;
    const i0 = Math.max(0, Math.floor((x - r - nav.x0) / cell));
    const i1 = Math.min(w - 1, Math.ceil((x + r - nav.x0) / cell));
    const j0 = Math.max(0, Math.floor((z - r - nav.z0) / cell));
    const j1 = Math.min(h - 1, Math.ceil((z + r - nav.z0) / cell));
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      const dz = nav.z0 + (j + 0.5) * cell - z;
      for (let i = i0; i <= i1; i++) {
        const idx = j * w + i;
        if (!nav.paintable[idx]) continue;
        const dx = nav.x0 + (i + 0.5) * cell - x;
        if (dx * dx + dz * dz > r2) continue;
        const prev = this.owner[idx];
        if (prev === owner) continue;
        this.counts[prev]--;
        this.counts[owner]++;
        this.owner[idx] = owner;
      }
    }
  }

  /** Explosión de color: gran círculo con salpicaduras alrededor. */
  splash(x, z, radius, owner) {
    this.stamp(x, z, radius, owner);
    const drops = 22;
    for (let i = 0; i < drops; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * (0.85 + Math.random() * 0.7);
      this.stamp(x + Math.cos(a) * d, z + Math.sin(a) * d, radius * (0.05 + Math.random() * 0.17), owner);
    }
  }

  /** Fracción (0..1) del mapa pintable que tiene ese jugador. */
  fraction(owner) {
    return Math.max(0, this.counts[owner]) / this.total;
  }

  /** Llamar una vez por frame: sube el canvas a la GPU si ha cambiado. */
  flush() {
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }

  dispose() {
    this.texture.dispose();
    this.maskTexture.dispose();
    this._patched.forEach((m) => m.dispose());
    this._patched.clear();
  }
}
