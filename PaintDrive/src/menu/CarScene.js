import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createVehicle } from './vehicles.js';

/* ============ Ajustes ============ */
const CAMERA_FOV = 35;
const CAMERA_ELEVATION = 0.28;                       // inclinación de la cámara
const CAMERA_TARGET = new THREE.Vector3(0, 0.55, 0);
const SPIN_SPEED = 0.45;                             // rad/s
/* ================================== */

/**
 * Visor 3D de un vehículo sobre una plataforma con anillo de neón.
 * Uno por jugador. Devuelve { setVehicle, setColor, dispose }.
 */
export function createCarScene(canvas, { ringColor = 0xff3b57, vehicleId = 'sport', color } = {}) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 4 / 3, 0.1, 100);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.7;

  /* ---------- Luces ---------- */
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333355, 0.5));

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
  key.shadow.bias = -0.0004;
  scene.add(key);

  const tint = new THREE.PointLight(ringColor, 25, 18, 2);
  tint.position.set(0, 3.2, 4.5);
  scene.add(tint);

  /* ---------- Plataforma ---------- */
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 3.7, 0.3, 96),
    new THREE.MeshStandardMaterial({ color: 0x1a1a33, metalness: 0.7, roughness: 0.35 }),
  );
  base.position.y = -0.15;
  base.receiveShadow = true;
  scene.add(base);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.25, 0.09, 16, 128),
    new THREE.MeshBasicMaterial({ color: ringColor, toneMapped: false }),
  );
  const ringInner = new THREE.Mesh(
    new THREE.TorusGeometry(2.95, 0.03, 12, 128),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  );
  for (const r of [ring, ringInner]) {
    r.rotation.x = -Math.PI / 2;
    r.position.y = 0.03;
    scene.add(r);
  }

  const glowTexture = makeGlowTexture();
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(4.8, 64),
    new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: ringColor,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.012;
  scene.add(glow);

  /* ---------- Vehículo ---------- */
  const carSlot = new THREE.Group();
  carSlot.rotation.y = -0.6; // vista 3/4
  scene.add(carSlot);

  let current = null;
  let currentColor = color;
  let loadToken = 0;
  let disposed = false;

  async function setVehicle(id) {
    const token = ++loadToken;
    const vehicle = await createVehicle(id);
    if (disposed || token !== loadToken) {
      vehicle.dispose(); // llegó tarde: el usuario ya pidió otro
      return;
    }
    if (current) {
      carSlot.remove(current.object);
      current.dispose();
    }
    current = vehicle;
    carSlot.add(vehicle.object);
    if (currentColor) applyColor(currentColor);
  }

  function applyColor(hex) {
    currentColor = hex;
    current?.paintMaterials.forEach((m) => m.color.set(hex));
  }

  /* ---------- Tamaño / cámara ---------- */
  const camBase = { y: 4, z: 10 };
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = Math.max(9.5, 8.2 / camera.aspect);
    camBase.z = dist;
    camBase.y = CAMERA_TARGET.y + dist * CAMERA_ELEVATION;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  const pointer = { x: 0 };
  const onPointerMove = (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  /* ---------- Bucle ---------- */
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!reduceMotion) {
      carSlot.rotation.y += dt * SPIN_SPEED;
      camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.05;
    }
    camera.position.y = camBase.y;
    camera.position.z = camBase.z;
    camera.lookAt(CAMERA_TARGET);
    renderer.render(scene, camera);
  });

  setVehicle(vehicleId);

  function dispose() {
    disposed = true;
    renderer.setAnimationLoop(null);
    resizeObserver.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    current?.dispose();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    glowTexture.dispose();
    envTexture.dispose();
    pmrem.dispose();
    renderer.dispose();
  }

  return { setVehicle, setColor: applyColor, dispose };
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}