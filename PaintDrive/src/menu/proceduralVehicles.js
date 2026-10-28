import * as THREE from 'three';

/*
 * Vehículos PROVISIONALES hechos con primitivas de Three.js.
 * Todos miran hacia +X y se apoyan sobre y = 0.
 * Reciben el material `paint` (la carrocería): al cambiarle el color se repinta el coche.
 */

const std = (color, metalness = 0.2, roughness = 0.6) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function add(parent, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function extrudeProfile(points, depth, bevel = 0.06) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Rueda con el eje en Z. `lugs` añade tacos (para el tractor). */
function makeWheel(radius, width, hubMaterial, lugs = 0) {
  const wheel = new THREE.Group();
  const tireMat = std(0x111111, 0.1, 0.85);
  add(wheel, new THREE.CylinderGeometry(radius, radius, width, 40).rotateX(Math.PI / 2), tireMat);
  add(wheel, new THREE.CylinderGeometry(radius * 0.65, radius * 0.65, width * 1.04, 24).rotateX(Math.PI / 2), std(0xdddddd, 1, 0.2));
  add(wheel, new THREE.CylinderGeometry(radius * 0.25, radius * 0.25, width * 1.08, 16).rotateX(Math.PI / 2), hubMaterial);
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2;
    const lug = add(wheel, box(radius * 0.28, radius * 0.12, width * 0.96), tireMat, Math.cos(a) * radius, Math.sin(a) * radius);
    lug.rotation.z = a - Math.PI / 2;
  }
  return wheel;
}

/* ---------------- Deportivo ---------------- */
export function buildSport(paint) {
  const car = new THREE.Group();
  const dark = std(0x0a0a14, 0.9, 0.15);
  const glass = std(0x0b1a33, 0.9, 0.05);
  const yellow = std(0xffc400, 0.5, 0.3);
  const arch = std(0x050510, 0, 0.9);

  add(car, extrudeProfile([
    [-2.2, 0.3], [2.2, 0.3], [2.25, 0.52], [1.5, 0.74],
    [0.6, 0.82], [-1.3, 0.9], [-2.2, 0.86], [-2.25, 0.55],
  ], 2.0, 0.06), paint);
  add(car, extrudeProfile([[-1.0, 0.85], [0.8, 0.78], [0.25, 1.25], [-0.55, 1.27], [-0.9, 1.1]], 1.5, 0.05), glass);
  add(car, box(0.85, 0.05, 1.5), paint, -0.15, 1.3, 0);

  add(car, box(0.5, 0.06, 1.9), dark, -2.05, 1.18, 0);
  for (const z of [-0.5, 0.5]) add(car, box(0.12, 0.3, 0.06), dark, -2.05, 1.0, z);

  for (const z of [-0.6, 0.6]) {
    add(car, box(0.08, 0.1, 0.4), glow(0xfff6d6), 2.29, 0.55, z);
    add(car, box(0.06, 0.1, 0.5), glow(0xff2020), -2.3, 0.7, z * 0.92);
  }

  const archGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.03, 32).rotateX(Math.PI / 2);
  for (const x of [-1.4, 1.4]) {
    for (const side of [-1, 1]) {
      add(car, archGeo, arch, x, 0.4, side * 1.07);
      const wheel = makeWheel(0.4, 0.34, yellow);
      wheel.position.set(x, 0.4, side * 0.95);
      car.add(wheel);
    }
  }
  return car;
}

/* ---------------- Fórmula 1 ---------------- */
export function buildFormula(paint) {
  const car = new THREE.Group();
  const dark = std(0x0a0a14, 0.8, 0.3);
  const white = std(0xf2f2f2, 0.3, 0.4);

  add(car, extrudeProfile([
    [-2.0, 0.28], [1.8, 0.2], [2.5, 0.28], [2.5, 0.38],
    [1.4, 0.5], [0.3, 0.62], [-0.6, 0.78], [-2.0, 0.7],
  ], 0.7, 0.05), paint);

  // Pontones laterales, toma de aire y cockpit
  for (const z of [-0.5, 0.5]) add(car, box(1.2, 0.35, 0.35), paint, -0.1, 0.42, z);
  add(car, box(0.3, 0.4, 0.3), paint, -0.7, 0.9, 0);
  add(car, box(0.55, 0.1, 0.42), dark, 0.15, 0.66, 0);
  add(car, new THREE.SphereGeometry(0.14, 20, 16), white, -0.05, 0.78, 0);

  // Alerón delantero
  add(car, box(0.4, 0.04, 1.9), dark, 2.3, 0.12, 0);
  for (const z of [-0.95, 0.95]) add(car, box(0.4, 0.14, 0.04), paint, 2.3, 0.17, z);

  // Alerón trasero
  add(car, box(0.45, 0.05, 1.2), dark, -2.0, 1.0, 0);
  add(car, box(0.1, 0.5, 0.1), dark, -1.95, 0.75, 0);
  for (const z of [-0.6, 0.6]) add(car, box(0.5, 0.4, 0.04), paint, -2.0, 0.9, z);

  // Ruedas descubiertas con brazos de suspensión
  const rim = std(0xffc400, 0.5, 0.3);
  for (const side of [-1, 1]) {
    const rear = makeWheel(0.42, 0.5, rim);
    rear.position.set(-1.45, 0.42, side * 0.95);
    const front = makeWheel(0.36, 0.36, rim);
    front.position.set(1.5, 0.36, side * 0.9);
    car.add(rear, front);
    add(car, box(0.08, 0.06, 0.3), dark, -1.45, 0.42, side * 0.55);
    add(car, box(0.08, 0.06, 0.32), dark, 1.5, 0.36, side * 0.56);
  }
  return car;
}

/* ---------------- Tractor ---------------- */
export function buildTractor(paint) {
  const tractor = new THREE.Group();
  const dark = std(0x15151f, 0.7, 0.4);
  const glass = std(0x0b1a33, 0.9, 0.05);
  const hub = std(0xe8e8e8, 0.6, 0.3);

  add(tractor, box(3.2, 0.2, 0.7), dark, 0.2, 0.72, 0);          // chasis
  add(tractor, box(1.7, 0.75, 0.8), paint, 1.1, 1.15, 0);        // capó
  add(tractor, box(0.06, 0.5, 0.6), dark, 1.97, 1.0, 0);         // parrilla
  add(tractor, box(0.5, 0.9, 0.85), paint, 0.05, 1.2, 0);        // entre capó y cabina
  add(tractor, box(1.2, 0.35, 1.0), paint, -0.5, 0.98, 0);       // suelo de la cabina
  add(tractor, box(1.0, 1.0, 1.1), glass, -0.5, 1.65, 0);        // cabina
  add(tractor, box(1.25, 0.08, 1.3), paint, -0.5, 2.2, 0);       // techo
  add(tractor, new THREE.CylinderGeometry(0.06, 0.06, 0.9, 12), dark, 1.45, 1.98, 0); // tubo de escape

  for (const z of [-0.28, 0.28]) add(tractor, box(0.05, 0.15, 0.15), glow(0xfff6d6), 2.0, 1.2, z);

  // Eje trasero, guardabarros y ruedas grandes
  add(tractor, box(0.15, 0.15, 2.0), dark, -0.9, 0.95, 0);
  for (const side of [-1, 1]) {
    add(tractor, box(1.5, 0.08, 0.75), paint, -0.9, 2.0, side * 0.95);
    const rear = makeWheel(0.95, 0.55, hub, 14);
    rear.position.set(-0.9, 0.95, side * 0.95);
    tractor.add(rear);
  }

  // Eje delantero y ruedas pequeñas
  add(tractor, box(0.12, 0.12, 1.5), dark, 1.5, 0.5, 0);
  for (const side of [-1, 1]) {
    const front = makeWheel(0.5, 0.35, hub, 10);
    front.position.set(1.5, 0.5, side * 0.7);
    tractor.add(front);
  }
  return tractor;
}