import { useEffect, useMemo, useRef, useState } from 'react';
import { AllIcon, ArtView, Close, Crate, Gear, ListView, Search } from './Icons.jsx';
import { formatTime } from '../data/library.js';

const bridge = typeof window !== 'undefined' ? window.b2b : undefined;
const coverCache = new Map();

function Art({ track }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(() => coverCache.get(track.id) || null);

  useEffect(() => {
    if (!track.path || !bridge || coverCache.has(track.id)) return;
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const url = await bridge.readCover(track.path);
      coverCache.set(track.id, url);
      if (!cancelled) setSrc(url);
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [track.id, track.path]);

  if (src) return <img ref={ref} className="art" src={src} alt="" draggable={false} />;
  // Sin portada, la tarjeta se arma dentro de la paleta: del amarillo al verde,
  // nunca con colores de fuera.
  const semilla = [...track.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const hue = 48 + (semilla % 110);
  const initials = (track.artist || track.title || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
  return (
    <div ref={ref} className="art" style={{ background: `linear-gradient(135deg, hsl(${hue} 52% 32%), hsl(${hue + 28} 58% 15%))` }}>
      {initials}
    </div>
  );
}

const COLUMNS = [
  { key: 'n', label: '#', cls: 'c-n' },
  { key: 'art', label: 'art', cls: 'c-art', sortable: false, artOnly: true },
  { key: 'title', label: 'song', cls: 'c-song' },
  { key: 'plays', label: 'plays', cls: 'c-plays' },
  { key: 'artist', label: 'artist', cls: 'c-artist' },
  { key: 'bpm', label: 'bpm', cls: 'c-bpm' },
  { key: 'key', label: 'key', cls: 'c-key' },
  { key: 'album', label: 'album', cls: 'c-album' },
  { key: 'duration', label: 'length', cls: 'c-len' },
  { key: 'comment', label: 'comment', cls: 'c-comment' },
];

export default function Library({ library, selectedCrate, setSelectedCrate, selectedTrack, setSelectedTrack, loadedIds, onLoad, focus = 'tracks', setFocus = () => {} }) {
  const { tracks, crates, loading, progress, error } = library;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'n', dir: 1 });
  const [showArt, setShowArt] = useState(true);
  const [tab, setTab] = useState('Files');

  const crate = crates.find((c) => c.id === selectedCrate) ?? crates[0];
  const rows = useMemo(() => {
    if (!crate) return [];
    const byId = new Map(tracks.map((t) => [t.id, t]));
    let list = crate.trackIds.map((id, i) => byId.get(id) && { ...byId.get(id), n: i + 1 }).filter(Boolean);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((t) => `${t.title} ${t.artist} ${t.album} ${t.genre}`.toLowerCase().includes(q));
    const { key, dir } = sort;
    const val = (t) => (typeof t[key] === 'string' ? t[key].toLowerCase() : t[key] ?? -1);
    return [...list].sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0));
  }, [tracks, crate, query, sort]);

  const cols = COLUMNS.filter((c) => !c.artOnly || showArt);

  // Mantiene visible lo que seleccionas con la perilla BROWSE del controlador
  const rowsRef = useRef(null);
  const cratesRef = useRef(null);
  useEffect(() => {
    rowsRef.current?.querySelector('.tr.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selectedTrack]);
  useEffect(() => {
    cratesRef.current?.querySelector('.crate.on')?.scrollIntoView({ block: 'nearest' });
  }, [selectedCrate]);

  return (
    <section className="library">
      <div className="lib-toolbar">
        <div className="lib-tool-left">
          <button className="tool-btn" title="Nuevo crate">+<Crate /></button>
          <button className="tool-btn dim" title="Nuevo smart crate">+<Crate /></button>
          <div className="view-toggle">
            <button className={!showArt ? 'on' : ''} onClick={() => setShowArt(false)} title="Lista"><ListView /></button>
            <button className={showArt ? 'on' : ''} onClick={() => setShowArt(true)} title="Lista con portadas"><ArtView /></button>
          </div>
          <button className="tool-btn text">Analyze Files</button>
          <button className="tool-btn"><Gear /> ▾</button>
        </div>
        <div className="lib-tool-right">
          {['Files', 'Browse', 'Prepare', 'History'].map((t) => (
            <button key={t} className={`tab-btn ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
          <div className="search">
            <Search />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="" aria-label="Buscar" />
            {query && <button onClick={() => setQuery('')}><Close /></button>}
          </div>
        </div>
      </div>

      <div className="lib-body">
        <aside className={`crates ${focus === 'crates' ? 'focused' : ''}`} ref={cratesRef} onMouseDown={() => setFocus('crates')}>
          {crates.map((c) =>
            c.icon === 'section' ? (
              <div key={c.id} className="crate-section">{c.name}</div>
            ) : (
              <button
                key={c.id}
                className={`crate ${c.id === crate?.id ? 'on' : ''}`}
                style={{ paddingLeft: 10 + (c.depth || 0) * 14 }}
                onClick={() => setSelectedCrate(c.id)}
                title={`${c.name} · ${c.trackIds.length} pistas`}
              >
                {c.icon === 'all' ? <AllIcon className="all-ic" /> : c.icon === 'folder' ? <span className="folder-ic">▸</span> : <Crate />}
                <span>{c.name}</span>
              </button>
            ),
          )}
        </aside>

        <div className={`tracklist ${showArt ? 'with-art' : ''} ${focus === 'tracks' ? 'focused' : ''}`} ref={rowsRef} onMouseDown={() => setFocus('tracks')}>
          <div className="tl-head">
            {cols.map((c) => (
              <div
                key={c.key}
                className={`th ${c.cls} ${sort.key === c.key ? 'sorted' : ''}`}
                onClick={() => c.sortable !== false && setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : 1 }))}
              >
                {c.label}
                {sort.key === c.key && <span className="sort-ind">{sort.dir > 0 ? '▲' : '▼'}</span>}
              </div>
            ))}
          </div>
          <div className="tl-rows">
            {rows.map((t) => {
              const deckBadge = loadedIds.indexOf(t.id);
              return (
                <div
                  key={t.id}
                  className={`tr ${selectedTrack === t.id ? 'selected' : ''} ${deckBadge >= 0 ? 'loaded' : ''}`}
                  onClick={() => setSelectedTrack(t.id)}
                  onDoubleClick={() => onLoad(null, t.id)}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/track-id', t.id)}
                >
                  {cols.map((c) => {
                    let v;
                    switch (c.key) {
                      case 'art': v = <Art track={t} />; break;
                      case 'duration': v = t.duration ? formatTime(t.duration) : ''; break;
                      case 'bpm': v = t.bpm ? Math.round(t.bpm) : ''; break;
                      case 'title': v = <>{deckBadge >= 0 && <span className="deck-badge">{deckBadge + 1}</span>}{t.title}</>; break;
                      default: v = t[c.key];
                    }
                    return <div key={c.key} className={`td ${c.cls}`}>{v}</div>;
                  })}
                </div>
              );
            })}
            {loading && (
              <div className="tl-empty">
                Cargando tu librería…
                {progress?.stage === 'scan' && ` (${progress.done}/${progress.total} archivos nuevos)`}
              </div>
            )}
            {!loading && error && <div className="tl-empty">No se pudo leer la librería: {error}</div>}
            {!loading && !error && rows.length === 0 && <div className="tl-empty">Sin pistas</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
