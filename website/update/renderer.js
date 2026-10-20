const mnHolder = document.getElementById('mnHolder');
const mn = document.getElementById('mn');
const pinBtn = document.getElementById('pinBtn');

const DEFAULT_TAB_IDS = ['music', 'clipboard', 'shelf', 'todo'];
let activeTabs = ['music', 'clipboard', 'shelf', 'todo'];
let activeTab = 'music';
let isExpanded = false;
let isPinned = false;
let isPeekActive = false;
let isDraggingOut = false;
let dragOutTimer = null;
let openTimer = null;
let closeTimer = null;
let peekTimer = null;

let currentState = {
  battery: { percent: 85, charging: false },
  audio: { volume: 50, muted: false, brightness: 80, device: 'Audio Windows' },
  window: { hasActiveApp: false, isMaximized: false, isFullscreen: false },
  inNotchZone: false,
  mouseDown: false,
  media: null
};

let store = {
  settings: {
    scale: 1.0,
    openDelay: 100,
    closeDelay: 320,
    retractMode: 'app',
    hideInFullscreen: true,
    showInScreenshots: false,
    retractedLip: 4,
    restingStyle: 'auto',
    musicCompactStyle: 'cover',
    peekEnabled: true,
    peekDuration: 2200,
    autoStart: false
  },
  todos: [],
  shelf: [],
  clipboard: []
};

// Lyrics state
let currentTrackKey = '';
let currentLyrics = [];

// Shared WebAudio synthesizer for gentle UI chimes (zero memory leak)
let sharedAudioCtx = null;
function playChime(type = 'soft') {
  try {
    if (!sharedAudioCtx) {
      sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }
    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(sharedAudioCtx.destination);

    const now = sharedAudioCtx.currentTime;
    if (type === 'done') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.14);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.start(now);
      osc.stop(now + 0.55);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    }
  } catch (e) {}
}

// ==================== RETRACTION, HOVER & CLICK-THROUGH ====================
let mouseInsideNotch = false;

function shouldRetractWhenClosed() {
  const mode = (store.settings && store.settings.retractMode) || 'app';
  if (mode === 'always') return false; // "Toujours visible sur le bureau"
  if (mode === 'never') return false;
  const win = currentState.window || {};
  return Boolean(win.hasActiveApp || win.isMaximized || win.isFullscreen);
}

function updateVisibilityAndRetraction() {
  const win = currentState.window || {};
  const hideFsSetting = store.settings ? store.settings.hideInFullscreen !== false : true;

  // 1. True Fullscreen (vidéos YouTube F11, VLC plein écran, jeux vidéo)
  // Se masque totalement si l'application est en vrai plein écran
  const shouldHideFullscreen = Boolean(win.isFullscreen && hideFsSetting);

  mn.dataset.fullscreenHidden = shouldHideFullscreen ? 'true' : 'false';
  if (shouldHideFullscreen) {
    if (isExpanded && !isPinned) {
      isExpanded = false;
      mn.dataset.s = getRestingState();
    }
    window.nusa.setIgnoreMouse(true);
    return;
  }

  // 2. Rétractation automatique : se replie / réduit dans la bordure supérieure si Chrome ou une fenêtre est active
  if (isExpanded || isPeekActive || isPinned) {
    mn.dataset.retracted = 'false';
  } else {
    const retract = shouldRetractWhenClosed();
    mn.dataset.retracted = retract ? 'true' : 'false';
    if (retract && !mouseInsideNotch) {
      window.nusa.setIgnoreMouse(true);
    }
  }
}

function blurSettingsControls() {
  const activeEl = document.activeElement;
  if (activeEl && activeEl !== document.body) {
    try {
      activeEl.blur();
    } catch (e) {}
  }
}

function handleMouseLeaveZone() {
  if (!mouseInsideNotch && !isExpanded) return;
  mouseInsideNotch = false;
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }
  blurSettingsControls();
  window.nusa.setIgnoreMouse(true);
  if (!isPinned && !isDraggingOut) {
    scheduleClose();
  }
}

// Triggered by main.js cursor watcher when user pushes cursor to very top edge (y <= 6px)
window.nusa.onTopEdgeHover(({ active }) => {
  if (!active) return;
  if (mn.dataset.fullscreenHidden === 'true') return;

  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  mn.dataset.retracted = 'false';
  mouseInsideNotch = true;
  window.nusa.setIgnoreMouse(false);

  const delay = Number(store.settings?.openDelay ?? 100);
  if (openTimer) clearTimeout(openTimer);
  openTimer = setTimeout(() => {
    if (mouseInsideNotch) {
      openNotch(activeTab);
    }
  }, delay);
});

window.addEventListener('mousemove', e => {
  if (mn.dataset.fullscreenHidden === 'true') {
    window.nusa.setIgnoreMouse(true);
    return;
  }

  const rect = mn.getBoundingClientRect();
  const isRetracted = mn.dataset.retracted === 'true';

  let inside = false;
  const lip = Number(store.settings?.retractedLip ?? 4);
  if (isRetracted && !isExpanded) {
    inside =
      e.clientY <= Math.max(8, lip + 3) &&
      e.clientX >= rect.left - 16 &&
      e.clientX <= rect.right + 16;
  } else {
    inside =
      e.clientX >= rect.left - 12 &&
      e.clientX <= rect.right + 12 &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom + 14;
  }

  if (inside !== mouseInsideNotch) {
    mouseInsideNotch = inside;
    window.nusa.setIgnoreMouse(!inside);

    if (inside) {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      mn.dataset.retracted = 'false';
      const delay = Number(store.settings?.openDelay ?? 100);
      if (openTimer) clearTimeout(openTimer);
      openTimer = setTimeout(() => {
        if (mouseInsideNotch) {
          if (mn.dataset.s === 'clip-peek') activeTab = 'clipboard';
          else if (mn.dataset.s === 'screenshot') activeTab = 'shelf';
          else if (currentState.media && currentState.media.status === 'Playing') activeTab = 'music';
          openNotch(activeTab);
        }
      }, delay);
    } else {
      handleMouseLeaveZone();
    }
  }

  // Subtle mascot eye tracking when visible in pet mode
  if (!isExpanded && mn.dataset.s === 'pet' && mn.dataset.retracted === 'false') {
    const dx = Math.max(-3.5, Math.min(3.5, (e.clientX - window.innerWidth / 2) / 55));
    const dy = Math.max(-2, Math.min(2.5, e.clientY / 50));
    const eyes = document.getElementById('mascotEyes');
    if (eyes) {
      eyes.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    }
  }
});

// Also handle mouse leaving the Notch element or window directly (including from Settings)
mn.addEventListener('mouseleave', () => {
  handleMouseLeaveZone();
});

window.addEventListener('mouseleave', () => {
  handleMouseLeaveZone();
});

function scheduleClose(customDelay) {
  if (closeTimer) clearTimeout(closeTimer);
  const delay = customDelay ?? Number(store.settings?.closeDelay ?? 320);
  closeTimer = setTimeout(() => {
    if (!mouseInsideNotch && !isPinned && !isDraggingOut) {
      closeNotch();
    }
  }, delay);
}

function getRestingState() {
  const style = (store.settings && store.settings.restingStyle) || 'auto';
  if (style === 'mascot') return 'pet';
  if (style === 'clock') return 'idle';
  const isPlaying =
    currentState.media && currentState.media.status === 'Playing';
  return isPlaying ? 'idle' : 'pet';
}

function openNotch(tab = activeTab) {
  if (tab === 'settings') {
    window.nusa.openSettingsWindow();
    closeNotch();
    return;
  }
  if (peekTimer) {
    clearTimeout(peekTimer);
    peekTimer = null;
  }
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  isPeekActive = false;
  isExpanded = true;
  if (tab && activeTabs.includes(tab)) {
    activeTab = tab;
  }
  mn.dataset.retracted = 'false';
  mn.dataset.s = activeTab;
  window.nusa.setIgnoreMouse(false);
  updateNavUI();

  if (activeTab === 'clipboard') {
    window.nusa.getStore().then(latest => {
      store = latest;
      renderClipboard();
    });
  }
}

function closeNotch() {
  isExpanded = false;
  isPeekActive = false;
  blurSettingsControls();
  mn.dataset.s = getRestingState();
  updateVisibilityAndRetraction();
}

function updateNavUI() {
  const effectiveTab = mn.dataset.s === 'lyrics' ? 'music' : activeTab;
  document.querySelectorAll('#hdrTabs .hdr-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === effectiveTab);
  });
  document.querySelectorAll('#pageDots button').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.tab === effectiveTab);
  });
}

// Header tab clicks & page dots
document.querySelectorAll('#hdrTabs .hdr-tab').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (btn.dataset.tab === 'settings') {
      window.nusa.openSettingsWindow();
      closeNotch();
      return;
    }
    openNotch(btn.dataset.tab);
  });
});

document.querySelectorAll('#pageDots button').forEach(dot => {
  dot.addEventListener('click', e => {
    e.stopPropagation();
    if (dot.dataset.tab === 'settings') {
      window.nusa.openSettingsWindow();
      closeNotch();
      return;
    }
    openNotch(dot.dataset.tab);
  });
});

// Left / Right page arrows
document.querySelectorAll('.js-prev-page').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const idx = activeTabs.indexOf(activeTab);
    const prev = activeTabs[(idx - 1 + activeTabs.length) % activeTabs.length];
    openNotch(prev);
  });
});

document.querySelectorAll('.js-next-page').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const idx = activeTabs.indexOf(activeTab);
    const next = activeTabs[(idx + 1) % activeTabs.length];
    openNotch(next);
  });
});

// Pin button
pinBtn.addEventListener('click', e => {
  e.stopPropagation();
  isPinned = !isPinned;
  pinBtn.classList.toggle('pinned', isPinned);
});

// ==================== CLOCK & REMINDERS ====================
function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${mm}`;
  document.querySelectorAll('.js-time').forEach(el => {
    el.textContent = timeStr;
  });

  if (store.todos && store.todos.length > 0) {
    store.todos.forEach(t => {
      if (!t.done && t.time === timeStr && !t._notifiedToday) {
        t._notifiedToday = true;
        playChime('done');
        openNotch('todo');
      }
    });
  }

  const msUntilNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50;
  setTimeout(updateClock, msUntilNextMinute);
}
updateClock();

// ==================== SYSTEM STATE (MEDIA, VOLUME, BRIGHTNESS, BATTERY, WINDOW, ZONE) ====================
function formatSec(sec) {
  if (!sec || sec < 0 || !isFinite(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

window.nusa.onSystemState(state => {
  currentState = state;

  // 1. Guarantee retraction when mouse leaves activation zone across OS (even in Settings!)
  if (state.inNotchZone === false && !state.mouseDown) {
    if (mouseInsideNotch || (isExpanded && !isPinned && !isDraggingOut)) {
      mouseInsideNotch = false;
      blurSettingsControls();
      window.nusa.setIgnoreMouse(true);
      if (!closeTimer && isExpanded && !isPinned && !isDraggingOut) {
        scheduleClose();
      }
    }
  }

  // 2. Update window fullscreen & auto-retract state
  updateVisibilityAndRetraction();

  // 3. Battery Ring
  if (state.battery) {
    const pct = Math.max(5, Math.min(100, state.battery.percent || 100));
    document.getElementById('idleRing').style.setProperty('--p', pct + '%');
    document.getElementById('hdrRing').style.setProperty('--p', pct + '%');
    document.getElementById('hdrRing').title = `Batterie : ${pct}%${
      state.battery.charging ? ' (En charge)' : ''
    }`;
  }

  // 4. Media Player (Apple Music, Spotify, YouTube, etc.)
  const m = state.media;
  const isPlaying = m && m.status === 'Playing';

  const compactMusicStyle = store.settings?.musicCompactStyle || 'cover';
  const idleEl = document.getElementById('idleLayer');
  if (idleEl) {
    idleEl.dataset.mode = (isPlaying && compactMusicStyle === 'cover') ? 'music' : 'clock';
  }

  document.getElementById('idleBars').classList.toggle('paused', !isPlaying);
  const idleMusicBars = document.getElementById('idleMusicBars');
  if (idleMusicBars) idleMusicBars.classList.toggle('paused', !isPlaying);
  document.getElementById('musicBars').classList.toggle('paused', !isPlaying);

  const playPath = '<path d="M7 4.5v15l12-7.5z"/>';
  const pausePath = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';
  document.getElementById('iconPlayPause').innerHTML = isPlaying ? pausePath : playPath;
  document.getElementById('lyrIconPlayPause').innerHTML = isPlaying ? pausePath : playPath;

  if (m && m.title) {
    document.getElementById('musicTitle').textContent = m.title;
    document.getElementById('musicArtist').textContent =
      [m.artist, m.album].filter(Boolean).join(' · ') || 'Apple Music / Média';
    document.getElementById('lyrTitle').textContent = m.title;
    document.getElementById('lyrArtist').textContent = m.artist || 'Média';

    const artEl = document.getElementById('musicArt');
    const lyrArtEl = document.getElementById('lyrArt');
    const idleArtEl = document.getElementById('idleArt');
    if (m.thumbnail) {
      artEl.style.backgroundImage = `url("${m.thumbnail}")`;
      lyrArtEl.style.backgroundImage = `url("${m.thumbnail}")`;
      if (idleArtEl) idleArtEl.style.backgroundImage = `url("${m.thumbnail}")`;
    } else {
      artEl.style.backgroundImage = '';
      lyrArtEl.style.backgroundImage = '';
      if (idleArtEl) idleArtEl.style.backgroundImage = '';
    }

    const pos = m.position || 0;
    const dur = m.duration || 0;
    const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
    document.getElementById('musicPos').textContent = formatSec(pos);
    document.getElementById('musicDur').textContent =
      dur > 0 ? '-' + formatSec(Math.max(0, dur - pos)) : '00:00';
    document.getElementById('musicProgBar').style.width = pct + '%';

    document.getElementById('lyrPos').textContent = formatSec(pos);
    document.getElementById('lyrDur').textContent =
      dur > 0 ? '-' + formatSec(Math.max(0, dur - pos)) : '00:00';
    document.getElementById('lyrProgBar').style.width = pct + '%';

    const key = `${m.title}|${m.artist}`;
    if (key !== currentTrackKey) {
      currentTrackKey = key;
      loadSyncedLyrics(m.title, m.artist);
    }
    updateActiveLyricLine(pos);
  }

  if (!isExpanded && !isPeekActive && (mn.dataset.s === 'pet' || mn.dataset.s === 'idle')) {
    mn.dataset.s = getRestingState();
  }
});

// Media controls
document.getElementById('btnPlayPause').addEventListener('click', () => window.nusa.sendMediaCmd('PLAY_PAUSE'));
document.getElementById('btnPrev').addEventListener('click', () => window.nusa.sendMediaCmd('PREV'));
document.getElementById('btnNext').addEventListener('click', () => window.nusa.sendMediaCmd('NEXT'));
document.getElementById('btnMute').addEventListener('click', () => window.nusa.sendMediaCmd('VOL_MUTE_TOGGLE'));

document.getElementById('lyrPlayPause').addEventListener('click', () => window.nusa.sendMediaCmd('PLAY_PAUSE'));
document.getElementById('lyrPrev').addEventListener('click', () => window.nusa.sendMediaCmd('PREV'));
document.getElementById('lyrNext').addEventListener('click', () => window.nusa.sendMediaCmd('NEXT'));

document.getElementById('openLyricsBtn').addEventListener('click', () => {
  mn.dataset.s = 'lyrics';
});
document.getElementById('closeLyricsBtn').addEventListener('click', () => {
  mn.dataset.s = 'music';
});

function handleSeekClick(e, wrapEl) {
  if (!currentState.media || !currentState.media.duration) return;
  const rect = wrapEl.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const targetSec = Math.round(ratio * currentState.media.duration);
  window.nusa.sendMediaCmd(`SEEK:${targetSec}`);
}
document.getElementById('musicSeekWrap').addEventListener('click', e =>
  handleSeekClick(e, document.getElementById('musicSeekWrap'))
);
document.getElementById('lyrSeekWrap').addEventListener('click', e =>
  handleSeekClick(e, document.getElementById('lyrSeekWrap'))
);

// Scroll wheel over music or volume to adjust Windows volume, or over brightness to adjust brightness
mn.addEventListener('wheel', e => {
  if (mn.dataset.s === 'music' || mn.dataset.s === 'volume' || mn.dataset.s === 'idle') {
    e.preventDefault();
    const curVol =
      currentState.audio && currentState.audio.volume >= 0
        ? currentState.audio.volume
        : 50;
    const step = e.deltaY < 0 ? 4 : -4;
    const nextVol = Math.max(0, Math.min(100, curVol + step));
    window.nusa.sendMediaCmd(`VOL_SET:${nextVol}`);
  } else if (mn.dataset.s === 'brightness') {
    e.preventDefault();
    const curBrt =
      typeof currentState.brightness === 'number'
        ? currentState.brightness
        : 80;
    const step = e.deltaY < 0 ? 5 : -5;
    const nextBrt = Math.max(0, Math.min(100, curBrt + step));
    window.nusa.sendMediaCmd(`BRT_SET:${nextBrt}`);
  }
});

// Synced Lyrics logic
async function loadSyncedLyrics(title, artist) {
  const listEl = document.getElementById('lyrList');
  listEl.innerHTML = '<li class="on">Recherche des paroles synchronisées…</li>';
  const lines = await window.nusa.fetchLyrics(title, artist);
  currentLyrics = lines || [];
  if (currentLyrics.length === 0) {
    listEl.innerHTML = `<li class="on">${escapeHtml(title)}</li><li>${escapeHtml(
      artist || 'Aucune parole synchronisée trouvée'
    )}</li><li>Profitez de votre musique</li>`;
    return;
  }
  listEl.innerHTML = '';
  currentLyrics.forEach((line, idx) => {
    const li = document.createElement('li');
    li.textContent = line.text;
    if (idx === 0) li.classList.add('on');
    li.addEventListener('click', () => {
      window.nusa.sendMediaCmd(`SEEK:${Math.floor(line.time)}`);
    });
    listEl.appendChild(li);
  });
}

function updateActiveLyricLine(posSec) {
  if (!currentLyrics || currentLyrics.length === 0) return;
  let activeIdx = 0;
  for (let i = 0; i < currentLyrics.length; i++) {
    if (posSec >= currentLyrics[i].time) {
      activeIdx = i;
    } else {
      break;
    }
  }
  const listEl = document.getElementById('lyrList');
  const items = listEl.querySelectorAll('li');
  items.forEach((li, idx) => {
    const isCurrent = idx === activeIdx;
    if (isCurrent && !li.classList.contains('on')) {
      li.classList.add('on');
      li.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (!isCurrent && li.classList.contains('on')) {
      li.classList.remove('on');
    }
  });
}

// ==================== STORE: SETTINGS, CLIPBOARD, SHELF, TODO ====================
window.nusa.getStore().then(initialStore => {
  store = initialStore;
  applySettingsToDOM();
  renderAllStoreViews();
});

window.nusa.onStoreUpdated(newStore => {
  store = newStore;
  applySettingsToDOM();
  renderAllStoreViews();
});

function renderAllStoreViews() {
  renderClipboard();
  renderShelf();
  renderTodos();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==================== THEME, SETTINGS & DYNAMIC TABS SYNC ====================
function applyAccentColor(hex, rgb) {
  if (!hex) return;
  const root = document.documentElement;
  root.style.setProperty('--cyan', hex);

  const r = parseInt(hex.slice(1, 3), 16) || 25;
  const g = parseInt(hex.slice(3, 5), 16) || 184;
  const b = parseInt(hex.slice(5, 7), 16) || 255;
  const rgbStr = rgb || `${r}, ${g}, ${b}`;

  const skyHex = `rgb(${Math.min(255, r + 55)}, ${Math.min(255, g + 45)}, ${Math.min(255, b + 25)})`;
  const blueHex = `rgb(${Math.max(0, r - 45)}, ${Math.max(0, g - 45)}, ${Math.max(0, b - 35)})`;

  root.style.setProperty('--sky', skyHex);
  root.style.setProperty('--blue', blueHex);
  root.style.setProperty('--accent-rgb', rgbStr);
  root.style.setProperty('--glow', `linear-gradient(90deg, ${blueHex}, ${hex} 55%, ${skyHex})`);
}

function syncTabsFromStore(tabConfigs) {
  if (Array.isArray(tabConfigs) && tabConfigs.length > 0) {
    const enabled = tabConfigs.filter(t => t.enabled !== false).map(t => t.id);
    activeTabs = enabled.length > 0 ? enabled : [...DEFAULT_TAB_IDS];
  } else {
    activeTabs = [...DEFAULT_TAB_IDS];
  }

  // Update DOM order & visibility in #hdrTabs and #pageDots
  const hdrContainer = document.getElementById('hdrTabs');
  const dotsContainer = document.getElementById('pageDots');

  if (hdrContainer) {
    const tabBtns = Array.from(hdrContainer.querySelectorAll('.hdr-tab'));
    const btnMap = new Map();
    tabBtns.forEach(btn => btnMap.set(btn.dataset.tab, btn));

    tabBtns.forEach(btn => {
      btn.style.display = activeTabs.includes(btn.dataset.tab) ? '' : 'none';
    });

    activeTabs.forEach(id => {
      const btn = btnMap.get(id);
      if (btn) hdrContainer.appendChild(btn);
    });
  }

  if (dotsContainer) {
    const dotBtns = Array.from(dotsContainer.querySelectorAll('button'));
    const dotMap = new Map();
    dotBtns.forEach(dot => dotMap.set(dot.dataset.tab, dot));

    dotBtns.forEach(dot => {
      dot.style.display = activeTabs.includes(dot.dataset.tab) ? '' : 'none';
    });

    activeTabs.forEach(id => {
      const dot = dotMap.get(id);
      if (dot) dotsContainer.appendChild(dot);
    });
  }

  if (!activeTabs.includes(activeTab)) {
    activeTab = activeTabs[0] || 'music';
    if (isExpanded) {
      openNotch(activeTab);
    }
  }
}

function applySettingsToDOM() {
  const s = store.settings || {};
  if (s.activeAccentHex) {
    applyAccentColor(s.activeAccentHex, s.activeAccentRgb);
  }
  const scale = Number(s.scale || 1.0);
  const lip = Number(s.retractedLip ?? 4);

  document.documentElement.style.setProperty('--scale', String(scale));
  document.documentElement.style.setProperty('--lip', `${lip}px`);

  if (s.tabs) {
    syncTabsFromStore(s.tabs);
  }

  if (currentState) {
    const isPlaying = currentState.media && currentState.media.status === 'Playing';
    const idleEl = document.getElementById('idleLayer');
    if (idleEl) {
      idleEl.dataset.mode = (isPlaying && s.musicCompactStyle === 'cover') ? 'music' : 'clock';
    }
  }

  updateVisibilityAndRetraction();
}

const idleMusicView = document.getElementById('idleMusicView');
if (idleMusicView) {
  idleMusicView.addEventListener('click', (e) => {
    e.stopPropagation();
    openNotch('music');
  });
}

document.querySelectorAll('.js-ext-link').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const url = btn.dataset.url;
    if (url && window.nusa.openExternal) {
      window.nusa.openExternal(url);
    }
  });
});

// ==================== 1. PRESSE-PAPIERS (CLIPBOARD) ====================
const clipSearchInput = document.getElementById('clipSearch');
clipSearchInput.addEventListener('input', () => renderClipboard());
document.getElementById('clipClearBtn').addEventListener('click', () => {
  window.nusa.clearClipboard();
});

function renderClipboard() {
  const container = document.getElementById('clipList');
  if (!container) return;
  const query = (clipSearchInput.value || '').toLowerCase().trim();
  const items = (store.clipboard || []).filter(
    item => !query || (item.text && item.text.toLowerCase().includes(query))
  );

  if (items.length === 0) {
    container.innerHTML = `
      <div class="dim" style="text-align:center;margin-top:18px;font-size:11.5px">
        Copiez n'importe quel texte, lien ou image (<b>Ctrl+C</b>) :<br>il apparaîtra automatiquement ici !
      </div>`;
    return;
  }

  container.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'clip-item';
    row.title = 'Cliquer pour recopier dans le presse-papiers';

    const badgeLabels = {
      text: 'TXT',
      link: 'LIEN',
      code: 'CODE',
      color: 'HEX',
      image: 'IMG'
    };

    const thumbHtml =
      item.kind === 'image' && item.dataUrl
        ? `<img class="clip-thumb" src="${item.dataUrl}" alt="img">`
        : item.kind === 'color'
        ? `<span style="width:14px;height:14px;border-radius:4px;background:${escapeHtml(
            item.text
          )};border:1px solid rgba(255,255,255,.4);flex-shrink:0"></span>`
        : '';

    row.innerHTML = `
      <span class="clip-badge ${item.kind || 'text'}">${badgeLabels[item.kind] || 'TXT'}</span>
      ${thumbHtml}
      <span class="clip-text">${escapeHtml(item.preview || item.text)}</span>
      <span class="clip-time">${escapeHtml(item.time || '')}</span>
      <div class="clip-actions">
        <button class="clip-act ${item.pinned ? 'pinned' : ''}" data-act="pin" title="Épingler">
          <svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor"><path d="M16 3H8v2l2 2v5l-3 3v2h4v5l1 1 1-1v-5h4v-2l-3-3V7l2-2V3z"/></svg>
        </button>
        <button class="clip-act" data-act="del" title="Supprimer">×</button>
      </div>
    `;

    row.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (btn) {
        e.stopPropagation();
        if (btn.dataset.act === 'pin') window.nusa.pinClipboardItem(item.id);
        if (btn.dataset.act === 'del') window.nusa.deleteClipboardItem(item.id);
        return;
      }
      window.nusa.copyClipboardItem(item.id);
      playChime('soft');
      row.classList.add('copied');
      const txtEl = row.querySelector('.clip-text');
      const orig = txtEl.textContent;
      txtEl.textContent = 'Copié dans le presse-papiers !';
      setTimeout(() => {
        row.classList.remove('copied');
        txtEl.textContent = orig;
      }, 900);
    });

    container.appendChild(row);
  });
}

// ==================== 2. FILE SHELF (ÉTAGÈRE À FICHIERS & OUTGOING DRAG) ====================
const shelfLayer = document.getElementById('shelfLayer');
const shelfClearBtn = document.getElementById('shelfClearBtn');

shelfClearBtn.addEventListener('click', () => {
  window.nusa.clearShelf();
});

function renderShelf() {
  const cardsEl = document.getElementById('shelfCards');
  const files = store.shelf || [];
  const hasFiles = files.length > 0;

  shelfLayer.classList.toggle('has-files', hasFiles);
  shelfClearBtn.style.display = hasFiles ? 'block' : 'none';

  cardsEl.innerHTML = '';
  files.forEach(file => {
    const card = document.createElement('div');
    card.className = 'sh-card';
    card.draggable = true;
    card.title = `${file.name}\n• Glisser hors de Kora : Déposer vers Bureau, WhatsApp, Discord, Mail…\n• Clic gauche : Ouvrir\n• Clic droit : Afficher dans le dossier`;

    let iconHtml = '';
    if (file.thumbDataUrl) {
      iconHtml = `<img src="${file.thumbDataUrl}" alt="">`;
    } else if (file.ext === 'folder') {
      iconHtml = `<svg viewBox="0 0 44 44" width="34" height="34"><path d="M4 11a3 3 0 0 1 3-3h10l4 4h16a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#1982ff"/><path d="M4 16h36v18a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#59bfff"/></svg>`;
    } else {
      iconHtml = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#19b8ff" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    }

    card.innerHTML = `
      <button class="sh-card-rm" title="Retirer">×</button>
      <span class="sh-thumb">${iconHtml}</span>
      <span class="sh-name">${escapeHtml(file.name)}</span>
      <span class="sh-size">${escapeHtml(file.size)}</span>
    `;

    card.querySelector('.sh-card-rm').addEventListener('click', e => {
      e.stopPropagation();
      window.nusa.removeShelfFile(file.id);
    });

    card.addEventListener('click', () => {
      window.nusa.openShelfFile(file.path);
    });

    card.addEventListener('contextmenu', e => {
      e.preventDefault();
      window.nusa.revealShelfFile(file.path);
    });

    // Outgoing native OS Drag & Drop to any external app or folder
    card.addEventListener('dragstart', e => {
      e.preventDefault();
      isDraggingOut = true;
      shelfLayer.classList.remove('drag-over');
      if (dragOutTimer) clearTimeout(dragOutTimer);
      dragOutTimer = setTimeout(() => {
        isDraggingOut = false;
      }, 3500);
      window.nusa.startShelfDrag(file.path);
    });

    card.addEventListener('dragend', () => {
      isDraggingOut = false;
      if (dragOutTimer) clearTimeout(dragOutTimer);
    });

    cardsEl.appendChild(card);
  });
}

// Drag & Drop files INTO Kora
window.addEventListener('dragenter', e => {
  if (isDraggingOut) return;
  e.preventDefault();
  openNotch('shelf');
  shelfLayer.classList.add('drag-over');
});

window.addEventListener('dragover', e => {
  if (isDraggingOut) return;
  e.preventDefault();
  if (mn.dataset.s !== 'shelf') {
    openNotch('shelf');
  }
  shelfLayer.classList.add('drag-over');
});

window.addEventListener('dragleave', e => {
  if (e.relatedTarget === null) {
    shelfLayer.classList.remove('drag-over');
  }
});

window.addEventListener('drop', e => {
  if (isDraggingOut) {
    isDraggingOut = false;
    shelfLayer.classList.remove('drag-over');
    return;
  }
  e.preventDefault();
  shelfLayer.classList.remove('drag-over');
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const paths = [];
    for (const file of e.dataTransfer.files) {
      const fp = window.nusa.getFilePath(file);
      if (fp) paths.push(fp);
    }
    if (paths.length > 0) {
      playChime('soft');
      window.nusa.addShelfFiles(paths);
      openNotch('shelf');
    }
  }
});

window.nusa.onOsDragNear(({ near }) => {
  if (isDraggingOut) return;
  if (near && !isExpanded && mn.dataset.fullscreenHidden !== 'true') {
    openNotch('shelf');
    shelfLayer.classList.add('drag-over');
  } else if (!near) {
    shelfLayer.classList.remove('drag-over');
  }
});

// ==================== 3. TO-DO LIST ====================
document.getElementById('todoForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = document.getElementById('todoInput');
  const timeInput = document.getElementById('todoTime');
  if (!input.value.trim()) return;
  window.nusa.addTodo(input.value.trim(), timeInput.value);
  input.value = '';
  timeInput.value = '';
  playChime('soft');
});

function renderTodos() {
  const todos = store.todos || [];
  const doneCount = todos.filter(t => t.done).length;
  document.getElementById('todoCount').textContent = `${doneCount}/${todos.length}`;

  const listEl = document.getElementById('todoList');
  listEl.innerHTML = '';

  todos.forEach(t => {
    const row = document.createElement('div');
    row.className = 'trow' + (t.done ? ' done' : '');
    row.innerHTML = `
      <span class="chk"><svg viewBox="0 0 10 10"><path d="m2 5.2 2 2 4-4.4"/></svg></span>
      <span class="trow-txt">${escapeHtml(t.text)}</span>
      ${t.time ? `<span class="trow-time"><svg viewBox="0 0 24 24" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:2px;fill:none;stroke:currentColor;stroke-width:2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escapeHtml(t.time)}</span>` : ''}
      <button class="trow-del" title="Supprimer">×</button>
    `;

    row.addEventListener('click', e => {
      if (e.target.closest('.trow-del')) {
        e.stopPropagation();
        window.nusa.deleteTodo(t.id);
        return;
      }
      window.nusa.toggleTodo(t.id);
      playChime('soft');
    });

    listEl.appendChild(row);
  });
}

// ==================== QUICK PEEK NOTIFICATIONS & ANIMATIONS ====================
function getNotifAppIconSvg(appKind) {
  switch (appKind) {
    case 'whatsapp':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="#25D366" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
    case 'mail':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="#19b8ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
    case 'discord':
    case 'chat':
    case 'telegram':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="#70d6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    case 'browser':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="#19b8ff" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
    case 'music':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="#19b8ff" stroke-width="2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" fill="none" stroke="#19b8ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
  }
}

function showPeekNotification(ev) {
  if (isExpanded) return;
  if (mn.dataset.fullscreenHidden === 'true') return;
  if (store.settings && store.settings.peekEnabled === false) return;

  if (peekTimer) clearTimeout(peekTimer);
  isPeekActive = true;
  mn.dataset.retracted = 'false';

  if (ev.type === 'notif') {
    const badge = document.getElementById('notifBadge');
    const titleEl = document.getElementById('notifTitle');
    const snipEl = document.getElementById('notifSnippet');
    if (badge) badge.innerHTML = getNotifAppIconSvg(ev.app);
    if (titleEl) titleEl.textContent = ev.title || 'Notification';
    if (snipEl) snipEl.textContent = ev.snippet || 'Nouvelle notification…';
    mn.dataset.s = 'notif';
    playChime('soft');
  } else if (ev.type === 'charge') {
    const pct = ev.percent ?? 85;
    document.getElementById('chargeTitle').textContent = ev.charging
      ? 'En charge'
      : 'Sur batterie';
    document.getElementById('chargeSub').textContent = ev.charging
      ? 'Chargeur branché'
      : 'Chargeur débranché';
    document.getElementById('chargePct').textContent = pct + '%';
    const offset = 69.1 - (69.1 * Math.min(100, pct)) / 100;
    document.getElementById('chargeArc').style.strokeDashoffset = offset.toFixed(1);
    mn.dataset.s = 'charge';
    playChime('soft');
  } else if (ev.type === 'volume') {
    const vol = ev.muted ? 0 : ev.volume ?? 50;
    document.getElementById('volTitle').textContent = ev.muted
      ? 'Son coupé (Muet)'
      : 'Volume système';
    document.getElementById('volPct').textContent = ev.muted ? 'Muet' : vol + '%';
    document.getElementById('volBar').style.width = vol + '%';
    const offset = 69.1 - (69.1 * Math.min(100, vol)) / 100;
    document.getElementById('volArc').style.strokeDashoffset = offset.toFixed(1);
    mn.dataset.s = 'volume';
  } else if (ev.type === 'brightness') {
    const brt = Math.max(0, Math.min(100, ev.brightness ?? 80));
    document.getElementById('brtPct').textContent = brt + '%';
    document.getElementById('brtBar').style.width = brt + '%';
    const offset = 69.1 - (69.1 * brt) / 100;
    document.getElementById('brtArc').style.strokeDashoffset = offset.toFixed(1);
    mn.dataset.s = 'brightness';
  } else if (ev.type === 'screenshot') {
    const imgEl = document.getElementById('shotPeekImg');
    if (imgEl && (ev.thumbDataUrl || ev.dataUrl)) {
      imgEl.src = ev.thumbDataUrl || ev.dataUrl;
    }
    const subEl = document.getElementById('shotPeekSub');
    if (subEl) {
      subEl.textContent = ev.preview || 'Prête à glisser-déposer dans Fichiers';
    }
    mn.dataset.s = 'screenshot';
    playChime('done');
  } else if (ev.type === 'bt') {
    document.getElementById('btName').textContent = ev.device || 'Casque Audio';
    document.getElementById('btSub').textContent = `Connecté · ${ev.percent ?? 100}%`;
    mn.dataset.s = 'bt';
    playChime('soft');
  } else if (ev.type === 'clipboard') {
    document.getElementById('clipPeekText').textContent = ev.preview || 'Élément copié';
    mn.dataset.s = 'clip-peek';
  } else if (ev.type === 'capslock') {
    document.getElementById('capsTitle').textContent = ev.active
      ? 'Verr. Maj activé'
      : 'Verr. Maj désactivé';
    mn.dataset.s = 'capslock';
  }

  const dur = ev.type === 'notif' ? 2100 : Number(store.settings?.peekDuration ?? 2200);
  peekTimer = setTimeout(() => {
    isPeekActive = false;
    if (!isExpanded) {
      mn.dataset.s = getRestingState();
      updateVisibilityAndRetraction();
    }
  }, dur);
}

window.nusa.onPeekEvent(ev => {
  showPeekNotification(ev);
});

// Global shortcuts / Tray commands
window.nusa.onSwitchTab(tab => {
  openNotch(tab);
});

window.nusa.onToggleNotch(() => {
  if (isExpanded) {
    isPinned = false;
    pinBtn.classList.remove('pinned');
    closeNotch();
  } else {
    openNotch(activeTab);
  }
});

window.nusa.onNotchBlur(() => {
  if (isExpanded && !isPinned && !isDraggingOut) {
    closeNotch();
  }
});


