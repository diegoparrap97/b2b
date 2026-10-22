// Mapeo MIDI para la Numark Mixtrack Platinum FX.
//
// Los números de cada botón, perilla y pantalla salen del mapeo abierto de Mixxx
// para este controlador (mixxxdj/mixxx, res/controllers). El comportamiento
// imita a Serato DJ Lite con la Mixtrack.
//
// Entrada (controlador → app): transport, jogs (scratch / nudge / búsqueda),
// pitch de 14 bits, mixer, pads (hot cue, auto loop, fader cuts), loops,
// browse y carga de pistas.
// Salida (app → controlador): LEDs, vúmetros y las pantallas de los jogs
// (BPM, tiempo, pitch, posición y spinner).

import { SECONDS_PER_REV } from '../audio/engine.js';

export const PAD_MODES = { HOTCUE: 0x00, HOTCUE2: 0x02, AUTOLOOP: 0x0d, FADERCUTS: 0x07, SAMPLE: 0x0b, SAMPLE2: 0x0f };
export const AUTOLOOP_SIZES = [1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16];
const LED_ON = 0x7f;
const LED_DIM = 0x01;
const JOG_TICKS_PER_REV = 1024;
const SYSEX = {
  exitDemo: [0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7],
  faderCut4: [0xf0, 0x00, 0x20, 0x7f, 0x13, 0xf7],
  status: [0xf0, 0x00, 0x20, 0x7f, 0x03, 0x01, 0xf7],
  shutdown: [0xf0, 0x00, 0x20, 0x7f, 0x02, 0xf7],
};

/** Número → nibbles para las pantallas del jog (mismo formato que el firmware). */
export function encodeNum(number, drop, unsigned) {
  const a = [
    (number >> 28) & 0x0f, (number >> 24) & 0x0f, (number >> 20) & 0x0f, (number >> 16) & 0x0f,
    (number >> 12) & 0x0f, (number >> 8) & 0x0f, (number >> 4) & 0x0f, number & 0x0f,
  ];
  if (drop !== undefined) a.splice(0, drop);
  if (number < 0) a[0] = 0x07;
  else if (!unsigned) a[0] = 0x08;
  return a;
}

const screenSysex = (deckNo, kind, nibbles) => [0xf0, 0x00, 0x20, 0x7f, deckNo, kind, ...nibbles, 0xf7];

export class MixtrackPlatinumFX {
  /**
   * @param {MIDIOutput|null} output
   * @param {object} api  funciones de la app (ver App.jsx → midiApi)
   */
  constructor(output, api, sysexOk = false) {
    this.out = output;
    this.api = api;
    this.sysexOk = sysexOk;
    this.shift = false;
    this.cache = new Map();
    this.screen = [{}, {}];
    this.padMode = [PAD_MODES.HOTCUE, PAD_MODES.HOTCUE];
    this.scratchMode = [true, true];
    this.touching = [false, false];
    this.pitchMsb = [null, null];   // hasta que llegue el primer mensaje del fader
    this.pitchLsb = [0, 0];
    this.nudgeTimer = [0, 0];
    this.cutHeld = [new Set(), new Set()];
  }

  // ── Salida ──
  send(status, d1, d2, force = false) {
    if (!this.out) return;
    const key = (status << 8) | d1;
    if (!force && this.cache.get(key) === d2) return;
    this.cache.set(key, d2);
    try { this.out.send([status, d1, d2 & 0x7f]); } catch { /* puerto cerrado */ }
  }

  sysex(bytes) {
    if (!this.out || !this.sysexOk) return;
    try { this.out.send(bytes); } catch { this.sysexOk = false; /* sin permiso: no insistir */ }
  }

  init() {
    this.sysex(SYSEX.exitDemo);
    this.sysex(SYSEX.faderCut4);
    this.sysex(SYSEX.status);
    for (let d = 0; d < 2; d++) {
      this.send(0x90 + d, 0x08, LED_ON, true);   // deck activo (1 y 2)
      this.send(0x90 + d, 0x46, LED_ON, true);   // pantalla en tiempo restante
      this.send(0x90 + d, 0x0e, 8, true);        // rango de pitch ±8 %
    }
    this.cache.clear();
    this.screen = [{}, {}];
    this.update();
  }

  shutdown() {
    for (let d = 0; d < 4; d++) {
      this.send(0xb0 | d, 0x3f, 0, true);
      this.send(0xb0 | d, 0x06, 0, true);
      this.send(0x80 | d, 0x0d, 0, true);
      this.send(0x80 | d, 0x0a, 0, true);
      this.send(0x80 | d, 0x09, 0, true);
    }
    this.sysex(SYSEX.shutdown);
  }

  /** Refresca LEDs y pantallas (se llama ~25 veces por segundo). */
  update() {
    if (!this.out) return;
    const s = this.api.snapshot();
    for (let d = 0; d < 2; d++) {
      const deck = s.decks[d];
      const loaded = !!deck.track && deck.status !== 'error';
      const playing = s.isPlaying(d);
      const pos = s.position(d);
      const dur = deck.duration || 0;

      // Botones de transporte
      this.send(0x90 + d, 0x00, playing ? LED_ON : LED_DIM);
      this.send(0x90 + d, 0x01, loaded && !playing ? LED_ON : LED_DIM);
      this.send(0x90 + d, 0x02, deck.sync ? LED_ON : LED_DIM);
      this.send(0x90 + d, 0x1b, s.mixer[d].cue ? LED_ON : LED_DIM);
      this.send(0x90 + d, 0x0d, deck.keylock ? LED_ON : 0x00);
      this.send(0x90 + d, 0x07, this.scratchMode[d] ? LED_ON : LED_DIM);

      // Pads
      const ch = 0x94 + d;
      for (const m of [PAD_MODES.HOTCUE, PAD_MODES.AUTOLOOP, PAD_MODES.FADERCUTS, PAD_MODES.SAMPLE]) {
        this.send(ch, m, this.padMode[d] === m ? LED_ON : LED_DIM);
      }
      for (let p = 0; p < 8; p++) {
        let v = LED_DIM;
        if (this.padMode[d] === PAD_MODES.HOTCUE) v = deck.cues[p] ? LED_ON : LED_DIM;
        else if (this.padMode[d] === PAD_MODES.AUTOLOOP) v = deck.loop && Math.abs(deck.loopSize - AUTOLOOP_SIZES[p]) < 1e-6 ? LED_ON : LED_DIM;
        else if (this.padMode[d] === PAD_MODES.FADERCUTS) v = this.cutHeld[d].has(p) ? LED_ON : p < 4 ? LED_DIM : 0;
        this.send(ch, 0x14 + p, v);
      }
      this.send(ch, 0x40, deck.loop ? LED_ON : LED_DIM);

      // Vúmetro, anillo de posición y spinner del jog
      this.send(0xb0 + d, 0x1f, Math.round(Math.min(1, s.level(d)) * 90));
      this.send(0xb0 + d, 0x3f, dur ? Math.max(0, Math.min(52, Math.round((pos / dur) * 52))) : 0);
      this.send(0xb0 + d, 0x06, loaded ? 64 + (Math.round(((pos % SECONDS_PER_REV) / SECONDS_PER_REV) * 52) % 52) : 0);

      // Pantallas del jog
      const scr = this.screen[d];
      const deckNo = d + 1;
      const bpm = deck.grid?.bpm ? Math.round(deck.grid.bpm * (1 + deck.pitch / 100) * 100) : 0;
      if (scr.bpm !== bpm) {
        scr.bpm = bpm;
        const nib = encodeNum(bpm);
        nib.shift(); nib.shift();
        this.sysex(screenSysex(deckNo, 0x01, nib));
      }
      const rate = Math.round(deck.pitch * 100);
      if (scr.rate !== rate) {
        scr.rate = rate;
        this.sysex(screenSysex(deckNo, 0x02, encodeNum(rate, 2)));
      }
      const durMs = Math.max(1, Math.round(dur * 1000));
      if (scr.dur !== durMs) {
        scr.dur = durMs;
        this.sysex(screenSysex(deckNo, 0x03, encodeNum(durMs - 1)));
      }
      // El tiempo se manda ~10 veces por segundo: más que eso satura al
      // controlador de SysEx y empieza a comportarse raro.
      const timeMs = Math.round(pos * 1000);
      if (scr.time === undefined || Math.abs(scr.time - timeMs) >= 100) {
        scr.time = timeMs;
        this.sysex(screenSysex(deckNo, 0x04, encodeNum(timeMs)));
      }
      if (scr.range !== deck.pitchRange) {
        scr.range = deck.pitchRange;
        this.send(0x90 + d, 0x0e, deck.pitchRange, true);
      }

      // Flechas de BPM respecto al otro deck
      const other = s.decks[1 - d];
      const myBpm = bpm / 100;
      const otherBpm = other.grid?.bpm ? other.grid.bpm * (1 + other.pitch / 100) : 0;
      let up = 0, down = 0;
      if (myBpm && otherBpm) {
        if (otherBpm > myBpm + 0.05) down = 1;
        if (otherBpm < myBpm - 0.05) up = 1;
      }
      this.send(0x80 | d, 0x0a, down);
      this.send(0x80 | d, 0x09, up);
    }
  }

  // ── Entrada ──
  handle(data) {
    const [status, d1 = 0, d2 = 0] = data;
    if (status === 0xf0 || status === 0xfe || status === 0xf8) return;
    const type = status & 0xf0;
    const ch = status & 0x0f;
    const isNote = type === 0x90 || type === 0x80;
    const down = type === 0x90 && d2 > 0;
    const a = this.api;

    // Shift (cualquiera de los dos lados)
    if (isNote && ch < 4 && d1 === 0x20) { this.shift = down; a.onShift?.(down); return; }

    // ── Decks: canales 0-3 (3 y 4 se tratan como 1 y 2) ──
    if (ch < 4) {
      const d = ch % 2;
      if (isNote) {
        switch (d1) {
          case 0x00: if (down) a.togglePlay(d); return;
          case 0x04: if (down) a.stutter(d); return;                     // shift + play
          case 0x01: a.cueButton(d, down); return;
          case 0x05: if (down) a.toTrackStart(d); return;                 // shift + cue
          case 0x02: if (down) a.toggleSync(d); return;
          case 0x03: if (down) a.syncOff(d); return;                      // shift + sync
          case 0x06: this.jogTouch(d, down); return;
          case 0x07: if (down) this.scratchMode[d] = !this.scratchMode[d]; return;
          case 0x0b: a.tempBend(d, down ? 1 : 0); return;
          case 0x0c: a.tempBend(d, down ? -1 : 0); return;
          case 0x2b: if (down) a.toggleKeylock(d); return;                // shift + bend +
          case 0x2c: if (down) a.cyclePitchRange(d); return;              // shift + bend −
          case 0x1b: if (down) a.togglePfl(d); return;
          default: return;
        }
      }
      if (type === 0xb0) {
        const rel = d2 >= 64 ? d2 - 128 : d2;
        const knob = d2 < 64 ? (d2 - 64) / 64 : (d2 - 64) / 63; // -1 … 1 con centro en 64
        switch (d1) {
          case 0x06: this.jogTurn(d, rel); return;
          // El fader de pitch es de 14 bits: manda primero la parte gruesa (0x09)
          // y enseguida la fina (0x29). Hay que esperar a la segunda para mover
          // nada; si se reacciona a cada mensaje por separado, entre una y otra
          // salen valores disparatados y el tema se acelera y frena solo.
          case 0x09: this.pitchMsb[d] = d2; return;
          case 0x29:
            if (this.pitchMsb[d] == null) return;   // aún no llega la parte gruesa
            this.pitchLsb[d] = d2;
            this.pitchMove(d);
            return;
          case 0x16: a.setChannel(d, 'gain', knob); return;
          case 0x17: a.setChannel(d, 'hi', knob); return;
          case 0x18: a.setChannel(d, 'mid', knob); return;
          case 0x19: a.setChannel(d, 'low', knob); return;
          case 0x1a: a.setChannel(d, 'filter', knob); return;
          case 0x1c: a.setChannel(d, 'volume', d2 / 127); return;
          default: return;
        }
      }
      return;
    }

    // ── Pads y loops: canales 4-7 ──
    if (ch >= 4 && ch <= 7 && isNote) {
      const d = (ch - 4) % 2;
      if ([PAD_MODES.HOTCUE, PAD_MODES.HOTCUE2, PAD_MODES.AUTOLOOP, PAD_MODES.FADERCUTS, PAD_MODES.SAMPLE, PAD_MODES.SAMPLE2].includes(d1)) {
        if (down) {
          this.releaseCuts(d);
          this.padMode[d] = d1 === PAD_MODES.HOTCUE2 ? PAD_MODES.HOTCUE : d1 === PAD_MODES.SAMPLE2 ? PAD_MODES.SAMPLE : d1;
        }
        return;
      }
      if (d1 >= 0x14 && d1 <= 0x23) {
        const shifted = d1 >= 0x1c;
        const p = (d1 - 0x14) % 8;
        this.pad(d, p, down, shifted || this.shift);
        return;
      }
      switch (d1) {
        case 0x40: case 0x41: if (down) a.toggleLoop(d); return;
        case 0x34: if (down) a.loopSize(d, 0.5); return;
        case 0x35: if (down) a.loopSize(d, 2); return;
        case 0x36: if (down) a.loopIn(d); return;                          // shift + ½ = loop in
        case 0x37: if (down) a.loopOut(d); return;                         // shift + ×2 = loop out
        default: return;
      }
    }

    // ── Global: canal 15 (browse, crossfader, audífonos) y 14 (master) ──
    if (ch === 0x0f) {
      if (type === 0xb0) {
        const rel = d2 >= 64 ? d2 - 128 : d2;
        switch (d1) {
          case 0x00: a.browse(rel, this.shift); return;
          case 0x01: a.browse(rel, true); return;
          case 0x08: a.setCrossfader(d2 / 127); return;
          case 0x0c: a.setGlobal('phones', d2 / 127); return;
          case 0x0d: a.setGlobal('cueMix', d2 / 127); return;
          default: return;
        }
      }
      if (isNote && down) {
        switch (d1) {
          case 0x02: case 0x04: this.shift ? a.eject(0) : a.loadSelected(0); return;
          case 0x03: case 0x05: this.shift ? a.eject(1) : a.loadSelected(1); return;
          case 0x06: a.browsePress(false); return;
          case 0x07: a.browsePress(true); return;
          default: return;
        }
      }
      return;
    }
    if (ch === 0x0e && type === 0xb0 && d1 === 0x23) a.setGlobal('master', d2 / 127);
    // Canales 8-9 (efectos): pendiente para la etapa de FX
  }

  pad(d, p, down, shifted) {
    const a = this.api;
    switch (this.padMode[d]) {
      case PAD_MODES.HOTCUE:
        if (!down) return;
        if (shifted) a.deleteCue(d, p);
        else a.hotCue(d, p);
        return;
      case PAD_MODES.AUTOLOOP:
        if (down) a.autoLoop(d, AUTOLOOP_SIZES[p]);
        return;
      case PAD_MODES.FADERCUTS:
        if (p > 3) return;
        if (down) this.cutHeld[d].add(p);
        else this.cutHeld[d].delete(p);
        a.faderCut(d, this.cutHeld[d].size > 0);
        return;
      default:
        return; // sampler: próxima etapa
    }
  }

  releaseCuts(d) {
    if (this.cutHeld[d].size) {
      this.cutHeld[d].clear();
      this.api.faderCut(d, false);
    }
  }

  pitchMove(d) {
    let v = (this.pitchMsb[d] * 128 + this.pitchLsb[d]) / 16383; // 0 … 1
    if (this.api.invertPitch()) v = 1 - v;
    this.api.pitchFader(d, (v - 0.5) * 2); // -1 … 1
  }

  jogTouch(d, down) {
    this.touching[d] = down;
    if (down && this.scratchMode[d] && !this.shift) this.api.scratchStart(d);
    else if (!down) this.api.scratchEnd(d);
  }

  jogTurn(d, ticks) {
    const a = this.api;
    if (this.shift) { a.seekBy(d, ticks * 0.05); return; }       // búsqueda rápida
    if (a.isScratching(d)) { a.scratchMove(d, (ticks / JOG_TICKS_PER_REV) * SECONDS_PER_REV); return; }
    if (a.isPlaying(d)) {
      // Borde del jog: empuja o frena el tema (nudge) para cuadrar beats
      a.nudge(d, 1 + Math.max(-0.25, Math.min(0.25, ticks * 0.01)));
      clearTimeout(this.nudgeTimer[d]);
      this.nudgeTimer[d] = setTimeout(() => a.nudge(d, 1), 70);
    } else {
      a.seekBy(d, (ticks / JOG_TICKS_PER_REV) * SECONDS_PER_REV * 2);
    }
  }
}

// Puertos que nunca son el controlador (los crea el sistema o otras apps).
const IGNORED_PORT = /IAC Driver|Network Session|Bluetooth|Session 1/i;
const MIXTRACK_PORT = /mixtrack|numark|platinum/i;

// El pedido de acceso MIDI puede quedarse colgado sin resolver ni fallar
// (pasa cuando el permiso de SysEx no se contesta). Por eso va con tope de tiempo.
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`sin respuesta al pedir MIDI ${label}`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

const askAccess = (sysex, ms) =>
  withTimeout(navigator.requestMIDIAccess({ sysex }), ms, sysex ? 'con pantallas' : 'básico');

/**
 * Conecta con la Mixtrack (y se reconecta si la desenchufas y la vuelves a enchufar).
 * `preferSysex` pide primero el permiso de SysEx (pantallas del jog). Ese permiso
 * suele necesitar un clic del usuario, así que se usa desde el botón de Ajustes.
 */
export async function connectMixtrack(api, onStatus, onMessage, { preferSysex = false } = {}) {
  if (!navigator.requestMIDIAccess) {
    onStatus({ state: 'unsupported', message: 'Este Mac/navegador no permite MIDI' });
    return { stop: () => {}, retry: () => {} };
  }

  // Primero el MIDI básico (botones, perillas, jogs, luces). Las pantallas de los
  // jogs necesitan SysEx y se piden después, sin frenar lo demás.
  let access = null;
  let sysexDenied = true;
  const why = [];
  onStatus({ state: 'init', message: 'Pidiendo acceso MIDI…' });
  // Con preferSysex probamos primero el permiso completo; si no llega, el básico
  // igual deja todo funcionando menos las pantallas.
  const orden = preferSysex ? [true, false] : [false, true];
  for (const conSysex of orden) {
    const etiqueta = conSysex ? 'con SysEx' : 'básico';
    console.log(`[midi] pidiendo acceso ${etiqueta}…`);
    try {
      access = await askAccess(conSysex, conSysex ? 10000 : 4000);
      sysexDenied = !access.sysexEnabled;
      console.log(`[midi] acceso ${etiqueta} concedido · sysex=${access.sysexEnabled}`);
      break;
    } catch (e) {
      why.push(`${etiqueta}: ${e.message || e}`);
      console.log(`[midi] acceso ${etiqueta} falló:`, e.message || e);
    }
  }
  if (access) {
    console.log('[midi] puertos de entrada:', [...access.inputs.values()].map((p) => p.name).join(' | ') || '(ninguno)');
    console.log('[midi] puertos de salida:', [...access.outputs.values()].map((p) => p.name).join(' | ') || '(ninguno)');
  }
  if (!access) {
    onStatus({ state: 'error', message: `No se pudo acceder al MIDI (${why.join(' · ')})`, ports: [] });
    return { stop: () => {}, retry: (opts) => connectMixtrack(api, onStatus, onMessage, opts) };
  }

  let controller = null;
  let input = null;
  let timer = 0;

  const listener = (e) => {
    onMessage?.(e.data);
    controller?.handle(e.data);
  };

  let stopped = false;
  const attach = () => {
    if (stopped) return;
    const live = (p) => p.state !== 'disconnected';
    const ins = [...access.inputs.values()].filter(live);
    const outs = [...access.outputs.values()].filter(live);
    const names = ins.map((p) => p.name);
    const usable = (list) => list.filter((p) => !IGNORED_PORT.test(p.name || ''));
    // Primero por nombre; si no coincide ninguno, usa el único puerto real que haya
    // (así funciona aunque macOS le ponga otro nombre al controlador).
    const byName = (list) => list.find((p) => MIXTRACK_PORT.test(p.name || ''));
    const pick = (list) => {
      const real = usable(list);
      return byName(real) || (real.length === 1 ? real[0] : null);
    };
    const nextIn = pick(ins);
    const nextOut = pick(outs);
    if (nextIn === input && controller) return;
    if (input) input.onmidimessage = null;
    clearInterval(timer);
    input = nextIn;
    if (!input) {
      controller = null;
      const message = ins.length === 0
        ? 'No se ve ningún puerto MIDI. Conecta la Mixtrack por USB y cierra Serato.'
        : 'No reconozco el controlador entre los puertos MIDI';
      onStatus({ state: 'waiting', message, ports: names });
      return;
    }
    controller = new MixtrackPlatinumFX(nextOut, api, !!access.sysexEnabled);
    input.onmidimessage = listener;
    controller.init();
    timer = setInterval(() => controller?.update(), 40);
    onStatus({
      state: 'connected',
      message: input.name,
      sysex: !!access.sysexEnabled && !sysexDenied,
      noOutput: !nextOut,
      ports: names,
      intentos: why,
    });
  };

  access.onstatechange = () => attach();
  attach();

  // Ya con el controlador andando, intenta el permiso de SysEx para las pantallas
  // de los jogs. Si no llega, todo lo demás sigue funcionando igual.
  if (sysexDenied) {
    askAccess(true, 8000)
      .then((full) => {
        if (stopped || !full.sysexEnabled) return;
        const prev = access;
        access = full;
        sysexDenied = false;
        prev.onstatechange = null;
        access.onstatechange = () => attach();
        if (input) input.onmidimessage = null;
        input = null;
        clearInterval(timer);
        attach();
      })
      .catch(() => {});
  }

  const onUnload = () => controller?.shutdown();
  window.addEventListener('beforeunload', onUnload);

  const stop = () => {
    stopped = true;
    window.removeEventListener('beforeunload', onUnload);
    clearInterval(timer);
    controller?.shutdown();
    if (input) input.onmidimessage = null;
    access.onstatechange = null;
  };
  return {
    stop,
    sysex: () => !!access.sysexEnabled,
    retry: (opts) => { stop(); return connectMixtrack(api, onStatus, onMessage, opts); },
  };
}
