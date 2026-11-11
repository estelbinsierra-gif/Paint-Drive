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
  files: { versus: 'mapa.glb', coop: 'mapa.glb' },
  size: 60,            // el lado largo del mapa se escala a estas unidades
  grid: 512,           // resolución de la rejilla de colisiones/pintura
  obstacleHeight: 0.45, // lo que sobresalga más que esto del suelo cuenta como obstáculo
  wallHeight: 0.14,     // muros bajos
  outsideNames: ['grass', 'cesped', 'césped', 'hierba', 'pasto', 'outside', 'exterior', 'terrain'],
  cameraMargin: 1.5,    // metros extra alrededor de la pista al encuadrar la cámara
  holeDepth: 0.8,       // lo que esté más hundido que esto cuenta como agujero
  paintScale: 2,        // píxeles de canvas por celda de rejilla
};

/* ---------------- Coche ---------------- */
export const CAR = {
  length: 4.0,        // largo del coche
  maxSpeed: 15,
  reverseSpeed: 6,
  accel: 20,
  brake: 34,
  drag: 5,            
  steerRate: 2.6,     
  brushRadius: 1.3,   
  bodyRadius: 0.42,   
  wallRadius: 0.36,   
  wallOffset: 0.24,   
  steerRise: 7,       
  steerReturn: 15,    
  steerHighSpeed: 0.4,
  knockback: 0.55,    
};

/* ---------------- Potenciadores (modo 2 jugadores) ---------------- */
export const POWERUPS = {
  files: { big: 'puntoGrande.glb', speed: 'puntoVelocidad.glb', splash: 'puntoMancha.glb' },
  size: 2.6,                   
  floatHeight: 0.55,           
  big: { duration: 8, scale: 1.7 },
  speed: { duration: 6, speedMult: 1.6, accelMult: 1.6 },
  splash: { radius: 8 },       
  spawnEvery: [4, 7],          
  maxActive: 3,                
  lifetime: 14,                
  pickupRadius: 1.3,           
};

/* ---------------- Puntos de colores (modo 1 jugador) ---------------- */
export const COINS = {
  colors: ['#e8222e', '#1f5bff', '#22b04a', '#ffc400', '#a43bff'],
  radius: 0.95,                
  pickupRadius: 1.15,          
};

/* ---------------- Orientación de cada modelo de coche ---------------- */
export const VEHICLE_FORWARD_FIX = {
  sport: Math.PI,
  formula: 0,
  tractor: Math.PI,
};

/* ---------------- Cámara (vista de águila fija) ---------------- */
export const CAMERA = {
  fov: 38,             
  tiltDeg: 16,         
};

/* ---------------- Teclas (códigos físicos) ---------------- */
export const KEYS = {
  p1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
  p2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
  alt: { p2: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL' } },
  pause: ['Escape', 'KeyP'],
};

/* ---------------- Personajes para el modo cooperativo ---------------- */
// El juego elegirá uno de estos al azar cada vez que empieces una partida
export const CHARACTERS = [
  {
    id: 'goku',
    name: 'Goku',
    file: 'goku.png',
    palette: [
      { name: 'Negro', hex: '#1a1a1a' },
      { name: 'Carne', hex: '#f5cba7' },
      { name: 'Naranja', hex: '#e67e22' },
      { name: 'Azul', hex: '#2980b9' },
    ]
  },
     {
    id: 'sonic',
    name: 'Sonic',
    file: 'sonic.png',
    palette: [
      { name: 'Azul', hex: '#007ef3' },   // Azul de Sonic
      { name: 'Piel', hex: '#f5cba7' },   // Melocotón de la cara
      { name: 'Rojo', hex: '#e52222' },   // Zapatos
      { name: 'Negro', hex: '#1a1a1a' },  // Contornos y ojos negros
    ]
  }
];

/* ---------------- Configuración de Píxeles ---------------- */
export const PIXEL = {
  cols: 40,            // casillas del dibujo a lo ancho
  rows: 28,            // casillas del dibujo a lo alto
  cell: 0.9,           // tamaño de cada casilla
  margin: 1.0,         // hueco entre el dibujo y los muros
  paletteW: 6.5,       // ancho de la zona de colores (lado izquierdo)
  wallHeight: 0.9,
  wallThickness: 1.5,
  padSize: 2.3,        // casilla especial de cada color
  brushRadius: 0.95,   // radio de pintura del coche
  rule: 'match',       // 'match' = pinta solo si el color coincide; 'free' = pinta cualquier cosa
  
  // La paleta se llenará automáticamente desde el personaje elegido en PixelArena.js
  palette: [], 
};