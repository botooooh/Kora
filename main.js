const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  clipboard,
  nativeImage,
  shell,
  Tray,
  Menu,
  globalShortcut
} = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

// ==================== ULTRA-LOW RAM & CPU CHROMIUM FLAGS ====================
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64 --optimize-for-size');
app.commandLine.appendSwitch('renderer-process-limit', '1');
app.commandLine.appendSwitch(
  'disable-features',
  'Spellcheck,TranslateUI,CalculateNativeWinOcclusion,HardwareMediaKeyHandling,MediaRouter,OptimizationHints,BackForwardCache'
);
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('disable-extensions');
app.commandLine.appendSwitch('disable-pdf-extension');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
let bridgeProc = null;

const WIN_WIDTH = 650;
const WIN_HEIGHT = 260;

const storePath = path.join(app.getPath('userData'), 'kora-data.json');
const capturesDir = path.join(app.getPath('userData'), 'captures');
try {
  if (!fs.existsSync(capturesDir)) {
    fs.mkdirSync(capturesDir, { recursive: true });
  }
} catch (e) {}

const DEFAULT_SETTINGS = {
  scale: 1.0,
  openDelay: 100,
  closeDelay: 380,
  retractMode: 'app',
  hideInFullscreen: true,
  retractedLip: 4,
  restingStyle: 'auto',
  peekEnabled: true,
  peekDuration: 2600,
  screenshotProtect: true,
  autoStart: false
};

let appStore = {
  settings: { ...DEFAULT_SETTINGS },
  todos: [
    { id: '1', text: 'Tester ma nouvelle Kora Notch', done: false, time: '' },
    { id: '2', text: 'Faire une capture (Win+Shift+S) vers Fichiers', done: false, time: '' },
    { id: '3', text: 'Copier du texte (Ctrl+C) pour le presse-papiers', done: true, time: '' }
  ],
  shelf: [],
  clipboard: []
};

function loadStore() {
  try {
    if (fs.existsSync(storePath)) {
      const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      if (raw.settings) {
        appStore.settings = { ...DEFAULT_SETTINGS, ...raw.settings };
      }
      if (raw.todos) appStore.todos = raw.todos;
      if (raw.shelf) {
        appStore.shelf = raw.shelf.filter(f => f && f.path && fs.existsSync(f.path));
      }
      if (raw.clipboard) appStore.clipboard = raw.clipboard.slice(0, 25);
    }
  } catch (e) {}
}

let saveTimer = null;
function saveStore() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(storePath, JSON.stringify(appStore), 'utf8');
    } catch (e) {}
  }, 250);
}

// Kora Emerald & Gold Icon
function getKoraIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#00e676"/>
        <stop offset="55%" stop-color="#a3ff12"/>
        <stop offset="100%" stop-color="#ffd000"/>
      </linearGradient>
    </defs>
    <rect x="4" y="10" width="56" height="44" rx="20" fill="#050806" stroke="url(#g)" stroke-width="4"/>
    <rect x="17" y="26" width="11" height="12" rx="4" fill="#d9ff66"/>
    <rect x="36" y="26" width="11" height="12" rx="4" fill="#d9ff66"/>
  </svg>`;
  return nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  );
}

// Create a valid 48x48 PNG bitmap icon for Windows native startDrag
let cachedDragIcon = null;
function getDragIcon(thumbDataUrl) {
  if (thumbDataUrl && thumbDataUrl.startsWith('data:image/png;base64,')) {
    try {
      const img = nativeImage.createFromDataURL(thumbDataUrl);
      if (!img.isEmpty()) return img.resize({ width: 48, height: 48 });
    } catch (e) {}
  }
  if (!cachedDragIcon) {
    // Valid 32x32 green/gold file icon PNG
    const w = 32, h = 32;
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (x >= 4 && x < 28 && y >= 2 && y < 30) {
          buf[i] = 38;     // B
          buf[i + 1] = 230; // G
          buf[i + 2] = 118; // R
          buf[i + 3] = 255; // A
        }
      }
    }
    cachedDragIcon = nativeImage.createFromBitmap(buf, { width: w, height: h });
  }
  return cachedDragIcon;
}

function positionWindowAtTopCenter() {
  if (!mainWindow) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.bounds;
  const x = Math.round((width - WIN_WIDTH) / 2);
  mainWindow.setBounds({ x, y: 0, width: WIN_WIDTH, height: WIN_HEIGHT });
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.bounds;
  const x = Math.round((width - WIN_WIDTH) / 2);

  mainWindow = new BrowserWindow({
    x,
    y: 0,
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    title: 'Kora Notch',
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      enableWebSQL: false,
      backgroundThrottling: false,
      v8CacheOptions: 'code'
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Make Kora Notch INVISIBLE in all screenshots (Win+Shift+S, PrtScn, OBS)
  if (appStore.settings.screenshotProtect !== false) {
    mainWindow.setContentProtection(true);
  }

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => sendBridgeCommand('TRIM_MEM'), 1200);
  });

  screen.on('display-metrics-changed', positionWindowAtTopCenter);
}

// Persistent C# native bridge (nusa-bridge.exe, 17 KB)
let lastState = {
  battery: { percent: 100, charging: false },
  audio: { volume: 50, muted: false, micMuted: false, device: 'Audio Windows' },
  brightness: 80,
  window: { hasActiveApp: false, isMaximized: false, isFullscreen: false },
  capsLock: false,
  mouseDown: false,
  atTopEdge: false,
  dragNearTop: false,
  clipSeq: 0,
  media: null
};
let isInitializedState = false;

let artCacheKey = '';
let artCacheUrl = '';
let artFetchInProgress = false;

function fetchCoverArtFallback(title, artist) {
  const cleanArtist = (artist || '').split('—')[0].split('-')[0].trim();
  const query = encodeURIComponent(`${title} ${cleanArtist}`.trim());
  const url = `https://itunes.apple.com/search?term=${query}&entity=song&limit=1`;
  artFetchInProgress = true;
  const req = https.get(url, { timeout: 3500 }, res => {
    let body = '';
    res.on('data', d => (body += d));
    res.on('end', () => {
      artFetchInProgress = false;
      try {
        const json = JSON.parse(body);
        if (json && json.results && json.results.length > 0) {
          const art = json.results[0].artworkUrl100;
          if (art) {
            artCacheUrl = art.replace('100x100bb', '240x240bb');
          }
        }
      } catch (e) {}
    });
  });
  req.on('error', () => {
    artFetchInProgress = false;
  });
  req.on('timeout', () => {
    artFetchInProgress = false;
    req.destroy();
  });
}

function startWindowsBridge() {
  const exePath = path.join(__dirname, 'nusa-bridge.exe');
  bridgeProc = spawn(exePath, [], { windowsHide: true });

  let buffer = '';
  bridgeProc.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('NUSA_STATE:')) {
        try {
          const data = JSON.parse(line.slice('NUSA_STATE:'.length));
          handleNativeStateUpdate(data);
        } catch (err) {}
      }
    }
  });

  bridgeProc.on('exit', () => {
    setTimeout(() => {
      if (!app.isQuitting) startWindowsBridge();
    }, 1500);
  });
}

function sendBridgeCommand(cmd) {
  if (bridgeProc && bridgeProc.stdin && !bridgeProc.killed) {
    try {
      bridgeProc.stdin.write(cmd + '\n');
    } catch (e) {}
  }
}

// ==================== RELIABLE CLIPBOARD & SCREENSHOT HANDLER ====================
let lastClipText = '';
let lastClipImgSig = '';
let suppressNextClipPeek = false;

function checkClipboardNow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const formats = clipboard.availableFormats();

    // 1. Check if an image / screenshot was copied (Win+Shift+S, PrtScn, Copy Image)
    if (formats.some(f => f.includes('image') || f.includes('Bitmap'))) {
      const img = clipboard.readImage();
      if (img && !img.isEmpty()) {
        const size = img.getSize();
        const bitmap = img.toBitmap();
        // Fast signature from dimensions + sample bytes (zero heavy PNG encoding unless changed!)
        const sample =
          bitmap.length > 200
            ? `${bitmap[0]}_${bitmap[50]}_${bitmap[100]}_${bitmap[Math.floor(bitmap.length / 2)]}_${bitmap[bitmap.length - 10]}`
            : String(bitmap.length);
        const sig = `${size.width}x${size.height}_${sample}`;

        if (sig !== lastClipImgSig) {
          lastClipImgSig = sig;

          const thumbImg = size.width > 180 ? img.resize({ width: 180 }) : img;
          const thumbDataUrl = thumbImg.toDataURL();
          const now = new Date();
          const timeStr = now.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
          });
          const stamp = now
            .toISOString()
            .replace(/[:.]/g, '-')
            .slice(0, 19);
          const fileName = `Capture_${stamp}.png`;
          const filePath = path.join(capturesDir, fileName);

          // Save screenshot as real PNG file and automatically place it in File Shelf!
          try {
            const pngBuffer = img.toPNG();
            fs.writeFileSync(filePath, pngBuffer);

            appStore.shelf.unshift({
              id: 'cap_' + Date.now().toString(),
              name: fileName,
              path: filePath,
              size: formatBytes(pngBuffer.length),
              ext: 'png',
              thumbDataUrl
            });
            appStore.shelf = appStore.shelf.slice(0, 12);
          } catch (err) {}

          // Also add to Clipboard history
          addClipboardItem(
            {
              id: Date.now().toString(),
              kind: 'image',
              text: `Capture (${size.width}×${size.height})`,
              preview: `Capture ${size.width}×${size.height} → Fichiers`,
              dataUrl: thumbDataUrl,
              filePath,
              time: timeStr,
              pinned: false
            },
            true // isScreenshot
          );
          return;
        }
      }
    }

    // 2. Check if text was copied (Ctrl+C)
    const text = (clipboard.readText() || '').trim();
    if (text && text !== lastClipText) {
      lastClipText = text;
      addClipboardItem(
        {
          id: Date.now().toString(),
          kind: detectTextKind(text),
          text: text.slice(0, 2000),
          preview: text.replace(/\s+/g, ' ').slice(0, 90),
          time: new Date().toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          pinned: false
        },
        false
      );
    }
  } catch (e) {}
}

function triggerClipboardCheckWithRetry() {
  // Check after 50ms and 220ms so Windows apps/Snipping Tool finish releasing OpenClipboard lock
  setTimeout(checkClipboardNow, 50);
  setTimeout(checkClipboardNow, 220);
  setTimeout(checkClipboardNow, 550);
}

function handleNativeStateUpdate(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (state.media && state.media.title) {
    const key = `${state.media.title}|${state.media.artist}`;
    if (key !== artCacheKey) {
      artCacheKey = key;
      artCacheUrl = '';
      if (!state.media.thumbnail && !artFetchInProgress) {
        fetchCoverArtFallback(state.media.title, state.media.artist);
      }
    }
    if (!state.media.thumbnail && artCacheUrl) {
      state.media.thumbnail = artCacheUrl;
    }
  }

  if (isInitializedState) {
    // 1. Top-edge hover wakeup
    if (state.atTopEdge && !lastState.atTopEdge) {
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.webContents.send('top-edge-hover', { active: true });
    }

    // 2. OS file drag near top center
    if (state.dragNearTop && !lastState.dragNearTop) {
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.webContents.send('os-drag-near', { near: true });
    } else if (!state.dragNearTop && lastState.dragNearTop) {
      mainWindow.webContents.send('os-drag-near', { near: false });
    }

    // 3. Clipboard sequence changed
    if (state.clipSeq !== lastState.clipSeq) {
      triggerClipboardCheckWithRetry();
    }

    // 4. Quick Peek events
    if (appStore.settings.peekEnabled) {
      // Charger plugged/unplugged
      if (
        state.battery &&
        lastState.battery &&
        state.battery.charging !== lastState.battery.charging
      ) {
        mainWindow.webContents.send('peek-event', {
          type: 'charge',
          charging: state.battery.charging,
          percent: state.battery.percent
        });
      }

      // Speaker Volume or Mute changed
      if (
        state.audio &&
        lastState.audio &&
        state.audio.volume >= 0 &&
        (Math.abs(state.audio.volume - lastState.audio.volume) >= 1 ||
          state.audio.muted !== lastState.audio.muted)
      ) {
        mainWindow.webContents.send('peek-event', {
          type: 'volume',
          volume: state.audio.volume,
          muted: state.audio.muted,
          device: state.audio.device
        });
      }

      // Microphone Mute changed
      if (
        state.audio &&
        lastState.audio &&
        state.audio.micMuted !== lastState.audio.micMuted
      ) {
        mainWindow.webContents.send('peek-event', {
          type: 'mic',
          micMuted: state.audio.micMuted
        });
      }

      // Screen Brightness changed
      if (
        typeof state.brightness === 'number' &&
        typeof lastState.brightness === 'number' &&
        Math.abs(state.brightness - lastState.brightness) >= 1
      ) {
        mainWindow.webContents.send('peek-event', {
          type: 'brightness',
          brightness: state.brightness
        });
      }

      // Caps Lock toggled
      if (state.capsLock !== lastState.capsLock) {
        mainWindow.webContents.send('peek-event', {
          type: 'capslock',
          active: state.capsLock
        });
      }
    }
  } else {
    isInitializedState = true;
    try {
      lastClipText = (clipboard.readText() || '').trim();
      const img = clipboard.readImage();
      if (img && !img.isEmpty()) {
        const size = img.getSize();
        const bitmap = img.toBitmap();
        const sample =
          bitmap.length > 200
            ? `${bitmap[0]}_${bitmap[50]}_${bitmap[100]}_${bitmap[Math.floor(bitmap.length / 2)]}_${bitmap[bitmap.length - 10]}`
            : String(bitmap.length);
        lastClipImgSig = `${size.width}x${size.height}_${sample}`;
      }
    } catch (e) {}
  }

  lastState = state;
  mainWindow.webContents.send('system-state', state);
}

function detectTextKind(t) {
  if (/^https?:\/\/\S+/i.test(t)) return 'link';
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t)) return 'color';
  if (/[{};=()=>]/.test(t) && t.includes('\n')) return 'code';
  return 'text';
}

function addClipboardItem(item, isScreenshot = false) {
  appStore.clipboard = appStore.clipboard.filter(
    c => !(c.kind === item.kind && c.text === item.text)
  );
  appStore.clipboard.unshift(item);
  if (appStore.clipboard.length > 25) {
    appStore.clipboard = appStore.clipboard.slice(0, 25);
  }
  saveStore();
  mainWindow.webContents.send('store-updated', appStore);

  if (!suppressNextClipPeek && appStore.settings.peekEnabled) {
    if (isScreenshot) {
      mainWindow.webContents.send('peek-event', {
        type: 'screenshot',
        preview: item.preview,
        thumbDataUrl: item.dataUrl
      });
    } else {
      mainWindow.webContents.send('peek-event', {
        type: 'clipboard',
        preview: item.preview,
        kind: item.kind
      });
    }
  }
  suppressNextClipPeek = false;
}

// Fetch synced lyrics from LRCLIB
function fetchLyricsFromLrclib(title, artist) {
  return new Promise(resolve => {
    if (!title) return resolve([]);
    const cleanTitle = title
      .replace(/\(.*?\)|\[.*?\]/g, '')
      .replace(/official\s*(music\s*)?video|audio|lyrics/gi, '')
      .trim();
    const cleanArtist = (artist || '').split('—')[0].split(' - ')[0].trim();
    const query = encodeURIComponent(`${cleanTitle} ${cleanArtist}`.trim());
    const url = `https://lrclib.net/api/search?q=${query}`;

    const req = https.get(
      url,
      { headers: { 'User-Agent': 'KoraNotchWindows/1.0' }, timeout: 4500 },
      res => {
        let body = '';
        res.on('data', d => (body += d));
        res.on('end', () => {
          try {
            const list = JSON.parse(body);
            if (!Array.isArray(list) || list.length === 0) return resolve([]);
            const withSynced = list.find(item => item.syncedLyrics);
            if (withSynced && withSynced.syncedLyrics) {
              const parsed = parseLrc(withSynced.syncedLyrics);
              if (parsed.length > 0) return resolve(parsed);
            }
            const withPlain = list.find(item => item.plainLyrics);
            if (withPlain && withPlain.plainLyrics) {
              const lines = withPlain.plainLyrics
                .split(/\r?\n/)
                .map(l => l.trim())
                .filter(Boolean)
                .slice(0, 35)
                .map((text, idx) => ({ time: idx * 4, text }));
              return resolve(lines);
            }
            resolve([]);
          } catch (e) {
            resolve([]);
          }
        });
      }
    );
    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
  });
}

function parseLrc(lrcString) {
  const lines = lrcString.split(/\r?\n/);
  const result = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  for (const line of lines) {
    const text = line.replace(timeRegex, '').trim();
    if (!text) continue;
    let match;
    timeRegex.lastIndex = 0;
    while ((match = timeRegex.exec(line)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
      result.push({ time: min * 60 + sec + ms / 1000, text });
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

function setupIpc() {
  ipcMain.on('set-ignore-mouse', (_event, ignore) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (ignore) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
      sendBridgeCommand('TRIM_MEM');
    } else {
      mainWindow.setIgnoreMouseEvents(false);
    }
  });

  ipcMain.handle('get-store', () => appStore);

  ipcMain.on('settings-update', (_event, partialSettings) => {
    appStore.settings = { ...appStore.settings, ...partialSettings };
    if (typeof partialSettings.autoStart === 'boolean') {
      try {
        app.setLoginItemSettings({ openAtLogin: partialSettings.autoStart });
      } catch (e) {}
    }
    if (typeof partialSettings.screenshotProtect === 'boolean' && mainWindow) {
      mainWindow.setContentProtection(partialSettings.screenshotProtect);
    }
    saveStore();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('store-updated', appStore);
    }
  });

  ipcMain.on('media-cmd', (_event, cmd) => {
    sendBridgeCommand(cmd);
  });

  ipcMain.handle('fetch-lyrics', async (_event, { title, artist }) => {
    return await fetchLyricsFromLrclib(title, artist);
  });

  // Clipboard actions
  ipcMain.on('clipboard-copy', (_event, id) => {
    const item = appStore.clipboard.find(c => c.id === id);
    if (!item) return;
    suppressNextClipPeek = true;
    if (item.kind === 'image' && item.dataUrl) {
      const img = nativeImage.createFromDataURL(item.dataUrl);
      clipboard.writeImage(img);
    } else {
      lastClipText = item.text;
      clipboard.writeText(item.text);
    }
  });

  ipcMain.on('clipboard-pin', (_event, id) => {
    const item = appStore.clipboard.find(c => c.id === id);
    if (item) {
      item.pinned = !item.pinned;
      appStore.clipboard.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
      saveStore();
      mainWindow.webContents.send('store-updated', appStore);
    }
  });

  ipcMain.on('clipboard-delete', (_event, id) => {
    appStore.clipboard = appStore.clipboard.filter(c => c.id !== id);
    saveStore();
    mainWindow.webContents.send('store-updated', appStore);
  });

  ipcMain.on('clipboard-clear', () => {
    appStore.clipboard = appStore.clipboard.filter(c => c.pinned);
    saveStore();
    mainWindow.webContents.send('store-updated', appStore);
  });

  // File Shelf actions
  ipcMain.on('shelf-add-files', (_event, filePaths) => {
    if (!Array.isArray(filePaths)) return;
    for (const rawFp of filePaths) {
      if (!rawFp) continue;
      const fp = path.resolve(rawFp);
      if (!fs.existsSync(fp)) continue;
      if (appStore.shelf.some(s => s.path === fp)) continue;
      try {
        const stat = fs.statSync(fp);
        const ext = path.extname(fp).toLowerCase();
        const isDir = stat.isDirectory();
        let thumbDataUrl = null;
        if (
          ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext) &&
          stat.size < 6 * 1024 * 1024
        ) {
          try {
            const img = nativeImage.createFromPath(fp);
            if (!img.isEmpty()) {
              thumbDataUrl = img.resize({ width: 72, height: 72 }).toDataURL();
            }
          } catch (e) {}
        }
        appStore.shelf.unshift({
          id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
          name: path.basename(fp),
          path: fp,
          size: isDir ? 'Dossier' : formatBytes(stat.size),
          ext: isDir ? 'folder' : ext.replace('.', '') || 'file',
          thumbDataUrl
        });
      } catch (e) {}
    }
    appStore.shelf = appStore.shelf.slice(0, 12);
    saveStore();
    mainWindow.webContents.send('store-updated', appStore);
  });

  ipcMain.on('shelf-open', (_event, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.openPath(path.resolve(filePath));
    }
  });

  ipcMain.on('shelf-reveal', (_event, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(path.resolve(filePath));
    }
  });

  ipcMain.on('shelf-remove', (_event, id) => {
    appStore.shelf = appStore.shelf.filter(f => f.id !== id);
    saveStore();
    mainWindow.webContents.send('store-updated', appStore);
  });

  ipcMain.on('shelf-clear', () => {
    appStore.shelf = [];
    saveStore();
    mainWindow.webContents.send('store-updated', appStore);
  });

  // Native OS Drag OUT of Kora Notch into any Windows application (WhatsApp, Explorer, Browser, Discord)
  ipcMain.on('shelf-start-drag', (event, filePath) => {
    if (!filePath) return;
    const normalizedPath = path.resolve(filePath);
    if (!fs.existsSync(normalizedPath)) return;
    const shelfItem = appStore.shelf.find(f => path.resolve(f.path) === normalizedPath);
    try {
      event.sender.startDrag({
        file: normalizedPath,
        icon: getDragIcon(shelfItem ? shelfItem.thumbDataUrl : null)
      });
    } catch (e) {
      console.error('startDrag error:', e);
    }
  });

  // To-Do actions
  ipcMain.on('todo-add', (_event, { text, time }) => {
    if (!text || !text.trim()) return;
    appStore.todos.unshift({
      id: Date.now().toString(),
      text: text.trim(),
      done: false,
      time: time || '',
      notified: false
    });
    saveStore();
    mainWindow.webContents.send('store-updated', appStore);
  });

  ipcMain.on('todo-toggle', (_event, id) => {
    const t = appStore.todos.find(x => x.id === id);
    if (t) {
      t.done = !t.done;
      saveStore();
      mainWindow.webContents.send('store-updated', appStore);
    }
  });

  ipcMain.on('todo-delete', (_event, id) => {
    appStore.todos = appStore.todos.filter(x => x.id !== id);
    saveStore();
    mainWindow.webContents.send('store-updated', appStore);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function createTray() {
  tray = new Tray(getKoraIcon());
  tray.setToolTip('Kora — L\'encoche vivante pour Windows');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Kora Notch (Ultra-Léger)',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '🎵 Ouvrir Musique (Alt+M)',
      click: () => mainWindow && mainWindow.webContents.send('switch-tab', 'music')
    },
    {
      label: '📋 Ouvrir Presse-papiers (Alt+V)',
      click: () => mainWindow && mainWindow.webContents.send('switch-tab', 'clipboard')
    },
    {
      label: '📁 Ouvrir Fichiers Drag & Drop (Alt+S)',
      click: () => mainWindow && mainWindow.webContents.send('switch-tab', 'shelf')
    },
    {
      label: '✅ Ouvrir To-Do List',
      click: () => mainWindow && mainWindow.webContents.send('switch-tab', 'todo')
    },
    {
      label: '⚙️ Ouvrir Paramètres',
      click: () => mainWindow && mainWindow.webContents.send('switch-tab', 'settings')
    },
    { type: 'separator' },
    {
      label: '🎙️ Couper / Activer le Micro (Alt+X)',
      click: () => sendBridgeCommand('MIC_MUTE_TOGGLE')
    },
    { type: 'separator' },
    {
      label: 'Quitter Kora',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.webContents.send('toggle-notch');
    }
  });
}

function registerShortcuts() {
  globalShortcut.register('Alt+N', () => {
    if (mainWindow) mainWindow.webContents.send('toggle-notch');
  });
  globalShortcut.register('Alt+V', () => {
    if (mainWindow) mainWindow.webContents.send('switch-tab', 'clipboard');
  });
  globalShortcut.register('Alt+S', () => {
    if (mainWindow) mainWindow.webContents.send('switch-tab', 'shelf');
  });
  globalShortcut.register('Alt+M', () => {
    if (mainWindow) mainWindow.webContents.send('switch-tab', 'music');
  });
  globalShortcut.register('Alt+X', () => {
    sendBridgeCommand('MIC_MUTE_TOGGLE');
  });
}

app.whenReady().then(() => {
  loadStore();
  setupIpc();
  createWindow();
  createTray();
  registerShortcuts();
  startWindowsBridge();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (bridgeProc && !bridgeProc.killed) {
    bridgeProc.kill();
  }
});
