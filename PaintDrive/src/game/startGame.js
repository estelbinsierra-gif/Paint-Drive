/**
 * Punto de entrada al juego (provisional).
 * Recibe: { players: 1 | 2, p1: { vehicle, color }, p2: { vehicle, color } }
 * vehicle = 'sport' | 'formula' | 'tractor' (solo cambia la apariencia)
 * color   = '#rrggbb'
 */
export function startGame({ players, p1, p2 }) {
  console.info('[Paint Drive] startGame', { players, p1, p2 });
  const detail = players === 2 ? `J1: ${p1.vehicle} · J2: ${p2.vehicle}` : `J1: ${p1.vehicle}`;
  return {
    implemented: false,
    message: `${players} jugador${players === 1 ? '' : 'es'} (${detail}). La escena de juego se implementará más adelante.`,
  };
}