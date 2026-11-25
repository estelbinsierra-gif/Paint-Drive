/**
 * Ajustes del juego. Aquí se cambia casi todo lo que se quiera "afinar":
 * duración, velocidad del coche, tamaño del pincel, potenciadores, cámara...
 */

/* ---------------- Modos ---------------- */
export const GAME = {
  versus: {
    duration: 90, 
  },
  coop: {
    points: 20,    
    timeLimit: 0,  
  },
  countdown: 3, 
};

/* ---------------- Mapa ---------------- */
export const MAP = {
  files: { versus: 'mapa.glb', coop: 'mapa.glb' },
  size: 60,            
  grid: 512,           
  obstacleHeight: 0.45, 
  wallHeight: 0.14,     
  outsideNames: ['grass', 'cesped', 'césped', 'hierba', 'pasto', 'outside', 'exterior', 'terrain'],
  cameraMargin: 1.5,    
  holeDepth: 0.8,       
  paintScale: 2,        
};

/* ---------------- Coche ---------------- */
export const CAR = {
  length: 2.8,        // Coche más pequeño
  maxSpeed: 15,
  reverseSpeed: 6,
  accel: 20,
  brake: 34,
  drag: 5,
  steerRate: 2.6,
  brushRadius: 0.7,   // Pincel más fino
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
  size: 1.5,                    
  floatHeight: 0.55,
  big: { duration: 8, scale: 1.5 }, 
  speed: { duration: 6, speedMult: 1.6, accelMult: 1.6 },
  splash: { radius: 5 },        
  spawnEvery: [4, 7],
  maxActive: 3,
  lifetime: 14,
  pickupRadius: 1.0,            
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
    ],
  },
  {
    id: 'sonic',
    name: 'Sonic',
    file: 'sonic.png',
    palette: [
      { name: 'Azul', hex: '#007ef3' },
      { name: 'Piel', hex: '#f5cba7' },
      { name: 'Rojo', hex: '#e52222' },
      { name: 'Negro', hex: '#1a1a1a' },
    ],
  },
  {
    id: 'luffy',
    name: 'Luffy',
    file: 'luffy.png',
    palette: [
      { name: 'Azul', hex: '#1b548d' },
      { name: 'Rojo', hex: '#e8222e' },      
      { name: 'Negro', hex: '#1a1a1a' },     
      { name: 'Amarillo', hex: '#ffc400' },  
      { name: 'Piel', hex: '#ffcc99' },      
    ],
  },
  {
    id: 'finn',
    name: 'Finn',
    file: 'finn.png',
    palette: [
      { name: 'Piel', hex: '#f5cba7' },       
      { name: 'Azul Claro', hex: '#5dade2' }, 
      { name: 'Azul Oscuro', hex: '#1f3a93' },
      { name: 'Negro', hex: '#1a1a1a' },      
      { name: 'Verde', hex: '#00ff00' },      // Verde puro para que el código lo detecte a la primera
    ]
  },
  {
    id: 'spiderman',
    name: 'Spiderman',
    file: 'spiderman.png',
    palette: [
      { name: 'Rojo', hex: '#e8222e' },
      { name: 'Azul', hex: '#1f5bff' },
      { name: 'Negro', hex: '#1a1a1a' },
      { name: 'Gris', hex: '#888888' },
    ]
  }
];

/* ---------------- Configuración de Píxeles ---------------- */
export const PIXEL = {
  cols: 40,            
  rows: 28,            
  cell: 0.9,           
  margin: 1.0,         
  paletteW: 6.5,       
  wallHeight: 0.9,
  wallThickness: 1.5,
  padSize: 2.3,        
  brushRadius: 0.95,   
  rule: 'match',       
  
  // --- SISTEMA DE CANDADOS ---
  lock: {
    frameColor: 0x555555, 
    padGlow: 0.05,        
    ballGlow: 0.1,        
    iconHeight: 2.6,      
    iconSize: 1.4,        
  },
  // ---------------------------

  palette: [],
};