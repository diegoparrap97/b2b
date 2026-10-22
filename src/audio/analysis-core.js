// Análisis de una pista en segundo plano (no traba la interfaz):
//  - waveform en 3 bandas (graves / medios / agudos), 100 muestras por segundo
//  - BPM y primer beat, solo si Serato no los trae

const BINS_PER_SECOND = 100;

function biquad(type, freq, sr, q = 0.707) {
  const w = (2 * Math.PI * freq) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; }
  else { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const c = { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
  return (x) => {
    const y = c.b0 * x + c.b1 * c.x1 + c.b2 * c.x2 - c.a1 * c.y1 - c.a2 * c.y2;
    c.x2 = c.x1; c.x1 = x; c.y2 = c.y1; c.y1 = y;
    return y;
  };
}

export function analyze(mono, sr, knownBpm, knownFirstBeat) {
  const hop = sr / BINS_PER_SECOND;
  const bins = Math.ceil(mono.length / hop);
  const low = new Float32Array(bins);
  const mid = new Float32Array(bins);
  const high = new Float32Array(bins);

  // Envolvente de graves a 400 Hz para detectar tempo
  const ENV_RATE = 400;
  const envHop = sr / ENV_RATE;
  const env = new Float32Array(Math.ceil(mono.length / envHop));

  const lp = biquad('lp', 180, sr);
  const hpMid = biquad('hp', 180, sr);
  const lpMid = biquad('lp', 2800, sr);
  const hp = biquad('hp', 2800, sr);

  let bi = 0, nextBin = hop, pl = 0, pm = 0, ph = 0;
  let ei = 0, nextEnv = envHop, envAcc = 0;
  for (let n = 0; n < mono.length; n++) {
    const x = mono[n];
    const l = lp(x);
    const m = lpMid(hpMid(x));
    const h = hp(x);
    const al = Math.abs(l), am = Math.abs(m), ah = Math.abs(h);
    if (al > pl) pl = al;
    if (am > pm) pm = am;
    if (ah > ph) ph = ah;
    envAcc += l * l;
    if (n + 1 >= nextEnv) {
      env[ei++] = Math.sqrt(envAcc / envHop);
      envAcc = 0;
      nextEnv += envHop;
    }
    if (n + 1 >= nextBin) {
      low[bi] = pl; mid[bi] = pm; high[bi] = ph;
      bi++; pl = pm = ph = 0;
      nextBin += hop;
    }
  }

  // Normalización conjunta (respeta el balance entre bandas)
  let max = 0;
  for (let k = 0; k < bins; k++) max = Math.max(max, low[k], mid[k], high[k] * 1.8);
  const s = max ? 1 / max : 1;
  for (let k = 0; k < bins; k++) { low[k] *= s; mid[k] = Math.min(1, mid[k] * s); high[k] = Math.min(1, high[k] * s * 1.8); }

  // Onsets: diferencia positiva de la envolvente
  const onset = new Float32Array(env.length);
  for (let k = 1; k < env.length; k++) onset[k] = Math.max(0, env[k] - env[k - 1]);

  let bpm = knownBpm;
  if (!bpm) bpm = detectBpm(onset, ENV_RATE);
  let firstBeat = knownFirstBeat;
  if (firstBeat == null && bpm) firstBeat = detectPhase(onset, ENV_RATE, bpm);

  return { low, mid, high, length: bins, bpm, firstBeat };
}

function detectBpm(onset, rate) {
  // Autocorrelación sobre un tramo central (evita intro/outro)
  const start = Math.floor(onset.length * 0.2);
  const len = Math.min(onset.length - start, rate * 90);
  if (len < rate * 10) return null;
  const minBpm = 70, maxBpm = 180;
  const minLag = Math.floor((60 / maxBpm) * rate);
  const maxLag = Math.ceil((60 / minBpm) * rate);
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let sum = 0;
    for (let k = start; k < start + len - lag; k++) sum += onset[k] * onset[k + lag];
    corr[lag] = sum;
  }
  let best = minLag;
  for (let lag = minLag; lag <= maxLag; lag++) if (corr[lag] > corr[best]) best = lag;
  // Interpolación parabólica para más precisión
  const a = corr[best - 1] || 0, b = corr[best], c = corr[best + 1] || 0;
  const d = (a - 2 * b + c) ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
  let bpm = (60 * rate) / (best + d);
  // Llevar a un rango típico de DJ
  while (bpm < 85) bpm *= 2;
  while (bpm > 175) bpm /= 2;
  return Math.round(bpm * 100) / 100;
}

function detectPhase(onset, rate, bpm) {
  const period = (60 / bpm) * rate;
  const steps = 64;
  let bestPhase = 0, bestScore = -1;
  const limit = Math.min(onset.length, rate * 120);
  for (let s = 0; s < steps; s++) {
    const phase = (s / steps) * period;
    let score = 0;
    for (let t = phase; t < limit; t += period) {
      const k = Math.round(t);
      score += (onset[k] || 0) + 0.5 * ((onset[k - 1] || 0) + (onset[k + 1] || 0));
    }
    if (score > bestScore) { bestScore = score; bestPhase = phase; }
  }
  return bestPhase / rate;
}

