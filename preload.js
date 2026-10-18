const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('nusa', {
  setIgnoreMouse: ignore => ipcRenderer.send('set-ignore-mouse', ignore),
  getStore: () => ipcRenderer.invoke('get-store'),
  updateSettings: partial => ipcRenderer.send('settings-update', partial),
  sendMediaCmd: cmd => ipcRenderer.send('media-cmd', cmd),
  fetchLyrics: (title, artist) => ipcRenderer.invoke('fetch-lyrics', { title, artist }),

  // Clipboard (Presse-papiers)
  copyClipboardItem: id => ipcRenderer.send('clipboard-copy', id),
  pinClipboardItem: id => ipcRenderer.send('clipboard-pin', id),
  deleteClipboardItem: id => ipcRenderer.send('clipboard-delete', id),
  clearClipboard: () => ipcRenderer.send('clipboard-clear'),

  // File Shelf (Étagère à fichiers)
  getFilePath: file => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch (e) {}
    return file.path || '';
  },
  addShelfFiles: paths => ipcRenderer.send('shelf-add-files', paths),
  openShelfFile: filePath => ipcRenderer.send('shelf-open', filePath),
  revealShelfFile: filePath => ipcRenderer.send('shelf-reveal', filePath),
  removeShelfFile: id => ipcRenderer.send('shelf-remove', id),
  clearShelf: () => ipcRenderer.send('shelf-clear'),
  startShelfDrag: filePath => ipcRenderer.send('shelf-start-drag', filePath),

  // To-Do List
  addTodo: (text, time) => ipcRenderer.send('todo-add', { text, time }),
  toggleTodo: id => ipcRenderer.send('todo-toggle', id),
  deleteTodo: id => ipcRenderer.send('todo-delete', id),

  // Listeners from main process
  onSystemState: cb => ipcRenderer.on('system-state', (_e, state) => cb(state)),
  onStoreUpdated: cb => ipcRenderer.on('store-updated', (_e, store) => cb(store)),
  onPeekEvent: cb => ipcRenderer.on('peek-event', (_e, ev) => cb(ev)),
  onOsDragNear: cb => ipcRenderer.on('os-drag-near', (_e, data) => cb(data)),
  onTopEdgeHover: cb => ipcRenderer.on('top-edge-hover', (_e, data) => cb(data)),
  onSwitchTab: cb => ipcRenderer.on('switch-tab', (_e, tab) => cb(tab)),
  onToggleNotch: cb => ipcRenderer.on('toggle-notch', () => cb())
});
