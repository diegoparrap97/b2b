import { useRef } from 'react';

function Knob({ label, value, onChange, min = -1, max = 1, center = true }) {
  const drag = useRef(null);
  const norm = (value - min) / (max - min);
  const angle = -135 + norm * 270;
  return (
    <div className="knob-wrap">
      <div
        className={`knob ${center && Math.abs(value) < 0.001 ? 'centered' : ''}`}
        onDoubleClick={() => onChange(center ? 0 : max)}
        onMouseDown={(e) => {
          drag.current = { y: e.clientY, v: value };
          const move = (ev) => {
            const dv = ((drag.current.y - ev.clientY) / 150) * (max - min);
            onChange(Math.min(max, Math.max(min, drag.current.v + dv)));
          };
          const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
          window.addEventListener('mousemove', move);
          window.addEventListener('mouseup', up);
        }}
        title={`${label} (doble clic para resetear)`}
      >
        <div className="knob-ind" style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      <span className="knob-label">{label}</span>
    </div>
  );
}

function Fader({ value, onChange, vertical = false, className = '' }) {
  return (
    <input
      type="range"
      className={`fader ${vertical ? 'vertical' : ''} ${className}`}
      min={0}
      max={1}
      step={0.001}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      onDoubleClick={() => onChange(vertical ? 1 : 0.5)}
    />
  );
}

function ChannelStrip({ index, ch, setMixer, mirrored }) {
  const set = (k) => (v) => setMixer(index, k, v);
  return (
    <div className={`channel-strip ${mirrored ? 'mirrored' : ''}`}>
      <div className="strip-knobs">
        <Knob label="GAIN" value={ch.gain} onChange={set('gain')} />
        <Knob label="HI" value={ch.hi} onChange={set('hi')} />
        <Knob label="MID" value={ch.mid} onChange={set('mid')} />
        <Knob label="LOW" value={ch.low} onChange={set('low')} />
        <Knob label="FILTER" value={ch.filter} onChange={set('filter')} />
        <button className={`cue-btn ${ch.cue ? 'on' : ''}`} onClick={() => setMixer(index, 'cue', !ch.cue)} title="Pre-escucha en audífonos">CUE {index + 1}</button>
      </div>
      <Fader vertical value={ch.volume} onChange={set('volume')} />
    </div>
  );
}

export default function CenterPanel({ mode, mixer, setMixer, crossfader, setCrossfader, showCues, onToggleCues }) {
  if (mode === 'pro') {
    return (
      <section className="center-panel pro">
        <div className="mixer">
          <ChannelStrip index={0} ch={mixer[0]} setMixer={setMixer} />
          <div className="mixer-mid">
            <Knob label="MASTER" value={mixer.master} min={0} max={1} center={false} onChange={(v) => setMixer('master', null, v)} />
            <Knob label="PHONES" value={mixer.phones} min={0} max={1} center={false} onChange={(v) => setMixer('phones', null, v)} />
          </div>
          <ChannelStrip index={1} ch={mixer[1]} setMixer={setMixer} mirrored />
        </div>
        <div className="xfader-row">
          <span>A</span>
          <Fader value={crossfader} onChange={setCrossfader} className="xfader" />
          <span>B</span>
          <button className={`cues-loops mini ${showCues ? 'on' : ''}`} onClick={onToggleCues} title="Mostrar/ocultar cues y loops">C&amp;L</button>
        </div>
      </section>
    );
  }
  return (
    <section className="center-panel">
      <div className="xfader-row">
        <Fader value={crossfader} onChange={setCrossfader} className="xfader" />
      </div>
      <button className={`cues-loops ${showCues ? 'on' : ''}`} onClick={onToggleCues}>CUES &amp; LOOPS<span>⌄</span></button>
    </section>
  );
}
