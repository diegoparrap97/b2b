// Worker: corre el análisis fuera del hilo de la interfaz.
import { analyze } from './analysis-core.js';

self.onmessage = (e) => {
  const { id, mono, sampleRate, bpm, firstBeat } = e.data;
  try {
    const r = analyze(mono, sampleRate, bpm, firstBeat);
    self.postMessage({ id, ok: true, ...r }, [r.low.buffer, r.mid.buffer, r.high.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
