import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NavGrid } from './NavGrid.js';

// No da error si todavía no hay ningún .glb en src/assets/
const glbUrls = import.meta.glob('../assets/*.glb', { query: '?url', import: 'default', eager: true });

/**
 * Carga el mapa (.glb), lo escala/centra, y calcula la rejilla de colisiones y pintura.
 * Si el archivo no existe o falla, usa un mapa provisional para que el juego siga funcionando.
 *
 * @returns {Promise<{root:THREE.Object3D, nav:NavGrid, bounds:object, usedFallback:boolean, dispose:()=>void}>}
 */
export async function loadGameMap(renderer, fileName, opts) {
  let root = null;
  let usedFallback = false;

  const url = glbUrls[`../assets/${fileName}`];
  if (url) {
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      root = gltf.scene;
    } catch (err) {
      console.warn(`[Paint Drive] No se pudo cargar ${fileName}; se usa un mapa provisional.`, err);
    }
  } else {
    console.warn(`[Paint Drive] No existe src/assets/${fileName}; se usa un mapa provisional.`);
  }
  if (!root) {
    root = buildFallbackMap(opts.size);
    usedFallback = true;
  }

  // Fuera luces y cámaras que Blender haya exportado (con intensidades enormes estropean la iluminación)
  const trash = [];
  root.traverse((o) => {
    if (o.isLight || o.isCamera) trash.push(o);
  });
  trash.forEach((o) => o.parent?.remove(o));

  root.traverse((o) => {
    if (o.isMesh) {
      o.receiveShadow = true;
      o.castShadow = true;
    }
  });

  // Escala (lado largo = opts.size) y centrado en X/Z
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const k = opts.size / Math.max(size.x, size.z, 1e-6);
  root.scale.multiplyScalar(k);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.updateMatrixWorld(true);
  box.setFromObject(root);

  // Geometría de la rejilla
  const sx = box.max.x - box.min.x;
  const sz = box.max.z - box.min.z;
  const cell = Math.max(sx, sz) / opts.grid;
  const w = Math.max(8, Math.ceil(sx / cell));
  const h = Math.max(8, Math.ceil(sz / cell));
  const geo = { x0: box.min.x, z0: box.min.z, cell, w, h };

  // Objetos que son "exterior" (césped...) y no cuentan como suelo jugable:
  //  1) por su nombre en Blender (MAP.outsideNames),
  //  2) y si no hay ninguno con ese nombre, se detecta solo: un plano grande que contiene a otro plano
  //     más pequeño (la pista) es el césped de alrededor.
  const outside = new Set();
  const hints = (opts.outsideNames ?? []).map((t) => t.toLowerCase());
  const looksOutside = (o) => {
    const names = [o.name, ...(Array.isArray(o.material) ? o.material : [o.material]).map((m) => m?.name)];
    for (let p = o.parent; p && p !== root; p = p.parent) names.push(p.name);
    return names.some((n) => n && hints.some((t) => n.toLowerCase().includes(t)));
  };
  if (hints.length) root.traverse((o) => o.isMesh && looksOutside(o) && outside.add(o));
  if (!outside.size) detectOutsidePlane(root, sx, sz).forEach((o) => outside.add(o));

  // La pista = caja que ocupa todo lo que NO es exterior (los obstáculos están dentro del suelo)
  const play = new THREE.Box3();
  root.traverse((o) => {
    if (o.isMesh && !outside.has(o)) play.expandByObject(o);
  });

  outside.forEach((o) => (o.visible = false));
  const { hit, heights } = bakeHeightMap(renderer, root, geo, box.min.y, box.max.y);
  outside.forEach((o) => (o.visible = true));

  // Todo lo que queda fuera de la pista (y una franja pegada al muro) cuenta como pared.
  // Así los coches nunca llegan al muro ni al césped, aunque el muro sea una pared sin grosor.
  if (!play.isEmpty() && outside.size) {
    const inset = opts.wallInset ?? 0.5;
    const px0 = play.min.x + inset, px1 = play.max.x - inset, pz0 = play.min.z + inset, pz1 = play.max.z - inset;
    for (let j = 0; j < h; j++) {
      const z = geo.z0 + (j + 0.5) * cell;
      for (let i = 0; i < w; i++) {
        const x = geo.x0 + (i + 0.5) * cell;
        if (x < px0 || x > px1 || z < pz0 || z > pz1) hit[j * w + i] = 0;
      }
    }
  }
  const nav = new NavGrid(geo, hit, heights, {
    obstacleHeight: opts.obstacleHeight,
    wallHeight: opts.wallHeight,
    holeDepth: opts.holeDepth,
  });

  // El suelo pasa a estar en y = 0
  root.position.y -= nav.groundY;
  root.updateMatrixWorld(true);

  const freePct = Math.round((100 * nav.paintableCount) / (w * h));
  console.info(
    `[Paint Drive] Mapa "${fileName}"${usedFallback ? ' (provisional)' : ''}: tamaño original ` +
      `${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}, escala x${k.toFixed(3)}, rejilla ${w}x${h}, ` +
      `suelo a y=${nav.groundY.toFixed(2)}, zona libre ${freePct}%, exterior sellado ${nav.sealedOutside} celdas, ` +
      `objetos 'exterior' ocultos: ${outside.size}, pista ${nav.play.sx.toFixed(1)} x ${nav.play.sz.toFixed(1)}`,
  );
  if (freePct < 15) {
    console.warn(
      '[Paint Drive] Casi no hay suelo libre en el mapa. Revisa que el .glb esté exportado con +Y Up y que ' +
        'no incluya objetos enormes alrededor (cielo, cúpulas...).',
    );
  }

  const bounds = {
    x0: geo.x0,
    z0: geo.z0,
    x1: geo.x0 + w * cell,
    z1: geo.z0 + h * cell,
    sx: w * cell,
    sz: h * cell,
    cx: geo.x0 + (w * cell) / 2,
    cz: geo.z0 + (h * cell) / 2,
    play: nav.play, // caja de la pista (sin el césped de alrededor)
  };

  return {
    root,
    nav,
    bounds,
    usedFallback,
    dispose() {
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
    },
  };
}

/**
 * Detecta el plano de césped sin depender de cómo se llame: entre los objetos planos y grandes,
 * si el más grande contiene a otro de tamaño parecido, el más grande es el exterior.
 */
function detectOutsidePlane(root, sx, sz) {
  const flats = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const s = b.getSize(new THREE.Vector3());
    const wide = Math.max(s.x, s.z);
    if (wide < Math.max(sx, sz) * 0.25 || s.y > wide * 0.15) return; // pequeño o alto: no es un plano de suelo
    flats.push({ o, b, area: s.x * s.z });
  });
  flats.sort((a, c) => c.area - a.area);
  const big = flats[0];
  if (!big) return [];
  const tol = Math.max(sx, sz) * 0.01;
  const inside = flats.slice(1).some(
    (f) =>
      f.area >= big.area * 0.2 && f.area < big.area * 0.98 &&
      f.b.min.x >= big.b.min.x - tol && f.b.max.x <= big.b.max.x + tol &&
      f.b.min.z >= big.b.min.z - tol && f.b.max.z <= big.b.max.z + tol,
  );
  return inside ? [big.o] : [];
}

/**
 * Dibuja el mapa visto desde arriba (cámara ortográfica) con un material que guarda la altura
 * de lo más alto en cada píxel. Lo lee la CPU y se convierte en la rejilla.
 */
function bakeHeightMap(renderer, root, g, yMin, yMax) {
  const { w, h, cell, x0, z0 } = g;
  const lo = yMin - 0.01;
  const range = yMax + 0.01 - lo;

  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    generateMipmaps: false,
  });

  const W = w * cell;
  const H = h * cell;
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, range + 4);
  cam.up.set(0, 0, -1); // arriba de la imagen = -Z, derecha = +X
  cam.position.set(x0 + W / 2, yMax + 1.5, z0 + H / 2);
  cam.lookAt(x0 + W / 2, 0, z0 + H / 2);
  cam.updateMatrixWorld(true);

  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uLo: { value: lo }, uRange: { value: range } },
    vertexShader: `
      varying float vY;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vY = wp.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      precision highp float;
      varying float vY;
      uniform float uLo;
      uniform float uRange;
      void main() {
        float t = clamp((vY - uLo) / uRange, 0.0, 1.0);
        float v = floor(t * 65535.0 + 0.5);
        float hi = floor(v / 256.0);
        float lo = v - hi * 256.0;
        gl_FragColor = vec4(hi / 255.0, lo / 255.0, 0.0, 1.0);
      }`,
  });

  const tmp = new THREE.Scene();
  tmp.add(root);
  tmp.overrideMaterial = mat;

  const prevTarget = renderer.getRenderTarget();
  const prevClear = new THREE.Color();
  renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear;

  renderer.autoClear = true;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(tmp, cam);

  const buf = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.autoClear = prevAuto;
  tmp.remove(root);
  tmp.overrideMaterial = null;
  mat.dispose();
  rt.dispose();

  // La lectura empieza por la fila de abajo (= +Z); nuestra rejilla empieza por z0 (= arriba de la imagen)
  const hit = new Uint8Array(w * h);
  const heights = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    const j = h - 1 - r;
    for (let i = 0; i < w; i++) {
      const p = (r * w + i) * 4;
      const idx = j * w + i;
      if (buf[p + 3] > 127) {
        hit[idx] = 1;
        heights[idx] = lo + ((buf[p] * 256 + buf[p + 1]) / 65535) * range;
      }
    }
  }
  return { hit, heights };
}

/** Mapa provisional (suelo + paredes + obstáculos) por si falta mapa.glb. */
function buildFallbackMap(size) {
  const g = new THREE.Group();
  const W = size;
  const D = size * 0.66;

  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#c9ced8';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#bcc2cf';
  x.fillRect(0, 0, 64, 64);
  x.fillRect(64, 64, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(W / 5, D / 5);

  const ground = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, D), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  ground.position.y = -0.2;
  g.add(ground);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4f63, roughness: 0.7 });
  const addBox = (w, h, d, px, pz, mat = wallMat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(px, h / 2, pz);
    g.add(m);
  };
  // Muros del borde: un poco más altos y gruesos para que la colisión los detecte bien
  addBox(W + 1.6, 1.8, 1.6, 0, -D / 2 + 0.8);
  addBox(W + 1.6, 1.8, 1.6, 0,  D / 2 - 0.8);
  addBox(1.6, 1.8, D, -W / 2 + 0.8, 0);
  addBox(1.6, 1.8, D,  W / 2 - 0.8, 0);

  const obs = new THREE.MeshStandardMaterial({ color: 0xe0a030, roughness: 0.6 });
  addBox(6, 1.6, 2, -8, -6, obs);
  addBox(2, 1.6, 7, 9, 5, obs);
  addBox(4, 1.6, 4, 0, 0, obs);
  addBox(5, 1.6, 2, 14, -9, obs);
  addBox(2, 1.6, 5, -14, 7, obs);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 1.6, 24), obs);
  cyl.position.set(-4, 0.8, 8);
  g.add(cyl);
  return g;
}