/**
 * Ajustes del juego. Aquí se cambia casi todo lo que se quiera "afinar":
 * duración, velocidad del coche, tamaño del pincel, potenciadores, cámara...
 */

/* ---------------- Modos ---------------- */
export const GAME = {
  // MODO 2 JUGADORES (pintar el mapa, a la vez, vista fija)
  versus: {
    duration: 90, // segundos (1:30)
  },
  // MODO 1 JUGADOR (cooperativo: 2 personas, 1 coche) - recoger puntos
  coop: {
    points: 20,    // cuántos puntos de colores hay en el mapa
    timeLimit: 0,  // 0 = sin límite (cronómetro que sube); >0 = cuenta atrás en segundos
  },
  countdown: 3, // 3-2-1-¡YA!
};

/* ---------------- Mapa ---------------- */
export const MAP = {
  // Qué archivo de src/assets/ se usa en cada modo.
  // Para el cooperativo puedes poner otra variante, p. ej. 'mapaObstaculos.glb'.
  files: { versus: 'mapa.glb', coop: 'mapa.glb' },
  size: 60,            // el lado largo del mapa se escala a estas unidades (así el coche siempre cabe bien)
  grid: 512,           // resolución de la rejilla de colisiones/pintura (celdas en el lado largo)
  obstacleHeight: 0.45, // lo que sobresalga más que esto del suelo cuenta como obstáculo
  holeDepth: 0.8,       // lo que esté más hundido que esto cuenta como agujero (no se puede entrar)
  paintScale: 2,        // píxeles de canvas por celda de rejilla (2 -> canvas de ~1024 px)
};

/* ---------------- Coche ---------------- */
/* ---------------- Coche ---------------- */
export const CAR = {
  length: 4.0,        // <--- Cambia el 3.4 por 4.0 para que se vean más grandes
  maxSpeed: 15,
  reverseSpeed: 6,
  accel: 20,
  brake: 34,
  drag: 5,            
  steerRate: 2.6,     
  brushRadius: 1.3,   
  bodyRadius: 0.42,   
  wallRadius: 0.36,   // <-- Si ves que chocan muy pronto con las paredes al hacerlos grandes, baja esto a 0.32
  wallOffset: 0.24,   
};

/* ---------------- Potenciadores (modo 2 jugadores) ---------------- */
export const POWERUPS = {
  // Qué modelo de src/assets/ es cada potenciador
  files: { big: 'puntoGrande.glb', speed: 'puntoVelocidad.glb', splash: 'puntoMancha.glb' },
  size: 2.6,                   // antes 1.9 → mucho más visibles
  floatHeight: 0.55,           // altura a la que flotan sobre el suelo
  big: { duration: 8, scale: 1.7 },
  speed: { duration: 6, speedMult: 1.6, accelMult: 1.6 },
  splash: { radius: 8 },       // radio de la explosión de color
  spawnEvery: [4, 7],          // cada cuántos segundos (mín, máx) aparece uno nuevo
  maxActive: 3,                // máximo a la vez en el mapa
  lifetime: 14,                // segundos que dura sin recogerse
  pickupRadius: 1.3,           // antes 1.0 → más fácil recogerlos
};

/* ---------------- Puntos de colores (modo 1 jugador) ---------------- */
export const COINS = {
  colors: ['#e8222e', '#1f5bff', '#22b04a', '#ffc400', '#a43bff'],
  radius: 0.95,                // antes 0.65 → monedas más grandes
  pickupRadius: 1.15,          // antes 0.9
};

/* ---------------- Orientación de cada modelo de coche ----------------
 * Si en la partida un coche va "marcha atrás" (avanza con el culo por delante),
 * pon aquí Math.PI para ese vehículo. (0 = el morro mira hacia donde avanza.)
 *
 * sport y tractor van al revés → Math.PI.
 * formula ya va bien → 0.
 */
export const VEHICLE_FORWARD_FIX = {
  sport: Math.PI,
  formula: 0,
  tractor: Math.PI,
};

/* ---------------- Cámara (vista de águila fija) ---------------- */
export const CAMERA = {
  fov: 38,             // antes 40 → un poco más cerrado = coche más grande en pantalla
  tiltDeg: 16,         // antes 14 → un pelín más inclinada
};

/* ---------------- Teclas (códigos físicos: valen en teclado español) ---------------- */
export const KEYS = {
  p1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
  p2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
  pause: ['Escape', 'KeyP'],
};