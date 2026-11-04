import * as THREE from 'three';

/** Partículas sencillas (esferitas instanciadas) para recoger cosas, explosiones y turbo. */
export class Particles {
  constructor(scene, max = 700) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.size = new Float32Array(max);

    this.geo = new THREE.SphereGeometry(0.5, 8, 6);
    this.mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, white);
    this._dummy = new THREE.Object3D();
    this._c = new THREE.Color();
    scene.add(this.mesh);
    this._clearAll();
  }

  _clearAll() {
    this._dummy.scale.setScalar(0);
    this._dummy.updateMatrix();
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, this._dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  burst(x, y, z, { count = 30, colors = ['#ffffff'], speed = 6, life = 0.8, size = 0.3, up = 4 } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.9);
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = up * (0.4 + Math.random());
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      const l = life * (0.6 + Math.random() * 0.6);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.mesh.setColorAt(i, this._c.set(colors[(Math.random() * colors.length) | 0]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    const d = this._dummy;
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const p = i * 3;
      this.vel[p + 1] -= 14 * dt;
      this.pos[p] += this.vel[p] * dt;
      this.pos[p + 1] += this.vel[p + 1] * dt;
      this.pos[p + 2] += this.vel[p + 2] * dt;
      if (this.pos[p + 1] < 0.08) {
        this.pos[p + 1] = 0.08;
        this.vel[p + 1] *= -0.3;
        this.vel[p] *= 0.8;
        this.vel[p + 2] *= 0.8;
      }
      const s = this.life[i] > 0 ? this.size[i] * Math.min(1, (this.life[i] / this.maxLife[i]) * 1.6) : 0;
      d.position.set(this.pos[p], this.pos[p + 1], this.pos[p + 2]);
      d.scale.setScalar(s);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}
