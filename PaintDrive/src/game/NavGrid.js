/**
 * Rejilla de navegación del mapa, calculada a partir de un "mapa de alturas" visto desde arriba.
 * Sirve para:
 *  - saber qué celdas son obstáculos / agujeros / fuera del mapa (no se puede entrar),
 *  - colisiones suaves del coche con un campo de distancias (SDF),
 *  - saber qué celdas se pueden pintar,
 *  - elegir posiciones libres para coches, potenciadores y puntos.
 *
 * No depende de cómo esté hecho el modelo en Blender (objetos sueltos o todo unido).
 */

const INF = 1e20;

/** Transformada de distancia euclídea exacta (Felzenszwalb). Devuelve distancia en celdas al "feature" más cercano. */
function edt(feature, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  const g = new Float64Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = feature[i] ? 0 : INF;

  const pass = (len) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    pass(h);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    pass(w);
    for (let x = 0; x < w; x++) g[y * w + x] = d[x];
  }

  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(Math.sqrt(g[i]), 1e4);
  return out;
}

/** Altura del "suelo": la más frecuente (si hay varias, la más baja de las importantes). */
function findGroundHeight(hit, heights) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < hit.length; i++) {
    if (!hit[i]) continue;
    if (heights[i] < min) min = heights[i];
    if (heights[i] > max) max = heights[i];
  }
  if (min === Infinity) return 0;
  const bins = 512;
  const range = max - min || 1;
  const hist = new Uint32Array(bins);
  for (let i = 0; i < hit.length; i++) {
    if (!hit[i]) continue;
    hist[Math.min(bins - 1, Math.floor(((heights[i] - min) / range) * bins))]++;
  }
  let top = 0;
  for (let b = 0; b < bins; b++) top = Math.max(top, hist[b]);
  let pick = 0;
  for (let b = 0; b < bins; b++) {
    if (hist[b] >= top * 0.5) {
      pick = b;
      break;
    }
  }
  // media de las celdas de ese contenedor y los vecinos (más precisa que el centro)
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < hit.length; i++) {
    if (!hit[i]) continue;
    const b = Math.min(bins - 1, Math.floor(((heights[i] - min) / range) * bins));
    if (Math.abs(b - pick) <= 1) {
      sum += heights[i];
      cnt++;
    }
  }
  return cnt ? sum / cnt : min + ((pick + 0.5) * range) / bins;
}

export class NavGrid {
  /**
   * @param {{x0:number,z0:number,cell:number,w:number,h:number}} g  geometría de la rejilla (mundo)
   * @param {Uint8Array} hit        1 si hay geometría en esa celda (vista desde arriba)
   * @param {Float32Array} heights  altura (Y) de lo más alto en cada celda
   * @param {{obstacleHeight:number, holeDepth:number}} opts
   */
  constructor(g, hit, heights, opts) {
    this.x0 = g.x0;
    this.z0 = g.z0;
    this.cell = g.cell;
    this.w = g.w;
    this.h = g.h;
    const { w, h, cell } = this;
    const n = w * h;

    this.groundY = findGroundHeight(hit, heights);

    // altura relativa al suelo + celdas bloqueadas
    this.rel = new Float32Array(n);
    let blocked = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!hit[i]) {
        blocked[i] = 1;
        continue;
      }
      const r = heights[i] - this.groundY;
      this.rel[i] = r;
      if (r > opts.obstacleHeight || r < -opts.holeDepth) blocked[i] = 1;
    }

    // quitar motas sueltas (grietas entre piezas, píxeles aislados)
    const copy = blocked.slice();
    for (let j = 1; j < h - 1; j++) {
      for (let i = 1; i < w - 1; i++) {
        const idx = j * w + i;
        if (!copy[idx]) continue;
        let c = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && copy[idx + dj * w + di]) c++;
        if (c <= 1) blocked[idx] = 0;
      }
    }

    // el borde de la rejilla siempre es pared (nadie se sale del mapa)
    for (let i = 0; i < w; i++) {
      blocked[i] = 1;
      blocked[(h - 1) * w + i] = 1;
    }
    for (let j = 0; j < h; j++) {
      blocked[j * w] = 1;
      blocked[j * w + w - 1] = 1;
    }
    this.blocked = blocked;

    // celdas pintables y cuántas hay
    this.paintable = new Uint8Array(n);
    this.paintableCount = 0;
    for (let i = 0; i < n; i++) {
      if (!blocked[i]) {
        this.paintable[i] = 1;
        this.paintableCount++;
      }
    }

    // campo de distancias con signo (positivo = libre, negativo = dentro de un obstáculo), en unidades de mundo
    const free = new Uint8Array(n);
    for (let i = 0; i < n; i++) free[i] = blocked[i] ? 0 : 1;
    const dFree = edt(blocked, w, h);
    const dBlk = edt(free, w, h);
    this.sdf = new Float32Array(n);
    for (let i = 0; i < n; i++) this.sdf[i] = blocked[i] ? -(dBlk[i] - 0.5) * cell : (dFree[i] - 0.5) * cell;

    // puntos libres candidatos (cada 3 celdas) con su holgura
    this._pts = [];
    for (let j = 2; j < h - 2; j += 3) {
      for (let i = 2; i < w - 2; i += 3) {
        const idx = j * w + i;
        if (!blocked[idx]) this._pts.push({ x: this.x0 + (i + 0.5) * cell, z: this.z0 + (j + 0.5) * cell, clear: this.sdf[idx] });
      }
    }
    this._ptsCache = new Map();
    this._grad = { x: 0, z: 0 };
  }

  get width() {
    return this.w * this.cell;
  }
  get depth() {
    return this.h * this.cell;
  }

  /** Distancia con signo al obstáculo más cercano (interpolada). */
  sdfAt(x, z) {
    const { w, h, sdf } = this;
    const u = (x - this.x0) / this.cell - 0.5;
    const v = (z - this.z0) / this.cell - 0.5;
    const i0 = Math.floor(u);
    const j0 = Math.floor(v);
    const tx = u - i0;
    const ty = v - j0;
    const cl = (a, m) => (a < 0 ? 0 : a > m ? m : a);
    const ia = cl(i0, w - 1);
    const ib = cl(i0 + 1, w - 1);
    const ja = cl(j0, h - 1);
    const jb = cl(j0 + 1, h - 1);
    const a = sdf[ja * w + ia];
    const b = sdf[ja * w + ib];
    const c = sdf[jb * w + ia];
    const d = sdf[jb * w + ib];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  /** Dirección (unitaria) hacia donde "se sale" del obstáculo. Devuelve un objeto reutilizado. */
  gradAt(x, z) {
    const e = this.cell;
    let gx = this.sdfAt(x + e, z) - this.sdfAt(x - e, z);
    let gz = this.sdfAt(x, z + e) - this.sdfAt(x, z - e);
    const l = Math.hypot(gx, gz);
    if (l < 1e-6) {
      // sin información (fuera de la rejilla): empuja hacia el centro
      gx = this.x0 + this.width / 2 - x;
      gz = this.z0 + this.depth / 2 - z;
      const l2 = Math.hypot(gx, gz) || 1;
      this._grad.x = gx / l2;
      this._grad.z = gz / l2;
    } else {
      this._grad.x = gx / l;
      this._grad.z = gz / l;
    }
    return this._grad;
  }

  /** Altura del suelo en ese punto, relativa al suelo "normal" (0 en llano). */
  heightAt(x, z) {
    const i = Math.floor((x - this.x0) / this.cell);
    const j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return 0;
    const idx = j * this.w + i;
    return this.blocked[idx] ? 0 : this.rel[idx];
  }

  /** Puntos libres con al menos `clear` unidades de holgura a los obstáculos. */
  pointsWithClearance(clear) {
    const key = Math.round(clear * 10);
    let list = this._ptsCache.get(key);
    if (!list) {
      list = this._pts.filter((p) => p.clear >= clear);
      this._ptsCache.set(key, list);
    }
    return list;
  }

  /** Punto libre con holgura más cercano a (tx, tz). Si no hay, relaja la holgura. */
  findNearestFree(tx, tz, clear = 2.5) {
    for (let c = clear; c >= 0.4; c *= 0.7) {
      const list = this.pointsWithClearance(c);
      if (!list.length) continue;
      let best = list[0];
      let bd = Infinity;
      for (const p of list) {
        const d = (p.x - tx) ** 2 + (p.z - tz) ** 2;
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      return { x: best.x, z: best.z };
    }
    return { x: tx, z: tz };
  }

  /** Centro del mapa (útil para empujar coches atascados hacia una zona segura). */
  center() {
    return { x: this.x0 + this.width / 2, z: this.z0 + this.depth / 2 };
  }

  /**
   * Asegura que el objeto con .x/.z quede dentro de la caja del mapa,
   * con un margen `margin` (unidades de mundo). Lo modifica in-place.
   *
   * Si el objeto tiene `.speed`, se le aplica un rebote suave al chocar con el borde.
   */
  clampToBounds(obj, margin = 0) {
    const minX = this.x0 + margin;
    const maxX = this.x0 + this.width - margin;
    const minZ = this.z0 + margin;
    const maxZ = this.z0 + this.depth - margin;
    const hasSpeed = typeof obj.speed === 'number';
    if (obj.x < minX) {
      obj.x = minX;
      if (hasSpeed) obj.speed *= -0.3;
    } else if (obj.x > maxX) {
      obj.x = maxX;
      if (hasSpeed) obj.speed *= -0.3;
    }
    if (obj.z < minZ) {
      obj.z = minZ;
      if (hasSpeed) obj.speed *= -0.3;
    } else if (obj.z > maxZ) {
      obj.z = maxZ;
      if (hasSpeed) obj.speed *= -0.3;
    }
  }
}