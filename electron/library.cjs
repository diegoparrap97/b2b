// Construye la librería: base de datos y crates de Serato + archivos de la
// carpeta de música que Serato todavía no conoce.

const fs = require('fs');
const path = require('path');
const serato = require('./serato.cjs');

const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.wav', '.aif', '.aiff', '.ogg', '.opus']);

function isAudio(file) {
  if (file.includes('.vdjstems')) return false;
  return AUDIO_EXT.has(path.extname(file).toLowerCase());
}

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && isAudio(e.name)) out.push(p);
  }
  return out;
}

function guessFromFilename(file) {
  let base = path.basename(file, path.extname(file));
  base = base.replace(/^\d+[\s._-]*/, '').replace(/_/g, ' ').replace(/\s*\[www\.[^\]]+\]\s*/gi, ' ').trim();
  const m = /^(.+?)\s+-\s+(.+)$/.exec(base);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: base };
}

async function readTagsBasic(file) {
  try {
    const mm = await import('music-metadata');
    const meta = await mm.parseFile(file, { skipCovers: true, duration: false });
    const c = meta.common || {};
    const g = guessFromFilename(file);
    return {
      title: c.title || g.title,
      artist: c.artist || g.artist,
      album: c.album || '',
      genre: (c.genre && c.genre[0]) || '',
      comment: (c.comment && (c.comment[0]?.text ?? c.comment[0])) || '',
      year: c.year ? String(c.year) : '',
      key: c.key || '',
      bpm: c.bpm ? Number(c.bpm) : null,
      duration: meta.format?.duration || 0,
    };
  } catch {
    return { ...guessFromFilename(file), album: '', genre: '', comment: '', year: '', key: '', bpm: null, duration: 0 };
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let k = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (k < items.length) {
      const i = k++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function buildLibrary({ musicRoot, seratoRoot }, onProgress = () => {}) {
  const byPath = new Map();

  // 1) Base de datos de Serato
  let hasSerato = false;
  if (seratoRoot && fs.existsSync(path.join(seratoRoot, 'database V2'))) {
    hasSerato = true;
    for (const t of serato.readDatabase(seratoRoot)) {
      if (!fs.existsSync(t.path)) continue;
      byPath.set(t.path, t);
    }
  }
  onProgress({ stage: 'serato', count: byPath.size });

  // 2) Archivos en la carpeta de música que no están en Serato
  const found = musicRoot && fs.existsSync(musicRoot) ? walk(musicRoot) : [];
  const fresh = found.filter((f) => !byPath.has(f));
  const tagged = await mapLimit(fresh, 6, async (f, i) => {
    if (i % 10 === 0) onProgress({ stage: 'scan', done: i, total: fresh.length });
    return { path: f, plays: 0, added: Math.floor(fs.statSync(f).mtimeMs / 1000), ...(await readTagsBasic(f)) };
  });
  for (const t of tagged) byPath.set(t.path, t);

  const tracks = [...byPath.values()].map((t) => ({
    ...t,
    id: t.path,
    title: t.title || guessFromFilename(t.path).title,
    ext: path.extname(t.path).slice(1).toLowerCase(),
  }));

  // 3) Crates: los de Serato (en su orden) + una entrada por subcarpeta
  const crates = [{ id: 'all', name: 'All...', icon: 'all', depth: 0, trackIds: tracks.map((t) => t.id) }];
  if (hasSerato) {
    for (const c of serato.readCrates(seratoRoot)) {
      crates.push({ id: c.id, name: c.name, icon: 'crate', depth: c.depth, trackIds: c.paths.filter((p) => byPath.has(p)) });
    }
  }
  if (musicRoot && fs.existsSync(musicRoot)) {
    const folders = new Map();
    for (const f of found) {
      const rel = path.relative(musicRoot, path.dirname(f));
      if (!rel || rel.startsWith('..')) continue;
      if (!folders.has(rel)) folders.set(rel, []);
      folders.get(rel).push(f);
    }
    const sorted = [...folders.keys()].sort((a, b) => a.localeCompare(b));
    if (sorted.length) crates.push({ id: 'sep:folders', name: 'Carpetas', icon: 'section', depth: 0, trackIds: [] });
    for (const rel of sorted) {
      const parts = rel.split(path.sep);
      crates.push({ id: 'folder:' + rel, name: parts[parts.length - 1], icon: 'folder', depth: parts.length - 1, trackIds: folders.get(rel) });
    }
  }

  onProgress({ stage: 'done', count: tracks.length });
  return { tracks, crates, hasSerato };
}

module.exports = { buildLibrary };
