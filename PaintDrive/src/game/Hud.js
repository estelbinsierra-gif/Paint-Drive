import { POWERUP_INFO } from './Pickups.js';

const fmt = (s) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};
const fmtTenths = (s) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/** Interfaz HTML de la partida (marcador, cronómetro, cuenta atrás, ventanas). */
export class Hud {
  /**
   * @param {HTMLElement} root  contenedor .pd-root
   * @param {{mode:'versus'|'coop', colors:{1:string,2:string}, names:{1:string,2:string}}} cfg
   */
  constructor(root, cfg) {
    this.cfg = cfg;
    this.root = root;
    root.style.setProperty('--c1', cfg.colors[1]);
    root.style.setProperty('--c2', cfg.colors[2]);

    this.hud = el('div', 'pd-hud');
    this.top = el('div', 'pd-top');
    this.hud.append(this.top);

    this.timer = el('div', 'pd-timer', '0:00');

    if (cfg.mode === 'versus') {
      this.p = {};
      for (const id of [1, 2]) {
        const box = el('div', `pd-score p${id}`);
        const name = el('div', 'pd-name', `<span>JUGADOR ${id}</span><b>0%</b>`);
        const bar = el('div', 'pd-bar', '<i></i>');
        const fx = el('div', 'pd-fx');
        box.append(name, bar, fx);
        this.p[id] = { box, pct: name.querySelector('b'), bar: bar.querySelector('i'), fx };
      }
      this.top.append(this.p[1].box, this.timer, this.p[2].box);
    } else {
      const left = el('div', 'pd-coop-score');
      left.innerHTML = '<div>PUNTOS</div><div class="pd-big">0 / 0</div>';
      this.coopBig = left.querySelector('.pd-big');
      this.top.append(left, this.timer, el('div', 'pd-spacer'));
    }

    this.center = el('div', 'pd-center');
    this.count = el('div', 'pd-count');
    this.center.append(this.count);
    this.hud.append(this.center);

    this.hint = el('div', 'pd-hint');
    if (cfg.mode === 'versus') {
      this.hint.innerHTML =
        `<span style="--h:${cfg.colors[1]}">J1: W A S D</span><span style="--h:${cfg.colors[2]}">J2: ← ↑ ↓ →</span><span>Pausa: Esc</span>`;
    } else {
      this.hint.innerHTML =
        `<span style="--h:${cfg.colors[1]}">J1 dirección: A / D</span><span style="--h:${cfg.colors[2]}">J2 acelerar / frenar: ↑ / ↓</span><span>Pausa: Esc</span>`;
    }
    this.hud.append(this.hint);

    this.modal = null;
    this.loading = el('div', 'pd-loading', 'CARGANDO…');
    root.append(this.hud, this.loading);
  }

  hideLoading() {
    this.loading?.remove();
    this.loading = null;
  }

  setTimer(seconds, { tenths = false, low = false } = {}) {
    this.timer.textContent = tenths ? fmtTenths(seconds) : fmt(seconds);
    this.timer.classList.toggle('low', low);
  }

  setScores(f1, f2) {
    for (const [id, f] of [[1, f1], [2, f2]]) {
      this.p[id].pct.textContent = `${(f * 100).toFixed(1)}%`;
      this.p[id].bar.style.width = `${Math.min(100, f * 100)}%`;
    }
  }

  setPoints(done, total) {
    this.coopBig.textContent = `${done} / ${total}`;
  }

  /** Muestra los potenciadores activos de un jugador. */
  setEffects(id, car) {
    const chips = [];
    if (car.timers.big > 0) chips.push(['big', car.timers.big]);
    if (car.timers.speed > 0) chips.push(['speed', car.timers.speed]);
    const key = chips.map(([t, s]) => `${t}${Math.ceil(s)}`).join('|');
    const box = this.p[id].fx;
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.innerHTML = chips
      .map(([t, s]) => `<span class="pd-chip" style="--chip:${POWERUP_INFO[t].css}">${POWERUP_INFO[t].icon} ${POWERUP_INFO[t].label} ${Math.ceil(s)}s</span>`)
      .join('');
  }

  showCount(text) {
    this.count.textContent = text;
    this.count.classList.remove('pop');
    void this.count.offsetWidth; // reinicia la animación
    this.count.classList.add('pop');
  }
  clearCount() {
    this.count.textContent = '';
  }

  hideHint() {
    this.hint.classList.add('hide');
  }

  flash(text, color) {
    const f = el('div', 'pd-flash', text);
    f.style.setProperty('--f', color);
    this.center.append(f);
    setTimeout(() => f.remove(), 1400);
  }

  /** Ventana modal: { title, subtitle, rows:[{label,fraction,color,win}], buttons:[{text,onClick,primary}] } */
  showModal({ title, subtitle = '', rows = [], buttons = [] }) {
    this.closeModal();
    const card = el('div', 'pd-card');
    card.append(el('h2', null, title));
    if (subtitle) card.append(el('p', null, subtitle));
    if (rows.length) {
      const box = el('div', 'pd-rows');
      rows.forEach((r) => {
        const row = el('div', `pd-row${r.win ? ' win' : ''}`);
        row.style.setProperty('--rc', r.color);
        row.append(el('div', 'pd-row-head', `<span>${r.label}${r.win ? ' ★' : ''}</span><span>${(r.fraction * 100).toFixed(1)}%</span>`));
        row.append(el('div', 'pd-bar', `<i style="width:${Math.min(100, r.fraction * 100)}%"></i>`));
        box.append(row);
      });
      card.append(box);
    }
    const bar = el('div', 'pd-buttons');
    buttons.forEach((b) => {
      const btn = el('button', `pd-btn${b.primary ? ' primary' : ''}`, b.text);
      btn.type = 'button';
      btn.addEventListener('click', b.onClick);
      bar.append(btn);
    });
    card.append(bar);
    this.modal = el('div', 'pd-modal');
    this.modal.append(card);
    this.hud.append(this.modal);
    this.modal.querySelector('.pd-btn.primary, .pd-btn')?.focus();
  }

  closeModal() {
    this.modal?.remove();
    this.modal = null;
  }
}