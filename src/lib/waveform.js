// Generación y dibujo de waveforms.
// Etapa 1: waveforms procedurales (deterministas por pista) para el look.
// Etapa 2: se reemplaza generateWaveform() por el análisis real del audio
// (FFT en 3 bandas) y el resto del render sigue igual.

export const BINS_PER_SECOND = 100;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const cache = new Map();
const realAnalysis = new Map();

/** Guarda el análisis real de una pista (lo produce el worker). */
export function setAnalysis(trackId, a) {
  realAnalysis.set(trackId, a);
}
export function getAnalysis(trackId) {
  return realAnalysis.get(trackId) || null;
}

/** Waveform para dibujar: real si existe, procedural en modo demo, null mientras se analiza. */
export function waveformFor(track) {
  if (!track) return null;
  const real = realAnalysis.get(track.id);
  if (real) return real;
  if (track.path) return null;
  return generateWaveform(track);
}

/**
 * Devuelve { low, mid, high } (Float32Array, 0..1) con BINS_PER_SECOND muestras por segundo.
 * Simula estructura de tema electrónico: intro, build, drop, break, drop, outro.
 */
export function generateWaveform(track) {
  if (cache.has(track.id)) return cache.get(track.id);
  const rand = mulberry32(hash(track.id));
  const n = Math.ceil(track.duration * BINS_PER_SECOND);
  const low = new Float32Array(n);
  const mid = new Float32Array(n);
  const high = new Float32Array(n);
  const beat = 60 / track.bpm;

  // Secciones en compases de 32 tiempos
  const sectionLen = beat * 32;
  const sections = [];
  const pattern = ['intro', 'build', 'drop', 'drop', 'break', 'build', 'drop', 'drop', 'outro'];
  let t = 0;
  let i = 0;
  while (t < track.duration) {
    const kind = i === 0 ? 'intro' : pattern[Math.min(i, pattern.length - 1)] ?? 'drop';
    sections.push({ start: t, kind, energy: 0.55 + rand() * 0.45 });
    t += sectionLen * (kind === 'drop' ? 2 : 1);
    i = (i + 1) % pattern.length || 1;
  }
  // Las últimas ~2 secciones como outro
  if (sections.length > 2) sections[sections.length - 1].kind = 'outro';

  let s = 0;
  for (let k = 0; k < n; k++) {
    const time = k / BINS_PER_SECOND;
    while (s < sections.length - 1 && time >= sections[s + 1].start) s++;
    const sec = sections[s];
    const phase = (time % beat) / beat; // 0..1 dentro del tiempo
    const noise = rand();
    const kick = Math.exp(-phase * 4.5) * (0.85 + noise * 0.15);
    const hat = Math.exp(-(((phase + 0.5) % 1) * 14));
    
    let l = 0, m = 0, h = 0;
    switch (sec.kind) {
      case 'intro':
        l = 0.25 + kick * 0.45; m = 0.12 + noise * 0.1; h = 0.08 + hat * 0.25; break;
      case 'build': {
        const p = (time - sec.start) / sectionLen;
        l = 0.15 + kick * 0.3 * (1 - p); m = 0.3 + p * 0.45 + noise * 0.1; h = 0.2 + p * 0.5 * noise; break;
      }
      case 'break':
        l = 0.05 + noise * 0.05; m = 0.35 + Math.sin(time * 1.3) * 0.12 + noise * 0.1; h = 0.18 + noise * 0.12; break;
      case 'outro':
        l = 0.2 + kick * 0.4; m = 0.1 + noise * 0.08; h = 0.06 + hat * 0.2; break;
      default: // drop
        l = 0.5 + kick * 0.35 + noise * 0.1; m = 0.45 + noise * 0.3; h = 0.25 + hat * 0.4 + noise * 0.15;
    }
    low[k] = Math.min(1, l * sec.energy);
    mid[k] = Math.min(1, m * sec.energy);
    high[k] = Math.min(1, h * sec.energy);
  }
  // Fade in/out
  const fade = 2 * BINS_PER_SECOND;
  for (let k = 0; k < fade && k < n; k++) {
    const f = k / fade;
    low[k] *= f; mid[k] *= f; high[k] *= f;
    low[n - 1 - k] *= f; mid[n - 1 - k] *= f; high[n - 1 - k] *= f;
  }
  const wf = { low, mid, high, length: n };
  cache.set(track.id, wf);
  return wf;
}

/** Color por bandas: graves → rojo, medios → verde, agudos → azul. */
/* Cada deck pinta su waveform en su propia familia de color: el deck 1 en los
   amarillos de DJ A y el deck 2 en los verdes de DJ B. Dentro de cada familia,
   los graves van oscuros, los medios al color pleno y los agudos a la versión
   clara, así se siguen distinguiendo las tres bandas. */
const BANDAS = [
  { graves: [196, 104, 0], medios: [255, 214, 10], agudos: [255, 247, 198] },   // DJ A · amarillo
  { graves: [10, 112, 66], medios: [31, 208, 127], agudos: [198, 250, 228] },   // DJ B · verde
];

export function bandColor(l, m, h, alpha = 1, deck = 0) {
  const p = BANDAS[deck] || BANDAS[0];
  const L = (l * 0.85) ** 2, M = m ** 2, H = (h * 0.9) ** 2;
  const max = Math.max(L, M, H) || 1;
  const wl = Math.sqrt(L / max), wm = Math.sqrt(M / max), wh = Math.sqrt(H / max);
  const t = wl + wm + wh || 1;
  const c = (i) => Math.round((p.graves[i] * wl + p.medios[i] * wm + p.agudos[i] * wh) / t);
  return `rgba(${c(0)},${c(1)},${c(2)},${alpha})`;
}

function peakIn(arr, a, b) {
  let p = 0;
  for (let i = Math.max(0, a); i < Math.min(arr.length, b); i++) if (arr[i] > p) p = arr[i];
  return p;
}

/**
 * Dibuja la waveform principal desplazándose, con el playhead fijo en `playheadX` (0..1).
 * secondsVisible: zoom horizontal.
 */
export function drawScrollingWaveform(ctx, w, h, { track, grid, position, secondsVisible = 12, playheadX = 0.5, cues = [], loop = null, mirrored = false, status = null, deck = 0 }) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#061009';
  ctx.fillRect(0, 0, w, h);

  const mid = h / 2;
  if (!track) {
    drawGridOnly(ctx, w, h);
    return;
  }

  const wf = waveformFor(track);
  const pxPerSec = w / secondsVisible;
  const startTime = position - playheadX * secondsVisible;
  const bpm = grid?.bpm || track.bpm || 0;
  const firstBeat = grid?.firstBeat || 0;
  const beat = bpm ? 60 / bpm : 0;

  // Loop activo
  if (loop) {
    const x0 = (loop.start - startTime) * pxPerSec;
    const x1 = (loop.end - startTime) * pxPerSec;
    ctx.fillStyle = 'rgba(66, 214, 120, 0.13)';
    ctx.fillRect(x0, 0, x1 - x0, h);
  }

  // Grid de beats (anclado al primer beat del beatgrid)
  const b0 = beat ? Math.floor((startTime - firstBeat) / beat) : 0;
  const b1 = beat ? Math.ceil((startTime + secondsVisible - firstBeat) / beat) : -1;
  for (let b = b0; b <= b1; b++) {
    if (b < 0) continue;
    const x = (firstBeat + b * beat - startTime) * pxPerSec;
    const isBar = b % 4 === 0;
    const isPhrase = b % 32 === 0;
    ctx.fillStyle = isPhrase ? 'rgba(255,255,255,0.55)' : isBar ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)';
    ctx.fillRect(Math.round(x), 0, 1, isBar ? h : 6);
    if (!isBar) ctx.fillRect(Math.round(x), h - 6, 1, 6);
    if (isPhrase) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '10px -apple-system, Helvetica, Arial';
      ctx.fillText(String(b / 32 + 1), x + 3, mirrored ? h - 4 : 11);
    }
  }

  if (!wf) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px -apple-system, Helvetica, Arial';
    ctx.fillText(status || 'Analizando…', w * playheadX + 12, h / 2 + 4);
    drawPlayhead(ctx, w, h, playheadX);
    return;
  }

  // Waveform (columnas de 1px)
  const binsPerPx = BINS_PER_SECOND / pxPerSec;
  for (let x = 0; x < w; x++) {
    const t = startTime + x / pxPerSec;
    if (t < 0 || t * BINS_PER_SECOND >= wf.length) continue;
    const a = Math.floor(t * BINS_PER_SECOND);
    const b = Math.max(a + 1, Math.floor(a + binsPerPx));
    const l = peakIn(wf.low, a, b);
    const m = peakIn(wf.mid, a, b);
    const hi = peakIn(wf.high, a, b);
    const amp = Math.min(1, Math.sqrt(Math.max(l * 0.8, m, hi * 0.85)) * 0.92);
    const played = t < position;
    const hh = amp * (mid - 6);
    ctx.fillStyle = bandColor(l, m, hi, played ? 0.55 : 1, deck);
    ctx.fillRect(x, mid - hh, 1, hh * 2);
  }

  // Hot cues
  cues.forEach((cue, i) => {
    if (cue == null) return;
    const x = (cue.position - startTime) * pxPerSec;
    if (x < -10 || x > w + 10) return;
    ctx.fillStyle = cue.color || CUE_COLORS[i % CUE_COLORS.length];
    ctx.fillRect(Math.round(x), 0, 2, h);
    ctx.beginPath();
    ctx.moveTo(x - 5, 0); ctx.lineTo(x + 7, 0); ctx.lineTo(x + 1, 8); ctx.closePath();
    ctx.fill();
  });

  drawPlayhead(ctx, w, h, playheadX);
}

function drawPlayhead(ctx, w, h, playheadX) {
  const px = Math.round(playheadX * w);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px - 1, 0, 2, h);
  ctx.fillStyle = '#E2453F';
  ctx.beginPath();
  ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 7); ctx.closePath();
  ctx.fill();
}

function drawGridOnly(ctx, w, h) {
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let x = 0; x < w; x += w / 14) ctx.fillRect(Math.round(x), 0, 1, h);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, h / 2, w, 1);
}

/** Overview de la pista completa (cabecera del deck). */
export function drawOverview(ctx, w, h, { track, position, cues = [], duration: duration_, deck = 0 }) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0A1711';
  ctx.fillRect(0, 0, w, h);
  if (!track) return;
  const wf = waveformFor(track);
  const duration = duration_ || track.duration;
  if (!wf || !duration) return;
  const binsPerPx = Math.min(wf.length, duration * BINS_PER_SECOND) / w;
  const mid = h / 2;
  const playX = (position / duration) * w;
  for (let x = 0; x < w; x++) {
    const a = Math.floor(x * binsPerPx);
    const b = Math.floor((x + 1) * binsPerPx);
    const l = peakIn(wf.low, a, b), m = peakIn(wf.mid, a, b), hi = peakIn(wf.high, a, b);
    const amp = Math.min(1, Math.max(l, m * 0.9, hi * 0.8));
    const hh = amp * (mid - 1);
    ctx.fillStyle = bandColor(l, m, hi, x < playX ? 0.35 : 0.95, deck);
    ctx.fillRect(x, mid - hh, 1, hh * 2);
  }
  cues.forEach((cue, i) => {
    if (cue == null) return;
    ctx.fillStyle = cue.color || CUE_COLORS[i % CUE_COLORS.length];
    ctx.fillRect(Math.round((cue.position / duration) * w), 0, 2, h);
  });
  ctx.fillStyle = '#E2453F';
  ctx.fillRect(Math.round(playX), 0, 2, h);
}

/* Colores por defecto de los hot cues: recorren la paleta del amarillo de DJ A
   al verde de DJ B. Si la pista trae su propio color de Serato, manda ese. */
export const CUE_COLORS = ['#FFD60A', '#E6A800', '#C98A12', '#9FB22A', '#6EC24F', '#1FD07F', '#12A060', '#0E8A72'];
