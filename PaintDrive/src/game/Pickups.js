import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { POWERUPS, COINS } from './config.js';

const glbUrls = import.meta.glob('../assets/*.glb', { query: '?url', import: 'default', eager: true });

export const POWERUP_INFO = {
  // big: Rojo (antes verde) - 0xff2222 / #ff2222
  big: { label: 'GRANDE', ring: 0xff2222, css: '#ff2222', icon: '⬆' },
  // speed: Azul (antes amarillo) - 0x1f5bff / #1f5bff
  speed: { label: 'VELOCIDAD', ring: 0x1f5bff, css: '#1f5bff', icon: '⚡' },
  // splash: Morado (se queda igual)
  splash: { label: 'EXPLOSIÓN', ring: 0xff3bd4, css: '#ff3bd4', icon: '✹' },
};

/* ------------------------------------------------------------------ */
/*  Modelos de los potenciadores (GLB si existe; si no, uno provisional) */
/* ------------------------------------------------------------------ */
async function loadTemplate(type) {
  const file = POWERUPS.files[type];
  const url = glbUrls[`../assets/${file}`];
  if (url) {
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      const m = gltf.scene;
      
      const trash = [];
      m.traverse((o) => {
        if (o.isLight || o.isCamera) trash.push(o);
        if (o.isMesh) {
          o.castShadow = true;
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((mm) => {
              mm.transparent = false;
              mm.opacity = 1;
              if (mm.emissive) mm.emissiveIntensity = 1.0; // Brillo máximo
            });
          }
        }
      });
      trash.forEach((o) => o.parent?.remove(o));

      // Forzamos un tamaño más grande para que tu círculo azul se vea bien
      return fit(m, POWERUPS.size * 1.5);
    } catch (err) {
      console.warn(`[Paint Drive] No se pudo cargar ${file}; se usa un modelo provisional.`, err);
    }
  } else {
    console.warn(`[Paint Drive] No existe src/assets/${file}; se usa un modelo provisional.`);
  }
  return fit(fallbackModel(type), POWERUPS.size);
}

/** Escala el modelo para que mida `size`, lo centra en X/Z y lo apoya en y = 0. */
function fit(obj, size) {
  const holder = new THREE.Group();
  holder.add(obj);
  
  // Calculamos la caja envolvente real
  const box = new THREE.Box3().setFromObject(obj);
  const s = box.getSize(new THREE.Vector3());
  
  // Escalamos basándonos en el lado más grande
  const maxDim = Math.max(s.x, s.y, s.z, 1e-6);
  obj.scale.multiplyScalar(size / maxDim);
  
  obj.updateMatrixWorld(true);
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  
  // Lo centramos perfectamente en su espacio
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= box.min.y;
  
  return holder;
}

function fallbackModel(type) {
  const info = POWERUP_INFO[type];
  const mat = new THREE.MeshStandardMaterial({
    color: info.ring,
    emissive: info.ring,
    emissiveIntensity: 0.8,
    roughness: 0.3,
    metalness: 0.2,
  });
  const g = new THREE.Group();
  if (type === 'big') {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), mat));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.1, 10, 32), mat);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  } else if (type === 'speed') {
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.95, 5), mat);
    a.position.y = 0.5;
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.95, 5), mat);
    b.position.y = -0.5;
    b.rotation.x = Math.PI;
    g.add(a, b);
  } else {
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), mat));
    for (let i = 0; i < 8; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6), mat);
      const a = (i / 8) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7);
      sp.rotation.z = (-Math.cos(a) * Math.PI) / 2;
      sp.rotation.x = (Math.sin(a) * Math.PI) / 2;
      g.add(sp);
    }
  }
  return g;
}

function groundRing(color, inner, outer) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  m.position.y = 0.06;
  m.renderOrder = 2;
  return m;
}

/** Haz de luz vertical (cilindro suave) para que el potenciador se vea desde lejos. */
function beacon(color, height = 3) {
  const geo = new THREE.CylinderGeometry(0.18, 0.35, height, 12, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = height / 2;
  m.renderOrder = 1;
  return m;
}

/* ------------------------------------------------------------------ */
/*  Potenciadores aleatorios (modo 2 jugadores)                         */
/* ------------------------------------------------------------------ */
export class PowerUpField {
  constructor({ scene, nav }) {
    this.scene = scene;
    this.nav = nav;
    this.templates = {};
    this.active = [];
    this.timer = 1.5;
    this.time = 0;
  }

  async load() {
    const types = Object.keys(POWERUPS.files);
    const list = await Promise.all(types.map((t) => loadTemplate(t)));
    types.forEach((t, i) => (this.templates[t] = list[i]));
  }

  _spawn(cars) {
    const types = Object.keys(this.templates);
    const type = types[(Math.random() * types.length) | 0];
    const info = POWERUP_INFO[type];
    const pts = this.nav.pointsWithClearance(2.2);
    if (!pts.length) return;
    for (let tries = 0; tries < 30; tries++) {
      const p = pts[(Math.random() * pts.length) | 0];
      if (this.active.some((a) => (a.x - p.x) ** 2 + (a.z - p.z) ** 2 < 100)) continue;
      if (cars.some((c) => (c.x - p.x) ** 2 + (c.z - p.z) ** 2 < 36)) continue;

      const holder = new THREE.Group();
      holder.position.set(p.x, 0, p.z);

      // Ahora SÍ mostramos tu modelo de Blender
      const body = this.templates[type].clone(true);

      // Aro grande en el suelo
      const ring = groundRing(info.ring, POWERUPS.size * 0.55, POWERUPS.size * 0.72);
      // Haz de luz vertical
      const beam = beacon(info.ring, POWERUPS.size * 2.2);
      // Halo bajo el modelo
      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(POWERUPS.size * 0.9, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: info.ring, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false })
      );
      halo.position.y = 0.05;
      halo.renderOrder = 1;

      // --- ICONO GIGANTE (Solo como respaldo por si el GLB mide 0) ---
      const iconGroup = new THREE.Group();
      const iconGeo = new THREE.ConeGeometry(0.45, 1.3, 4);
      const iconMat = new THREE.MeshBasicMaterial({ color: info.ring, toneMapped: false, transparent: true, opacity: 0.5 });
      
      if (type === 'speed') {
        const i1 = new THREE.Mesh(iconGeo, iconMat);
        i1.rotation.z = Math.PI / 3;
        i1.position.set(0, 0.3, 0);
        const i2 = new THREE.Mesh(iconGeo, iconMat);
        i2.rotation.z = Math.PI / 3;
        i2.position.set(0, -0.3, 0);
        iconGroup.add(i1, i2);
      }
      iconGroup.position.y = POWERUPS.floatHeight;

      holder.add(halo, ring, beam, body, iconGroup);
      
      // Subimos un poco el modelo para que flote sobre su aro
      body.position.y = POWERUPS.floatHeight + 0.2;
      
      this.scene.add(holder);
      
      this.active.push({ type, x: p.x, z: p.z, holder, body, ring, beam, iconGroup, age: 0, phase: Math.random() * 6 });
      return;
    }
  }

  /** @param {(car:any, type:string, x:number, z:number)=>void} onCollect */
  update(dt, cars, onCollect) {
    this.time += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.active.length < POWERUPS.maxActive) this._spawn(cars);
      const [a, b] = POWERUPS.spawnEvery;
      this.timer = a + Math.random() * (b - a);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.age += dt;
      const t = this.time + p.phase;
      const base = POWERUPS.floatHeight + 0.2;
      
      // Tu modelo de Blender flota y gira
      p.body.position.y = base + Math.sin(t * 3) * 0.18;
      p.body.rotation.y += dt * 1.8;
      
      if (p.iconGroup) {
        p.iconGroup.rotation.y += dt * 3;
        p.iconGroup.position.y = base + Math.sin(t * 3) * 0.18;
      }

      p.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.1);
      p.beam.material.opacity = 0.18 + Math.sin(t * 5) * 0.1;

      const left = POWERUPS.lifetime - p.age;
      p.holder.visible = left > 3 || Math.floor(left * 6) % 2 === 0;

      let taken = null;
      for (const c of cars) {
        const r = POWERUPS.pickupRadius + c.bodyRadius;
        if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 < r * r) {
          taken = c;
          break;
        }
      }
      if (taken) {
        this._remove(i);
        onCollect(taken, p.type, p.x, p.z);
      } else if (left <= 0) {
        this._remove(i);
      }
    }
  }

  _remove(i) {
    const p = this.active[i];
    p.holder.parent?.remove(p.holder);
    p.ring.geometry.dispose();
    p.ring.material.dispose();
    if (p.beam) {
      p.beam.geometry.dispose();
      p.beam.material.dispose();
    }
    this.active.splice(i, 1);
  }

  dispose() {
    while (this.active.length) this._remove(this.active.length - 1);
    Object.values(this.templates).forEach((t) =>
      t.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Puntos de colores (modo 1 jugador cooperativo)                      */
/* ------------------------------------------------------------------ */
export class CoinField {
  constructor({ scene, nav, count }) {
    this.scene = scene;
    this.nav = nav;
    this.count = count;
    this.coins = [];
    this.collected = 0;
    this.time = 0;
    this.shared = {
      sphere: new THREE.SphereGeometry(COINS.radius, 24, 16),
      ring: new THREE.RingGeometry(COINS.radius * 1.15, COINS.radius * 1.55, 32).rotateX(-Math.PI / 2),
      glow: new THREE.CircleGeometry(COINS.radius * 2.2, 32).rotateX(-Math.PI / 2),
    };
  }

  /** Reparte los puntos por el mapa, separados entre sí y lejos de `avoid` ({x,z,r}). */
  place(avoid = []) {
    const pts = this.nav.pointsWithClearance(1.6);
    const freeArea = this.nav.paintableCount * this.nav.cell * this.nav.cell;
    let spacing = Math.max(3, Math.min(14, Math.sqrt(freeArea / this.count) * 0.8));
    const placed = [];
    let guard = 0;
    while (placed.length < this.count && guard++ < 6000 && pts.length) {
      if (guard % 300 === 0) spacing *= 0.85; // si cuesta colocar, relaja la separación
      const p = pts[(Math.random() * pts.length) | 0];
      if (avoid.some((a) => (a.x - p.x) ** 2 + (a.z - p.z) ** 2 < a.r * a.r)) continue;
      if (placed.some((q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < spacing * spacing)) continue;
      placed.push(p);
    }
    placed.forEach((p, i) => {
      const color = COINS.colors[i % COINS.colors.length];
      const c = new THREE.Color(color);
      const holder = new THREE.Group();
      holder.position.set(p.x, 0, p.z);

      const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.1 });
      const ball = new THREE.Mesh(this.shared.sphere, mat);
      ball.castShadow = true;
      const ringMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
      const ring = new THREE.Mesh(this.shared.ring, ringMat);
      ring.position.y = 0.06;
      const glowMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false });
      const glow = new THREE.Mesh(this.shared.glow, glowMat);
      glow.position.y = 0.04;
      holder.add(glow, ring, ball);
      this.scene.add(holder);
      this.coins.push({ x: p.x, z: p.z, color, holder, ball, ring, mats: [mat, ringMat, glowMat], phase: Math.random() * 6 });
    });
    this.count = placed.length;
  }

  get remaining() {
    return this.coins.length;
  }

  /** @param {(coin:any)=>void} onCollect */
  update(dt, car, onCollect) {
    this.time += dt;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      const t = this.time + c.phase;
      c.ball.position.y = COINS.radius + 0.25 + Math.sin(t * 3) * 0.15;
      c.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.1);
      const r = COINS.pickupRadius + car.bodyRadius;
      if ((car.x - c.x) ** 2 + (car.z - c.z) ** 2 < r * r) {
        this.collected++;
        this.coins.splice(i, 1);
        c.holder.parent?.remove(c.holder);
        c.mats.forEach((m) => m.dispose());
        onCollect(c);
      }
    }
  }

  dispose() {
    this.coins.forEach((c) => {
      c.holder.parent?.remove(c.holder);
      c.mats.forEach((m) => m.dispose());
    });
    this.coins = [];
    Object.values(this.shared).forEach((g) => g.dispose());
  }
}