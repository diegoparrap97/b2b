// Librería de ejemplo para la etapa 1 (look).
// En la etapa 2 esto se reemplaza por el escaneo real de tus carpetas de música.

const raw = [
  ['Northern Lights (Extended Mix)', 'Aurelia Vance', 'Polar Echoes', 123, 303.6, 'Melodic'],
  ['Midnight Tram', 'Coastal Drift', '', 122, 493.8, 'Deep'],
  ['Glass Horizon feat. Lumi', 'Okaro', 'Glass Horizon', 120, 433.2, 'Melodic'],
  ['Ascend', 'Mira Solenne', 'Ascend', 120, 367.7, 'Progressive'],
  ['Remember Us (Extended Mix)', 'Dune Theory, Kai Ostra', 'Remember Us / Tide', 122, 411.3, 'Melodic'],
  ['Velvet Signal (Night Edit)', 'Harbor Club', '', 127, 305.5, 'House'],
  ['Little Ember (Original Mix)', 'Fenwick', '', 124, 410.1, 'Deep'],
  ['Forever Now (Extended Mix)', 'Sato Kenji', 'Forever Now', 124, 412.1, 'Progressive'],
  ['Hold On Tight', 'Prism Unit feat. Ara', '', 124, 298.2, 'Melodic'],
  ['Delta Bloom', 'Nova Arden', 'Delta Bloom', 121, 379.1, 'Trance'],
  ['Saltwater', 'Lune & Arcos', 'Shorelines', 118, 352.4, 'Chill'],
  ['Parallel Skies', 'Ostrich Lane', '', 126, 388.0, 'Trance'],
  ['Kinetic', 'Halden', 'Kinetic EP', 125, 342.9, 'Techno'],
  ['Copper Moon', 'Vela Gray', '', 123, 401.5, 'Deep'],
  ['Atlas (Club Mix)', 'Rhea Dawn', 'Atlas', 128, 365.2, 'House'],
  ['Undertow', 'Mono Coast', '', 122, 456.7, 'Melodic'],
  ['Lanterns', 'Ivo Marlow', 'Lanterns', 120, 330.8, 'Chill'],
  ['Phase Shift', 'Grid Theory', '', 130, 324.4, 'Techno'],
  ['Silver Thread', 'Elan Rossi', 'Silver Thread EP', 123, 418.9, 'Progressive'],
  ['Open Water (Dub)', 'Coastal Drift', '', 121, 472.0, 'Deep'],
  ['Night Garden', 'Sol Vireo', '', 124, 377.3, 'Melodic'],
  ['Arcadia', 'Tessellate', 'Arcadia', 132, 399.6, 'Trance'],
];

const hues = [210, 330, 160, 30, 280, 5, 190, 250, 100, 45, 300, 15];

export const tracks = raw.map(([title, artist, album, bpm, duration, genre], i) => ({
  id: `t${i + 1}`,
  title,
  artist,
  album,
  bpm,
  duration,
  genre,
  plays: 5 + ((i * 37 + 11) % 29),
  key: ['8A', '9A', '5A', '10B', '7A', '11A', '4A', '6B'][i % 8],
  hue: hues[i % hues.length],
  comment: '',
}));

export const crates = [
  { id: 'all', name: 'All...', icon: 'all', trackIds: tracks.map((t) => t.id) },
  { id: 'music', name: 'Music', icon: 'crate', trackIds: tracks.map((t) => t.id) },
  { id: 'deep', name: 'Deep Sessions 2', icon: 'crate', trackIds: tracks.filter((t) => t.genre === 'Deep').map((t) => t.id) },
  { id: 'melodic6', name: '#6 Melodic Deep House', icon: 'crate', trackIds: tracks.filter((t) => ['Melodic', 'Deep'].includes(t.genre)).map((t) => t.id) },
  { id: 'melodic5', name: '#5 Melodic Deep House', icon: 'crate', trackIds: tracks.slice(0, 10).map((t) => t.id) },
  { id: 'trance', name: 'Trance Progressive Final', icon: 'crate', trackIds: tracks.filter((t) => ['Trance', 'Progressive'].includes(t.genre)).map((t) => t.id) },
  { id: 'set1', name: 'Set 1', icon: 'crate', trackIds: ['t1', 't4', 't8', 't10', 't15'] },
  { id: 'set2', name: 'Set 2', icon: 'crate', trackIds: ['t2', 't3', 't6', 't13'] },
  { id: 'house', name: 'House Classics', icon: 'crate', trackIds: tracks.filter((t) => t.genre === 'House').map((t) => t.id) },
  { id: 'chill', name: 'Chill House Vol 2', icon: 'crate', trackIds: tracks.filter((t) => t.genre === 'Chill').map((t) => t.id) },
  { id: 'techno', name: 'Techno', icon: 'crate', trackIds: tracks.filter((t) => t.genre === 'Techno').map((t) => t.id) },
  { id: 'warmup', name: 'Warm Up', icon: 'crate', trackIds: ['t11', 't17', 't3', 't5'] },
];

export const trackById = Object.fromEntries(tracks.map((t) => [t.id, t]));

export function formatTime(sec, withMs = true) {
  if (sec == null || Number.isNaN(sec)) return '--:--';
  const neg = sec < 0;
  const s = Math.abs(sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const whole = Math.floor(r);
  const cs = Math.floor((r - whole) * 100);
  const base = `${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}`;
  return `${neg ? '-' : ''}${base}${withMs ? '.' + String(cs).padStart(2, '0') : ''}`;
}
