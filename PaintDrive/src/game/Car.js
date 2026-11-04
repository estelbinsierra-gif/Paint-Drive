import * as THREE from 'three';
import { createVehicle } from '../menu/vehicles.js';
import { CAR, POWERUPS, VEHICLE_FORWARD_FIX } from './config.js';

/**
 * Coche jugable: modelo 3D + física arcade sencilla.
 * Convención: el ángulo `angle` es el de rotation.y de three.js; el coche avanza hacia (cos a, -sin a) en (x, z).
 * Girar a la izquierda = aumentar el ángulo.
 */
export class Car {
  constructor({ id, vehicleId, color }) {
    this.id = id;
    this.vehicleId = vehicleId;
    this.color = color;

    this.x = 0;
    this.z = 0;
    this.angle = 0;
    this.speed = 0;
    this.size = 1; // 1 = normal; sube con el potenciador "grande"
    this.timers = { big: 0, speed: 0 };
    this.lastPaint = { x: 0, z: 0 };
    this.roll = 0;
    this.hasPainted = false;

    this.root = new THREE.Group(); // posición y giro
    this.tilt = new THREE.Group(); // balanceo al girar
    this.scaler = new THREE.Group(); // tamaño
    this.root.add(this.tilt);
    this.tilt.add(this.scaler);
    this.baseScale = 1;
    this.vehicle = null;
  }

  async load() {
    const v = await createVehicle(this.vehicleId);
    this.vehicle = v;

    // escala para que el coche mida CAR.length
    const box = new THREE.Box3().setFromObject(v.object);
    const s = box.getSize(new THREE.Vector3());
    this.baseScale = CAR.length / Math.max(s.x, s.z, 1e-6);

    v.object.rotation.y += VEHICLE_FORWARD_FIX[this.vehicleId] ?? 0;
    v.object.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    v.paintMaterials.forEach((m) => m.color.set(this.color));
    this.scaler.add(v.object);
    this.scaler.scale.setScalar(this.baseScale);
    return this;
  }

  place(x, z, angle) {
    this.x = x;
    this.z = z;
    this.angle = angle;
    this.speed = 0;
    this.lastPaint = { x, z };
    this.hasPainted = false;
    this._sync(0);
  }

  get brushRadius() {
    return CAR.brushRadius * this.size;
  }
  get bodyRadius() {
    return CAR.length * CAR.bodyRadius * this.size;
  }
  get boosting() {
    return this.timers.speed > 0;
  }
  get forward() {
    return { x: Math.cos(this.angle), z: -Math.sin(this.angle) };
  }

  /** Aplica un potenciador de tiempo ('big' o 'speed'). */
  applyEffect(type) {
    if (type === 'big') this.timers.big = POWERUPS.big.duration;
    if (type === 'speed') this.timers.speed = POWERUPS.speed.duration;
  }

  /**
   * @param {number} dt
   * @param {{throttle:number, steer:number}} ctrl  throttle: +1 acelera, -1 frena/marcha atrás; steer: +1 izquierda, -1 derecha
   * @param {import('./NavGrid.js').NavGrid} nav
   */
  update(dt, ctrl, nav) {
    this.timers.big = Math.max(0, this.timers.big - dt);
    this.timers.speed = Math.max(0, this.timers.speed - dt);

    // tamaño suave
    const sizeTarget = this.timers.big > 0 ? POWERUPS.big.scale : 1;
    this.size += (sizeTarget - this.size) * Math.min(1, dt * 6);

    const boost = this.boosting;
    const maxSpeed = CAR.maxSpeed * (boost ? POWERUPS.speed.speedMult : 1);
    const accel = CAR.accel * (boost ? POWERUPS.speed.accelMult : 1);

    // velocidad
    const t = ctrl.throttle;
    if (t > 0) {
      this.speed += (this.speed < 0 ? CAR.brake : accel) * t * dt;
    } else if (t < 0) {
      this.speed -= (this.speed > 0.2 ? CAR.brake : accel * 0.6) * -t * dt;
    } else {
      const d = CAR.drag * dt;
      this.speed = Math.abs(this.speed) <= d ? 0 : this.speed - Math.sign(this.speed) * d;
    }
    this.speed = Math.max(-CAR.reverseSpeed, Math.min(maxSpeed, this.speed));

    // dirección (no gira parado; al ir marcha atrás se invierte)
    const grip = Math.max(-1, Math.min(1, this.speed / 4));
    this.angle += ctrl.steer * CAR.steerRate * grip * dt;

    // avance
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.z += -Math.sin(this.angle) * this.speed * dt;

    this._collide(nav);

    // balanceo visual
    const rollTarget = -ctrl.steer * Math.min(1, Math.abs(this.speed) / CAR.maxSpeed) * 0.12 * Math.sign(this.speed || 1);
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 8);

    this._sync(nav.heightAt(this.x, this.z));
  }

  /**
   * Choque con paredes/obstáculos:
   *  - Dos círculos a lo largo del coche contra el campo de distancias (SDF).
   *  - Más iteraciones para evitar atravesar muros finos a alta velocidad.
   *  - Anti-atasco: si queda atrapado muy dentro de un obstáculo, lo empuja al centro.
   *  - Clamp duro a la caja del mapa: NUNCA se sale del césped/muro exterior.
   */
  _collide(nav) {
    const L = CAR.length * this.size;
    const rad = CAR.wallRadius * L;
    const off = CAR.wallOffset * L;

    // 1) Empuje suave contra el SDF (muros, obstáculos, agujeros).
    for (let it = 0; it < 8; it++) {
      let moved = false;
      for (const o of [off, -off]) {
        const fx = Math.cos(this.angle);
        const fz = -Math.sin(this.angle);
        const cx = this.x + fx * o;
        const cz = this.z + fz * o;
        const d = nav.sdfAt(cx, cz);
        if (d < rad) {
          const g = nav.gradAt(cx, cz);
          const push = rad - d;
          this.x += g.x * push;
          this.z += g.z * push;
          const nf = g.x * fx + g.z * fz; // >0: el morro mira "hacia fuera" de la pared
          if (nf * this.speed < 0) this.speed *= 1 - nf * nf; // quita la parte de velocidad que choca
          moved = true;
        }
      }
      if (!moved) break;
    }

    // 2) Anti-atasco: si está muy dentro de un obstáculo, empújalo al centro.
    if (nav.sdfAt(this.x, this.z) < -rad * 2) {
      const c = nav.center();
      const dx = c.x - this.x;
      const dz = c.z - this.z;
      const d = Math.hypot(dx, dz) || 1;
      this.x += (dx / d) * rad * 0.5;
      this.z += (dz / d) * rad * 0.5;
      this.speed *= 0.5;
    }

    // 3) Clamp duro a la caja exterior del mapa.
    nav.clampToBounds(this, rad);
  }

  _sync(y) {
    this.root.position.set(this.x, y, this.z);
    this.root.rotation.y = this.angle;
    this.tilt.rotation.x = this.roll;
    this.scaler.scale.setScalar(this.baseScale * this.size);
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.vehicle?.dispose();
  }
}