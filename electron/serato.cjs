// Lectura (solo lectura) de los datos de Serato: base de datos, crates,
// orden de crates y los tags que Serato escribe en cada archivo
// (hot cues, loops y beatgrid).

const fs = require('fs');
const path = require('path');

// ── Formato de tags de Serato: [tag 4 bytes][largo uint32 BE][payload] ──
function parseTags(buf) {
  const out = [];
  let i = 0;
  while (i + 8 <= buf.length) {
    const tag = buf.toString('latin1', i, i + 4);
    const len = buf.readUInt32BE(i + 4);
    const v = buf.subarray(i + 8, i + 8 + len);
    i += 8 + len;
    let value;
    const t = tag[0];
    if (tag === 'vrsn' || t === 't' || t === 'p') value = utf16be(v);
    else if (t === 'o') value = parseTags(v);
    else if (t === 'u') value = len === 4 ? v.readUInt32BE(0) : null;
    else if (t === 's') value = len === 2 ? v.readUInt16BE(0) : null;
    else if (t === 'b') value = len ? v[0] : null;
    else value = v;
    out.push([tag, value]);
  }
  return out;
}

function utf16be(b) {
  const swapped = Buffer.from(b);
  for (let i = 0; i + 1 < swapped.length; i += 2) {
    const a = swapped[i];
    swapped[i] = swapped[i + 1];
    swapped[i + 1] = a;
  }
  return swapped.toString('utf16le');
}

// Las rutas en Serato son relativas a la raíz del volumen ("Users/…")
function toAbs(p) {
  if (!p) return p;
  return p.startsWith('/') ? p : '/' + p;
}

function parseLength(s) {
  // "08:13.77"
  if (!s) return 0;
  const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(s.trim());
  return m ? parseInt(m[1], 10) * 60 + parseFloat(m[2]) : 0;
}

function readDatabase(seratoRoot) {
  const file = path.join(seratoRoot, 'database V2');
  if (!fs.existsSync(file)) return [];
  const tags = parseTags(fs.readFileSync(file));
  const tracks = [];
  for (const [tag, rec] of tags) {
    if (tag !== 'otrk') continue;
    const d = Object.fromEntries(rec);
    if (!d.pfil) continue;
    tracks.push({
      path: toAbs(d.pfil),
      title: d.tsng || '',
      artist: d.tart || '',
      album: d.talb || '',
      genre: d.tgen || '',
      comment: d.tcom || '',
      year: d.ttyr || '',
      key: d.tkey || '',
      bpm: parseFloat(d.tbpm) || null,
      duration: parseLength(d.tlen),
      plays: d.utpc || 0,
      added: d.uadd || 0,
      missing: !!d.bmis,
    });
  }
  return tracks;
}

function readCrate(file) {
  const tags = parseTags(fs.readFileSync(file));
  const paths = [];
  for (const [tag, rec] of tags) {
    if (tag !== 'otrk') continue;
    const p = rec.find(([t]) => t === 'ptrk');
    if (p) paths.push(toAbs(p[1]));
  }
  return paths;
}

function readCrateOrder(seratoRoot) {
  const file = path.join(seratoRoot, 'neworder.pref');
  if (!fs.existsSync(file)) return [];
  const text = utf16be(fs.readFileSync(file));
  return text
    .split(/\r?\n/)
    .map((l) => /^\[crate\](.*)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => m[1]);
}

function readCrates(seratoRoot) {
  const dir = path.join(seratoRoot, 'Subcrates');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.crate'));
  const order = readCrateOrder(seratoRoot);
  const crates = files.map((f) => {
    const name = f.slice(0, -'.crate'.length);
    let paths = [];
    try { paths = readCrate(path.join(dir, f)); } catch { /* crate dañado: lo ignoramos */ }
    const parts = name.split('%%'); // Serato usa %% para subcrates
    return { id: 'crate:' + name, name: parts[parts.length - 1], depth: parts.length - 1, fullName: name, paths };
  });
  const idx = (c) => {
    const k = order.indexOf(c.fullName);
    return k < 0 ? 9999 : k;
  };
  crates.sort((a, b) => idx(a) - idx(b) || a.fullName.localeCompare(b.fullName));
  return crates;
}

// ── Tags por archivo: Serato Markers2 (cues, loops, color) y BeatGrid ──

function decodeMarkers2(data) {
  // data: Buffer con 0x01 0x01 + base64 (con saltos de línea) terminado en \0
  let b64 = data.subarray(2).toString('latin1');
  const z = b64.indexOf('\0');
  if (z >= 0) b64 = b64.slice(0, z);
  b64 = b64.replace(/[^A-Za-z0-9+/]/g, '');
  if (b64.length % 4 === 1) b64 = b64.slice(0, -1);
  while (b64.length % 4) b64 += '=';
  const raw = Buffer.from(b64, 'base64');
  const cues = [];
  const loops = [];
  let color = null;
  let i = 2; // versión 0x01 0x01
  while (i < raw.length) {
    const end = raw.indexOf(0, i);
    if (end <= i) break;
    const name = raw.toString('latin1', i, end);
    const len = raw.readUInt32BE(end + 1);
    const p = raw.subarray(end + 5, end + 5 + len);
    i = end + 5 + len;
    if (name === 'CUE' && p.length >= 12) {
      const nameEnd = p.indexOf(0, 12);
      cues.push({
        index: p[1],
        position: p.readUInt32BE(2) / 1000,
        color: '#' + p.subarray(7, 10).toString('hex'),
        name: p.toString('utf8', 12, nameEnd < 0 ? p.length : nameEnd),
      });
    } else if (name === 'LOOP' && p.length >= 20) {
      loops.push({
        index: p[1],
        start: p.readUInt32BE(2) / 1000,
        end: p.readUInt32BE(6) / 1000,
        locked: !!p[19],
      });
    } else if (name === 'COLOR' && p.length >= 4) {
      color = '#' + p.subarray(1, 4).toString('hex');
    }
  }
  return { cues, loops, color };
}

function decodeBeatGrid(data) {
  // 0x01 0x00, uint32 cantidad, marcadores; el último trae el BPM
  if (data.length < 6) return null;
  const n = data.readUInt32BE(2);
  const markers = [];
  let i = 6;
  for (let k = 0; k < n && i + 8 <= data.length; k++) {
    const position = data.readFloatBE(i);
    if (k === n - 1) markers.push({ position, bpm: data.readFloatBE(i + 4) });
    else markers.push({ position, beatsToNext: data.readUInt32BE(i + 4) });
    i += 8;
  }
  if (!markers.length) return null;
  const last = markers[markers.length - 1];
  return { firstBeat: markers[0].position, bpm: last.bpm, markers };
}

// FLAC / M4A guardan los mismos datos en base64 con un encabezado MIME
function unwrapBase64Tag(str) {
  const buf = Buffer.from(String(str).replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
  // "application/octet-stream\0\0Serato Markers2\0<data>"
  let i = buf.indexOf(0);
  if (i < 0) return buf;
  i = buf.indexOf(0, i + 2); // salta el \0\0 y el nombre
  return buf.subarray(i + 1);
}

async function readTrackMarkers(file) {
  const mm = await import('music-metadata');
  const meta = await mm.parseFile(file, { skipCovers: true, duration: false });
  let markers2 = null;
  let grid = null;
  for (const [fmt, tags] of Object.entries(meta.native || {})) {
    for (const t of tags) {
      try {
        if (fmt.startsWith('ID3') && t.id === 'GEOB' && t.value) {
          const desc = t.value.description;
          const data = Buffer.from(t.value.data);
          if (desc === 'Serato Markers2') markers2 = decodeMarkers2(data);
          else if (desc === 'Serato BeatGrid') grid = decodeBeatGrid(data);
        } else {
          const id = String(t.id).toUpperCase();
          if (id === 'SERATO_MARKERS_V2' || id.endsWith('MARKERSV2')) markers2 = decodeMarkers2(unwrapBase64Tag(t.value));
          else if (id === 'SERATO_BEATGRID' || id.endsWith('BEATGRID')) grid = decodeBeatGrid(unwrapBase64Tag(t.value));
        }
      } catch { /* tag con formato inesperado: lo ignoramos */ }
    }
  }
  return {
    cues: markers2?.cues ?? [],
    loops: markers2?.loops ?? [],
    trackColor: markers2?.color ?? null,
    grid,
    duration: meta.format?.duration ?? null,
    sampleRate: meta.format?.sampleRate ?? null,
  };
}

module.exports = { parseTags, readDatabase, readCrates, readCrateOrder, readTrackMarkers, decodeMarkers2, decodeBeatGrid };
