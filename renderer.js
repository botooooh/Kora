const mnHolder = document.getElementById('mnHolder');
const mn = document.getElementById('mn');
const pinBtn = document.getElementById('pinBtn');
const hdrMicBtn = document.getElementById('hdrMicBtn');

const TABS = ['music', 'clipboard', 'shelf', 'todo', 'settings'];
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
  audio: { volume: 50, muted: false, micMuted: false, brightness: 80, device: 'Audio Windows' },
  window: { hasActiveApp: false, isMaximized: false, isFullscreen: false },
  media: null
};

let store = {
  settings: {
    scale: 1.0,
    openDelay: 120,
    closeDelay: 380,
    retractMode: 'app',
    hideInFullscreen: true,
    hideInScreenshots: true,
    retractedLip: 4,
    restingStyle: 'auto',
    peekEnabled: true,
    peekDuration: 2600,
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
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  // mode === 'app': retract whenever an application window is open/active
  return Boolean(currentState.window && currentState.window.hasActiveApp);
}

function updateVisibilityAndRetraction() {
  const win = currentState.window || {};
  const hideFsSetting = store.settings ? store.settings.hideInFullscreen !== false : true;
  const mode = (store.settings && store.settings.retractMode) || 'app';

  // Hide completely when an app (including WhatsApp/UWP) is fullscreen or maximized
  // Especially when user selects "Toujours visible (sauf plein écran)" or has hideInFullscreen enabled
  const isFullOrMax = Boolean(win.isFullscreen || (mode === 'never' && win.isMaximized));
  const shouldHideFullscreen = isFullOrMax && hideFsSetting;

  mn.dataset.fullscreenHidden = shouldHideFullscreen ? 'true' : 'false';
  if (shouldHideFullscreen) {
    if (isExpanded && !isPinned) {
      isExpanded = false;
      mn.dataset.s = getRestingState();
    }
    window.nusa.setIgnoreMouse(true);
    return;
  }

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

// Triggered by main.js cursor watcher when user pushes cursor to very top edge (y <= 6px)
window.nusa.onTopEdgeHover(({ active }) => {
  if (!active) return;
  if (mn.dataset.fullscreenHidden === 'true') return;

  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  // Slide down from retracted position immediately
  mn.dataset.retracted = 'false';
  mouseInsideNotch = true;
  window.nusa.setIgnoreMouse(false);

  const delay = Number(store.settings?.openDelay ?? 120);
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

  // When retracted into the top edge, only wake up if mouse is pushed all the way to the top edge (y <= 6px)
  let inside = false;
  if (isRetracted && !isExpanded) {
    inside =
      e.clientY <= 6 &&
      e.clientX >= rect.left - 12 &&
      e.clientX <= rect.right + 12;
  } else {
    inside =
      e.clientX >= rect.left - 10 &&
      e.clientX <= rect.right + 10 &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom + 12;
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
      const delay = Number(store.settings?.openDelay ?? 120);
      if (openTimer) clearTimeout(openTimer);
      openTimer = setTimeout(() => {
        if (mouseInsideNotch) {
          if (mn.dataset.s === 'clip-peek') activeTab = 'clipboard';
          if (mn.dataset.s === 'screenshot') activeTab = 'shelf';
          openNotch(activeTab);
        }
      }, delay);
    } else {
      if (openTimer) {
        clearTimeout(openTimer);
        openTimer = null;
      }
      const activeEl = document.activeElement;
      const isTyping =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT');
      if (!isPinned && !isTyping && !isDraggingOut) {
        scheduleClose();
      }
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

// Close when input/select loses focus and mouse is outside
document.addEventListener('focusout', () => {
  setTimeout(() => {
    const activeEl = document.activeElement;
    const isTyping =
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT');
    if (!mouseInsideNotch && !isPinned && !isTyping && !isDraggingOut) {
      scheduleClose();
    }
  }, 100);
});

function scheduleClose(customDelay) {
  if (closeTimer) clearTimeout(closeTimer);
  const delay = customDelay ?? Number(store.settings?.closeDelay ?? 380);
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
  if (peekTimer) {
    clearTimeout(peekTimer);
    peekTimer = null;
  }
  isPeekActive = false;
  isExpanded = true;
  if (tab && TABS.includes(tab)) {
    activeTab = tab;
  }
  mn.dataset.retracted = 'false';
  mn.dataset.s = activeTab;
  updateNavUI();
}

function closeNotch() {
  isExpanded = false;
  isPeekActive = false;
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
    openNotch(btn.dataset.tab);
  });
});

document.querySelectorAll('#pageDots button').forEach(dot => {
  dot.addEventListener('click', e => {
    e.stopPropagation();
    openNotch(dot.dataset.tab);
  });
});

// Left / Right page arrows
document.querySelectorAll('.js-prev-page').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const idx = TABS.indexOf(activeTab);
    const prev = TABS[(idx - 1 + TABS.length) % TABS.length];
    openNotch(prev);
  });
});

document.querySelectorAll('.js-next-page').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const idx = TABS.indexOf(activeTab);
    const next = TABS[(idx + 1) % TABS.length];
    openNotch(next);
  });
});

// Pin button
pinBtn.addEventListener('click', e => {
  e.stopPropagation();
  isPinned = !isPinned;
  pinBtn.classList.toggle('pinned', isPinned);
});

// Header Mic Mute toggle button
if (hdrMicBtn) {
  hdrMicBtn.addEventListener('click', e => {
    e.stopPropagation();
    window.nusa.sendMediaCmd('MIC_MUTE_TOGGLE');
  });
}

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

// ==================== SYSTEM STATE (MEDIA, VOLUME, MIC, BRIGHTNESS, BATTERY, WINDOW) ====================
function formatSec(sec) {
  if (!sec || sec < 0 || !isFinite(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

window.nusa.onSystemState(state => {
  currentState = state;

  // 1. Update window fullscreen & auto-retract state
  updateVisibilityAndRetraction();

  // 2. Update Microphone Mute indicator on Kora Visor Eyes + Header button
  const micMuted = Boolean(state.audio && state.audio.micMuted);
  mn.dataset.micMuted = micMuted ? 'true' : 'false';
  if (hdrMicBtn) {
    hdrMicBtn.style.background = micMuted ? '#ff3b47' : '';
    hdrMicBtn.style.color = micMuted ? '#fff' : '';
    hdrMicBtn.title = micMuted
      ? 'Microphone COUPÉ (Cliquer pour réactiver)'
      : 'Microphone actif (Cliquer pour couper)';
  }

  // 3. Battery Ring
  if (state.battery) {
    const pct = Math.max(5, Math.min(100, state.battery.percent || 100));
    document.getElementById('idleRing').style.setProperty('--p', pct + '%');
    document.getElementById('hdrRing').style.setProperty('--p', pct + '%');
    document.getElementById('hdrRing').title = `Batterie : ${pct}%${
      state.battery.charging ? ' (En charge ⚡)' : ''
    }`;
  }

  // 4. Media Player (Apple Music, Spotify, YouTube, etc.)
  const m = state.media;
  const isPlaying = m && m.status === 'Playing';

  document.getElementById('idleBars').classList.toggle('paused', !isPlaying);
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
    if (m.thumbnail) {
      artEl.style.backgroundImage = `url("${m.thumbnail}")`;
      lyrArtEl.style.backgroundImage = `url("${m.thumbnail}")`;
    } else {
      artEl.style.backgroundImage = '';
      lyrArtEl.style.backgroundImage = '';
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

    // Check if track changed to fetch synced lyrics
    const key = `${m.title}|${m.artist}`;
    if (key !== currentTrackKey) {
      currentTrackKey = key;
      loadSyncedLyrics(m.title, m.artist);
    }
    updateActiveLyricLine(pos);
  }

  // Update resting state if closed and not showing a peek
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
      currentState.audio && currentState.audio.brightness >= 0
        ? currentState.audio.brightness
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
    )}</li><li>Profitez de la musique 🎵</li>`;
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

// ==================== SETTINGS PANEL LOGIC ====================
const stScale = document.getElementById('stScale');
const stScaleVal = document.getElementById('stScaleVal');
const stOpenDelay = document.getElementById('stOpenDelay');
const stOpenDelayVal = document.getElementById('stOpenDelayVal');
const stCloseDelay = document.getElementById('stCloseDelay');
const stCloseDelayVal = document.getElementById('stCloseDelayVal');
const stRetractMode = document.getElementById('stRetractMode');
const stFullscreen = document.getElementById('stFullscreen');
const stHideInScreenshots = document.getElementById('stHideInScreenshots');
const stLip = document.getElementById('stLip');
const stRestingStyle = document.getElementById('stRestingStyle');
const stPeekEnabled = document.getElementById('stPeekEnabled');
const stAutoStart = document.getElementById('stAutoStart');

function applySettingsToDOM() {
  const s = store.settings || {};
  const scale = Number(s.scale || 1.0);
  const lip = Number(s.retractedLip ?? 4);

  document.documentElement.style.setProperty('--scale', String(scale));
  document.documentElement.style.setProperty('--lip', `${lip}px`);

  const pct = Math.round(scale * 100);
  stScale.value = String(pct);
  stScaleVal.textContent = `${pct}%`;

  stOpenDelay.value = String(s.openDelay ?? 120);
  stOpenDelayVal.textContent = `${s.openDelay ?? 120} ms`;

  stCloseDelay.value = String(s.closeDelay ?? 380);
  stCloseDelayVal.textContent = `${s.closeDelay ?? 380} ms`;

  stRetractMode.value = s.retractMode || 'app';
  stFullscreen.classList.toggle('on', s.hideInFullscreen !== false);
  if (stHideInScreenshots) {
    stHideInScreenshots.classList.toggle('on', s.hideInScreenshots !== false);
  }
  stLip.value = String(lip);
  stRestingStyle.value = s.restingStyle || 'auto';
  stPeekEnabled.classList.toggle('on', s.peekEnabled !== false);
  stAutoStart.classList.toggle('on', Boolean(s.autoStart));

  updateVisibilityAndRetraction();
}

stScale.addEventListener('input', () => {
  const pct = Number(stScale.value);
  stScaleVal.textContent = `${pct}%`;
  const scale = +(pct / 100).toFixed(2);
  document.documentElement.style.setProperty('--scale', String(scale));
  window.nusa.updateSettings({ scale });
});

stOpenDelay.addEventListener('input', () => {
  const openDelay = Number(stOpenDelay.value);
  stOpenDelayVal.textContent = `${openDelay} ms`;
  window.nusa.updateSettings({ openDelay });
});

stCloseDelay.addEventListener('input', () => {
  const closeDelay = Number(stCloseDelay.value);
  stCloseDelayVal.textContent = `${closeDelay} ms`;
  window.nusa.updateSettings({ closeDelay });
});

stRetractMode.addEventListener('change', () => {
  window.nusa.updateSettings({ retractMode: stRetractMode.value });
});

stFullscreen.addEventListener('click', () => {
  const next = !stFullscreen.classList.contains('on');
  stFullscreen.classList.toggle('on', next);
  window.nusa.updateSettings({ hideInFullscreen: next });
});

if (stHideInScreenshots) {
  stHideInScreenshots.addEventListener('click', () => {
    const next = !stHideInScreenshots.classList.contains('on');
    stHideInScreenshots.classList.toggle('on', next);
    window.nusa.updateSettings({ hideInScreenshots: next });
  });
}

stLip.addEventListener('change', () => {
  const retractedLip = Number(stLip.value);
  document.documentElement.style.setProperty('--lip', `${retractedLip}px`);
  window.nusa.updateSettings({ retractedLip });
});

stRestingStyle.addEventListener('change', () => {
  window.nusa.updateSettings({ restingStyle: stRestingStyle.value });
});

stPeekEnabled.addEventListener('click', () => {
  const next = !stPeekEnabled.classList.contains('on');
  stPeekEnabled.classList.toggle('on', next);
  window.nusa.updateSettings({ peekEnabled: next });
});

stAutoStart.addEventListener('click', () => {
  const next = !stAutoStart.classList.contains('on');
  stAutoStart.classList.toggle('on', next);
  window.nusa.updateSettings({ autoStart: next });
});

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
        <button class="clip-act ${item.pinned ? 'pinned' : ''}" data-act="pin" title="Épingler">📌</button>
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
      txtEl.textContent = '✓ Copié dans le presse-papiers !';
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
      iconHtml = `<svg viewBox="0 0 44 44" width="34" height="34"><path d="M4 11a3 3 0 0 1 3-3h10l4 4h16a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#e8a720"/><path d="M4 16h36v18a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#ffc94d"/></svg>`;
    } else {
      iconHtml = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#00e676" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
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

// Drag & Drop files INTO Kora (ignored when dragging a file OUT of Kora)
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
      ${t.time ? `<span class="trow-time">⏰ ${escapeHtml(t.time)}</span>` : ''}
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
window.nusa.onPeekEvent(ev => {
  if (isExpanded) return;
  if (mn.dataset.fullscreenHidden === 'true') return;
  if (store.settings && store.settings.peekEnabled === false) return;

  if (peekTimer) clearTimeout(peekTimer);
  isPeekActive = true;
  mn.dataset.retracted = 'false';

  if (ev.type === 'charge') {
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
  } else if (ev.type === 'mic') {
    const isMuted = Boolean(ev.micMuted);
    mn.dataset.micMuted = isMuted ? 'true' : 'false';
    const badge = document.getElementById('micPeekBadge');
    const icon = document.getElementById('micPeekIcon');
    const title = document.getElementById('micPeekTitle');
    const sub = document.getElementById('micPeekSub');
    const status = document.getElementById('micPeekStatus');

    if (isMuted) {
      badge.style.background = 'rgba(255,59,71,.22)';
      badge.style.boxShadow = 'inset 0 0 0 1.5px #ff3b47';
      icon.setAttribute('stroke', '#ff3b47');
      icon.innerHTML = '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>';
      title.textContent = 'Microphone désactivé';
      sub.textContent = 'Témoin affiché sur les yeux Kora';
      status.textContent = 'MUET';
      status.style.color = '#ff4b55';
      status.style.background = 'rgba(255,59,71,.16)';
    } else {
      badge.style.background = 'rgba(0,230,118,.22)';
      badge.style.boxShadow = 'inset 0 0 0 1.5px #00e676';
      icon.setAttribute('stroke', '#a3ff12');
      icon.innerHTML = '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/>';
      title.textContent = 'Microphone activé';
      sub.textContent = 'Votre voix est captée normalement';
      status.textContent = 'ACTIF';
      status.style.color = '#a3ff12';
      status.style.background = 'rgba(0,230,118,.18)';
    }
    mn.dataset.s = 'mic';
    playChime('soft');
  } else if (ev.type === 'screenshot') {
    const imgEl = document.getElementById('shotPeekImg');
    if (imgEl && ev.dataUrl) {
      imgEl.src = ev.dataUrl;
    }
    const subEl = document.getElementById('shotPeekSub');
    if (subEl) {
      subEl.textContent = ev.fileName
        ? `${ev.fileName} · Prête à glisser-déposer`
        : 'Prête à glisser-déposer dans Fichiers';
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

  const dur = Number(store.settings?.peekDuration ?? 2600);
  peekTimer = setTimeout(() => {
    isPeekActive = false;
    if (!isExpanded) {
      mn.dataset.s = getRestingState();
      updateVisibilityAndRetraction();
    }
  }, dur);
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
