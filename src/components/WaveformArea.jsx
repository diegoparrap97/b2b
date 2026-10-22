import { useRef } from 'react';
import { useFrame, setupCanvas } from '../lib/useFrame.js';
import { drawScrollingWaveform } from '../lib/waveform.js';

function Lane({ index, deck, transport, zoom, mirrored, onScrub }) {
  const canvas = useRef(null);
  useFrame(() => {
    if (!canvas.current) return;
    const { ctx, w, h } = setupCanvas(canvas.current);
    drawScrollingWaveform(ctx, w, h, {
      track: deck.track,
      grid: deck.grid,
      status: deck.status === 'loading' ? 'Cargando…' : deck.status === 'error' ? 'No se pudo cargar' : 'Analizando…',
      position: transport.getPosition(index),
      secondsVisible: zoom,
      playheadX: 0.5,
      cues: deck.cues,
      loop: deck.loop,
      mirrored,
      deck: index,
    });
  });

  // Arrastrar la waveform para mover la posición (scratch visual)
  const onMouseDown = (e) => {
    if (!deck.track) return;
    const startX = e.clientX;
    const startPos = transport.getPosition(index);
    const w = e.currentTarget.getBoundingClientRect().width;
    const move = (ev) => onScrub(index, startPos - ((ev.clientX - startX) / w) * zoom);
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return <canvas ref={canvas} className="wave-lane" onMouseDown={onMouseDown} />;
}

export default function WaveformArea({ decks, transport, zoom, setZoom, onScrub, onDropTrack }) {
  return (
    <div
      className="waveform-area"
      onWheel={(e) => setZoom((z) => Math.min(40, Math.max(3, z * (e.deltaY > 0 ? 1.1 : 0.9))))}
      title="Rueda del mouse: zoom · Arrastrar: mover"
    >
      {decks.map((deck, i) => (
        <div
          key={i}
          className="lane-wrap"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { const id = e.dataTransfer.getData('text/track-id'); if (id) onDropTrack(i, id); }}
        >
          <Lane index={i} deck={deck} transport={transport} zoom={zoom} mirrored={i === 1} onScrub={onScrub} />
        </div>
      ))}
    </div>
  );
}
