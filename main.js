const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { shell } = require('electron');
const GoogleTasksService = require('./google-tasks');
const canvas = require('./canvas');
const calendar = require('./calendar');

let mainWindow;
let googleTasks;
// First free combo wins; Ctrl+Alt+Space is often taken by other apps.
const QUICK_ADD_SHORTCUTS = process.platform === 'darwin' ? ['Command+Shift+Space', 'Command+Option+N'] : ['Control+Alt+N', 'Alt+Shift+Space', 'Control+Shift+Space'];
let quickAddShortcut = '';
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

async function loadSettings() {
  try { return JSON.parse(await fs.readFile(settingsFile(), 'utf8')); } catch { return {}; }
}

// Reuse the saved folder position only if it is still on a connected screen.
function onScreen(x, y) {
  return Number.isFinite(x) && Number.isFinite(y) && screen.getAllDisplays().some(({ workArea: a }) => x >= a.x && y >= a.y && x < a.x + a.width - 40 && y < a.y + a.height - 40);
}

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

async function createWindow() {
  const { x, y } = await loadSettings();
  mainWindow = new BrowserWindow({
    ...(onScreen(x, y) ? { x, y } : {}),
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
  // Remember where the folder sits (collapsed size only), debounced while dragging.
  let saveTimer;
  mainWindow.on('move', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const bounds = mainWindow?.getBounds();
      if (bounds && bounds.width < 200) fs.writeFile(settingsFile(), JSON.stringify({ x: bounds.x, y: bounds.y }), 'utf8').catch(() => {});
    }, 400);
  });
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

// One copy only: a second launch (e.g. startup + a click) would race the first on tasks.json and the hotkey.
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => {
  mainWindow?.show();
  mainWindow?.focus();
});

app.whenReady().then(() => {
  googleTasks = new GoogleTasksService();
  ipcMain.handle('tasks:load', loadTasks);
  ipcMain.handle('tasks:save', saveTasks);
  ipcMain.handle('google:status', () => googleTasks.status());
  ipcMain.handle('google:set-client-id', (_event, clientId, clientSecret) => googleTasks.setClientId(clientId, clientSecret));
  ipcMain.handle('google:connect', () => googleTasks.connect());
  ipcMain.handle('google:refresh-lists', () => googleTasks.refreshLists());
  ipcMain.handle('google:set-list', (_event, listId) => googleTasks.setSelectedList(listId));
  ipcMain.handle('google:sync', (_event, payload) => googleTasks.sync(payload?.tasks, payload?.listId));
  ipcMain.handle('google:disconnect', () => googleTasks.disconnect());
  ipcMain.handle('canvas:status', () => canvas.status());
  ipcMain.handle('canvas:set-feed', (_event, url) => canvas.setFeedUrl(url));
  ipcMain.handle('canvas:fetch', () => canvas.fetchEvents());
  ipcMain.handle('canvas:hide', (_event, uid) => canvas.hide(String(uid || '')));
  ipcMain.handle('calendar:status', () => calendar.status());
  ipcMain.handle('calendar:set-feed', (_event, url) => calendar.setFeedUrl(url));
  ipcMain.handle('calendar:fetch', () => calendar.fetchEvents());
  ipcMain.on('open-external', async (_event, url) => {
    try {
      const parsed = new URL(url);
      const canvasHost = (await canvas.status()).host;
      if (parsed.protocol === 'https:' && ['console.cloud.google.com', 'developers.google.com', canvasHost].filter(Boolean).includes(parsed.hostname)) shell.openExternal(parsed.toString());
    } catch {}
  });
  let dragStart = null;
  ipcMain.on('window:drag-start', () => { dragStart = mainWindow?.getPosition(); });
  ipcMain.on('window:drag', (_event, dx, dy) => {
    if (dragStart) mainWindow?.setPosition(Math.round(dragStart[0] + dx), Math.round(dragStart[1] + dy));
  });
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:show', () => { mainWindow?.show(); mainWindow?.focus(); });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.handle('window:set-widget-open', (_event, open) => setWidgetOpen(Boolean(open)));
  ipcMain.handle('window:set-pinned', (_event, pinned) => {
    mainWindow?.setAlwaysOnTop(Boolean(pinned));
    return mainWindow?.isAlwaysOnTop() ?? false;
  });
  if (process.platform === 'win32') app.setAppUserModelId('com.daymark.desktop');
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
  createWindow();
  // Global quick add: bring the widget up with the add field focused.
  const showQuickAdd = () => {
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.webContents.send('quick-add');
  };
  quickAddShortcut = QUICK_ADD_SHORTCUTS.find((combo) => globalShortcut.register(combo, showQuickAdd)) || '';
  if (!quickAddShortcut) console.error('No quick-add shortcut could be registered; other apps hold them all.');
  ipcMain.handle('quick-add:shortcut', () => quickAddShortcut);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit on close everywhere; a widget shouldn't linger in the macOS Dock with no window.
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => globalShortcut.unregisterAll());
