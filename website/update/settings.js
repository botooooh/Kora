document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const winMinBtn = document.getElementById('winMinBtn');
  const winCloseBtn = document.getElementById('winCloseBtn');
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const heroGlow = document.getElementById('heroGlow');
  const previewNotch = document.getElementById('previewNotch');

  // Color mode cards
  const modeCardWallpaper = document.getElementById('modeCardWallpaper');
  const modeCardCustom = document.getElementById('modeCardCustom');
  const detectedColorDot = document.getElementById('detectedColorDot');
  const detectedColorLabel = document.getElementById('detectedColorLabel');
  const btnRefreshWallpaper = document.getElementById('btnRefreshWallpaper');
  const customActiveDot = document.getElementById('customActiveDot');
  const customActiveHex = document.getElementById('customActiveHex');
  const swatches = document.querySelectorAll('.swatch-btn');
  const customColorInput = document.getElementById('customColorInput');
  const customColorText = document.getElementById('customColorText');
  const pickerPreviewBox = document.getElementById('pickerPreviewBox');
  const paletteCard = document.getElementById('paletteCard');

  // Sliders & Controls
  const stScale = document.getElementById('stScale');
  const stScaleVal = document.getElementById('stScaleVal');
  const stRestingStyle = document.getElementById('stRestingStyle');
  const stGlowMode = document.getElementById('stGlowMode');
  const stRetractMode = document.getElementById('stRetractMode');
  const stFullscreen = document.getElementById('stFullscreen');
  const stLip = document.getElementById('stLip');
  const stLipVal = document.getElementById('stLipVal');
  const stCloseDelay = document.getElementById('stCloseDelay');
  const stCloseDelayVal = document.getElementById('stCloseDelayVal');
  const stOpenDelay = document.getElementById('stOpenDelay');
  const stOpenDelayVal = document.getElementById('stOpenDelayVal');
  const stMusicCompactStyle = document.getElementById('stMusicCompactStyle');
  const stShowInScreenshots = document.getElementById('stShowInScreenshots');
  const stAutoStart = document.getElementById('stAutoStart');
  const stPeekEnabled = document.getElementById('stPeekEnabled');
  const stPeekDur = document.getElementById('stPeekDur');
  const stPeekDurVal = document.getElementById('stPeekDurVal');
  const btnTestNotif = document.getElementById('btnTestNotif');
  const btnUpdateCheck = document.getElementById('btnUpdateCheck');
  const btnUninstall = document.getElementById('btnUninstall');

  // Window Controls
  winMinBtn?.addEventListener('click', () => window.nusa.minimizeSettingsWindow());
  winCloseBtn?.addEventListener('click', () => window.nusa.closeSettingsWindow());

  // Tab Navigation
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.tab;
      navItems.forEach(i => i.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(`pane-${target}`)?.classList.add('active');
    });
  });

  // Theme Color Application Helper
  function applyThemeColor(hex, rgb) {
    if (!hex) return;
    const root = document.documentElement;
    root.style.setProperty('--accent', hex);
    
    const r = parseInt(hex.slice(1, 3), 16) || 25;
    const g = parseInt(hex.slice(3, 5), 16) || 184;
    const b = parseInt(hex.slice(5, 7), 16) || 255;
    const rgbStr = rgb || `${r}, ${g}, ${b}`;
    root.style.setProperty('--accent-rgb', rgbStr);

    const skyHex = `rgb(${Math.min(255, r + 55)}, ${Math.min(255, g + 45)}, ${Math.min(255, b + 25)})`;
    const blueHex = `rgb(${Math.max(0, r - 45)}, ${Math.max(0, g - 45)}, ${Math.max(0, b - 35)})`;
    root.style.setProperty('--accent-glow', `linear-gradient(90deg, ${blueHex}, ${hex} 55%, ${skyHex})`);

    // Update live preview notch
    if (previewNotch) {
      if (currentSettings.glowMode === 'vibrant') {
        previewNotch.style.boxShadow = `0 10px 28px -6px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(${rgbStr}, 0.35), 0 0 20px rgba(${rgbStr}, 0.25)`;
      } else if (currentSettings.glowMode === 'subtle') {
        previewNotch.style.boxShadow = `0 10px 28px -6px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(${rgbStr}, 0.25)`;
      } else {
        previewNotch.style.boxShadow = `0 10px 28px -6px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.12)`;
      }
    }
    if (pickerPreviewBox) {
      pickerPreviewBox.style.background = hex;
    }
  }

  // Load Store & Apply settings
  let currentSettings = {};
  async function loadSettings() {
    try {
      const store = await window.nusa.getStore();
      currentSettings = store.settings || {};
      renderSettings(currentSettings);
    } catch (e) {}
  }

  function renderSettings(s) {
    // 1. Color mode
    const isWallpaper = s.colorMode !== 'custom';
    modeCardWallpaper.classList.toggle('active', isWallpaper);
    modeCardCustom.classList.toggle('active', !isWallpaper);

    // Active accent color
    const activeHex = s.activeAccentHex || '#19b8ff';
    const activeRgb = s.activeAccentRgb || '25, 184, 255';
    applyThemeColor(activeHex, activeRgb);

    // Custom color inputs
    const customHex = s.customColor || '#19b8ff';
    customActiveDot.style.background = customHex;
    customActiveHex.textContent = customHex.toUpperCase();
    customColorInput.value = customHex;
    customColorText.value = customHex.toUpperCase();
    pickerPreviewBox.style.background = customHex;

    // Highlight matching swatch
    swatches.forEach(sw => {
      const swColor = sw.dataset.color.toLowerCase();
      sw.classList.toggle('active', swColor === customHex.toLowerCase());
    });

    // 2. Scale
    const scale = Number(s.scale || 1.0);
    const pct = Math.round(scale * 100);
    stScale.value = String(pct);
    stScaleVal.textContent = `${pct}%`;
    if (previewNotch) {
      previewNotch.style.transform = `scale(${scale})`;
    }

    // 3. Resting style & Glow
    stRestingStyle.value = s.restingStyle || 'auto';
    if (stGlowMode) stGlowMode.value = s.glowMode || 'none';

    // 4. Behavior
    stRetractMode.value = s.retractMode || 'app';
    stFullscreen.checked = s.hideInFullscreen !== false;

    // 5. Lip
    const lip = Number(s.retractedLip ?? 4);
    stLip.value = String(lip);
    stLipVal.textContent = `${lip} px`;

    // 6. Delays
    const closeDelay = Number(s.closeDelay ?? 320);
    stCloseDelay.value = String(closeDelay);
    stCloseDelayVal.textContent = `${closeDelay} ms`;

    const openDelay = Number(s.openDelay ?? 100);
    stOpenDelay.value = String(openDelay);
    stOpenDelayVal.textContent = `${openDelay} ms`;

    // 7. Music
    stMusicCompactStyle.value = s.musicCompactStyle || 'cover';

    // 8. Privacy & System
    stShowInScreenshots.checked = Boolean(s.showInScreenshots);
    stAutoStart.checked = Boolean(s.autoStart);
    stPeekEnabled.checked = s.peekEnabled !== false;

    const peekDur = Number(s.peekDuration ?? 2200);
    stPeekDur.value = String(peekDur);
    stPeekDurVal.textContent = `${(peekDur / 1000).toFixed(1)} s`;

    // 9. Tabs Management
    renderTabsManagement();
  }

  // Detect Wallpaper Color Display
  async function refreshWallpaperDisplay() {
    try {
      const color = await window.nusa.getWallpaperColor();
      if (color && color.hex) {
        detectedColorDot.style.background = color.hex;
        detectedColorLabel.textContent = `${color.hex.toUpperCase()}`;
        if (currentSettings.colorMode !== 'custom') {
          applyThemeColor(color.hex, color.rgb);
        }
      }
    } catch (e) {}
  }

  // Events: Color Mode selection
  modeCardWallpaper.addEventListener('click', async () => {
    modeCardWallpaper.classList.add('active');
    modeCardCustom.classList.remove('active');
    currentSettings.colorMode = 'wallpaper';
    await window.nusa.updateSettings({ colorMode: 'wallpaper' });
    await refreshWallpaperDisplay();
  });

  modeCardCustom.addEventListener('click', () => {
    modeCardWallpaper.classList.remove('active');
    modeCardCustom.classList.add('active');
    currentSettings.colorMode = 'custom';
    const color = customColorInput.value || '#19b8ff';
    window.nusa.updateSettings({ colorMode: 'custom', customColor: color });
  });

  const refreshSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg><span>Rafraîchir</span>';
  const analyzingSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/></svg><span>Analyse...</span>';

  btnRefreshWallpaper.addEventListener('click', async e => {
    e.stopPropagation();
    btnRefreshWallpaper.innerHTML = analyzingSvg;
    await window.nusa.updateSettings({ colorMode: 'wallpaper' });
    await refreshWallpaperDisplay();
    setTimeout(() => {
      btnRefreshWallpaper.innerHTML = refreshSvg;
    }, 600);
  });

  // Swatches
  swatches.forEach(sw => {
    sw.addEventListener('click', () => {
      const color = sw.dataset.color;
      customColorInput.value = color;
      customColorText.value = color.toUpperCase();
      pickerPreviewBox.style.background = color;
      modeCardWallpaper.classList.remove('active');
      modeCardCustom.classList.add('active');
      swatches.forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      window.nusa.updateSettings({ colorMode: 'custom', customColor: color });
    });
  });

  // Color Picker & Text input
  customColorInput.addEventListener('input', e => {
    const val = e.target.value;
    customColorText.value = val.toUpperCase();
    pickerPreviewBox.style.background = val;
    swatches.forEach(sw => {
      sw.classList.toggle('active', sw.dataset.color.toLowerCase() === val.toLowerCase());
    });
    modeCardWallpaper.classList.remove('active');
    modeCardCustom.classList.add('active');
    window.nusa.updateSettings({ colorMode: 'custom', customColor: val });
  });

  customColorText.addEventListener('change', e => {
    let val = e.target.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9a-f]{6}$/i.test(val)) {
      customColorInput.value = val;
      pickerPreviewBox.style.background = val;
      modeCardWallpaper.classList.remove('active');
      modeCardCustom.classList.add('active');
      window.nusa.updateSettings({ colorMode: 'custom', customColor: val });
    }
  });

  // Scale
  stScale.addEventListener('input', () => {
    const pct = Number(stScale.value);
    stScaleVal.textContent = `${pct}%`;
    const scale = pct / 100;
    if (previewNotch) {
      previewNotch.style.transform = `scale(${scale})`;
    }
    window.nusa.updateSettings({ scale });
  });

  // Resting Style
  stRestingStyle.addEventListener('change', () => {
    window.nusa.updateSettings({ restingStyle: stRestingStyle.value });
  });

  // Glow Mode
  stGlowMode?.addEventListener('change', () => {
    window.nusa.updateSettings({ glowMode: stGlowMode.value });
  });

  // Retract Mode
  stRetractMode.addEventListener('change', () => {
    window.nusa.updateSettings({ retractMode: stRetractMode.value });
  });

  // Fullscreen
  stFullscreen.addEventListener('change', () => {
    window.nusa.updateSettings({ hideInFullscreen: stFullscreen.checked });
  });

  // Lip
  stLip.addEventListener('input', () => {
    const lip = Number(stLip.value);
    stLipVal.textContent = `${lip} px`;
    window.nusa.updateSettings({ retractedLip: lip });
  });

  // Close Delay
  stCloseDelay.addEventListener('input', () => {
    const d = Number(stCloseDelay.value);
    stCloseDelayVal.textContent = `${d} ms`;
    window.nusa.updateSettings({ closeDelay: d });
  });

  // Open Delay
  stOpenDelay.addEventListener('input', () => {
    const d = Number(stOpenDelay.value);
    stOpenDelayVal.textContent = `${d} ms`;
    window.nusa.updateSettings({ openDelay: d });
  });

  // Music Compact Style
  stMusicCompactStyle.addEventListener('change', () => {
    window.nusa.updateSettings({ musicCompactStyle: stMusicCompactStyle.value });
  });

  // Screenshots Protection
  stShowInScreenshots.addEventListener('change', () => {
    window.nusa.updateSettings({ showInScreenshots: stShowInScreenshots.checked });
  });

  // Auto Start
  stAutoStart.addEventListener('change', () => {
    window.nusa.updateSettings({ autoStart: stAutoStart.checked });
  });

  // Peek Enabled
  stPeekEnabled.addEventListener('change', () => {
    window.nusa.updateSettings({ peekEnabled: stPeekEnabled.checked });
  });

  // Peek Duration
  stPeekDur.addEventListener('input', () => {
    const dur = Number(stPeekDur.value);
    stPeekDurVal.textContent = `${(dur / 1000).toFixed(1)} s`;
    window.nusa.updateSettings({ peekDuration: dur });
  });

  // Test Peek Notification
  btnTestNotif.addEventListener('click', () => {
    window.nusa.testPeekNotification();
  });

  // Check update
  btnUpdateCheck.addEventListener('click', () => {
    window.nusa.triggerUpdateCheck();
  });

  // Uninstall
  btnUninstall.addEventListener('click', () => {
    window.nusa.triggerUninstall();
  });

  // Tabs Management Logic
  const TAB_METADATA = {
    music: {
      name: 'Musique & Paroles',
      desc: 'Lecteur multimédia Apple Music, Spotify, YouTube avec commandes et paroles synchronisées',
      icon: '<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
    },
    clipboard: {
      name: 'Presse-papiers Intelligent',
      desc: 'Historique instantané des textes, liens web, codes et images copiés (Ctrl+C)',
      icon: '<svg viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>'
    },
    shelf: {
      name: 'Étagère à Fichiers & Captures',
      desc: 'Dépôt temporaire et glisser-déposer vers WhatsApp, Discord, Bureau ou vos emails',
      icon: '<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
    },
    todo: {
      name: 'To-Do & Rappels',
      desc: 'Liste rapide de vos tâches quotidiennes avec alertes programmées',
      icon: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'
    }
  };

  const DEFAULT_TABS_LIST = [
    { id: 'music', name: 'Musique', enabled: true },
    { id: 'clipboard', name: 'Presse-papiers', enabled: true },
    { id: 'shelf', name: 'Fichiers', enabled: true },
    { id: 'todo', name: 'To-Do', enabled: true }
  ];

  const tabsManageList = document.getElementById('tabsManageList');
  const btnResetTabs = document.getElementById('btnResetTabs');

  function renderTabsManagement() {
    if (!tabsManageList) return;
    tabsManageList.innerHTML = '';

    const tabs = currentSettings.tabs && currentSettings.tabs.length > 0
      ? currentSettings.tabs
      : DEFAULT_TABS_LIST;

    tabs.forEach((tab, index) => {
      const meta = TAB_METADATA[tab.id] || {
        name: tab.name || tab.id,
        desc: 'Onglet Kora',
        icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>'
      };

      const item = document.createElement('div');
      item.className = 'tab-manage-item' + (tab.enabled !== false ? '' : ' disabled');

      const isFirst = index === 0;
      const isLast = index === tabs.length - 1;

      item.innerHTML = `
        <div class="tab-order-btns">
          <button type="button" class="tab-order-btn" data-act="up" ${isFirst ? 'disabled' : ''} title="Monter">
            <svg viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>
          </button>
          <button type="button" class="tab-order-btn" data-act="down" ${isLast ? 'disabled' : ''} title="Descendre">
            <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>
        <div class="tab-manage-icon">
          ${meta.icon}
        </div>
        <div class="tab-manage-details">
          <div class="tab-manage-title-row">
            <span class="tab-manage-name">${meta.name}</span>
            <span class="tab-manage-badge ${tab.enabled !== false ? 'active' : 'inactive'}">
              ${tab.enabled !== false ? 'Actif' : 'Masqué'}
            </span>
          </div>
          <span class="tab-manage-desc">${meta.desc}</span>
        </div>
        <label class="switch" title="${tab.enabled !== false ? 'Désactiver' : 'Activer'}">
          <input type="checkbox" class="tab-toggle" ${tab.enabled !== false ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      `;

      item.querySelector('[data-act="up"]')?.addEventListener('click', () => {
        if (index > 0) {
          const temp = tabs[index];
          tabs[index] = tabs[index - 1];
          tabs[index - 1] = temp;
          currentSettings.tabs = [...tabs];
          window.nusa.updateSettings({ tabs: currentSettings.tabs });
          renderTabsManagement();
        }
      });

      item.querySelector('[data-act="down"]')?.addEventListener('click', () => {
        if (index < tabs.length - 1) {
          const temp = tabs[index];
          tabs[index] = tabs[index + 1];
          tabs[index + 1] = temp;
          currentSettings.tabs = [...tabs];
          window.nusa.updateSettings({ tabs: currentSettings.tabs });
          renderTabsManagement();
        }
      });

      const toggleInput = item.querySelector('.tab-toggle');
      toggleInput?.addEventListener('change', () => {
        const enabledCount = tabs.filter(t => t.enabled !== false).length;
        if (!toggleInput.checked && enabledCount <= 1) {
          toggleInput.checked = true;
          return;
        }
        tab.enabled = toggleInput.checked;
        currentSettings.tabs = [...tabs];
        window.nusa.updateSettings({ tabs: currentSettings.tabs });
        renderTabsManagement();
      });

      tabsManageList.appendChild(item);
    });
  }

  if (btnResetTabs) {
    btnResetTabs.addEventListener('click', () => {
      currentSettings.tabs = DEFAULT_TABS_LIST.map(t => ({ ...t, enabled: true }));
      window.nusa.updateSettings({ tabs: currentSettings.tabs });
      renderTabsManagement();
    });
  }

  // External links
  document.querySelectorAll('.js-ext-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      if (url) window.nusa.openExternal(url);
    });
  });

  // Listen for Store updates broadcasted by main process
  window.nusa.onStoreUpdated(newStore => {
    if (newStore && newStore.settings) {
      renderSettings(newStore.settings);
    }
  });

  // Initial load
  await loadSettings();
  await refreshWallpaperDisplay();
});
