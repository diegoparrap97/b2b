// Motor de audio de B2B (Web Audio API).
//
// Cadena por deck:
//   source → trim → EQ low/mid/high → filtro LP/HP ─┬─ fader → crossfader → bus MASTER
//                                                    └─ CUE (pre-fader) ────→ bus AUDÍFONOS
// Salida:
//   - Dispositivo de 4+ canales (Mixtrack Platinum FX): master → 1/2, audífonos → 3/4
//   - Dispositivo estéreo: solo master
//
// Implementa la misma interfaz que el "transport" visual (getPosition, play, pause…)
// para que la interfaz no tenga que saber si hay audio real o no.

import scratchWorkletUrl from './scratch.worklet.js?url';

const dbToGain = (db) => Math.pow(10, db / 20);

// 33⅓ rpm: una vuelta del jog = 1.8 s de audio
export const SECONDS_PER_REV = 60 / (100 / 3);

class Deck {
  constructor(engine, index) {
    this.engine = engine;
    this.index = index;
    this.buffer = null;
    this.duration = 0;
    this.offset = 0;      // posición (s) cuando arrancó el source actual
    this.startCtx = 0;    // ctx.currentTime al arrancar
    this.rate = 1;
    this.playing = false;
    this.loop = null;
    this.source = null;
    this.loadToken = 0;
    this.tempMult = 1;     // pitch bend temporal (jog / botones de bend)
    this.scratching = false;
    this.scratchPos = 0;
    this.scratchTarget = 0;
    this.wasPlaying = false;
    this.scratcher = null;

    const ctx = engine.ctx;
    this.trim = ctx.createGain();
    this.low = ctx.createBiquadFilter(); this.low.type = 'lowshelf'; this.low.frequency.value = 220;
    this.mid = ctx.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.frequency.value = 1000; this.mid.Q.value = 0.7;
    this.high = ctx.createBiquadFilter(); this.high.type = 'highshelf'; this.high.frequency.value = 3200;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 22000; this.lp.Q.value = 0.9;
    this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 10; this.hp.Q.value = 0.9;
    this.fader = ctx.createGain();
    this.cut = ctx.createGain();   // fader cuts
    this.xf = ctx.createGain();
    this.cue = ctx.createGain(); this.cue.gain.value = 0;
    this.meter = ctx.createAnalyser(); this.meter.fftSize = 512;
    this.meterBuf = new Float32Array(this.meter.fftSize);

    this.trim.connect(this.low).connect(this.mid).connect(this.high).connect(this.lp).connect(this.hp);
    this.hp.connect(this.meter);
    this.hp.connect(this.fader).connect(this.cut).connect(this.xf).connect(engine.masterBus);
    this.hp.connect(this.cue).connect(engine.cueBus);
  }

  now() { return this.engine.ctx.currentTime; }

  effRate() { return this.rate * this.tempMult; }

  position() {
    if (this.scratching) return this.scratchPos;
    if (!this.playing) return this.offset;
    let p = this.offset + (this.now() - this.startCtx) * this.effRate();
    if (this.loop && p >= this.loop.end && this.offset < this.loop.end) {
      const len = this.loop.end - this.loop.start;
      p = this.loop.start + ((p - this.loop.start) % len);
    }
    if (this.duration && p >= this.duration) {
      this.stopSource();
      this.playing = false;
      this.offset = this.duration;
      return this.duration;
    }
    return Math.max(0, p);
  }

  stopSource() {
    if (this.source) {
      try { this.source.onended = null; this.source.stop(); } catch { /* ya detenido */ }
      this.source.disconnect();
      this.source = null;
    }
  }

  startSource(at) {
    this.stopSource();
    this.offset = Math.max(0, Math.min(at, this.duration || at));
    this.startCtx = this.now();
    if (!this.buffer) return; // deck "virtual" (sin audio): solo reloj
    const src = this.engine.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.effRate();
    if (this.loop) {
      src.loop = true;
      src.loopStart = this.loop.start;
      src.loopEnd = this.loop.end;
    }
    src.connect(this.trim);
    src.start(0, this.offset);
    this.source = src;
  }

  play() {
    if (this.scratching) { this.wasPlaying = true; return; }
    if (this.playing) return;
    this.engine.resume();
    this.playing = true;
    this.startSource(this.offset >= this.duration && this.duration ? 0 : this.offset);
  }

  pause() {
    if (this.scratching) { this.wasPlaying = false; return; }
    if (!this.playing) return;
    this.offset = this.position();
    this.playing = false;
    this.stopSource();
  }

  seek(pos) {
    pos = Math.max(0, Math.min(pos, this.duration || pos));
    if (this.scratching) {
      this.scratchPos = this.scratchTarget = pos;
      this.scratcher?.port.postMessage({ type: 'start', pos });
      return;
    }
    if (this.playing) this.startSource(pos);
    else this.offset = pos;
  }

  setRate(rate) {
    if (this.playing) {
      this.offset = this.position();
      this.startCtx = this.now();
    }
    this.rate = rate;
    if (this.source) this.source.playbackRate.setTargetAtTime(this.effRate(), this.now(), 0.01);
  }

  /** Multiplicador temporal (nudge con el jog o botones de pitch bend). */
  setTempMult(mult) {
    if (Math.abs(mult - this.tempMult) < 1e-4) return;
    if (this.playing) {
      this.offset = this.position();
      this.startCtx = this.now();
    }
    this.tempMult = mult;
    if (this.source) this.source.playbackRate.setTargetAtTime(this.effRate(), this.now(), 0.005);
  }

  // ── Scratch con el jog ──
  scratchStart() {
    if (!this.buffer || !this.scratcher || this.scratching) return false;
    const pos = this.position();
    this.wasPlaying = this.playing;
    this.stopSource();
    this.playing = false;
    this.scratching = true;
    this.scratchPos = this.scratchTarget = pos;
    this.scratcher.port.postMessage({ type: 'start', pos });
    return true;
  }

  scratchMove(seconds) {
    if (!this.scratching) return;
    this.scratchTarget = Math.max(0, Math.min(this.duration, this.scratchTarget + seconds));
    this.scratcher.port.postMessage({ type: 'target', target: this.scratchTarget });
  }

  scratchEnd() {
    if (!this.scratching) return;
    this.scratcher.port.postMessage({ type: 'stop' });
    this.scratching = false;
    const pos = this.scratchPos;
    this.offset = pos;
    if (this.wasPlaying) {
      this.playing = true;
      this.startSource(pos);
    }
  }

  attachScratcher(node) {
    this.scratcher = node;
    node.connect(this.trim);
    node.port.onmessage = (e) => {
      if (e.data.type === 'pos' && this.scratching) this.scratchPos = e.data.pos;
    };
  }

  sendBufferToScratcher() {
    if (!this.scratcher || !this.buffer) return;
    const chans = [];
    for (let c = 0; c < Math.min(2, this.buffer.numberOfChannels); c++) chans.push(this.buffer.getChannelData(c).slice());
    this.scratcher.port.postMessage({ type: 'load', channels: chans }, chans.map((a) => a.buffer));
  }

  setLoop(loop) {
    if (this.playing) {
      this.offset = this.position();
      this.startCtx = this.now();
    }
    this.loop = loop;
    if (this.source) {
      if (loop) {
        this.source.loopStart = loop.start;
        this.source.loopEnd = loop.end;
        this.source.loop = true;
      } else {
        this.source.loop = false;
      }
    }
  }

  level() {
    if ((!this.playing && !this.scratching) || !this.buffer) return 0;
    this.meter.getFloatTimeDomainData(this.meterBuf);
    let peak = 0;
    for (let i = 0; i < this.meterBuf.length; i++) {
      const v = Math.abs(this.meterBuf[i]);
      if (v > peak) peak = v;
    }
    return peak;
  }
}

export class AudioEngine {
  constructor(deckCount = 2) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.masterBus = ctx.createGain();
    this.cueBus = ctx.createGain();
    this.master = ctx.createGain();
    this.phones = ctx.createGain();
    this.phonesFromCue = ctx.createGain();
    this.phonesFromMaster = ctx.createGain();
    this.masterMeter = ctx.createAnalyser(); this.masterMeter.fftSize = 512;
    this.masterMeterBuf = new Float32Array(512);
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.1;

    this.masterBus.connect(this.master).connect(this.limiter);
    this.limiter.connect(this.masterMeter);
    this.cueBus.connect(this.phonesFromCue).connect(this.phones);
    this.masterBus.connect(this.phonesFromMaster).connect(this.phones);

    this.decks = Array.from({ length: deckCount }, (_, i) => new Deck(this, i));
    this.ready = ctx.audioWorklet
      .addModule(scratchWorkletUrl)
      .then(() => {
        for (const d of this.decks) {
          d.attachScratcher(new AudioWorkletNode(ctx, 'b2b-scratcher', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] }));
          if (d.buffer) d.sendBufferToScratcher();
        }
      })
      .catch((err) => console.warn('Scratch no disponible:', err));
    this.outputInfo = { channels: 2, split: false, deviceId: 'default', label: 'Predeterminado' };
    this.crossfader = 0.5;
    this.cueMix = 0;
    this.routeOutput();
    this.setPhones(0.8);
    this.setCueMix(0);
  }

  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }

  // ── Interfaz "transport" usada por la UI ──
  getPosition(i) { return this.decks[i].position(); }
  isPlaying(i) { const d = this.decks[i]; return d.scratching ? d.wasPlaying : d.playing; }
  play(i) { this.decks[i].play(); }
  pause(i) { this.decks[i].pause(); }
  toggle(i) {
    const d = this.decks[i];
    if (d.scratching) { d.wasPlaying = !d.wasPlaying; return d.wasPlaying; }
    d.playing ? d.pause() : d.play();
    return d.playing;
  }
  seek(i, pos) { this.decks[i].seek(pos); }
  setRate(i, rate) { this.decks[i].setRate(rate); }
  setLoop(i, loop) { this.decks[i].setLoop(loop); }

  scratchStart(i) { return this.decks[i].scratchStart(); }
  scratchMove(i, seconds) { this.decks[i].scratchMove(seconds); }
  scratchEnd(i) { this.decks[i].scratchEnd(); }
  isScratching(i) { return this.decks[i].scratching; }
  setTempMult(i, m) { this.decks[i].setTempMult(m); }
  setCut(i, on) { this.decks[i].cut.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, 0.003); }

  /** Deck sin audio (modo demo). */
  load(i, duration, startPos = 0) {
    const d = this.decks[i];
    if (d.scratching) d.scratchEnd();
    d.pause();
    d.loadToken++;
    d.buffer = null;
    d.duration = duration;
    d.offset = startPos;
    d.loop = null;
  }

  /** Carga un archivo real y lo decodifica. Devuelve el AudioBuffer. */
  async loadUrl(i, url) {
    const d = this.decks[i];
    if (d.scratching) d.scratchEnd();
    d.pause();
    d.scratcher?.port.postMessage({ type: 'unload' });
    const token = ++d.loadToken;
    d.buffer = null;
    d.loop = null;
    d.offset = 0;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo leer el archivo (${res.status})`);
    const data = await res.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data);
    if (token !== d.loadToken) return null; // se cargó otra pista mientras tanto
    d.buffer = buffer;
    d.duration = buffer.duration;
    d.sendBufferToScratcher();
    return buffer;
  }

  // ── Mixer ──
  setChannel(i, ch) {
    const d = this.decks[i];
    const t = this.ctx.currentTime;
    const tc = 0.015;
    d.trim.gain.setTargetAtTime(dbToGain(ch.gain * 12), t, tc);
    const eq = (v) => (v < 0 ? v * 30 : v * 6); // -30 dB (casi kill) … +6 dB
    d.low.gain.setTargetAtTime(eq(ch.low), t, tc);
    d.mid.gain.setTargetAtTime(eq(ch.mid), t, tc);
    d.high.gain.setTargetAtTime(eq(ch.high ?? ch.hi), t, tc);
    const f = ch.filter;
    const lpFreq = f < -0.03 ? 22000 * Math.pow(150 / 22000, -f) : 22000;
    const hpFreq = f > 0.03 ? 15 * Math.pow(6000 / 15, f) : 10;
    d.lp.frequency.setTargetAtTime(lpFreq, t, tc);
    d.hp.frequency.setTargetAtTime(hpFreq, t, tc);
    d.fader.gain.setTargetAtTime(Math.pow(ch.volume, 1.6), t, tc);
    d.cue.gain.setTargetAtTime(ch.cue ? 1 : 0, t, tc);
  }

  setCrossfader(x) {
    this.crossfader = x;
    const a = x <= 0.5 ? 1 : Math.max(0, 2 * (1 - x));
    const b = x >= 0.5 ? 1 : Math.max(0, 2 * x);
    const t = this.ctx.currentTime;
    this.decks[0]?.xf.gain.setTargetAtTime(a, t, 0.01);
    this.decks[1]?.xf.gain.setTargetAtTime(b, t, 0.01);
  }

  setMaster(v) { this.master.gain.setTargetAtTime(Math.pow(v, 1.6), this.ctx.currentTime, 0.02); }
  setPhones(v) { this.phones.gain.setTargetAtTime(Math.pow(v, 1.6), this.ctx.currentTime, 0.02); }
  setCueMix(v) {
    this.cueMix = v;
    const t = this.ctx.currentTime;
    this.phonesFromCue.gain.setTargetAtTime(1 - v, t, 0.02);
    this.phonesFromMaster.gain.setTargetAtTime(v, t, 0.02);
  }

  // ── Salida de audio ──
  routeOutput() {
    const ctx = this.ctx;
    const dest = ctx.destination;
    try { this.limiter.disconnect(); } catch { /* nada conectado */ }
    try { this.phones.disconnect(); } catch { /* nada conectado */ }
    if (this.merger) { try { this.merger.disconnect(); } catch { /* nada */ } }
    this.limiter.connect(this.masterMeter);

    const max = dest.maxChannelCount || 2;
    if (max >= 4) {
      dest.channelCount = 4;
      dest.channelCountMode = 'explicit';
      dest.channelInterpretation = 'discrete';
      const merger = ctx.createChannelMerger(4);
      const sm = ctx.createChannelSplitter(2);
      const sp = ctx.createChannelSplitter(2);
      this.limiter.connect(sm);
      this.phones.connect(sp);
      sm.connect(merger, 0, 0);
      sm.connect(merger, 1, 1);
      sp.connect(merger, 0, 2);
      sp.connect(merger, 1, 3);
      merger.connect(dest);
      this.merger = merger;
      this.outputInfo = { ...this.outputInfo, channels: max, split: true };
    } else {
      dest.channelCount = 2;
      dest.channelCountMode = 'explicit';
      dest.channelInterpretation = 'speakers';
      this.limiter.connect(dest);
      this.merger = null;
      this.outputInfo = { ...this.outputInfo, channels: max, split: false };
    }
    return this.outputInfo;
  }

  async listOutputs() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'audiooutput').map((d) => ({ id: d.deviceId, label: d.label || 'Salida de audio' }));
    } catch {
      return [];
    }
  }

  async setOutputDevice(deviceId, label) {
    if (typeof this.ctx.setSinkId !== 'function') throw new Error('Esta versión no permite elegir la salida de audio');
    await this.ctx.setSinkId(deviceId === 'default' ? '' : deviceId);
    this.outputInfo = { ...this.outputInfo, deviceId, label };
    return this.routeOutput();
  }

  getLevel(i) { return this.decks[i].level(); }
  getMasterLevel() {
    if (!this.decks.some((d) => d.playing && d.buffer)) return 0;
    this.masterMeter.getFloatTimeDomainData(this.masterMeterBuf);
    let p = 0;
    for (let k = 0; k < this.masterMeterBuf.length; k++) p = Math.max(p, Math.abs(this.masterMeterBuf[k]));
    return p;
  }
}
