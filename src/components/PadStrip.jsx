import { CUE_COLORS } from '../lib/waveform.js';
import { Play } from './Icons.jsx';

const fmtLoop = (n) => (n >= 1 ? String(n) : `1/${Math.round(1 / n)}`);

function HotCues({ index, deck, count, actions }) {
  return (
    <div className="hotcues" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
      {Array.from({ length: count }).map((_, i) => {
        const cue = deck.cues[i];
        const set = cue != null;
        const color = cue?.color && cue.color !== '#000000' ? cue.color : CUE_COLORS[i % CUE_COLORS.length];
        return (
          <button
            key={i}
            className={`hotcue ${set ? 'set' : ''}`}
            style={set ? { background: color } : undefined}
            disabled={!deck.track}
            onClick={(e) => (e.altKey ? actions.deleteCue(index, i) : actions.hotCue(index, i))}
            onContextMenu={(e) => { e.preventDefault(); actions.deleteCue(index, i); }}
            title={set ? `${cue.name ? cue.name + ' · ' : ''}Clic: saltar y reproducir · Alt/clic derecho: borrar` : 'Clic: guardar cue aquí'}
          >
            {set ? <Play /> : '+'}
          </button>
        );
      })}
    </div>
  );
}

function AutoLoop({ index, deck, actions }) {
  const active = !!deck.loop;
  return (
    <div className="autoloop">
      <button className="loop-arrow" onClick={() => actions.loopSize(index, 0.5)} title="Loop ÷2">‹</button>
      <button className={`loop-main ${active ? 'on' : ''}`} onClick={() => actions.toggleLoop(index)} disabled={!deck.track || !deck.grid?.bpm}>
        <span className="loop-auto">AUTO</span>
        <span className="loop-size">{fmtLoop(deck.loopSize)}</span>
        <span className="loop-label">LOOP</span>
      </button>
      <button className="loop-arrow" onClick={() => actions.loopSize(index, 2)} title="Loop ×2">›</button>
    </div>
  );
}

export default function PadStrip({ decks, mode, actions }) {
  const count = mode === 'pro' ? 8 : 4;
  return (
    <div className={`pad-strip ${mode}`}>
      <div className="pad-side left">
        <HotCues index={0} deck={decks[0]} count={count} actions={actions} />
        <AutoLoop index={0} deck={decks[0]} actions={actions} />
      </div>
      <div className="pad-side right">
        <AutoLoop index={1} deck={decks[1]} actions={actions} />
        <HotCues index={1} deck={decks[1]} count={count} actions={actions} />
      </div>
    </div>
  );
}
