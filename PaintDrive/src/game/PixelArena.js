import * as THREE from 'three';
import { PIXEL, CHARACTERS } from './config.js';

const drawingUrls = import.meta.glob('../assets/dibujos/*.png', { query: '?url', import: 'default', eager: true });

const NONE = 255;
const S = 16; 

const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Pasa una imagen (canvas) a una lista de índices de la paleta (NONE = casilla vacía). */
function quantize(canvas) {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const pal = PIXEL.palette.map((p) => hexRgb(p.hex));
  
  // AÑADIMOS EL BLANCO A LA PALETA INTERNA (será el último índice)
  pal.push([255, 255, 255]); 

  // --- TRUCO PARA FORZAR EL VERDE (Para Finn) ---
  const greenIndex = PIXEL.palette.findIndex(p => p.name.toLowerCase().includes('verde'));

  const out = new Uint8Array(w * h).fill(NONE);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    
    // Solo ignoramos lo transparente (canal alfa)
    if (a < 128) continue; 
    
    // Si el personaje tiene verde y el píxel es claramente verde, lo forzamos
    if (greenIndex !== -1 && g > 50 && g > r * 1.1 && g > b * 1.1) {
      out[i] = greenIndex;
      continue;
    }
    // -----------------------------------------------

    let best = 0, bd = Infinity;
    pal.forEach((c, k) => {
      const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
      if (d < bd) { bd = d; best = k; }
    });
    out[i] = best;
  }
  return out;
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
}

/** Dibuja un candado en un canvas para usarlo como textura 3D */
function makeLockTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffd400';
  ctx.beginPath();
  ctx.roundRect(34, 54, 60, 50, 10);
  ctx.fill();
  ctx.strokeStyle = '#ffd400';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(64, 54, 22, Math.PI, 0, false);
  ctx.stroke();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(64, 75, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(60, 75, 8, 12);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class PixelArena {
  static async create() {
    const a = new PixelArena();
    
    // 1. Elegir un personaje AL AZAR
    const randomIndex = Math.floor(Math.random() * CHARACTERS.length);
    const character = CHARACTERS[randomIndex];
    console.log(`[Paint Drive] Personaje seleccionado: ${character.name}`);
    
    // 2. Configurar la paleta con los colores de ese personaje
    PIXEL.palette = character.palette;

    // 3. Buscar la imagen en la carpeta src/assets/dibujos/
    const imagePath = `../assets/dibujos/${character.file}`;
    const url = drawingUrls[imagePath];

    if (url) {
      try {
        const im = await loadImage(url);
        const c = document.createElement('canvas');
        c.width = PIXEL.cols;
        c.height = PIXEL.rows;
        const x = c.getContext('2d');
        x.drawImage(im, 0, 0, PIXEL.cols, PIXEL.rows);
        a.target = quantize(c);
        
        a.imageUrl = url; // <--- Guardamos la URL para el HUD
        
      } catch (e) {
        console.warn(`[Paint Drive] No se pudo leer ${character.file}; se usa un dibujo por defecto.`, e);
        a.target = sampleFallback(PIXEL.cols, PIXEL.rows);
      }
    } else {
      console.warn(`[Paint Drive] No se encontró la imagen ${character.file} en src/assets/dibujos/.`);
      a.target = sampleFallback(PIXEL.cols, PIXEL.rows);
    }
    
    a._build();
    return a;
  }

  _build() {
    const { cols, rows, cell, margin, paletteW, wallHeight: WH, wallThickness: T, padSize } = PIXEL;
    const pal = PIXEL.palette;
    const sx = paletteW + cols * cell + margin;
    const sz = rows * cell + margin * 2;
    const x0 = -sx / 2, x1 = sx / 2, z0 = -sz / 2, z1 = sz / 2;
    this.gx0 = x0 + paletteW;
    this.gz0 = z0 + margin;
    this.cols = cols;
    this.rows = rows;
    this.cell = cell;
    this.palette = pal;
    this.painted = new Uint8Array(cols * rows).fill(NONE);
    
    // --- LÓGICA DE CANDADOS Y BLANCO DINÁMICO ---
    this.whiteIdx = pal.length; // El blanco siempre es el último índice (4, 5, etc)
    
    this.colorTargets = new Array(pal.length).fill(0);
    this.colorPainted = new Array(pal.length).fill(0);
    this.locked = new Array(pal.length).fill(false);

    this.totalCells = 0;
    this.target.forEach((t) => {
      if (t !== NONE && t !== this.whiteIdx) {
        this.totalCells++;
        if (t < pal.length) this.colorTargets[t]++;
      }
    });
    // ----------------------------------------------

    this.correct = 0;
    this.current = 0;
    this.time = 0;
    this.dirty = false;
    this.root = new THREE.Group();
    this.root.name = 'PixelArena';

    this.bounds = { x0, z0, x1, z1, sx, sz, cx: 0, cz: 0 };
    this.nav = this._makeNav(this.bounds);
    this.bounds.play = this.nav.play;
    this.gridCenter = { x: this.gx0 + (cols * cell) / 2, z: this.gz0 + (rows * cell) / 2 };

    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.ceil(sx * S);
    this.canvas.height = Math.ceil(sz * S);
    this.ctx = this.canvas.getContext('2d');
    this._drawFloor();
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(sx, sz),
      new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.95, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(sx + T * 2, 0.6, sz + T * 2), new THREE.MeshStandardMaterial({ color: 0x2c3040, roughness: 1 }));
    slab.position.y = -0.33;
    this.root.add(slab);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(sx + 90, sz + 90), new THREE.MeshStandardMaterial({ color: 0x4a9d4a, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.64;
    grass.receiveShadow = true;
    this.root.add(grass);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8b92a3, roughness: 0.8 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xdfe3ec, roughness: 0.7 });
    const addWall = (w, d, px, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, WH, d), wallMat);
      m.position.set(px, WH / 2, pz);
      m.castShadow = m.receiveShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.12, d + 0.02), capMat);
      cap.position.set(px, WH + 0.06, pz);
      this.root.add(m, cap);
    };
    addWall(sx + T * 2, T, 0, z0 - T / 2);
    addWall(sx + T * 2, T, 0, z1 + T / 2);
    addWall(T, sz, x0 - T / 2, 0);
    addWall(T, sz, x1 + T / 2, 0);

    this.pads = [];
    const lockTex = makeLockTexture();
    
    const pitch = sz / pal.length;
    pal.forEach((p, k) => {
      const px = x0 + paletteW / 2;
      const pz = z0 + pitch * (k + 0.5);
      
      const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
      const frame = new THREE.Mesh(new THREE.BoxGeometry(padSize + 0.35, 0.1, padSize + 0.35), frameMat);
      frame.position.set(px, 0.05, pz);
      
      const tileMat = new THREE.MeshStandardMaterial({ color: p.hex, emissive: p.hex, emissiveIntensity: 0.3, roughness: 0.4 });
      const tile = new THREE.Mesh(new THREE.BoxGeometry(padSize, 0.16, padSize), tileMat);
      tile.position.set(px, 0.08, pz);
      tile.receiveShadow = true;
      
      const ballMat = new THREE.MeshStandardMaterial({ color: p.hex, emissive: p.hex, emissiveIntensity: 0.5, roughness: 0.3 });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), ballMat);
      ball.position.set(px, 1.6, pz);
      ball.castShadow = true;

      const lockSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockTex, depthTest: false }));
      lockSprite.position.set(px, 2.6, pz);
      lockSprite.scale.set(1.2, 1.2, 1);
      lockSprite.visible = false;

      this.root.add(frame, tile, ball, lockSprite);
      this.pads.push({ x: px, z: pz, half: padSize / 2, frameMat, ball, k, lockSprite });
    });
    this._markActivePad();

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7d3a, roughness: 1 });
    const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    for (let i = 0; i < 26; i++) {
      const side = i % 4;
      const along = rnd();
      const out = T + 2 + rnd() * 8;
      const px = side < 2 ? x0 - T + along * (sx + T * 2) : (side === 2 ? x0 - out : x1 + out);
      const pz = side < 2 ? (side === 0 ? z0 - out : z1 + out) : z0 + along * sz;
      const h = 2 + rnd() * 1.6;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, h * 0.4, 6), trunkMat);
      trunk.position.set(px, h * 0.2 - 0.64, pz);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1 + rnd() * 0.5, h, 7), leafMat);
      leaf.position.set(px, h * 0.4 + h / 2 - 0.64, pz);
      leaf.castShadow = trunk.castShadow = true;
      this.root.add(trunk, leaf);
    }
  }

  _makeNav(b) {
    const g = { x: 0, z: 0 };
    const play = { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, cx: 0, cz: 0, sx: b.sx, sz: b.sz };
    return {
      play,
      groundY: 0,
      sealedOutside: 0,
      sdfAt: (x, z) => Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z),
      gradAt: (x, z) => {
        const a = x - b.x0, c = b.x1 - x, d = z - b.z0, e = b.z1 - z;
        const m = Math.min(a, c, d, e);
        g.x = g.z = 0;
        if (m === a) g.x = 1;
        else if (m === c) g.x = -1;
        else if (m === d) g.z = 1;
        else g.z = -1;
        return g;
      },
      heightAt: () => 0,
      center: () => ({ x: 0, z: 0 }),
      findNearestFree: (x, z) => ({ x, z }),
      clampToBounds(obj, margin = 0) {
        const hasSpeed = typeof obj.speed === 'number';
        const lim = (v, lo, hi) => {
          if (v < lo + margin) { if (hasSpeed) obj.speed *= -0.3; return lo + margin; }
          if (v > hi - margin) { if (hasSpeed) obj.speed *= -0.3; return hi - margin; }
          return v;
        };
        obj.x = lim(obj.x, b.x0, b.x1);
        obj.z = lim(obj.z, b.z0, b.z1);
      },
    };
  }

  _drawFloor() {
    const { ctx, canvas, bounds: b } = this;
    ctx.fillStyle = '#4a5062';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#3e4354';
    ctx.fillRect(0, 0, PIXEL.paletteW * S, canvas.height);
    ctx.fillStyle = '#c9ced9';
    ctx.fillRect((PIXEL.paletteW - 0.35) * S, 0, 0.12 * S, canvas.height);
    for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) this._drawCell(i, j);
  }

  _drawCell(i, j) {
    const idx = j * this.cols + i;
    const t = this.target[idx];
    const p = this.painted[idx];
    const x = (this.gx0 - this.bounds.x0 + i * this.cell) * S;
    const y = (this.gz0 - this.bounds.z0 + j * this.cell) * S;
    const cs = this.cell * S;
    const ctx = this.ctx;
    
    // Fondo de la casilla (junta)
    ctx.fillStyle = '#343949';
    ctx.fillRect(x, y, cs, cs);

    let color = (i + j) % 2 ? '#575d6e' : '#525869'; 

    if (t !== NONE) {
      if (t === this.whiteIdx) {
        // SI ES EL BLANCO INTOCABLE, LO PINTAMOS BLANCO
        color = '#ffffff'; 
      } else {
        // Si ya está pintado, usamos su color. Si no, el gris clarito de "por pintar"
        color = (p !== NONE && p < this.palette.length) ? this.palette[p].hex : '#eef0f6';
      }
    }

    ctx.fillStyle = color;
    ctx.fillRect(x + 0.7, y + 0.7, cs - 1.4, cs - 1.4);
  }

  get remaining() {
    return this.totalCells - this.correct;
  }

  indexOfColor(hex) {
    const k = this.palette.findIndex((p) => p.hex.toLowerCase() === String(hex).toLowerCase());
    return k < 0 ? 0 : k;
  }

  _markActivePad() {
    this.pads.forEach((p) => {
      if (this.locked[p.k]) {
        p.frameMat.color.set(0x555555); // Gris si está bloqueado
      } else {
        p.frameMat.color.set(p.k === this.current ? 0xffd400 : 0xffffff); // Amarillo si es el actual
      }
    });
  }

  setCurrent(k) {
    this.current = k;
    this._markActivePad();
  }

  update(dt, car, onPick) {
    this.time += dt;
    this.pads.forEach((p) => {
      p.ball.position.y = 1.6 + Math.sin(this.time * 2.2 + p.k) * 0.15;
      p.ball.rotation.y += dt;
      if (p.lockSprite.visible) {
        p.lockSprite.position.y = 2.6 + Math.sin(this.time * 3) * 0.1; 
      }
    });
    
    for (const p of this.pads) {
      // Si el color está bloqueado, no hace nada si pasas por encima
      if (this.locked[p.k]) continue; 

      if (p.k !== this.current && Math.abs(car.x - p.x) < p.half && Math.abs(car.z - p.z) < p.half) {
        this.setCurrent(p.k);
        onPick?.(p.k);
        break;
      }
    }
    this._paint(car);
    if (this.dirty) {
      this.tex.needsUpdate = true;
      this.dirty = false;
    }
  }

  _paint(car) {
    const r = PIXEL.brushRadius * car.size;
    const { cell, cols, rows } = this;
    const i0 = Math.max(0, Math.floor((car.x - r - this.gx0) / cell));
    const i1 = Math.min(cols - 1, Math.floor((car.x + r - this.gx0) / cell));
    const j0 = Math.max(0, Math.floor((car.z - r - this.gz0) / cell));
    const j1 = Math.min(rows - 1, Math.floor((car.z + r - this.gz0) / cell));
    for (let j = j0; j <= j1; j++) {
      const dz = this.gz0 + (j + 0.5) * cell - car.z;
      for (let i = i0; i <= i1; i++) {
        const dx = this.gx0 + (i + 0.5) * cell - car.x;
        if (dx * dx + dz * dz > r * r) continue;
        const idx = j * cols + i;
        const t = this.target[idx];
        
        // EL BLANCO NO SE PUEDE PINTAR
        if (t === NONE || t === this.whiteIdx) continue; 
        
        if (PIXEL.rule === 'match' && t !== this.current) continue;
        const before = this.painted[idx];
        if (before === this.current) continue;
        
        this.painted[idx] = this.current;
        this.correct += (this.current === t ? 1 : 0) - (before === t ? 1 : 0);
        
        // --- LÓGICA DE CONTAR PARA EL CANDADO ---
        if (this.current === t) {
          this.colorPainted[t]++;
          if (this.colorPainted[t] >= this.colorTargets[t]) {
            this.locked[t] = true;
            const pad = this.pads.find(p => p.k === t);
            if (pad) pad.lockSprite.visible = true;
            this._markActivePad();
          }
        } else if (before === t) {
          this.colorPainted[t]--;
        }
        // ---------------------------------------

        this._drawCell(i, j);
        this.dirty = true;
      }
    }
  }

  dispose() {
    this.root.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.tex?.dispose();
  }
}

function sampleFallback(cols, rows) {
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const x = c.getContext('2d');
  x.scale(cols / 40, rows / 28);
  const rect = (color, a, b, w, h) => { x.fillStyle = color; x.fillRect(a, b, w, h); };
  const circle = (color, cx, cy, r) => { x.fillStyle = color; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
  circle('#ffc400', 7, 7, 4);
  rect('#22b04a', 0, 23, 40, 5);
  rect('#1f5bff', 14, 12, 14, 11);
  x.fillStyle = '#a43bff';
  x.beginPath(); x.moveTo(12, 12); x.lineTo(21, 4); x.lineTo(30, 12); x.closePath(); x.fill();
  rect('#e8222e', 19, 16, 4, 7);
  return quantize(c);
}