const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daymark', {
  loadTasks: () => ipcRenderer.invoke('tasks:load'),
  saveTasks: (tasks) => ipcRenderer.invoke('tasks:save', tasks),
  dragStart: () => ipcRenderer.send('window:drag-start'),
  drag: (dx, dy) => ipcRenderer.send('window:drag', dx, dy),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  setWidgetOpen: (open) => ipcRenderer.invoke('window:set-widget-open', open),
  setPinned: (pinned) => ipcRenderer.invoke('window:set-pinned', pinned),
  googleStatus: () => ipcRenderer.invoke('google:status'),
  googleSetClientId: (clientId) => ipcRenderer.invoke('google:set-client-id', clientId),
  googleConnect: () => ipcRenderer.invoke('google:connect'),
  googleRefreshLists: () => ipcRenderer.invoke('google:refresh-lists'),
  googleSetList: (listId) => ipcRenderer.invoke('google:set-list', listId),
  googleSync: (payload) => ipcRenderer.invoke('google:sync', payload),
  googleDisconnect: () => ipcRenderer.invoke('google:disconnect'),
  openExternal: (url) => ipcRenderer.send('open-external', url)
});
