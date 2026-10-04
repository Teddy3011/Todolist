const state = {
  tasks: [],
  view: 'all',
  category: null,
  query: '',
  sort: 'smart',
  editingId: null,
  google: { connected: false, lists: [], selectedListId: '' },
  syncing: false,
  lastSyncedAt: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
// en-CA formats as YYYY-MM-DD in the local time zone (toISOString would use UTC).
const dateKey = (date) => new Date(date).toLocaleDateString('en-CA');
const todayKey = () => dateKey(Date.now());
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
// Motion via Anime.js v4 (anime.umd.min.js exposes `anime`). Always on, even when Windows "Animation effects" is off.
const motion = (targets, params) => window.anime.animate(targets, params);
const enterList = (items) => motion([...items].slice(0, 12), { opacity: [0, 1], y: [8, 0], delay: window.anime.stagger(28), duration: 420, ease: 'outQuart' });
const popCheck = (item) => motion(item.querySelector('.check-button'), { scale: [1, 1.28, 1], duration: 340, ease: 'outQuad' });
function leaveItem(item) {
  item.style.pointerEvents = 'none';
  item.style.overflow = 'hidden';
  return motion(item, { opacity: 0, x: 18, height: [item.offsetHeight, 0], paddingTop: 0, paddingBottom: 0, duration: 340, ease: 'inOutQuad' });
}
function showModal(backdrop) {
  backdrop.hidden = false;
  motion(backdrop, { opacity: [0, 1], duration: 200, ease: 'outQuad' });
  motion(backdrop.querySelector('.modal'), { opacity: [0, 1], y: [14, 0], scale: [0.97, 1], duration: 380, ease: 'outQuart' });
}
async function hideModal(backdrop) {
  if (backdrop.hidden || backdrop.dataset.closing) return;
  backdrop.dataset.closing = '1';
  motion(backdrop.querySelector('.modal'), { opacity: 0, y: 8, scale: 0.98, duration: 160, ease: 'inQuad' });
  await motion(backdrop, { opacity: 0, duration: 180, ease: 'inQuad' });
  backdrop.hidden = true;
  delete backdrop.dataset.closing;
}
const escapeHtml =(value = '') => value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

function defaultTasks() {
  const today = todayKey();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const now = Date.now();
  return [
    { id: uid(), title: 'Review the week and choose three priorities', notes: 'Keep the list realistic.', dueDate: today, category: 'Personal', priority: 'high', completed: false, createdAt: now - 3000, modifiedAt: now - 3000 },
    { id: uid(), title: 'Send project update', notes: '', dueDate: today, category: 'Work', priority: 'medium', completed: false, createdAt: now - 2000, modifiedAt: now - 2000 },
    { id: uid(), title: 'Pick up groceries', notes: 'Coffee, fruit, and something for dinner.', dueDate: dateKey(tomorrow), category: 'Errands', priority: 'low', completed: false, createdAt: now - 1000, modifiedAt: now - 1000 }
  ];
}

async function persist() {
  try { await window.daymark.saveTasks(state.tasks); }
  catch { toast('Could not save changes'); }
}

function isToday(task) { return task.dueDate === todayKey(); }
function isUpcoming(task) { return task.dueDate && task.dueDate > todayKey(); }
function priorityScore(priority) { return { high: 0, medium: 1, low: 2 }[priority] ?? 3; }

function visibleTasks() {
  let tasks = state.tasks.filter((task) => {
    if (task._deleted) return false;
    if (state.view === 'today' && (!isToday(task) || task.completed)) return false;
    if (state.view === 'upcoming' && (!isUpcoming(task) || task.completed)) return false;
    if (state.view === 'completed' && !task.completed) return false;
    if (state.view === 'all' && task.completed) return false;
    if (state.category && task.category !== state.category) return false;
    const haystack = `${task.title} ${task.notes} ${task.category}`.toLowerCase();
    return haystack.includes(state.query.toLowerCase());
  });

  return tasks.sort((a, b) => {
    if (state.sort === 'created') return b.createdAt - a.createdAt;
    if (state.sort === 'priority') return priorityScore(a.priority) - priorityScore(b.priority);
    if (state.sort === 'due') return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    return Number(b.dueDate === todayKey()) - Number(a.dueDate === todayKey()) || priorityScore(a.priority) - priorityScore(b.priority) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
  });
}

function dueLabel(task) {
  if (!task.dueDate) return '';
  const today = todayKey();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (task.dueDate === today) return 'Today';
  if (task.dueDate === dateKey(tomorrow)) return 'Tomorrow';
  return new Date(`${task.dueDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function render(animate = false) {
  const tasks = visibleTasks();
  const list = $('#task-list');
  list.innerHTML = tasks.map((task) => `
    <article class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
      <button class="check-button" data-action="toggle" aria-label="${task.completed ? 'Mark incomplete' : 'Complete task'}"></button>
      <div class="task-main" data-action="edit">
        <strong>${escapeHtml(task.title)}</strong>
        <div class="task-meta">
          <span class="priority-dot ${task.priority}"></span><span>${task.priority[0].toUpperCase() + task.priority.slice(1)}</span>
          <span class="category-pill">${escapeHtml(task.category)}</span>
          ${task.notes ? '<span>• Notes</span>' : ''}
        </div>
      </div>
      <span class="due ${task.dueDate && task.dueDate < todayKey() && !task.completed ? 'overdue' : ''}">${dueLabel(task)}</span>
      <div class="task-actions"><button class="more-button" data-action="menu" aria-label="Task actions">···</button></div>
    </article>`).join('');
  $('#empty-state').hidden = tasks.length > 0;
  if (animate) enterList(list.children);
  updateSummary();
}

function updateSummary() {
  const available = state.tasks.filter((task) => !task._deleted);
  const active = available.filter((task) => !task.completed);
  const completed = available.filter((task) => task.completed);
  const completedToday = completed.filter((task) => task.completedAt && dateKey(task.completedAt) === todayKey()).length;
  const todayTotal = available.filter(isToday).length;
  const todayDone = available.filter((task) => isToday(task) && task.completed).length;
  const progress = todayTotal ? Math.round(todayDone / todayTotal * 100) : 0;
  $('#count-all').textContent = active.length;
  $('#widget-count-all').textContent = active.length;
  $('#count-today').textContent = active.filter(isToday).length;
  $('#count-upcoming').textContent = active.filter(isUpcoming).length;
  $('#count-completed').textContent = completed.length;
  $('#summary-done').textContent = completedToday;
  $('#summary-open').textContent = active.length;
  $('#progress-copy').textContent = `${progress}%`;
  $('#progress-bar').style.width = `${progress}%`;
  $('#progress-detail').textContent = todayTotal ? `${todayDone} of ${todayTotal} today tasks done.` : 'Start with one small win.';
}

// Swiss-poster headline: the last word sits in a black block, e.g. "all [tasks]".
function posterTitle(text) {
  const words = text.toLowerCase().split(' ');
  const last = words.pop();
  return `${words.length ? `<span>${escapeHtml(words.join(' '))}</span> ` : ''}<mark>${escapeHtml(last)}</mark>`;
}

// The block wipes open left to right while the plain word slides in.
function revealTitle() {
  motion('#view-title mark', { clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'], duration: 620, ease: 'inOutQuart' });
  motion('#view-title span', { opacity: [0, 1], x: [-10, 0], duration: 480, ease: 'outQuart' });
}

function setView(view, category = null) {
  state.view = view;
  state.category = category;
  $$('.nav-item, .widget-tab').forEach((button) => button.classList.toggle('active', !category && button.dataset.view === view));
  $$('.list-key button').forEach((button) => button.classList.toggle('active', button.dataset.category === category));
  const titles = { all: 'All tasks', today: 'Today', upcoming: 'Upcoming', completed: 'Completed' };
  $('#view-title').innerHTML = posterTitle(category || titles[view]);
  revealTitle();
  $('#section-title').textContent = category ? `${category} list` : view === 'completed' ? 'Finished tasks' : view === 'today' ? 'Today’s focus' : view === 'upcoming' ? 'On the horizon' : 'Your tasks';
  $('#section-subtitle').textContent = category ? `Tasks filed under ${category}.` : view === 'completed' ? 'A record of your progress.' : view === 'today' ? 'A short list for a focused day.' : 'Everything in one calm place.';
  render(true);
}

function openModal(task = null) {
  state.editingId = task?.id || null;
  $('#modal-title').textContent = task ? 'Edit task' : 'New task';
  $('#task-title').value = task?.title || '';
  $('#task-notes').value = task?.notes || '';
  $('#task-date').value = task?.dueDate || todayKey();
  $('#task-category').value = task?.category || state.category || 'Personal';
  $(`input[name="priority"][value="${task?.priority || 'medium'}"]`).checked = true;
  showModal($('#task-modal'));
  requestAnimationFrame(() => $('#task-title').focus());
}

function closeModal() { hideModal($('#task-modal')); state.editingId = null; }

function saveFromModal(event) {
  event.preventDefault();
  const title = $('#task-title').value.trim();
  if (!title) return;
  const values = {
    title,
    notes: $('#task-notes').value.trim(),
    dueDate: $('#task-date').value,
    category: $('#task-category').value,
    priority: $('input[name="priority"]:checked').value,
    modifiedAt: Date.now()
  };
  const isNew = !state.editingId;
  if (isNew) {
    state.tasks.unshift({ id: uid(), ...values, completed: false, createdAt: Date.now() });
    toast('Task added');
  } else {
    Object.assign(state.tasks.find((task) => task.id === state.editingId), values);
    toast('Task updated');
  }
  persist(); closeModal(); render(); queueGoogleSync();
  if (isNew) enterNewest();
}

// The newest task is state.tasks[0]; drop it into place wherever the current sort put it.
function enterNewest() {
  const item = state.tasks[0] && $(`.task-item[data-id="${state.tasks[0].id}"]`);
  if (item) motion(item, { opacity: [0, 1], y: [-10, 0], scale: [0.97, 1], duration: 460, ease: 'outBack' });
}

function addQuickTask(event) {
  event.preventDefault();
  const input = $('#quick-title');
  const title = input.value.trim();
  if (!title) return;
  state.tasks.unshift({ id: uid(), title, notes: '', dueDate: $('#quick-date-input').value || todayKey(), category: state.category || 'Personal', priority: 'medium', completed: false, createdAt: Date.now(), modifiedAt: Date.now() });
  input.value = '';
  persist(); render(); toast('Task added'); queueGoogleSync();
  enterNewest();
}

function taskAction(event) {
  const action = event.target.closest('[data-action]')?.dataset.action;
  const item = event.target.closest('.task-item');
  if (!action || !item) return;
  const task = state.tasks.find((entry) => entry.id === item.dataset.id);
  if (action === 'toggle') {
    task.completed = !task.completed;
    task.completedAt = task.completed ? Date.now() : null;
    task.modifiedAt = Date.now();
    persist(); toast(task.completed ? 'Nicely done' : 'Task reopened'); queueGoogleSync();
    if (visibleTasks().some((entry) => entry.id === task.id)) { render(); popCheck($(`.task-item[data-id="${task.id}"]`)); }
    else { item.classList.toggle('completed', task.completed); popCheck(item); leaveItem(item).then(() => render()); }
  }
  if (action === 'edit') openModal(task);
  if (action === 'menu') {
    $$('.action-menu').forEach((menu) => menu.remove());
    const menu = document.createElement('div');
    menu.className = 'action-menu';
    menu.innerHTML = `<button data-menu="edit">Edit</button>${task.canvasUrl ? '<button data-menu="canvas">Open in Canvas</button>' : ''}<button class="danger" data-menu="delete">Delete</button>`;
    event.target.parentElement.append(menu);
    menu.style.transformOrigin = 'top right';
    motion(menu, { opacity: [0, 1], y: [-4, 0], scale: [0.95, 1], duration: 180, ease: 'outQuad' });
    menu.addEventListener('click', (menuEvent) => {
      if (menuEvent.target.dataset.menu === 'edit') openModal(task);
      if (menuEvent.target.dataset.menu === 'canvas') window.daymark.openExternal(task.canvasUrl);
      if (menuEvent.target.dataset.menu === 'delete') {
        // Remember deleted Canvas items so the next refresh doesn't bring them back.
        if (task.canvasUid) window.daymark.canvasHide(task.canvasUid);
        if (task.googleId) {
          task._deleted = true;
          task.modifiedAt = Date.now();
        } else state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
        persist(); toast('Task deleted'); queueGoogleSync();
        leaveItem(item).then(() => render());
      }
    }, { once: true });
  }
}

let toastTimer;
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 1800);
}

const cleanError = (error) => String(error?.message || error || 'Something went wrong.').replace(/^Error invoking remote method '[^']+': Error: /, '');

function renderGoogleStatus(status = state.google) {
  state.google = status;
  $('#google-disconnected').hidden = status.connected;
  $('#google-connected').hidden = !status.connected;
  $('#google-dot').classList.toggle('connected', status.connected);
  $('#google-button').classList.toggle('connected', status.connected);
  $('#google-client-id').value = status.clientId || '';
  const select = $('#google-list-select');
  select.innerHTML = (status.lists || []).map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.title)}</option>`).join('');
  if (status.selectedListId) select.value = status.selectedListId;
}

function setGoogleMessage(message, isError = false) {
  const element = $('#google-message');
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function openGoogleModal() {
  showModal($('#google-modal'));
  setGoogleMessage('');
}

function closeGoogleModal() {
  hideModal($('#google-modal'));
}

async function connectGoogle() {
  const button = $('#connect-google');
  button.disabled = true;
  setGoogleMessage('Saving client ID…');
  try {
    await window.daymark.googleSetClientId($('#google-client-id').value);
    setGoogleMessage('Complete sign-in in your browser…');
    const status = await window.daymark.googleConnect();
    renderGoogleStatus(status);
    setGoogleMessage('Connected. Syncing tasks…');
    await syncGoogle(true);
    setGoogleMessage('Google Tasks is ready.');
    toast('Google Tasks connected');
  } catch (error) {
    setGoogleMessage(cleanError(error), true);
  } finally {
    button.disabled = false;
  }
}

async function syncGoogle(silent = false) {
  if (!state.google.connected || state.syncing) return;
  state.syncing = true;
  const button = $('#sync-google');
  button.disabled = true;
  if (!silent) setGoogleMessage('Syncing…');
  let changedDuringSync = false;
  try {
    const sent = new Map(state.tasks.map((task) => [task.id, task.modifiedAt]));
    const result = await window.daymark.googleSync({ tasks: state.tasks, listId: $('#google-list-select').value || state.google.selectedListId });
    ({ tasks: state.tasks, changed: changedDuringSync } = mergeSyncResult(state.tasks, result.tasks, sent));
    state.lastSyncedAt = result.syncedAt;
    state.google.selectedListId = result.listId;
    await persist();
    render();
    $('#google-last-sync').textContent = `Last synced ${new Date(result.syncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
    if (!silent) { setGoogleMessage('Everything is up to date.'); toast('Google Tasks synced'); }
  } catch (error) {
    setGoogleMessage(cleanError(error), true);
    if (!silent) toast('Google sync failed');
  } finally {
    state.syncing = false;
    button.disabled = false;
    if (changedDuringSync) queueGoogleSync();
  }
}

// Edits made while a sync was in flight win over the sync result; Google bookkeeping comes from the result.
function mergeSyncResult(current, synced, sent) {
  const currentById = new Map(current.map((task) => [task.id, task]));
  let changed = false;
  const merged = synced.map((task) => {
    if (!sent.has(task.id)) return task;
    const local = currentById.get(task.id);
    if (!local) { changed = true; return { ...task, _deleted: true, modifiedAt: Date.now() }; }
    if (local.modifiedAt === sent.get(task.id)) return task;
    changed = true;
    const { googleId, googleListId, googleUpdatedAt, lastSyncedAt } = task;
    return { ...local, googleId, googleListId, googleUpdatedAt, lastSyncedAt, modifiedAt: Date.now() };
  });
  const added = current.filter((task) => !sent.has(task.id));
  if (added.length) changed = true;
  return { tasks: [...added, ...merged], changed };
}

let googleSyncTimer;
function queueGoogleSync() {
  if (!state.google.connected) return;
  clearTimeout(googleSyncTimer);
  googleSyncTimer = setTimeout(() => syncGoogle(true), 1800);
}

async function refreshGoogleLists() {
  setGoogleMessage('Refreshing lists…');
  try {
    renderGoogleStatus(await window.daymark.googleRefreshLists());
    setGoogleMessage('Lists refreshed.');
  } catch (error) { setGoogleMessage(cleanError(error), true); }
}

async function disconnectGoogle() {
  setGoogleMessage('Disconnecting…');
  try {
    renderGoogleStatus(await window.daymark.googleDisconnect());
    setGoogleMessage('Google Tasks disconnected.');
    toast('Google disconnected');
  } catch (error) { setGoogleMessage(cleanError(error), true); }
}

// Canvas items become tasks in the Canvas list. Refreshes update title/date but keep your completed state.
function mergeCanvasEvents(events) {
  const byUid = new Map(state.tasks.filter((task) => task.canvasUid && !task._deleted).map((task) => [task.canvasUid, task]));
  let added = 0;
  for (const event of events) {
    const task = byUid.get(event.uid);
    if (!task) {
      state.tasks.push({ id: uid(), title: event.title, notes: '', dueDate: event.dueDate, category: 'Canvas', priority: 'medium', completed: false, createdAt: Date.now(), modifiedAt: Date.now(), canvasUid: event.uid, canvasUrl: event.url });
      added++;
    } else if (task.title !== event.title || task.dueDate !== event.dueDate) {
      Object.assign(task, { title: event.title, dueDate: event.dueDate, canvasUrl: event.url, modifiedAt: Date.now() });
    }
  }
  return added;
}

let canvasConnected = false;
function renderCanvasStatus(status) {
  canvasConnected = status.connected;
  $('#canvas-disconnected').hidden = status.connected;
  $('#canvas-connected').hidden = !status.connected;
  $('#canvas-dot').classList.toggle('connected', status.connected);
  if (status.host) $('#canvas-host').textContent = `${status.host} · link encrypted on this PC.`;
}

function setCanvasMessage(message, isError = false) {
  $('#canvas-message').textContent = message;
  $('#canvas-message').classList.toggle('error', isError);
}

let canvasRefreshing = false;
async function refreshCanvas(silent = false) {
  if (!canvasConnected || canvasRefreshing) return;
  canvasRefreshing = true;
  if (!silent) setCanvasMessage('Refreshing…');
  try {
    const added = mergeCanvasEvents(await window.daymark.canvasFetch());
    persist(); render(); queueGoogleSync();
    $('#canvas-last-sync').textContent = `Last refreshed ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
    if (!silent) setCanvasMessage(added ? `Added ${added} new Canvas item${added === 1 ? '' : 's'}.` : 'Everything is up to date.');
  } catch (error) {
    setCanvasMessage(cleanError(error), true);
    if (!silent) toast('Canvas refresh failed');
  } finally {
    canvasRefreshing = false;
  }
}

async function connectCanvas() {
  const button = $('#connect-canvas');
  button.disabled = true;
  setCanvasMessage('Checking the feed…');
  try {
    renderCanvasStatus(await window.daymark.canvasSetFeed($('#canvas-feed-url').value));
    if (!canvasConnected) throw new Error('Paste your Canvas calendar feed link first.');
    $('#canvas-feed-url').value = '';
    await refreshCanvas();
    toast('Canvas connected');
  } catch (error) {
    setCanvasMessage(cleanError(error), true);
  } finally {
    button.disabled = false;
  }
}

async function disconnectCanvas() {
  try {
    renderCanvasStatus(await window.daymark.canvasSetFeed(''));
    setCanvasMessage('Canvas disconnected. Imported tasks stay in your list.');
  } catch (error) { setCanvasMessage(cleanError(error), true); }
}

async function init() {
  await window.daymark.setWidgetOpen(false);
  document.body.classList.add('is-collapsed');
  $('#eyebrow-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('#quick-date-input').value = todayKey();
  const saved = await window.daymark.loadTasks();
  state.tasks = saved.length ? saved : defaultTasks();
  if (!saved.length) await persist();

  $$('.nav-item, .widget-tab').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  $$('.list-key button').forEach((button) => button.addEventListener('click', () => setView('all', button.dataset.category)));
  $('#search-input').addEventListener('input', (event) => { state.query = event.target.value; render(); });
  $('#sort-select').addEventListener('change', (event) => { state.sort = event.target.value; render(); });
  $('#quick-add').addEventListener('submit', addQuickTask);
  $('#quick-date').addEventListener('click', () => $('#quick-date-input').showPicker());
  $('#quick-date-input').addEventListener('change', (event) => { $('#quick-date').textContent = event.target.value === todayKey() ? 'Today' : dueLabel({ dueDate: event.target.value }); });
  $('#task-list').addEventListener('click', taskAction);
  $('#open-new-task').addEventListener('click', () => openModal());
  $('#empty-add').addEventListener('click', () => openModal());
  $('#task-form').addEventListener('submit', saveFromModal);
  $('#close-modal').addEventListener('click', closeModal);
  $('#cancel-modal').addEventListener('click', closeModal);
  $('#task-modal').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeModal(); });
  $('#google-button').addEventListener('click', openGoogleModal);
  $('#close-google-modal').addEventListener('click', closeGoogleModal);
  $('#google-modal').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeGoogleModal(); });
  $('#open-google-console').addEventListener('click', () => window.daymark.openExternal('https://console.cloud.google.com/apis/library/tasks.googleapis.com'));
  $('#connect-google').addEventListener('click', connectGoogle);
  $('#sync-google').addEventListener('click', () => syncGoogle(false));
  $('#refresh-google-lists').addEventListener('click', refreshGoogleLists);
  $('#google-list-select').addEventListener('change', async (event) => {
    renderGoogleStatus(await window.daymark.googleSetList(event.target.value));
    await syncGoogle(false);
  });
  $('#disconnect-google').addEventListener('click', disconnectGoogle);
  $('#canvas-button').addEventListener('click', () => { showModal($('#canvas-modal')); setCanvasMessage(''); });
  $('#close-canvas-modal').addEventListener('click', () => hideModal($('#canvas-modal')));
  $('#canvas-modal').addEventListener('click', (event) => { if (event.target === event.currentTarget) hideModal(event.currentTarget); });
  $('#connect-canvas').addEventListener('click', connectCanvas);
  $('#refresh-canvas').addEventListener('click', () => refreshCanvas(false));
  $('#disconnect-canvas').addEventListener('click', disconnectCanvas);
  let pinned = true;
  $('#pin-window').addEventListener('click', async () => {
    pinned = await window.daymark.setPinned(!pinned);
    $('#pin-window').classList.toggle('active', pinned);
    $('#pin-window').title = pinned ? 'Keep on top' : 'Pin to top';
    toast(pinned ? 'Widget pinned on top' : 'Widget can sit behind windows');
  });
  $('#minimize-window').addEventListener('click', () => window.daymark.minimizeWindow());
  $('#close-window').addEventListener('click', () => window.daymark.closeWindow());
  $('#collapse-widget').addEventListener('click', collapseWidget);
  $('#folder-launcher').addEventListener('click', () => { if (!launcherDragged) openWidget(); });
  $('.launcher-stage').addEventListener('pointerdown', startLauncherDrag);
  $('#folder-launcher').addEventListener('mousemove', moveFolderPapers);
  $('#folder-launcher').addEventListener('mouseleave', resetFolderPapers);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeModal(); closeGoogleModal(); hideModal($('#canvas-modal')); } });
  document.addEventListener('click', (event) => { if (!event.target.closest('.task-actions')) $$('.action-menu').forEach((menu) => menu.remove()); });
  render();
  try {
    renderGoogleStatus(await window.daymark.googleStatus());
    if (state.google.connected) syncGoogle(true);
  } catch (error) { console.error('Could not read Google Tasks status:', error); }
  try {
    renderCanvasStatus(await window.daymark.canvasStatus());
    refreshCanvas(true);
  } catch (error) { console.error('Could not read Canvas status:', error); }
  setInterval(() => syncGoogle(true), 5 * 60 * 1000);
  setInterval(() => refreshCanvas(true), 30 * 60 * 1000);
}

function moveFolderPapers(event) {
  const folder = event.currentTarget;
  const rect = folder.getBoundingClientRect();
  const offsetX = (event.clientX - (rect.left + rect.width / 2)) * 0.1;
  const offsetY = (event.clientY - (rect.top + rect.height / 2)) * 0.1;
  folder.querySelectorAll('.paper').forEach((paper, index) => {
    const depth = 1 - index * 0.18;
    paper.style.setProperty('--magnet-x', `${offsetX * depth}px`);
    paper.style.setProperty('--magnet-y', `${offsetY * depth}px`);
  });
}

// Press-and-move drags the window; a press without movement stays a click that opens the widget.
let launcherDragged = false;
function startLauncherDrag(event) {
  if (event.button !== 0) return;
  const stage = event.currentTarget;
  const startX = event.screenX;
  const startY = event.screenY;
  launcherDragged = false;
  const move = (moveEvent) => {
    const dx = moveEvent.screenX - startX;
    const dy = moveEvent.screenY - startY;
    if (!launcherDragged && Math.hypot(dx, dy) < 4) return;
    if (!launcherDragged) {
      launcherDragged = true;
      // Capture only once dragging, so a plain click still reaches the folder button.
      stage.setPointerCapture(moveEvent.pointerId);
      window.daymark.dragStart();
    }
    window.daymark.drag(dx, dy);
  };
  const end = () => {
    stage.removeEventListener('pointermove', move);
    stage.removeEventListener('pointerup', end);
    stage.removeEventListener('pointercancel', end);
  };
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
}

function resetFolderPapers() {
  $$('.paper').forEach((paper) => {
    paper.style.setProperty('--magnet-x', '0px');
    paper.style.setProperty('--magnet-y', '0px');
  });
}

async function openWidget() {
  const launcher = $('#folder-launcher');
  if (launcher.classList.contains('open')) return;
  launcher.classList.add('open');
  launcher.setAttribute('aria-expanded', 'true');
  await new Promise((resolve) => setTimeout(resolve, 320));
  await window.daymark.setWidgetOpen(true);
  document.body.classList.remove('is-collapsed');
  document.body.classList.add('is-open');
  // Reveal the widget top to bottom, then the tasks.
  motion('.widget-titlebar, .topbar, .widget-tabs, .summary-row, .panel-heading, .quick-add', { opacity: [0, 1], y: [10, 0], delay: window.anime.stagger(45), duration: 460, ease: 'outQuart' });
  enterList($('#task-list').children);
  revealTitle();
}

async function collapseWidget() {
  document.body.classList.remove('is-open');
  document.body.classList.add('is-collapsed');
  $('#folder-launcher').classList.remove('open');
  $('#folder-launcher').setAttribute('aria-expanded', 'false');
  resetFolderPapers();
  await new Promise((resolve) => setTimeout(resolve, 140));
  await window.daymark.setWidgetOpen(false);
  motion('#folder-launcher', { opacity: [0, 1], scale: [0.85, 1], duration: 520, ease: 'outBack' });
}

init();
