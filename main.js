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
  globalShortcut,
  dialog
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
  closeDelay: 320,
  retractMode: 'app',
  hideInFullscreen: true,
  retractedLip: 4,
  restingStyle: 'auto',
  peekEnabled: true,
  peekDuration: 2200,
  showInScreenshots: false, // false = invisible on screenshots/recordings, true = visible
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
        // Migrate old setting keys if present
        if (typeof raw.settings.showInScreenshots !== 'boolean') {
          if (typeof raw.settings.hideInScreenshots === 'boolean') {
            appStore.settings.showInScreenshots = !raw.settings.hideInScreenshots;
          } else if (typeof raw.settings.screenshotProtect === 'boolean') {
            appStore.settings.showInScreenshots = !raw.settings.screenshotProtect;
          }
        }
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
  }, 200);
}

function applyScreenshotVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const showOnCapture = Boolean(appStore.settings.showInScreenshots);
  // setContentProtection(true) hides the window from screenshots/recordings
  // setContentProtection(false) lets the window appear in screenshots/recordings
  mainWindow.setContentProtection(!showOnCapture);
}

// Official Kora Logo Icon
function getKoraIcon() {
  const logoPath = path.join(__dirname, 'kora-logo.png');
  if (fs.existsSync(logoPath)) {
    try {
      const img = nativeImage.createFromPath(logoPath);
      if (!img.isEmpty()) {
        return img.resize({ width: 32, height: 32 });
      }
    } catch (e) {}
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect x="4" y="4" width="56" height="56" rx="16" fill="#ffffff"/>
    <rect x="20" y="20" width="8" height="8" fill="#111"/>
    <rect x="36" y="20" width="8" height="8" fill="#111"/>
    <rect x="13" y="36" width="7" height="7" fill="#111"/>
    <rect x="20" y="43" width="24" height="7" fill="#111"/>
    <rect x="44" y="36" width="7" height="7" fill="#111"/>
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
    // Valid 32x32 fluid blue file icon PNG
    const w = 32, h = 32;
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (x >= 4 && x < 28 && y >= 2 && y < 30) {
          buf[i] = 255;     // B
          buf[i + 1] = 150; // G
          buf[i + 2] = 25;  // R
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
    title: 'Kora — par Mr Paul',
    icon: getKoraIcon(),
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

  applyScreenshotVisibility();

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    applyScreenshotVisibility();
    setTimeout(() => sendBridgeCommand('TRIM_MEM'), 1200);
  });

  screen.on('display-metrics-changed', positionWindowAtTopCenter);
}

// Persistent C# native bridge (nusa-bridge.exe)
let lastState = {
  battery: { percent: 100, charging: false },
  audio: { volume: 50, muted: false, device: 'Audio Windows' },
  brightness: 80,
  window: { hasActiveApp: false, isMaximized: false, isFullscreen: false },
  capsLock: false,
  mouseDown: false,
  atTopEdge: false,
  inNotchZone: false,
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
let clipboardReady = false;

function getImageSignature(img) {
  if (!img || img.isEmpty()) return '';
  const size = img.getSize();
  if (!size || size.width <= 0 || size.height <= 0) return '';
  const bitmap = img.toBitmap();
  if (!bitmap || bitmap.length === 0) return '';
  const len = bitmap.length;
  const sample =
    len > 200
      ? `${bitmap[0]}_${bitmap[50]}_${bitmap[100]}_${bitmap[Math.floor(len / 3)]}_${bitmap[Math.floor(len / 2)]}_${bitmap[len - 12]}`
      : String(len);
  return `${size.width}x${size.height}_${sample}`;
}

function initClipboardBaseline() {
  try {
    const initialText = (clipboard.readText() || '').trim();
    lastClipText = initialText;
    // If clipboard store is empty and user already has text on their clipboard, add it silently
    if (initialText && appStore.clipboard.length === 0) {
      appStore.clipboard.unshift({
        id: Date.now().toString(),
        kind: detectTextKind(initialText),
        text: initialText.slice(0, 2000),
        preview: initialText.replace(/\s+/g, ' ').slice(0, 90),
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        pinned: false
      });
      saveStore();
    }
    const formats = clipboard.availableFormats();
    if (formats.some(f => f.toLowerCase().includes('image') || f.toLowerCase().includes('bitmap'))) {
      lastClipImgSig = getImageSignature(clipboard.readImage());
    }
  } catch (e) {}
  clipboardReady = true;
}

function checkClipboardNow() {
  if (!clipboardReady || !mainWindow || mainWindow.isDestroyed()) return;
  try {
    // 1. Always check text first (Ctrl+C text, links, hex colors, code)
    const rawText = clipboard.readText() || '';
    const text = rawText.trim();
    if (text && text !== lastClipText) {
      lastClipText = text;
      addClipboardItem(
        {
          id: Date.now().toString() + '_' + Math.random().toString(36).slice(2, 5),
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

    // 2. Check if an image / screenshot was copied (Win+Shift+S, PrtScn, Copy Image)
    const formats = clipboard.availableFormats();
    if (formats.some(f => f.toLowerCase().includes('image') || f.toLowerCase().includes('bitmap'))) {
      const img = clipboard.readImage();
      const sig = getImageSignature(img);
      if (sig && sig !== lastClipImgSig) {
        lastClipImgSig = sig;
        const size = img.getSize();
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

        addClipboardItem(
          {
            id: Date.now().toString() + '_img',
            kind: 'image',
            text: `Capture (${size.width}×${size.height})`,
            preview: `Capture ${size.width}×${size.height} → Fichiers`,
            dataUrl: thumbDataUrl,
            filePath,
            time: timeStr,
            pinned: false
          },
          true
        );
      }
    }
  } catch (e) {}
}

function triggerClipboardCheckWithRetry() {
  checkClipboardNow();
  setTimeout(checkClipboardNow, 80);
  setTimeout(checkClipboardNow, 260);
}

// ==================== WINDOWS NOTIFICATION INTERCEPTOR ====================
// Monitors Windows Notification database (%LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db-wal & .db)
// while NusaBridge.cs suppresses the huge Windows bottom-right toast popup.
let seenNotifHashes = new Set();
let notifBaselineDone = false;

function decodeXmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function detectNotifApp(xmlBlock, title, body) {
  const combined = `${xmlBlock} ${title} ${body}`.toLowerCase();
  if (combined.includes('whatsapp')) return 'whatsapp';
  if (combined.includes('telegram')) return 'telegram';
  if (combined.includes('discord')) return 'discord';
  if (combined.includes('outlook') || combined.includes('mail') || combined.includes('gmail') || combined.includes('courrier')) return 'mail';
  if (combined.includes('chrome') || combined.includes('edge') || combined.includes('firefox') || combined.includes('brave')) return 'browser';
  if (combined.includes('spotify') || combined.includes('music') || combined.includes('itunes')) return 'music';
  if (combined.includes('teams') || combined.includes('slack') || combined.includes('zoom')) return 'chat';
  return 'system';
}

function scanWindowsNotifications() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const notifDir = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Notifications');
    const walPath = path.join(notifDir, 'wpndatabase.db-wal');
    const dbPath = path.join(notifDir, 'wpndatabase.db');

    let rawContent = '';
    if (fs.existsSync(walPath)) {
      const stat = fs.statSync(walPath);
      if (stat.size > 0 && stat.size < 8 * 1024 * 1024) {
        rawContent += fs.readFileSync(walPath, 'utf8');
      }
    }
    if (!notifBaselineDone && fs.existsSync(dbPath)) {
      const stat = fs.statSync(dbPath);
      if (stat.size > 0 && stat.size < 8 * 1024 * 1024) {
        rawContent += '\n' + fs.readFileSync(dbPath, 'utf8');
      }
    }

    if (!rawContent) {
      notifBaselineDone = true;
      return;
    }

    const toastRegex = /<toast[\s\S]*?<\/toast>/gi;
    let match;
    let newestNotif = null;

    while ((match = toastRegex.exec(rawContent)) !== null) {
      const xml = match[0];
      const textMatches = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)];
      if (textMatches.length === 0) continue;

      const texts = textMatches
        .map(m => decodeXmlEntities(m[1]))
        .filter(Boolean);
      if (texts.length === 0) continue;

      const title = texts[0] || 'Notification';
      const body = texts.slice(1).join(' — ') || title;
      const sig = `${title}|${body.slice(0, 60)}`;

      if (!seenNotifHashes.has(sig)) {
        seenNotifHashes.add(sig);
        if (notifBaselineDone) {
          const appKind = detectNotifApp(xml, title, body);
          newestNotif = {
            app: appKind,
            title: title.length > 20 ? title.slice(0, 19) + '…' : title,
            snippet: body.length > 34 ? body.slice(0, 33) + '…' : body
          };
        }
      }
    }

    notifBaselineDone = true;

    if (newestNotif && appStore.settings.peekEnabled) {
      mainWindow.webContents.send('peek-event', {
        type: 'notif',
        app: newestNotif.app,
        title: newestNotif.title,
        snippet: newestNotif.snippet
      });
    }
  } catch (e) {
    notifBaselineDone = true;
  }
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('store-updated', appStore);
  }

  if (!suppressNextClipPeek && appStore.settings.peekEnabled && mainWindow && !mainWindow.isDestroyed()) {
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

  ipcMain.handle('get-store', () => {
    checkClipboardNow();
    return appStore;
  });

  ipcMain.on('settings-update', (_event, partialSettings) => {
    appStore.settings = { ...appStore.settings, ...partialSettings };
    if (typeof partialSettings.autoStart === 'boolean') {
      try {
        app.setLoginItemSettings({ openAtLogin: partialSettings.autoStart });
      } catch (e) {}
    }
    if (
      typeof partialSettings.showInScreenshots === 'boolean' ||
      typeof partialSettings.hideInScreenshots === 'boolean' ||
      typeof partialSettings.screenshotProtect === 'boolean'
    ) {
      if (typeof partialSettings.showInScreenshots !== 'boolean') {
        if (typeof partialSettings.hideInScreenshots === 'boolean') {
          appStore.settings.showInScreenshots = !partialSettings.hideInScreenshots;
        } else if (typeof partialSettings.screenshotProtect === 'boolean') {
          appStore.settings.showInScreenshots = !partialSettings.screenshotProtect;
        }
      }
      applyScreenshotVisibility();
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
      lastClipImgSig = getImageSignature(img);
      clipboard.writeImage(img);
    } else {
      lastClipText = (item.text || '').trim();
      clipboard.writeText(item.text || '');
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

  // Native OS Drag OUT of Kora Notch into any Windows application
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

  ipcMain.on('open-external-url', (_event, url) => {
    if (url && typeof url === 'string' && (url.startsWith('https://') || url.startsWith('mailto:'))) {
      shell.openExternal(url);
    }
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function isNewerVersion(remoteVer, localVer) {
  const r = String(remoteVer || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  const l = String(localVer || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

function fetchHttpsBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'KoraAutoUpdater/2.0', 'Cache-Control': 'no-cache' }, timeout: 8000 }, res => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode));
        }
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject)
      .on('timeout', function () {
        this.destroy();
        reject(new Error('timeout'));
      });
  });
}

let updateCheckInProgress = false;
async function checkForGitHubUpdates(isManual = false) {
  if (updateCheckInProgress) return;
  updateCheckInProgress = true;
  const baseUrl = 'https://raw.githubusercontent.com/botooooh/Kora/main';
  try {
    const localPkgPath = path.join(__dirname, 'package.json');
    const localPkg = fs.existsSync(localPkgPath)
      ? JSON.parse(fs.readFileSync(localPkgPath, 'utf8'))
      : { version: '2.0.0' };
    const remoteBuf = await fetchHttpsBuffer(`${baseUrl}/package.json?t=${Date.now()}`);
    const remotePkg = JSON.parse(remoteBuf.toString('utf8'));

    if (remotePkg && remotePkg.version && isNewerVersion(remotePkg.version, localPkg.version)) {
      const filesToUpdate = ['index.html', 'styles.css', 'renderer.js', 'preload.js', 'main.js', 'package.json'];
      for (const file of filesToUpdate) {
        const buf = await fetchHttpsBuffer(`${baseUrl}/${file}?t=${Date.now()}`);
        fs.writeFileSync(path.join(__dirname, file), buf);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('peek-event', {
          type: 'notif',
          app: 'system',
          title: `Kora v${remotePkg.version}`,
          snippet: 'Mise à jour installée avec succès !'
        });
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.reloadIgnoringCache();
          }
        }, 2200);
      }
    } else if (isManual && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('peek-event', {
        type: 'notif',
        app: 'system',
        title: `Kora v${localPkg.version}`,
        snippet: 'Vous avez déjà la dernière version ✓'
      });
    }
  } catch (e) {
    if (isManual && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('peek-event', {
        type: 'notif',
        app: 'system',
        title: 'Mise à jour Kora',
        snippet: 'Vérification hors-ligne ou déjà à jour'
      });
    }
  } finally {
    updateCheckInProgress = false;
  }
}

function createTray() {
  tray = new Tray(getKoraIcon());
  tray.setToolTip('Kora — par Mr Paul');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Kora v2.0 — créé par Mr Paul',
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
      label: '⚙️ Ouvrir Paramètres & Contacts',
      click: () => mainWindow && mainWindow.webContents.send('switch-tab', 'settings')
    },
    { type: 'separator' },
    {
      label: '🔄 Vérifier les mises à jour (GitHub)',
      click: () => checkForGitHubUpdates(true)
    },
    {
      label: '📢 Rejoindre la Communauté WhatsApp (Mr Paul)',
      click: () => shell.openExternal('https://whatsapp.com/channel/0029Vb6avN0InlqWut6HV70k')
    },
    {
      label: '💬 WhatsApp Direct : +225 01 51 19 10 73',
      click: () => shell.openExternal('https://wa.me/2250151191073')
    },
    {
      label: '✉️ Email : ivannguessan09@gmail.com',
      click: () => shell.openExternal('mailto:ivannguessan09@gmail.com')
    },
    { type: 'separator' },
    {
      label: '🗑️ Désinstaller Kora',
      click: async () => {
        const res = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['Annuler', 'Désinstaller Kora'],
          defaultId: 0,
          cancelId: 0,
          title: 'Désinstaller Kora',
          message: 'Voulez-vous vraiment désinstaller Kora de cet ordinateur ?',
          detail: 'Cela supprimera les raccourcis (Bureau, Menu Démarrer), le lancement automatique et les fichiers de Kora.'
        });
        if (res.response === 1) {
          const candidates = [
            path.join(__dirname, 'uninstall.ps1'),
            path.join(__dirname, 'website', 'uninstall.ps1')
          ];
          const scriptPath = candidates.find(p => fs.existsSync(p));
          if (scriptPath) {
            spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
              detached: true,
              stdio: 'ignore'
            }).unref();
          }
          app.isQuitting = true;
          app.quit();
        }
      }
    },
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
}

app.whenReady().then(() => {
  loadStore();
  initClipboardBaseline();
  setupIpc();
  createWindow();
  createTray();
  registerShortcuts();
  startWindowsBridge();

  // Direct lightweight clipboard watcher (guarantees Ctrl+C text/images are never missed)
  setInterval(checkClipboardNow, 380);

  // Direct Windows notification interceptor (compact notification inside Kora)
  scanWindowsNotifications();
  setInterval(scanWindowsNotifications, 650);

  // Automatic OTA update check on startup (after 6s) and every 3 hours
  setTimeout(() => checkForGitHubUpdates(false), 6000);
  setInterval(() => checkForGitHubUpdates(false), 3 * 60 * 60 * 1000);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (bridgeProc && !bridgeProc.killed) {
    bridgeProc.kill();
  }
});
