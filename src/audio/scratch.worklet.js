// Procesador de scratch: lee el audio del deck a cualquier velocidad,
// hacia adelante o hacia atrás, siguiendo la posición del jog.
// Se usa solo mientras tocas el jog; el resto del tiempo suena el reproductor normal.

class Scratcher extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ch = null;
    this.active = false;
    this.pos = 0;      // en frames
    this.target = 0;   // en frames
    this.vel = 0;      // frames por frame
    this.gain = 0;
    this.blocks = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'load') {
        this.ch = m.channels;
        this.length = this.ch[0].length;
        this.active = false;
      } else if (m.type === 'unload') {
        this.ch = null;
        this.active = false;
      } else if (m.type === 'start') {
        this.pos = m.pos * sampleRate;
        this.target = this.pos;
        this.vel = 0;
        this.active = true;
      } else if (m.type === 'target') {
        this.target = m.target * sampleRate;
      } else if (m.type === 'stop') {
        this.active = false;
        this.port.postMessage({ type: 'pos', pos: this.pos / sampleRate });
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    if (!this.active || !this.ch) {
      for (const c of out) c.fill(0);
      return true;
    }
    // Velocidad deseada: alcanzar el objetivo en ~25 ms
    const desired = Math.max(-6, Math.min(6, (this.target - this.pos) / (sampleRate * 0.025)));
    const L = this.ch[0];
    const R = this.ch[1] || this.ch[0];
    const last = this.length - 2;
    for (let i = 0; i < n; i++) {
      this.vel += (desired - this.vel) * 0.01;
      this.pos += this.vel;
      if (this.pos < 0) { this.pos = 0; this.vel = 0; }
      if (this.pos > last) { this.pos = last; this.vel = 0; }
      // Silencia suavemente cuando el disco está quieto (evita zumbido de DC)
      const g = Math.min(1, Math.abs(this.vel) * 6);
      this.gain += (g - this.gain) * 0.005;
      const k = Math.floor(this.pos);
      const f = this.pos - k;
      out[0][i] = (L[k] + (L[k + 1] - L[k]) * f) * this.gain;
      if (out[1]) out[1][i] = (R[k] + (R[k + 1] - R[k]) * f) * this.gain;
    }
    if (++this.blocks % 4 === 0) this.port.postMessage({ type: 'pos', pos: this.pos / sampleRate });
    return true;
  }
}

registerProcessor('b2b-scratcher', Scratcher);
