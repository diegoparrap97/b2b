// Envía el audio al worker de análisis y devuelve waveform + BPM + primer beat.
// Si el worker no se puede crear, analiza en el hilo principal.
import { analyze } from './analysis-core.js';

let worker;
let workerBroken = false;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./analyzer.worker.js', import.meta.url), { type: 'module' });
    worker.onerror = () => {
      workerBroken = true;
      for (const [, p] of pending) p.fallback();
      pending.clear();
    };
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      e.data.ok ? p.resolve(e.data) : p.reject(new Error(e.data.error));
    };
  }
  return worker;
}

export function analyzeBuffer(buffer, { bpm = null, firstBeat = null } = {}) {
  const n = buffer.length;
  const mono = new Float32Array(n);
  const chs = buffer.numberOfChannels;
  for (let c = 0; c < chs; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += d[i] / chs;
  }
  const sr = buffer.sampleRate;
  const runHere = () => analyze(mono, sr, bpm, firstBeat);
  if (workerBroken) return Promise.resolve(runHere());
  const id = ++seq;
  const copy = mono.slice();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, fallback: () => { try { resolve(runHere()); } catch (e) { reject(e); } } });
    try {
      getWorker().postMessage({ id, mono: copy, sampleRate: sr, bpm, firstBeat }, [copy.buffer]);
    } catch {
      workerBroken = true;
      pending.delete(id);
      resolve(runHere());
    }
  });
}
