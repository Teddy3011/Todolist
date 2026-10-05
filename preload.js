const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daymark', {
  loadTasks: () => ipcRenderer.invoke('tasks:load'),
  saveTasks: (tasks) => ipcRenderer.invoke('tasks:save', tasks),
  dragStart: () => ipcRenderer.send('window:drag-start'),
  drag: (dx, dy) => ipcRenderer.send('window:drag', dx, dy),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  showWindow: () => ipcRenderer.send('window:show'),
  onQuickAdd: (callback) => ipcRenderer.on('quick-add', () => callback()),
  quickAddShortcut: () => ipcRenderer.invoke('quick-add:shortcut'),
  platform: process.platform,
  closeWindow: () => ipcRenderer.send('window:close'),
  setWidgetOpen: (open) => ipcRenderer.invoke('window:set-widget-open', open),
  setPinned: (pinned) => ipcRenderer.invoke('window:set-pinned', pinned),
  googleStatus: () => ipcRenderer.invoke('google:status'),
  googleSetClientId: (clientId, clientSecret) => ipcRenderer.invoke('google:set-client-id', clientId, clientSecret),
  googleConnect: () => ipcRenderer.invoke('google:connect'),
  googleRefreshLists: () => ipcRenderer.invoke('google:refresh-lists'),
  googleSetList: (listId) => ipcRenderer.invoke('google:set-list', listId),
  googleSync: (payload) => ipcRenderer.invoke('google:sync', payload),
  googleDisconnect: () => ipcRenderer.invoke('google:disconnect'),
  canvasStatus: () => ipcRenderer.invoke('canvas:status'),
  canvasSetFeed: (url) => ipcRenderer.invoke('canvas:set-feed', url),
  canvasFetch: () => ipcRenderer.invoke('canvas:fetch'),
  canvasHide: (uid) => ipcRenderer.invoke('canvas:hide', uid),
  openExternal: (url) => ipcRenderer.send('open-external', url)
});
