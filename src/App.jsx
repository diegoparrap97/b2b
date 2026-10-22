import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import DeckHeader from './components/DeckHeader.jsx';
import CenterPanel from './components/CenterPanel.jsx';
import PadStrip from './components/PadStrip.jsx';
import WaveformArea from './components/WaveformArea.jsx';
import Library from './components/Library.jsx';
import Settings from './components/Settings.jsx';
import { tracks as demoTracks, crates as demoCrates } from './data/library.js';
import { AudioEngine } from './audio/engine.js';
import { analyzeBuffer } from './audio/analyze.js';
import { setAnalysis, CUE_COLORS } from './lib/waveform.js';
import { connectMixtrack } from './midi/mixtrack.js';

const bridge = typeof window !== 'undefined' ? window.b2b : undefined;
const MAX_CUES = 8;

const emptyDeck = () => ({
  track: null,
  status: null,     // 'loading' | 'analyzing' | 'ready' | 'error'
  error: null,
  duration: 0,
  grid: null,       // { bpm, firstBeat }
  playing: false,
  sync: false,
  keylock: false,
  pitch: 0,
  pitchRange: 8,    // ±% del fader de pitch
  mainCue: 0,       // cue "temporal" (botón CUE)
  cues: [],
  loop: null,
  loopSize: 4,
});

const emptyChannel = () => ({ gain: 0, hi: 0, mid: 0, low: 0, filter: 0, volume: 1, cue: false });

const effBpm = (d) => (d.grid?.bpm ? d.grid.bpm * (1 + d.pitch / 100) : null);

export default function App() {
  const engine = useMemo(() => new AudioEngine(2), []);
  const [mode, setMode] = useState('lite');
  const [decks, setDecks] = useState([emptyDeck(), emptyDeck()]);
  const [library, setLibrary] = useState({ tracks: [], crates: [], loading: true, progress: null, source: bridge ? 'serato' : 'demo' });
  const [selectedCrate, setSelectedCrate] = useState('all');
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [zoom, setZoom] = useState(12);
  const [crossfader, setCrossfader] = useState(0.5);
  const [showCues, setShowCues] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [output, setOutput] = useState(engine.outputInfo);
  const [mixer, setMixerState] = useState({ 0: emptyChannel(), 1: emptyChannel(), master: 0.85, cueMix: 0, phones: 0.8 });
  const decksRef = useRef(decks);
  decksRef.current = decks;
  const trackData = useRef({});
  const loadSeq = useRef([0, 0]);
  const [libFocus, setLibFocus] = useState('tracks');
  const [midiStatus, setMidiStatus] = useState({ state: 'init', message: 'Buscando controlador…' });
  const [invertPitch, setInvertPitch] = useState(false);
  const midiLog = useRef([]);
  const midiRetry = useRef(() => {});
  const pickup = useRef([true, true]);       // soft takeover del fader de pitch
  const pickupLast = useRef([null, null]);
  const preview = useRef([false, false]);    // CUE sostenido (preview)
  const loopInPos = useRef([null, null]);
  const bendMult = useRef([1, 1]);

  const trackById = useMemo(() => Object.fromEntries(library.tracks.map((t) => [t.id, t])), [library.tracks]);

  const patchDeck = useCallback((i, patch) => {
    setDecks((ds) => ds.map((d, k) => (k === i ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch) } : d)));
  }, []);

  // ── Librería ──
  const loadLibrary = useCallback(async () => {
    if (!bridge) {
      setLibrary({ tracks: demoTracks, crates: demoCrates, loading: false, progress: null, source: 'demo' });
      setSelectedCrate('melodic5');
      return;
    }
    setLibrary((l) => ({ ...l, loading: true }));
    const off = bridge.onLibraryProgress((p) => setLibrary((l) => ({ ...l, progress: p })));
    try {
      const [lib, td] = await Promise.all([bridge.loadLibrary(), bridge.getTrackData()]);
      trackData.current = td || {};
      setLibrary({ tracks: lib.tracks, crates: lib.crates, loading: false, progress: null, source: lib.hasSerato ? 'serato' : 'folder' });
    } catch (err) {
      setLibrary({ tracks: [], crates: [], loading: false, progress: null, error: String(err), source: 'error' });
    } finally {
      off();
    }
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  // ── Salida de audio: usa la guardada o la Mixtrack si está conectada ──
  const chooseOutput = useCallback(async (id, label) => {
    try {
      const info = await engine.setOutputDevice(id, label);
      setOutput({ ...info });
      bridge?.setConfig({ outputDeviceId: id });
      return info;
    } catch (err) {
      setOutput({ ...engine.outputInfo, error: String(err.message || err) });
      return null;
    }
  }, [engine]);

  useEffect(() => {
    (async () => {
      const cfg = bridge ? await bridge.getConfig() : {};
      const outs = await engine.listOutputs();
      const saved = cfg.outputDeviceId && outs.find((o) => o.id === cfg.outputDeviceId);
      const mixtrack = outs.find((o) => /mixtrack|numark/i.test(o.label));
      const pick = saved || mixtrack;
      if (pick) chooseOutput(pick.id, pick.label);
    })();
  }, [engine, chooseOutput]);

  // ── Mixer → motor ──
  useEffect(() => {
    engine.setChannel(0, mixer[0]);
    engine.setChannel(1, mixer[1]);
    engine.setMaster(mixer.master);
    engine.setPhones(mixer.phones);
    engine.setCueMix(mixer.cueMix);
  }, [engine, mixer]);
  useEffect(() => { engine.setCrossfader(crossfader); }, [engine, crossfader]);

  // Sincroniza "playing" cuando una pista llega al final
  useEffect(() => {
    const id = setInterval(() => {
      decksRef.current.forEach((d, i) => {
        if (d.playing && !engine.isPlaying(i)) patchDeck(i, { playing: false });
      });
    }, 250);
    return () => clearInterval(id);
  }, [engine, patchDeck]);

  const saveCues = (track, cues) => {
    if (!track?.path || !bridge) return;
    const plain = cues.map((c) => (c ? { position: c.position, color: c.color } : null));
    trackData.current[track.path] = { ...(trackData.current[track.path] || {}), cues: plain };
    bridge.setTrackData(track.path, { cues: plain });
  };

  const applyRate = (i, pitch) => engine.setRate(i, 1 + pitch / 100);

  // Cambia el pitch de un deck y arrastra al deck sincronizado
  const applyPitch = (i, pitch, { keepSync = false, fromFader = false } = {}) => {
    const d = decksRef.current[i];
    applyRate(i, pitch);
    if (!fromFader) pickup.current[i] = true;
    patchDeck(i, keepSync ? { pitch } : { pitch, sync: false });
    const j = 1 - i;
    const o = decksRef.current[j];
    if (o.sync && o.grid?.bpm && d.grid?.bpm) {
      const op = ((d.grid.bpm * (1 + pitch / 100)) / o.grid.bpm - 1) * 100;
      applyRate(j, op);
      pickup.current[j] = true;
      patchDeck(j, { pitch: op });
    }
  };

  const actions = useMemo(() => ({
    async load(i, trackId) {
      const track = trackById[trackId];
      if (!track || engine.isPlaying(i)) return; // como en Serato: no cargar sobre un deck sonando
      const seq = ++loadSeq.current[i];
      const prev = decksRef.current[i];
      const base = { ...emptyDeck(), track, loopSize: prev.loopSize, keylock: prev.keylock, pitchRange: prev.pitchRange };
      pickup.current[i] = true;
      loopInPos.current[i] = null;

      if (!track.path) {
        // Modo demo (sin audio)
        engine.load(i, track.duration, 0);
        patchDeck(i, { ...base, status: 'ready', duration: track.duration, grid: { bpm: track.bpm, firstBeat: 0 }, cues: [{ position: 0, color: CUE_COLORS[0] }] });
        return;
      }

      patchDeck(i, { ...base, status: 'loading', duration: track.duration, grid: track.bpm ? { bpm: track.bpm, firstBeat: 0 } : null });
      try {
        const [buffer, markers] = await Promise.all([
          engine.loadUrl(i, bridge.mediaUrl(track.path)),
          bridge.readMarkers(track.path).catch(() => null),
        ]);
        if (seq !== loadSeq.current[i] || !buffer) return;

        // Cues: los que guardaste en B2B, si no los de Serato
        const saved = trackData.current[track.path]?.cues;
        const cues = new Array(MAX_CUES).fill(null);
        if (saved) saved.forEach((c, k) => { if (c && k < MAX_CUES) cues[k] = c; });
        else (markers?.cues || []).forEach((c) => { if (c.index < MAX_CUES) cues[c.index] = { position: c.position, color: c.color, name: c.name }; });

        const serGrid = markers?.grid?.bpm ? { bpm: markers.grid.bpm, firstBeat: markers.grid.firstBeat } : null;
        patchDeck(i, { status: 'analyzing', duration: buffer.duration, cues, grid: serGrid || (track.bpm ? { bpm: track.bpm, firstBeat: 0 } : null) });

        const a = await analyzeBuffer(buffer, { bpm: serGrid?.bpm ?? track.bpm ?? null, firstBeat: serGrid?.firstBeat ?? null });
        if (seq !== loadSeq.current[i]) return;
        setAnalysis(track.id, a);
        patchDeck(i, { status: 'ready', grid: { bpm: a.bpm, firstBeat: a.firstBeat ?? 0 } });
      } catch (err) {
        if (seq !== loadSeq.current[i]) return;
        patchDeck(i, { status: 'error', error: String(err.message || err) });
      }
    },
    eject(i) {
      if (engine.isPlaying(i)) return;
      loadSeq.current[i]++;
      engine.load(i, 0, 0);
      patchDeck(i, emptyDeck());
    },
    togglePlay(i) {
      const d = decksRef.current[i];
      if (!d.track || d.status === 'loading' || d.status === 'error') return;
      if (preview.current[i]) {
        // Play mientras sostienes CUE: sigue sonando
        preview.current[i] = false;
        patchDeck(i, { playing: true });
        return;
      }
      const playing = engine.toggle(i);
      patchDeck(i, { playing });
    },
    toStart(i) {
      const d = decksRef.current[i];
      if (!d.track) return;
      engine.pause(i);
      engine.seek(i, d.cues.find(Boolean)?.position ?? 0);
      patchDeck(i, { playing: false });
    },
    seek(i, pos) { engine.seek(i, pos); },
    toggle(i, key) {
      const d = decksRef.current[i];
      if (key !== 'sync') return patchDeck(i, { [key]: !d[key] });
      if (d.sync) return patchDeck(i, { sync: false });
      const other = decksRef.current[1 - i];
      const target = effBpm(other);
      if (!d.grid?.bpm || !target) return patchDeck(i, { sync: true });
      const pitch = Math.max(-50, Math.min(50, (target / d.grid.bpm - 1) * 100));
      applyRate(i, pitch);
      // Alinear la fase de los beats con el otro deck
      if (other.grid) {
        const beatO = 60 / other.grid.bpm;
        const phaseO = (((engine.getPosition(1 - i) - (other.grid.firstBeat || 0)) / beatO) % 1 + 1) % 1;
        const beatT = 60 / d.grid.bpm;
        const pos = engine.getPosition(i);
        const phaseT = (((pos - (d.grid.firstBeat || 0)) / beatT) % 1 + 1) % 1;
        let diff = phaseO - phaseT;
        if (diff > 0.5) diff -= 1;
        if (diff < -0.5) diff += 1;
        engine.seek(i, pos + diff * beatT);
      }
      pickup.current[i] = true;
      patchDeck(i, { sync: true, pitch });
    },
    nudgePitch(i, delta) {
      const d = decksRef.current[i];
      const r = d.pitchRange;
      applyPitch(i, Math.max(-r, Math.min(r, Math.round((d.pitch + delta) * 10) / 10)));
    },
    hotCue(i, n) {
      const d = decksRef.current[i];
      if (!d.track || d.status === 'loading') return;
      if (d.cues[n]) {
        engine.seek(i, d.cues[n].position);
        if (!engine.isPlaying(i)) { engine.play(i); patchDeck(i, { playing: true }); }
      } else {
        const cues = [...d.cues];
        while (cues.length < MAX_CUES) cues.push(null);
        cues[n] = { position: engine.getPosition(i), color: CUE_COLORS[n % CUE_COLORS.length] };
        patchDeck(i, { cues });
        saveCues(d.track, cues);
      }
    },
    deleteCue(i, n) {
      const d = decksRef.current[i];
      const cues = [...d.cues];
      cues[n] = null;
      patchDeck(i, { cues });
      saveCues(d.track, cues);
    },
    toggleLoop(i) {
      const d = decksRef.current[i];
      if (!d.track || !d.grid?.bpm) return;
      if (d.loop) {
        engine.setLoop(i, null);
        patchDeck(i, { loop: null });
      } else {
        const beat = 60 / d.grid.bpm;
        const fb = d.grid.firstBeat || 0;
        const start = fb + Math.floor((engine.getPosition(i) - fb) / beat) * beat; // cuantizado al beat
        const loop = { start: Math.max(0, start), end: Math.max(0, start) + d.loopSize * beat };
        engine.setLoop(i, loop);
        patchDeck(i, { loop });
      }
    },
    loopSize(i, factor) {
      const d = decksRef.current[i];
      const loopSize = Math.min(32, Math.max(1 / 32, d.loopSize * factor));
      let loop = d.loop;
      if (loop && d.grid?.bpm) {
        loop = { start: loop.start, end: loop.start + loopSize * (60 / d.grid.bpm) };
        engine.setLoop(i, loop);
      }
      patchDeck(i, { loopSize, loop });
    },

    // ── Acciones extra para el controlador ──
    setPitchFromFader(i, x) {
      const d = decksRef.current[i];
      if (!d.track || d.sync) return;
      const target = Math.max(-1, Math.min(1, x)) * d.pitchRange;
      if (pickup.current[i]) {
        const last = pickupLast.current[i];
        pickupLast.current[i] = target;
        const crossed = last != null && Math.sign(last - d.pitch) !== Math.sign(target - d.pitch);
        if (Math.abs(target - d.pitch) > 0.25 && !crossed) {
          // Avisa en pantalla hacia dónde mover el fader, si no parece que no responde
          if (d.pitchHint == null || Math.abs(d.pitchHint - target) > 0.2) patchDeck(i, { pitchHint: target });
          return;
        }
        pickup.current[i] = false;
      }
      if (d.pitchHint != null) patchDeck(i, { pitchHint: null });
      applyPitch(i, target, { fromFader: true });
    },
    cyclePitchRange(i) {
      const ranges = [8, 16, 50];
      const d = decksRef.current[i];
      const pitchRange = ranges[(ranges.indexOf(d.pitchRange) + 1) % ranges.length];
      pickup.current[i] = true;
      patchDeck(i, { pitchRange });
    },
    toggleKeylock(i) { patchDeck(i, (d) => ({ keylock: !d.keylock })); },
    syncOff(i) { patchDeck(i, { sync: false }); },
    cueButton(i, down) {
      const d = decksRef.current[i];
      if (!d.track || d.status === 'loading') return;
      if (down) {
        if (engine.isPlaying(i)) {
          engine.pause(i);
          engine.seek(i, d.mainCue);
          patchDeck(i, { playing: false });
        } else {
          const pos = engine.getPosition(i);
          if (Math.abs(pos - d.mainCue) > 0.02) {
            patchDeck(i, { mainCue: pos });               // fija el cue donde estás
          } else {
            preview.current[i] = true;                    // preview mientras lo sostienes
            engine.play(i);
            patchDeck(i, { playing: true });
          }
        }
      } else if (preview.current[i]) {
        preview.current[i] = false;
        engine.pause(i);
        engine.seek(i, d.mainCue);
        patchDeck(i, { playing: false });
      }
    },
    playFromCue(i) {
      // Play mientras sostienes CUE: sigue sonando al soltar
      preview.current[i] = false;
    },
    stutter(i) {
      const d = decksRef.current[i];
      if (!d.track) return;
      engine.seek(i, d.mainCue);
      if (!engine.isPlaying(i)) engine.play(i);
      patchDeck(i, { playing: true });
    },
    toTrackStart(i) {
      if (!decksRef.current[i].track) return;
      engine.pause(i);
      engine.seek(i, 0);
      patchDeck(i, { playing: false, mainCue: 0 });
    },
    autoLoop(i, beats) {
      const d = decksRef.current[i];
      if (!d.track || !d.grid?.bpm) return;
      if (d.loop && Math.abs(d.loopSize - beats) < 1e-6) {
        engine.setLoop(i, null);
        patchDeck(i, { loop: null });
        return;
      }
      const beat = 60 / d.grid.bpm;
      const fb = d.grid.firstBeat || 0;
      const pos = engine.getPosition(i);
      const start = d.loop ? d.loop.start : Math.max(0, fb + Math.floor((pos - fb) / beat) * beat);
      const loop = { start, end: start + beats * beat };
      engine.setLoop(i, loop);
      patchDeck(i, { loop, loopSize: beats });
    },
    loopIn(i) {
      if (!decksRef.current[i].track) return;
      loopInPos.current[i] = engine.getPosition(i);
    },
    loopOut(i) {
      const d = decksRef.current[i];
      const start = loopInPos.current[i];
      const end = engine.getPosition(i);
      if (start == null || end <= start + 0.01) return;
      const loop = { start, end };
      engine.setLoop(i, loop);
      const loopSize = d.grid?.bpm ? Math.round(((end - start) / (60 / d.grid.bpm)) * 1000) / 1000 : d.loopSize;
      patchDeck(i, { loop, loopSize });
    },
    faderCut(i, on) { engine.setCut(i, on); },
    tempBend(i, dir) {
      bendMult.current[i] = dir ? 1 + dir * 0.04 : 1;
      engine.setTempMult(i, bendMult.current[i]);
    },
    nudge(i, mult) { engine.setTempMult(i, mult * bendMult.current[i]); },
    seekBy(i, seconds) {
      const d = decksRef.current[i];
      if (!d.track) return;
      engine.seek(i, Math.max(0, Math.min(d.duration || 0, engine.getPosition(i) + seconds)));
    },
    scratchStart(i) { engine.scratchStart(i); },
    scratchMove(i, seconds) { engine.scratchMove(i, seconds); },
    scratchEnd(i) {
      if (!engine.isScratching(i)) return;
      engine.scratchEnd(i);
      patchDeck(i, { playing: engine.isPlaying(i) });
    },
  }), [engine, patchDeck, trackById]);

  // Demo: dos pistas cargadas al abrir
  useEffect(() => {
    if (library.source === 'demo' && library.tracks.length && !decksRef.current[0].track) {
      actions.load(0, 't1');
      actions.load(1, 't2');
      setSelectedTrack('t2');
    }
  }, [library, actions]);

  const currentIds = useMemo(() => (library.crates.find((c) => c.id === selectedCrate) ?? library.crates[0])?.trackIds ?? [], [library.crates, selectedCrate]);

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.shiftKey && e.key === 'ArrowLeft') { actions.load(0, selectedTrack); e.preventDefault(); }
      else if (e.shiftKey && e.key === 'ArrowRight') { actions.load(1, selectedTrack); e.preventDefault(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const k = currentIds.indexOf(selectedTrack);
        const next = currentIds[Math.min(currentIds.length - 1, Math.max(0, k + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (next) setSelectedTrack(next);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, currentIds, selectedTrack]);

  // ── Controlador MIDI (Mixtrack Platinum FX) ──
  const live = useRef({});
  live.current = { actions, mixer, selectedTrack, currentIds, crates: library.crates, selectedCrate, libFocus, invertPitch };

  useEffect(() => {
    bridge?.getConfig().then((c) => setInvertPitch(!!c.invertPitch));
  }, []);

  useEffect(() => {
    const L = () => live.current;
    const setCh = (i, key, v) => setMixerState((m) => ({ ...m, [i]: { ...m[i], [key]: v } }));
    const visibleCrates = () => L().crates.filter((c) => c.icon !== 'section');
    const api = {
      snapshot: () => ({
        decks: decksRef.current,
        mixer: L().mixer,
        isPlaying: (i) => engine.isPlaying(i),
        position: (i) => engine.getPosition(i),
        level: (i) => engine.getLevel(i),
      }),
      invertPitch: () => L().invertPitch,
      isPlaying: (i) => engine.isPlaying(i),
      isScratching: (i) => engine.isScratching(i),
      togglePlay: (i) => L().actions.togglePlay(i),
      stutter: (i) => L().actions.stutter(i),
      cueButton: (i, down) => L().actions.cueButton(i, down),
      toTrackStart: (i) => L().actions.toTrackStart(i),
      toggleSync: (i) => L().actions.toggle(i, 'sync'),
      syncOff: (i) => L().actions.syncOff(i),
      toggleKeylock: (i) => L().actions.toggleKeylock(i),
      cyclePitchRange: (i) => L().actions.cyclePitchRange(i),
      tempBend: (i, dir) => L().actions.tempBend(i, dir),
      nudge: (i, m) => L().actions.nudge(i, m),
      seekBy: (i, s) => L().actions.seekBy(i, s),
      scratchStart: (i) => L().actions.scratchStart(i),
      scratchMove: (i, s) => L().actions.scratchMove(i, s),
      scratchEnd: (i) => L().actions.scratchEnd(i),
      pitchFader: (i, x) => L().actions.setPitchFromFader(i, x),
      hotCue: (i, n) => L().actions.hotCue(i, n),
      deleteCue: (i, n) => L().actions.deleteCue(i, n),
      autoLoop: (i, b) => L().actions.autoLoop(i, b),
      toggleLoop: (i) => L().actions.toggleLoop(i),
      loopSize: (i, f) => L().actions.loopSize(i, f),
      loopIn: (i) => L().actions.loopIn(i),
      loopOut: (i) => L().actions.loopOut(i),
      faderCut: (i, on) => L().actions.faderCut(i, on),
      togglePfl: (i) => setMixerState((m) => ({ ...m, [i]: { ...m[i], cue: !m[i].cue } })),
      setChannel: setCh,
      setCrossfader: (v) => setCrossfader(v),
      setGlobal: (key, v) => setMixerState((m) => ({ ...m, [key]: v })),
      browse: (delta, fast) => {
        const st = L();
        const step = delta * (fast ? 8 : 1);
        if (st.libFocus === 'crates') {
          const list = visibleCrates();
          const k = list.findIndex((c) => c.id === st.selectedCrate);
          const next = list[Math.max(0, Math.min(list.length - 1, (k < 0 ? 0 : k) + step))];
          if (next) setSelectedCrate(next.id);
        } else {
          const ids = st.currentIds;
          if (!ids.length) return;
          const k = ids.indexOf(st.selectedTrack);
          setSelectedTrack(ids[Math.max(0, Math.min(ids.length - 1, (k < 0 ? -1 : k) + step))]);
        }
      },
      browsePress: () => setLibFocus((f) => (f === 'tracks' ? 'crates' : 'tracks')),
      loadSelected: (i) => {
        const st = L();
        if (st.selectedTrack) st.actions.load(i, st.selectedTrack);
      },
      eject: (i) => L().actions.eject(i),
    };
    let handle = null;
    let cancelled = false;
    const onMsg = (data) => {
      const log = midiLog.current;
      log.push({ t: performance.now(), data: Array.from(data) });
      if (log.length > 30) log.shift();
    };
    connectMixtrack(api, setMidiStatus, onMsg).then((h) => {
      if (cancelled) h.stop();
      else handle = h;
    });
    // opts.preferSysex pide el permiso de pantallas; tiene que salir de un clic.
    midiRetry.current = async (opts) => {
      setMidiStatus({ state: 'init', message: 'Buscando controlador…' });
      const h = handle ? await handle.retry(opts) : await connectMixtrack(api, setMidiStatus, onMsg, opts);
      handle = h;
    };
    return () => { cancelled = true; handle?.stop(); };
  }, [engine]);

  // Deja el estado del controlador en midi-diag.json, junto al proyecto.
  useEffect(() => {
    if (!bridge?.writeDiag) return;
    const write = () => bridge.writeDiag({
      build: 'BUILD 8',
      cuando: new Date().toISOString(),
      versiones: bridge.versions,
      tieneWebMidi: typeof navigator.requestMIDIAccess === 'function',
      estado: midiStatus.state,
      mensaje: midiStatus.message,
      puertos: midiStatus.ports || [],
      sysex: midiStatus.sysex ?? null,
      intentosDeAcceso: midiStatus.intentos || [],
      sinSalida: midiStatus.noOutput ?? null,
      ultimosMensajes: midiLog.current.slice(-10).map((r) => r.data.map((n) => n.toString(16).padStart(2, '0')).join(' ')),
    });
    write();
    const id = setInterval(write, 4000); // así queda registrado lo que toques después
    return () => clearInterval(id);
  }, [midiStatus]);

  const setMixer = (ch, key, v) => {
    setMixerState((m) => (key == null ? { ...m, [ch]: v } : { ...m, [ch]: { ...m[ch], [key]: v } }));
  };

  return (
    <div className={`app mode-${mode}`}>
      <TopBar transport={engine} mode={mode} onModeChange={setMode} onSettings={() => setShowSettings(true)} output={output} />

      <div className="decks-row">
        <DeckHeader index={0} side="left" deck={decks[0]} transport={engine} actions={actions} />
        <CenterPanel
          mode={mode}
          mixer={mixer}
          setMixer={setMixer}
          crossfader={crossfader}
          setCrossfader={setCrossfader}
          showCues={showCues}
          onToggleCues={() => setShowCues((v) => !v)}
        />
        <DeckHeader index={1} side="right" deck={decks[1]} transport={engine} actions={actions} />
      </div>

      {showCues && <PadStrip decks={decks} mode={mode} actions={actions} />}

      <WaveformArea
        decks={decks}
        transport={engine}
        zoom={zoom}
        setZoom={setZoom}
        onScrub={(i, p) => actions.seek(i, p)}
        onDropTrack={(i, id) => actions.load(i, id)}
      />

      <Library
        library={library}
        mode={mode}
        selectedCrate={selectedCrate}
        setSelectedCrate={setSelectedCrate}
        selectedTrack={selectedTrack}
        setSelectedTrack={setSelectedTrack}
        loadedIds={decks.map((d) => d.track?.id ?? null)}
        focus={libFocus}
        setFocus={setLibFocus}
        onLoad={(i, id) => {
          // Doble clic: primer deck vacío; si no, el primero que no esté sonando
          const empty = decks.findIndex((d) => !d.track);
          const target = i ?? (empty >= 0 ? empty : decks.findIndex((d) => !d.playing));
          if (target >= 0) actions.load(target, id);
        }}
      />

      <footer className="bottombar">
        <button className="autoplay">Autoplay</button>
        <span className="hint">Shift + ← / → carga la pista seleccionada · rueda sobre la waveform = zoom</span>
        <span className={`midi-status ${midiStatus.state}`} onClick={() => setShowSettings(true)}>
          {midiStatus.state === 'connected'
            ? `🎛 ${midiStatus.message}${midiStatus.sysex ? '' : ' · sin pantallas'}`
            : midiStatus.state === 'waiting'
              ? '🎛 Controlador no conectado'
              : `🎛 ${midiStatus.message}`}
          <span className="build-tag">BUILD 8</span>
        </span>
        <span className="out-status" onClick={() => setShowSettings(true)}>
          {output.split ? `🎧 ${output.label}: master 1-2 · audífonos 3-4` : `Salida: ${output.label} (estéreo, sin audífonos separados)`}
        </span>
      </footer>

      {showSettings && (
        <Settings
          engine={engine}
          output={output}
          onChooseOutput={chooseOutput}
          mixer={mixer}
          setMixer={setMixer}
          onRescan={loadLibrary}
          library={library}
          midiStatus={midiStatus}
          midiLog={midiLog}
          onRetryMidi={(opts) => midiRetry.current(opts)}
          invertPitch={invertPitch}
          setInvertPitch={(v) => { setInvertPitch(v); bridge?.setConfig({ invertPitch: v }); }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
