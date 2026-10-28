import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildSport, buildFormula, buildTractor } from './proceduralVehicles.js';

const STAGE_LENGTH = 4.4; // tamaño al que se escala cada vehículo en la plataforma

/** Colores disponibles (solo cosmético). */
export const COLORS = [
  { id: 'red', name: 'Rojo', hex: '#e8222e' },
  { id: 'blue', name: 'Azul', hex: '#1f5bff' },
  { id: 'green', name: 'Verde', hex: '#22b04a' },
  { id: 'yellow', name: 'Amarillo', hex: '#ffc400' },
  { id: 'purple', name: 'Morado', hex: '#a43bff' },
];

/**
 * Vehículos (solo cambia la apariencia, no el juego).
 *  - glb: nombre del archivo en src/assets/ (si existe se usa; si no, el provisional)
 *  - glbRotationY: ajuste extra si el modelo sale mirando hacia atrás (Math.PI)
 *  - build: constructor del modelo provisional
 */
export const VEHICLES = [
  { id: 'sport', name: 'DEPORTIVO', glb: 'sport.glb', glbRotationY: 0, paint: 'auto', build: buildSport },
  { id: 'formula', name: 'FÓRMULA 1', glb: 'formula.glb', glbRotationY: 0, paint: 'first', build: buildFormula },
  { id: 'tractor', name: 'TRACTOR', glb: 'tractor.glb', glbRotationY: 0, paint: 'first', build: buildTractor },
];

// No da error si todavía no hay ningún .glb en src/assets/
const glbUrls = import.meta.glob('../assets/*.glb', { query: '?url', import: 'default', eager: true });

// Nombres de material que se consideran "la carrocería" (la que cambia de color)
const BODY_NAME = /body|carroc|paint|pintura|chasis|carcasa/i;
const NOT_BODY = /glass|window|cristal|vidrio|tire|tyre|wheel|rueda|neum|rim|llanta|light|faro|chrome|black|negro/i;

const glbCache = new Map();
function loadGlb(url) {
  if (!glbCache.has(url)) {
    glbCache.set(url, new Promise((resolve, reject) => new GLTFLoader().load(url, resolve, undefined, reject)));
  }
  return glbCache.get(url);
}

/**
 * Devuelve { object, paintMaterials, dispose } para el vehículo pedido.
 * Nunca rechaza: si el GLB falla, usa el provisional.
 */
export async function createVehicle(id) {
  const def = VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
  const url = glbUrls[`../assets/${def.glb}`];
  if (url) {
    try {
      return await buildFromGlb(def, url);
    } catch (err) {
      console.warn(`[Paint Drive] No se pudo cargar ${def.glb}; se usa el modelo provisional.`, err);
    }
  }
  return buildProcedural(def);
}

function buildProcedural(def) {
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.6, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08,
  });
  const model = def.build(paint);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return {
    object: fitToStage(model, STAGE_LENGTH),
    paintMaterials: [paint],
    dispose: () => disposeAll(model),
  };
}

async function buildFromGlb(def, url) {
  const gltf = await loadGlb(url);
  const root = gltf.scene.clone(true);

  // Cada jugador necesita sus propios materiales para poder pintar de distinto color
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    }
  });

  const paintMaterials = findPaintMaterials(root, def);
  return {
    object: fitToStage(root, STAGE_LENGTH, def.glbRotationY ?? 0, true),
    paintMaterials,
    // Las geometrías se comparten con la caché: solo se liberan los materiales clonados
    dispose: () =>
      root.traverse((o) => {
        if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }),
  };
}

/** Busca el/los material(es) de la carrocería: por nombre, o el de más triángulos. */
/** Elige el/los material(es) que cambian de color, según def.paint. */
function findPaintMaterials(root, def) {
  // Map conserva el orden de aparición de los materiales en el modelo
  const triangles = new Map();
  const count = (mat, n) => triangles.set(mat, (triangles.get(mat) ?? 0) + n);

  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const total = (g.index ? g.index.count : g.attributes.position.count) / 3;
    if (Array.isArray(o.material)) {
      const groups = g.groups.length ? g.groups : [{ materialIndex: 0, count: total * 3 }];
      groups.forEach((gr) => count(o.material[gr.materialIndex], gr.count / 3));
    } else {
      count(o.material, total);
    }
  });

  const all = [...triangles.keys()];
  const rule = def.paint ?? 'auto';
  const info = (msg) =>
    console.info(`[Paint Drive] "${def.id}": ${msg}`, 'Materiales del modelo:', all.map((m) => m.name || '(sin nombre)'));

  if (rule === 'first') {
    info(`se pinta el primer material: "${all[0]?.name || '(sin nombre)'}".`);
    return all.slice(0, 1);
  }

  if (rule !== 'auto') {
    const wanted = [].concat(rule).map((n) => String(n).toLowerCase());
    const found = all.filter((m) => wanted.includes(m.name.toLowerCase()));
    if (found.length) {
      info(`se pintan: ${found.map((m) => `"${m.name}"`).join(', ')}.`);
      return found;
    }
    info(`no encuentro ningún material llamado ${JSON.stringify(rule)}; se usa el modo automático.`);
  }

  // Modo automático: material llamado "Body"... o el de más superficie
  const named = all.filter((m) => BODY_NAME.test(m.name));
  if (named.length) {
    info(`se pintan: ${named.map((m) => `"${m.name}"`).join(', ')}.`);
    return named;
  }
  const guess = [...triangles.entries()]
    .filter(([m]) => !NOT_BODY.test(m.name))
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  info(guess ? `se pinta "${guess.name || '(sin nombre)'}" (el de más superficie).` : 'no se pudo elegir ningún material.');
  return guess ? [guess] : [];
}

/** Escala, centra y apoya el objeto sobre y = 0. Mira hacia +X. */
function fitToStage(obj, length, extraRotationY = 0, autoAlign = false) {
  const holder = new THREE.Group();
  holder.add(obj);

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.setFromObject(obj).getSize(size);
  // Si el lado largo está en Z, lo giramos para que quede en X
  obj.rotation.y = (autoAlign && size.z > size.x ? Math.PI / 2 : 0) + extraRotationY;
  obj.updateMatrixWorld(true);

  box.setFromObject(obj).getSize(size);
  obj.scale.setScalar(length / Math.max(size.x, size.z));
  obj.updateMatrixWorld(true);

  box.setFromObject(obj).getCenter(center);
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= box.min.y;
  return holder;
}

function disposeAll(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}