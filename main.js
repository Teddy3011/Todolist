const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { shell } = require('electron');
const GoogleTasksService = require('./google-tasks');

let mainWindow;
let googleTasks;

function dataFile() {
  return path.join(app.getPath('userData'), 'tasks.json');
}

async function loadTasks() {
  try {
    return JSON.parse(await fs.readFile(dataFile(), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Could not load tasks:', error);
      // Keep the unreadable file so starting fresh never destroys it.
      await fs.rename(dataFile(), dataFile().replace(/\.json$/, `.corrupt-${Date.now()}.json`)).catch(() => {});
    }
    return [];
  }
}

let saveQueue = Promise.resolve();
function saveTasks(_event, tasks) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  // Serialize saves so an older snapshot can't land last; write-then-rename so a crash never leaves a half-written file.
  const write = async () => {
    await fs.mkdir(path.dirname(dataFile()), { recursive: true });
    const temp = `${dataFile()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(safeTasks, null, 2), 'utf8');
    await fs.rename(temp, dataFile());
    return true;
  };
  saveQueue = saveQueue.catch(() => {}).then(write);
  return saveQueue;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 112,
    height: 100,
    minWidth: 100,
    minHeight: 90,
    maxWidth: 560,
    backgroundColor: '#00000000',
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

function setWidgetOpen(open) {
  if (!mainWindow) return false;
  const target = open ? { width: 410, height: 680 } : { width: 112, height: 100 };
  const current = mainWindow.getBounds();
  const workArea = screen.getDisplayMatching(current).workArea;
  const centeredX = Math.round(current.x + (current.width - target.width) / 2);
  const centeredY = Math.round(current.y + (current.height - target.height) / 2);
  const x = Math.max(workArea.x, Math.min(centeredX, workArea.x + workArea.width - target.width));
  const y = Math.max(workArea.y, Math.min(centeredY, workArea.y + workArea.height - target.height));
  if (!open) mainWindow.setMinimumSize(100, 90);
  mainWindow.setResizable(true);
  mainWindow.setBounds({ x, y, ...target });
  if (open) mainWindow.setMinimumSize(350, 500);
  if (!open) mainWindow.setResizable(false);
  return mainWindow.getBounds();
}

app.whenReady().then(() => {
  googleTasks = new GoogleTasksService();
  ipcMain.handle('tasks:load', loadTasks);
  ipcMain.handle('tasks:save', saveTasks);
  ipcMain.handle('google:status', () => googleTasks.status());
  ipcMain.handle('google:set-client-id', (_event, clientId) => googleTasks.setClientId(clientId));
  ipcMain.handle('google:connect', () => googleTasks.connect());
  ipcMain.handle('google:refresh-lists', () => googleTasks.refreshLists());
  ipcMain.handle('google:set-list', (_event, listId) => googleTasks.setSelectedList(listId));
  ipcMain.handle('google:sync', (_event, payload) => googleTasks.sync(payload?.tasks, payload?.listId));
  ipcMain.handle('google:disconnect', () => googleTasks.disconnect());
  ipcMain.on('open-external', (_event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && ['console.cloud.google.com', 'developers.google.com'].includes(parsed.hostname)) shell.openExternal(parsed.toString());
    } catch {}
  });
  let dragStart = null;
  ipcMain.on('window:drag-start', () => { dragStart = mainWindow?.getPosition(); });
  ipcMain.on('window:drag', (_event, dx, dy) => {
    if (dragStart) mainWindow?.setPosition(Math.round(dragStart[0] + dx), Math.round(dragStart[1] + dy));
  });
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.handle('window:set-widget-open', (_event, open) => setWidgetOpen(Boolean(open)));
  ipcMain.handle('window:set-pinned', (_event, pinned) => {
    mainWindow?.setAlwaysOnTop(Boolean(pinned));
    return mainWindow?.isAlwaysOnTop() ?? false;
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
