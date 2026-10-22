const { app, BrowserWindow, ipcMain, protocol, net, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { buildLibrary } = require('./library.cjs');
const { readTrackMarkers } = require('./serato.cjs');

const isDev = process.env.B2B_DEV === '1';

// El audio puede arrancar sin esperar un clic (lo controlamos nosotros)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Esquema propio para servir tus archivos de audio al motor de audio
protocol.registerSchemesAsPrivileged([
  { scheme: 'sfmedia', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
]);

// ── Configuración ──
// La app se llamaba SonicFlow y Electron guarda los datos en una carpeta con el
// nombre de la app. Al cambiar a B2B, traemos lo de antes (rutas de música y los
// cues que creaste) para no perderlo.
function migrarDatosViejos() {
  try {
    const nueva = app.getPath('userData');
    const vieja = path.join(path.dirname(nueva), 'sonicflow');
    if (nueva === vieja || !fs.existsSync(vieja)) return;
    fs.mkdirSync(nueva, { recursive: true });
    for (const f of ['config.json', 'track-data.json']) {
      const origen = path.join(vieja, f);
      const destino = path.join(nueva, f);
      if (fs.existsSync(origen) && !fs.existsSync(destino)) {
        fs.copyFileSync(origen, destino);
        console.log(`[b2b] traído de la versión anterior: ${f}`);
      }
    }
  } catch (err) {
    console.log('[b2b] no se pudo traer los datos anteriores:', String(err));
  }
}

const configFile = () => path.join(app.getPath('userData'), 'config.json');
// Carpeta de música por defecto: si existe la del proyecto original la usa,
// si no cae en ~/Music. De todas formas se cambia en Ajustes.
function musicaPorDefecto() {
  const propia = path.join(os.homedir(), 'Music', 'Musica', 'Set');
  try { if (fs.existsSync(propia)) return propia; } catch { /* da igual */ }
  return path.join(os.homedir(), 'Music');
}
const defaults = () => ({
  musicRoot: musicaPorDefecto(),
  seratoRoot: path.join(os.homedir(), 'Music', '_Serato_'),
  outputDeviceId: null,
});
function loadConfig() {
  try { return { ...defaults(), ...JSON.parse(fs.readFileSync(configFile(), 'utf8')) }; } catch { return defaults(); }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2));
}

// Datos propios de B2B por pista (cues que creas aquí). No tocamos tus archivos.
const userDataFile = () => path.join(app.getPath('userData'), 'track-data.json');
function loadTrackData() {
  try { return JSON.parse(fs.readFileSync(userDataFile(), 'utf8')); } catch { return {}; }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0e0e10',
    titleBarStyle: 'hiddenInset',
    title: 'B2B · Back to back',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Lleva lo que pasa en la interfaz al registro de la Terminal, para diagnóstico.
  const wc = mainWindow.webContents;
  wc.on('console-message', (...args) => {
    const d = args[0] && typeof args[0] === 'object' && 'message' in args[0] ? args[0] : null;
    console.log('[app]', d ? d.message : args[1]);
  });
  wc.on('did-finish-load', () => console.log('[b2b] interfaz cargada'));
  wc.on('did-fail-load', (_e, code, desc, url) => console.log(`[b2b] no cargó (${code} ${desc}) ${url}`));

  if (isDev) mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  migrarDatosViejos();

  // Ícono de la app en el Dock (en desarrollo, macOS usa el de Electron si no).
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(path.join(__dirname, 'icon.png')); } catch { /* da igual */ }
  }

  protocol.handle('sfmedia', (req) => {
    const u = new URL(req.url);
    const file = decodeURIComponent(u.pathname);
    return net.fetch(pathToFileURL(file).toString());
  });

  // Permite ver los nombres de los dispositivos de audio (para elegir la Mixtrack)
  // y usar el controlador MIDI. Se registra cada pedido para poder diagnosticarlo.
  const ALLOWED = ['media', 'speaker-selection', 'midi', 'midiSysex'];
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    const ok = ALLOWED.includes(permission);
    console.log(`[permiso] consulta "${permission}" → ${ok ? 'sí' : 'no'}`);
    return ok;
  });
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    const ok = ALLOWED.includes(permission);
    console.log(`[permiso] pedido  "${permission}" → ${ok ? 'sí' : 'no'}`);
    cb(ok);
  });
  console.log(`[b2b] arrancando · electron ${process.versions.electron} · chrome ${process.versions.chrome} · dev=${isDev}`);

  // Escribe el diagnóstico del controlador junto al proyecto, para poder revisarlo
  // sin tener que pedirle capturas al usuario.
  ipcMain.handle('diag:write', (_e, data) => {
    try {
      const file = path.join(__dirname, '..', 'midi-diag.json');
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
      return file;
    } catch (err) {
      return String(err);
    }
  });

  ipcMain.handle('config:get', () => loadConfig());
  ipcMain.handle('config:set', (_e, patch) => {
    const cfg = { ...loadConfig(), ...patch };
    saveConfig(cfg);
    return cfg;
  });
  ipcMain.handle('library:load', async (e) => {
    const cfg = loadConfig();
    return buildLibrary(cfg, (p) => e.sender.send('library:progress', p));
  });
  ipcMain.handle('track:markers', async (_e, file) => {
    try { return await readTrackMarkers(file); } catch (err) { return { error: String(err), cues: [], loops: [], grid: null }; }
  });
  ipcMain.handle('track:cover', async (_e, file) => {
    try {
      const mm = await import('music-metadata');
      const meta = await mm.parseFile(file, { duration: false });
      const pic = mm.selectCover(meta.common.picture);
      if (!pic) return null;
      return `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`;
    } catch { return null; }
  });
  ipcMain.handle('trackdata:get', () => loadTrackData());
  ipcMain.handle('trackdata:set', (_e, id, data) => {
    const all = loadTrackData();
    all[id] = { ...(all[id] || {}), ...data };
    fs.mkdirSync(path.dirname(userDataFile()), { recursive: true });
    fs.writeFileSync(userDataFile(), JSON.stringify(all));
    return true;
  });
  ipcMain.handle('dialog:pickFolder', async (_e, title) => {
    const r = await dialog.showOpenDialog(mainWindow, { title, properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
