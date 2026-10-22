import { useEffect, useState } from 'react';
import { Close } from './Icons.jsx';

const bridge = typeof window !== 'undefined' ? window.b2b : undefined;

function MidiMonitor({ midiLog }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const id = setInterval(() => setRows([...midiLog.current].slice(-10).reverse()), 150);
    return () => clearInterval(id);
  }, [midiLog]);
  const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
  return (
    <div className="midi-monitor">
      {rows.length === 0 ? <span>Mueve algo en el controlador…</span> : rows.map((r, k) => <div key={k}>{r.data.map(hex).join(' ')}</div>)}
    </div>
  );
}

export default function Settings({ engine, output, onChooseOutput, mixer, setMixer, onRescan, library, midiStatus, midiLog, onRetryMidi, invertPitch, setInvertPitch, onClose }) {
  const [outs, setOuts] = useState([]);
  const [cfg, setCfg] = useState(null);

  useEffect(() => {
    engine.listOutputs().then(setOuts);
    bridge?.getConfig().then(setCfg);
    const onChange = () => engine.listOutputs().then(setOuts);
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  }, [engine]);

  const pick = async (key, title) => {
    const dir = await bridge.pickFolder(title);
    if (!dir) return;
    const next = await bridge.setConfig({ [key]: dir });
    setCfg(next);
    onRescan();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Ajustes</h2>
          <button onClick={onClose} aria-label="Cerrar"><Close /></button>
        </div>

        <section>
          <h3>Salida de audio</h3>
          <select
            value={output.deviceId}
            onChange={(e) => {
              const o = outs.find((x) => x.id === e.target.value);
              onChooseOutput(e.target.value, o?.label || 'Predeterminado');
            }}
          >
            {!outs.some((o) => o.id === 'default') && <option value="default">Predeterminado del sistema</option>}
            {outs.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <p className={`out-info ${output.split ? 'ok' : ''}`}>
            {output.split
              ? `✓ ${output.channels} canales: master por 1-2 (parlantes) y audífonos por 3-4.`
              : `${output.channels} canales: solo master. Elige la Mixtrack Platinum FX para tener audífonos (CUE) separados.`}
          </p>
          {output.error && <p className="out-info err">{output.error}</p>}
          <label className="slider-row">
            Mezcla en audífonos <span>CUE</span>
            <input type="range" min={0} max={1} step={0.01} value={mixer.cueMix} onChange={(e) => setMixer('cueMix', null, parseFloat(e.target.value))} />
            <span>MASTER</span>
          </label>
          <label className="slider-row">
            Volumen audífonos
            <input type="range" min={0} max={1} step={0.01} value={mixer.phones} onChange={(e) => setMixer('phones', null, parseFloat(e.target.value))} />
          </label>
          <label className="slider-row">
            Volumen master
            <input type="range" min={0} max={1} step={0.01} value={mixer.master} onChange={(e) => setMixer('master', null, parseFloat(e.target.value))} />
          </label>
        </section>

        <section>
          <h3>Controlador <span className="build-tag">BUILD 8</span></h3>
          <p className={`out-info ${midiStatus?.state === 'connected' ? 'ok' : ''}`}>
            {midiStatus?.state === 'connected'
              ? `✓ ${midiStatus.message}${midiStatus.sysex ? '' : ' (sin pantallas: falta permiso SysEx)'}`
              : midiStatus?.message}
          </p>
          <p className="out-info">
            {midiStatus?.ports?.length > 0
              ? `Puertos MIDI vistos: ${midiStatus.ports.join(', ')}`
              : 'Puertos MIDI vistos: ninguno'}
          </p>
          {midiStatus?.state === 'connected' && midiStatus.noOutput && (
            <p className="out-info err">El controlador entra pero no sale: sin luces ni pantallas.</p>
          )}
          {midiStatus?.state === 'connected' && !midiStatus.sysex && (
            <p className="out-info err">
              Sin las pantallas del jog. El permiso para manejarlas hay que pedirlo con un clic:
            </p>
          )}
          <div className="btn-row">
            <button className="tool-btn text" onClick={() => onRetryMidi({ preferSysex: true })}>
              Activar pantallas del jog
            </button>
            <button className="tool-btn text" onClick={() => onRetryMidi()}>
              Buscar el controlador otra vez
            </button>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={invertPitch} onChange={(e) => setInvertPitch(e.target.checked)} />
            Invertir el fader de pitch (si al subirlo el tema se acelera al revés de lo que esperas)
          </label>
          <div className="path-label">Monitor MIDI (últimos mensajes)</div>
          <MidiMonitor midiLog={midiLog} />
        </section>

        {bridge && (
          <section>
            <h3>Librería</h3>
            <div className="path-row">
              <div>
                <div className="path-label">Carpeta de música</div>
                <code>{cfg?.musicRoot}</code>
              </div>
              <button className="tool-btn text" onClick={() => pick('musicRoot', 'Elige tu carpeta de música')}>Cambiar…</button>
            </div>
            <div className="path-row">
              <div>
                <div className="path-label">Datos de Serato (crates, BPM, cues) · solo lectura</div>
                <code>{cfg?.seratoRoot}</code>
              </div>
              <button className="tool-btn text" onClick={() => pick('seratoRoot', 'Elige la carpeta _Serato_')}>Cambiar…</button>
            </div>
            <p className="out-info">
              {library.loading ? 'Leyendo…' : `${library.tracks.length} pistas · ${library.crates.filter((c) => c.icon === 'crate').length} crates de Serato`}
            </p>
            <button className="tool-btn text" onClick={onRescan} disabled={library.loading}>Volver a leer la librería</button>
          </section>
        )}
      </div>
    </div>
  );
}
