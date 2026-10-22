import { useRef } from 'react';
import { Eject, Grid, Note, Pause, Pencil, Play, Prev } from './Icons.jsx';
import { useFrame, setupCanvas } from '../lib/useFrame.js';
import { drawOverview } from '../lib/waveform.js';
import { formatTime } from '../data/library.js';

function Overview({ index, deck, transport, onSeek }) {
  const canvas = useRef(null);
  useFrame(() => {
    if (!canvas.current) return;
    const { ctx, w, h } = setupCanvas(canvas.current);
    drawOverview(ctx, w, h, { track: deck.track, position: transport.getPosition(index), cues: deck.cues, duration: deck.duration, deck: index });
  });
  return (
    <canvas
      ref={canvas}
      className="overview"
      onMouseDown={(e) => {
        if (!deck.track || !deck.duration) return;
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - r.left) / r.width) * deck.duration);
      }}
    />
  );
}

function Platter({ index, transport, track }) {
  const ref = useRef(null);
  useFrame(() => {
    if (!ref.current) return;
    const pos = transport.getPosition(index);
    // 33⅓ rpm = 0.5556 vueltas/seg
    ref.current.style.transform = `rotate(${(pos * 0.5556 * 360) % 360}deg)`;
  });
  return (
    <div className={`platter ${track ? 'loaded' : ''}`}>
      <div ref={ref} className="platter-mark" />
    </div>
  );
}

function TimeRemaining({ index, transport, duration }) {
  const ref = useRef(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.textContent = duration ? formatTime(-(duration - transport.getPosition(index))).slice(0, -1) : '';
  });
  return <span ref={ref} className="time-remaining" />;
}

function ChannelMeter({ index, transport }) {
  const ref = useRef(null);
  const level = useRef(0);
  useFrame(() => {
    if (!ref.current) return;
    const target = transport.getLevel ? Math.min(1, transport.getLevel(index)) : 0;
    level.current = target > level.current ? target : level.current + (target - level.current) * 0.15;
    ref.current.style.setProperty('--lvl', level.current.toFixed(3));
  });
  return <div ref={ref} className="ch-meter"><div className="ch-meter-fill" /></div>;
}

export default function DeckHeader({ index, side, deck, transport, actions }) {
  const { track, playing, sync, keylock, pitch, status } = deck;
  const bpm = deck.grid?.bpm ? deck.grid.bpm * (1 + pitch / 100) : null;
  const statusText = status === 'loading' ? 'Cargando…' : status === 'analyzing' ? 'Analizando…' : status === 'error' ? `Error: ${deck.error}` : null;
  const deckNo = index + 1;

  return (
    <section className={`deck-header ${side}`} aria-label={`Deck ${deckNo}`}>
      <div className="dh-row dh-row-top">
        <div className="pm-btns">
          <button className="sq-btn" onClick={() => actions.nudgePitch(index, -0.1)} title="Pitch −">−</button>
          <button className="sq-btn" onClick={() => actions.nudgePitch(index, 0.1)} title="Pitch +">+</button>
        </div>
        <Overview index={index} deck={deck} transport={transport} onSeek={(p) => actions.seek(index, p)} />
        <button className="sq-btn tp" onClick={() => actions.toStart(index)} title="Volver al cue"><Prev /></button>
        <button className={`sq-btn tp play-btn ${playing ? 'playing' : ''}`} onClick={() => actions.togglePlay(index)} title="Play / Pausa" disabled={!track || status === 'loading' || status === 'error'}>
          {playing ? <Pause /> : <Play />}
        </button>
        <button className={`pill-btn keylock ${keylock ? 'on' : ''}`} onClick={() => actions.toggle(index, 'keylock')} title="Key lock">
          {keylock ? 'ON' : 'OFF'}
        </button>
        <button className={`pill-btn sync ${sync ? 'on' : ''}`} onClick={() => actions.toggle(index, 'sync')}>SYNC</button>
        <Platter index={index} transport={transport} track={track} />
      </div>

      <div className="dh-row dh-row-main">
        <div className="deck-no">{deckNo}</div>
        <div className="mini-stack">
          <button className="mini-btn" title="Info de pista"><Note /></button>
          <button className="mini-btn" onClick={() => actions.eject(index)} title="Expulsar"><Eject /></button>
        </div>
        <div className="track-info">
          {track ? (
            <>
              <div className="track-title">{track.title}</div>
              <div className="track-artist-row">
                <span className="track-artist">{track.artist}</span>
                {statusText ? <span className={`deck-status ${status}`}>{statusText}</span> : <span className="edit-grid">Edit Grid</span>}
                <TimeRemaining index={index} transport={transport} duration={deck.duration} />
              </div>
            </>
          ) : (
            <div className="track-empty">Arrastra una pista aquí o selecciónala y presiona Shift + {side === 'left' ? '←' : '→'}</div>
          )}
        </div>
        <div className="mini-stack">
          <button className="mini-btn" title="Editar"><Pencil /></button>
          <button className="mini-btn" title="Beatgrid"><Grid /></button>
        </div>
        <div className="bpm-box" title={track ? `Pitch ${pitch >= 0 ? '+' : ''}${pitch.toFixed(1)}%` : ''}>
          <div className="bpm-value">{bpm ? bpm.toFixed(1) : '--'}</div>
          <div className="bpm-label">BPM</div>
          {deck.pitchHint != null ? (
            // El fader físico está lejos del pitch actual: hasta que lo alcance,
            // no toma el control. Se indica hacia dónde hay que moverlo.
            <div className="pitch-val esperando" title={`El fader está en ${deck.pitchHint >= 0 ? '+' : ''}${deck.pitchHint.toFixed(1)}%. Muévelo hasta ${pitch >= 0 ? '+' : ''}${pitch.toFixed(1)}% y toma el control.`}>
              {pitch >= 0 ? '+' : ''}{pitch.toFixed(1)}%
            </div>
          ) : (
            <div className={`pitch-val ${pitch === 0 ? 'zero' : ''}`}>{pitch >= 0 ? '+' : ''}{pitch.toFixed(1)}%</div>
          )}
        </div>
        <ChannelMeter index={index} transport={transport} />
      </div>
    </section>
  );
}
