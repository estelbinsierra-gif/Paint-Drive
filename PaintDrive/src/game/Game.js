import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './game.css';
import { GAME, MAP, CAR, CAMERA, KEYS, POWERUPS } from './config.js';
import { COLORS } from '../menu/vehicles.js';
import { loadGameMap } from './GameMap.js';
import { PaintLayer } from './PaintLayer.js';
import { Car } from './Car.js';
import { PowerUpField, CoinField, POWERUP_INFO } from './Pickups.js';
import { Particles } from './Effects.js';
import { Hud } from './Hud.js';
import { Keyboard, readPad } from './input.js';
import { PixelArena } from './PixelArena.js';

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Una partida completa.
 *  - selection.players === 2 -> "versus": 2 coches a la vez, pintan el mapa 1:30, vista fija de águila.
 *  - selection.players === 1 -> "coop": 2 personas, 1 coche (J1 gira, J2 acelera/frena); recoger los puntos.
 */
export class Game {
  /**
   * @param {{players:1|2, p1:{vehicle:string,color:string}, p2:{vehicle:string,color:string}}} selection
   * @param {{onExit?:()=>void, onRestart?:()=>void}} hooks
   */
  constructor(selection, { onExit, onRestart } = {}) {
    this.selection = selection;
    this.onExit = onExit;
    this.onRestart = onRestart;
    this.mode = selection.players === 2 ? 'versus' : 'coop';
    this.state = 'loading'; // loading | countdown | playing | paused | finished
    this.disposed = false;

    const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
    const c1 = selection.p1?.color ?? COLORS[0].hex;
    let c2 = selection.p2?.color ?? COLORS[1].hex;
    if (this.mode === 'versus' && same(c1, c2)) c2 = COLORS.find((c) => !same(c.hex, c1)).hex; // dos colores distintos
    this.colors = { 1: c1, 2: c2 };
    this.vehicles = { 1: selection.p1?.vehicle ?? 'sport', 2: selection.p2?.vehicle ?? 'sport' };

    this.root = document.createElement('div');
    this.root.className = 'pd-root';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pd-canvas';
    this.root.append(this.canvas);
    document.body.append(this.root);
    this.hud = new Hud(this.root, { mode: this.mode, colors: this.colors });

    this.keys = new Keyboard();
    this._onKey = (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.toggleDiag();
        return;
      }
      if (e.repeat || !KEYS.pause.includes(e.code)) return;
      this.togglePause();
    };
    window.addEventListener('keydown', this._onKey);
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    this.timeLeft = GAME.versus.duration;
    this.elapsed = 0;
    this.cars = [];
    this.last = performance.now();
    this.tick = this.tick.bind(this);

    window.__paintDriveGame = this; // útil para depurar desde la consola (F12)

    this.init().catch((err) => {
      console.error('[Paint Drive] Error al preparar la partida', err);
      this.hud.hideLoading();
      this.hud.showModal({
        title: 'ERROR',
        subtitle: 'No se pudo preparar la partida. Mira la consola del navegador (F12).',
        buttons: [{ text: 'Volver al menú', primary: true, onClick: () => this.exit() }],
      });
    });
  }

  /** F3: muestra qué teclas llegan al navegador (para descubrir si el teclado "se come" alguna). */
  toggleDiag() {
    if (this.diag) {
      clearInterval(this.diagTimer);
      this.diag.remove();
      this.diag = null;
      return;
    }
    this.diag = document.createElement('pre');
    this.diag.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:50;margin:0;padding:8px 10px;background:#000a;color:#9f9;font:12px monospace;border-radius:6px;pointer-events:none';
    this.root.append(this.diag);
    this.diagTimer = setInterval(() => {
      if (!this.diag) return;
      const c = this.cars.map((car, i) => {
        const k = this.controls(i);
        return `J${i + 1}: gas ${k.throttle}  giro ${k.steer}  vel ${car.speed.toFixed(1)}`;
      });
      this.diag.textContent = `Teclas: ${[...this.keys.down].join(' ') || '—'}\n${c.join('\n')}`;
    }, 80);
  }

  /* ------------------------------------------------------------------ */
  async init() {
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer = renderer;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.background = new THREE.Color(0x5fb0ff);
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, 0.5, 500);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTexture = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.55;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a93a8, 0.9));

    // Mapa
    // versus: mapa.glb  |  cooperativo: escenario con cuadrícula construido por código (PixelArena)
    if (this.mode === 'coop') {
      this.arena = await PixelArena.create(); // Ya no le pasamos el (1), elige al azar
      this.map = this.arena;
    } else {
      this.map = await loadGameMap(renderer, MAP.files[this.mode], MAP);
    }
    if (this.disposed) return;
    this.nav = this.map.nav;
    scene.add(this.map.root);

    const { cx, cz, sx, sz } = this.map.bounds;
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(cx + sx * 0.25, Math.max(sx, sz) * 0.8, cz + sz * 0.35);
    sun.target.position.set(cx, 0, cz);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const R = Math.max(sx, sz) * 0.75;
    Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: Math.max(sx, sz) * 3 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);

    if (this.mode === 'versus') {
      this.paint = new PaintLayer(this.map, this.colors, MAP.paintScale);
      this.paint.attach(this.map.root);
    }

    // Coches
    const ids = this.mode === 'versus' ? [1, 2] : [1];
    this.cars = ids.map((id) => new Car({ id, vehicleId: this.vehicles[id], color: this.colors[id] }));
    await Promise.all(this.cars.map((c) => c.load()));
    if (this.disposed) return;
    this.cars.forEach((c) => scene.add(c.root));
    this.placeCars();

    this.particles = new Particles(scene);

    if (this.mode === 'versus') {
      this.powerups = new PowerUpField({ scene, nav: this.nav });
      await this.powerups.load();
      if (this.disposed) return;
    } else {
      // el coche empieza con el color elegido en el menú (si es de la paleta) y cambia al pisar las casillas especiales
      this.arena.setCurrent(this.arena.indexOfColor(this.colors[1]));
      this.applyArenaColor();
      this.hud.setPoints(0, this.arena.totalCells);
      this.timeLeft = GAME.coop.timeLimit;

      // --- NUEVO: Mostrar la imagen de referencia en el HUD ---
      if (this.arena.imageUrl) {
        this.hud.setPreview(this.arena.imageUrl);
      }
    }

    this.resize();
    this.refreshHud();
    this.hud.hideLoading();
    this.beginCountdown();
    renderer.setAnimationLoop(this.tick);
  }

  /** Aplica al coche (y al marcador) el color actual del modo cooperativo. */
  applyArenaColor() {
    const p = this.arena.palette[this.arena.current];
    this.cars[0].setColor(p.hex);
    this.hud.setColor(p.hex, p.name);
  }

  placeCars() {
    if (this.mode === 'coop') {
      const g = this.arena.gridCenter;
      this.cars[0].place(g.x, g.z, Math.PI); // arranca en el centro del dibujo, mirando a la zona de colores
      return;
    }
    const { cx, cz, sx } = this.map.bounds;
    const targets = this.mode === 'versus' ? [[cx - sx * 0.28, cz], [cx + sx * 0.28, cz]] : [[cx, cz]];
    this.cars.forEach((car, i) => {
      const p = this.nav.findNearestFree(targets[i][0], targets[i][1], 2.5);
      const angle = Math.atan2(-(cz - p.z), cx - p.x); // mirando al centro
      car.place(p.x, p.z, Number.isFinite(angle) && (p.x !== cx || p.z !== cz) ? angle : 0);
    });
  }

  /* ------------------------------------------------------------------ */
  resize() {
    if (!this.renderer) return;
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // la imagen baja un poco para dejar sitio al marcador de arriba
    this.camera.setViewOffset(w, h, 0, -h * 0.035, w, h);
    this.fitCamera();
  }

  /** Vista de águila fija: aleja la cámara hasta que el mapa entero cabe en pantalla. */
  fitCamera() {
    if (!this.map) return;
    const pl = this.nav.play;
    const m = MAP.cameraMargin ?? 1.5;
    const cx = pl.cx;
    const cz = pl.cz;
    const sx = pl.sx + m * 2;
    const sz = pl.sz + m * 2;
    const cam = this.camera;
    const tilt = THREE.MathUtils.degToRad(CAMERA.tiltDeg);
    const target = new THREE.Vector3(cx, 0, cz);
    const dir = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
    cam.up.set(0, 0, -1);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(cx + (a * sx) / 2, 0, cz + (b * sz) / 2));
    const v = new THREE.Vector3();
    // Empieza un poco más cerca que antes (0.34 en vez de 0.4)
    let d = Math.max(sx, sz) * 0.34;
    for (let i = 0; i < 500; i++) {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld(true);
      // Margen un poco más ajustado que antes (0.98 / 0.85 en vez de 0.96 / 0.8)
      const ok = corners.every((c) => {
        v.copy(c).project(cam);
        return Math.abs(v.x) <= 0.98 && v.y <= 0.85 && v.y >= -0.98;
      });
      if (ok) break;
      d *= 1.02;
    }
  }

  /* ------------------------------------------------------------------ */
  beginCountdown() {
    this.state = 'countdown';
    this.cd = GAME.countdown;
    this.cdShown = null;
    this.hintTimer = 8;
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.hud.showModal({
        title: 'PAUSA',
        buttons: [
          { text: 'Continuar', primary: true, onClick: () => this.togglePause() },
          { text: 'Salir al menú', onClick: () => this.exit() },
        ],
      });
    } else if (this.state === 'paused') {
      this.hud.closeModal();
      this.state = 'playing';
      this.last = performance.now();
    }
  }

  /* ------------------------------------------------------------------ */
  tick() {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.advance(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Avanza la simulación `dt` segundos (sin dibujar). */
  advance(dt) {
    if (this.state === 'countdown') {
      this.cd -= dt;
      const n = Math.ceil(this.cd);
      if (n > 0 && n !== this.cdShown) {
        this.cdShown = n;
        this.hud.showCount(String(n));
      }
      if (this.cd <= 0) {
        this.state = 'playing';
        this.hud.showCount('¡YA!');
        setTimeout(() => !this.disposed && this.hud.clearCount(), 900);
      }
    } else if (this.state === 'playing') {
      this.updatePlaying(dt);
    }

    if (this.state !== 'paused') {
      this.particles?.update(dt);
      this.paint?.flush();
    }
  }

  controls(idx) {
    const k = this.keys;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    if (this.mode === 'versus') {
      const m = idx === 0 ? KEYS.p1 : KEYS.p2;
      const alt = idx === 1 ? KEYS.alt?.p2 : null;
      // Cada jugador lee SOLO sus propias teclas (y su mando): no se mezclan entre sí.
      let throttle = alt ? k.axis2([m.down, alt.down], [m.up, alt.up]) : k.axis(m.down, m.up);
      let steer = alt ? k.axis2([m.right, alt.right], [m.left, alt.left]) : k.axis(m.right, m.left);
      const pad = readPad(idx);
      if (pad) {
        steer = clamp(steer + pad.steer);
        throttle = clamp(throttle + pad.throttle);
      }
      return { throttle, steer };
    }
    // cooperativo: J1 = dirección (A/D), J2 = acelerar / frenar (↑/↓)
    return { throttle: k.axis(KEYS.p2.down, KEYS.p2.up), steer: k.axis(KEYS.p1.right, KEYS.p1.left) };
  }

  updatePlaying(dt) {
    // tiempo
    if (this.mode === 'versus') {
      this.timeLeft -= dt;
    } else {
      this.elapsed += dt;
      if (GAME.coop.timeLimit > 0) this.timeLeft -= dt;
    }

    // coches
    // varios pasos pequeños: no se atraviesan muros ni coches aunque el ordenador vaya lento
    const steps = Math.max(1, Math.ceil(dt / 0.0167));
    const sub = dt / steps;
    const ctrls = this.cars.map((_, i) => this.controls(i));
    for (let s = 0; s < steps; s++) {
      this.cars.forEach((car, i) => car.update(sub, ctrls[i], this.nav));
      this.collideCars();
    }

    this.hintTimer -= dt;
    if (this.hintTimer <= 0) this.hud.hideHint();

    // rastro de turbo
    for (const car of this.cars) {
      if (car.boosting && Math.random() < dt * 45) {
        const f = car.forward;
        const back = CAR.length * 0.5 * car.size;
        this.particles.burst(car.x - f.x * back, 0.35, car.z - f.z * back, {
          count: 1, colors: ['#ffd400', '#ff8a00', '#ffffff'], speed: 1.6, life: 0.4, size: 0.3 * car.size, up: 1.2,
        });
      }
    }

    if (this.mode === 'versus') {
      for (const car of this.cars) this.paintCar(car);
      this.powerups.update(dt, this.cars, (car, type, x, z) => this.onPowerUp(car, type, x, z));
    } else {
      this.arena.update(dt, this.cars[0], (k) => {
        const p = this.arena.palette[k];
        this.applyArenaColor();
        this.particles.burst(this.cars[0].x, 0.8, this.cars[0].z, { count: 30, colors: [p.hex, '#ffffff'], speed: 5, life: 0.7, size: 0.3, up: 5 });
        this.hud.flash(`COLOR · ${p.name}`, p.hex);
      });
    }

    this.refreshHud();

    // fin
    if (this.mode === 'versus') {
      if (this.timeLeft <= 0) this.finishVersus();
    } else if (this.arena.remaining === 0) {
      this.finishCoop(true);
    } else if (GAME.coop.timeLimit > 0 && this.timeLeft <= 0) {
      this.finishCoop(false);
    }
  }

  /** Choque coche-coche: cada coche son 3 círculos a lo largo (cápsula), con masa, rebote y empujón. */
  collideCars() {
    if (this.cars.length < 2) return;
    const [a, b] = this.cars;
    const pts = (c) => {
      const f = c.forward;
      const L = CAR.length * c.size;
      return [-0.3, 0, 0.3].map((t) => ({ x: c.x + f.x * L * t, z: c.z + f.z * L * t }));
    };
    const ra = CAR.length * 0.2 * a.size;
    const rb = CAR.length * 0.2 * b.size;
    const ma = a.size * a.size;
    const mb = b.size * b.size;

    let hit = false;
    for (let pass = 0; pass < 3; pass++) {
      const A = pts(a);
      const B = pts(b);
      let best = null;
      for (const p of A) {
        for (const q of B) {
          const dx = q.x - p.x;
          const dz = q.z - p.z;
          const d = Math.hypot(dx, dz);
          const pen = ra + rb - d;
          if (pen > 0 && (!best || pen > best.pen)) best = { pen, nx: d > 1e-4 ? dx / d : 1, nz: d > 1e-4 ? dz / d : 0 };
        }
      }
      if (!best) break;
      hit = true;
      const { pen, nx, nz } = best;
      // el coche más ligero se mueve más
      a.x -= nx * pen * (mb / (ma + mb));
      a.z -= nz * pen * (mb / (ma + mb));
      b.x += nx * pen * (ma / (ma + mb));
      b.z += nz * pen * (ma / (ma + mb));
      if (pass === 0) {
        const va = { x: a.forward.x * a.speed + a.kx, z: a.forward.z * a.speed + a.kz };
        const vb = { x: b.forward.x * b.speed + b.kx, z: b.forward.z * b.speed + b.kz };
        const vn = (vb.x - va.x) * nx + (vb.z - va.z) * nz;
        if (vn < 0) {
          const j = (-(1 + CAR.knockback) * vn) / (1 / ma + 1 / mb);
          a.kx -= (j / ma) * nx;
          a.kz -= (j / ma) * nz;
          b.kx += (j / mb) * nx;
          b.kz += (j / mb) * nz;
          // se frenan algo: la parte de velocidad que choca de frente
          const fa = a.forward.x * nx + a.forward.z * nz;
          const fb = b.forward.x * nx + b.forward.z * nz;
          if (fa * a.speed > 0) a.speed *= 1 - Math.min(0.6, Math.abs(fa) * 0.5);
          if (fb * b.speed < 0) b.speed *= 1 - Math.min(0.6, Math.abs(fb) * 0.5);
        }
      }
    }
    if (hit) {
      a.collideWalls(this.nav); // que el empujón no meta a nadie dentro de un muro
      b.collideWalls(this.nav);
    }
  }

  /** Deja la huella de pintura del coche (rellenando el hueco entre dos frames). */
  paintCar(car) {
    const r = car.brushRadius;
    const dx = car.x - car.lastPaint.x;
    const dz = car.z - car.lastPaint.z;
    const dist = Math.hypot(dx, dz);
    if (dist < r * 0.25 && car.hasPainted) return;
    const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const x = car.lastPaint.x + dx * t;
      const z = car.lastPaint.z + dz * t;
      this.paint.stamp(x, z, r, car.id);
      if (Math.random() < 0.22) {
        const a = Math.random() * Math.PI * 2;
        const d = r * rand(1.1, 1.9);
        this.paint.stamp(x + Math.cos(a) * d, z + Math.sin(a) * d, r * rand(0.1, 0.28), car.id);
      }
    }
    car.lastPaint = { x: car.x, z: car.z };
    car.hasPainted = true;
  }

  onPowerUp(car, type, x, z) {
    const info = POWERUP_INFO[type];
    const mine = this.colors[car.id];
    if (type === 'splash') {
      this.paint.splash(car.x, car.z, POWERUPS.splash.radius, car.id);
      this.particles.burst(car.x, 0.6, car.z, {
        count: 120, colors: [mine, '#ff2d6a', '#ffd400', '#22b04a', '#1f9bff', '#a43bff', '#ffffff'], speed: 11, life: 1.1, size: 0.4, up: 7,
      });
    } else {
      car.applyEffect(type);
      this.particles.burst(x, 0.8, z, { count: 36, colors: [info.css, mine, '#ffffff'], speed: 6, life: 0.8, size: 0.3, up: 5 });
    }
    this.hud.flash(`J${car.id} · ${info.label}`, info.css);
  }

  onCoin(coin) {
    this.particles.burst(coin.x, 0.8, coin.z, { count: 28, colors: [coin.color, '#ffffff'], speed: 5, life: 0.7, size: 0.28, up: 5 });
    this.hud.setPoints(this.coins.collected, this.coins.count);
  }

  refreshHud() {
    if (this.mode === 'versus') {
      this.hud.setTimer(this.timeLeft, { low: this.timeLeft <= 10 });
      this.hud.setScores(this.paint.fraction(1), this.paint.fraction(2));
      this.cars.forEach((c) => this.hud.setEffects(c.id, c));
    } else {
      this.hud.setPoints(this.arena.correct, this.arena.totalCells);
      if (GAME.coop.timeLimit > 0) this.hud.setTimer(this.timeLeft, { low: this.timeLeft <= 10 });
      else this.hud.setTimer(this.elapsed, { tenths: true });
    }
  }

  /* ------------------------------------------------------------------ */
  finishVersus() {
    this.state = 'finished';
    this.timeLeft = 0;
    this.refreshHud();
    const f1 = this.paint.fraction(1);
    const f2 = this.paint.fraction(2);
    const winner = Math.abs(f1 - f2) < 0.0005 ? 0 : f1 > f2 ? 1 : 2;
    this.hud.showCount('¡FIN!');
    setTimeout(() => {
      if (this.disposed) return;
      this.hud.clearCount();
      this.hud.showModal({
        title: winner ? `¡GANA EL JUGADOR ${winner}!` : '¡EMPATE!',
        subtitle: 'Porcentaje del mapa pintado',
        rows: [
          { label: 'JUGADOR 1', fraction: f1, color: this.colors[1], win: winner === 1 },
          { label: 'JUGADOR 2', fraction: f2, color: this.colors[2], win: winner === 2 },
        ],
        buttons: [
          { text: 'Jugar otra vez', primary: true, onClick: () => this.restart() },
          { text: 'Volver al menú', onClick: () => this.exit() },
        ],
      });
    }, 1100);
  }

  finishCoop(completed) {
    this.state = 'finished';
    this.refreshHud();
    const total = this.arena.totalCells;
    const done = this.arena.correct;
    const t = this.elapsed;
    const m = Math.floor(t / 60);
    const time = `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
    this.hud.showCount(completed ? '¡COMPLETADO!' : '¡TIEMPO!');
    setTimeout(() => {
      if (this.disposed) return;
      this.hud.clearCount();
      this.hud.showModal({
        title: completed ? '¡DIBUJO COMPLETADO!' : 'SE ACABÓ EL TIEMPO',
        subtitle: completed ? `Tiempo: ${time}` : `Casillas bien pintadas: ${done} / ${total}`,
        buttons: [
          { text: 'Jugar otra vez', primary: true, onClick: () => this.restart() },
          { text: 'Volver al menú', onClick: () => this.exit() },
        ],
      });
    }, 1100);
  }

  restart() {
    this.onRestart?.();
  }

  exit() {
    this.dispose();
    this.onExit?.();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer?.setAnimationLoop(null);
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('resize', this._onResize);
    this.keys.dispose();
    clearInterval(this.diagTimer);
    this.diag?.remove();
    this.cars.forEach((c) => c.dispose());
    this.powerups?.dispose();
    this.coins?.dispose();
    this.particles?.dispose();
    this.paint?.dispose();
    this.map?.dispose();
    this.envTexture?.dispose();
    this.pmrem?.dispose();
    this.renderer?.dispose();
    this.root.remove();
    if (window.__paintDriveGame === this) delete window.__paintDriveGame;
  }
}