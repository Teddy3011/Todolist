const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { app, safeStorage, shell } = require('electron');

const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_URL = 'https://tasks.googleapis.com/tasks/v1';
const base64Url = (buffer) => buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

class GoogleTasksService {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'google-tasks.json');
    this.state = null;
  }

  async load() {
    if (this.state) return this.state;
    try {
      const stored = JSON.parse(await fs.readFile(this.file, 'utf8'));
      let tokens = null;
      if (stored.encryptedTokens && safeStorage.isEncryptionAvailable()) tokens = JSON.parse(safeStorage.decryptString(Buffer.from(stored.encryptedTokens, 'base64')));
      this.state = { clientId: stored.clientId || '', selectedListId: stored.selectedListId || '', lists: stored.lists || [], tokens };
    } catch {
      this.state = { clientId: '', selectedListId: '', lists: [], tokens: null };
    }
    return this.state;
  }

  async save() {
    const state = await this.load();
    if (state.tokens && !safeStorage.isEncryptionAvailable()) throw new Error('Secure Windows credential storage is unavailable.');
    const stored = {
      clientId: state.clientId,
      selectedListId: state.selectedListId,
      lists: state.lists,
      encryptedTokens: state.tokens ? safeStorage.encryptString(JSON.stringify(state.tokens)).toString('base64') : null
    };
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(stored, null, 2), 'utf8');
  }

  async status() {
    const state = await this.load();
    return { connected: Boolean(state.tokens?.refresh_token || state.tokens?.access_token), clientId: state.clientId, selectedListId: state.selectedListId, lists: state.lists };
  }

  async setClientId(clientId) {
    const value = String(clientId || '').trim();
    if (value && !value.endsWith('.apps.googleusercontent.com')) throw new Error('Enter a valid Google OAuth desktop client ID.');
    const state = await this.load();
    if (state.clientId !== value) {
      state.clientId = value;
      state.tokens = null;
      state.lists = [];
      state.selectedListId = '';
      await this.save();
    }
    return this.status();
  }

  async setSelectedList(listId) {
    const state = await this.load();
    state.selectedListId = String(listId || '');
    await this.save();
    return this.status();
  }

  async connect() {
    const state = await this.load();
    if (!state.clientId) throw new Error('Add your Google OAuth desktop client ID first.');
    const verifier = base64Url(crypto.randomBytes(64));
    const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
    const oauthState = base64Url(crypto.randomBytes(24));
    let resolveCode;
    let rejectCode;
    const codePromise = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname !== '/oauth2callback') return response.writeHead(404).end();
      if (url.searchParams.get('state') !== oauthState) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('em cheyali bhaii could not verify this sign-in. You can close this tab.');
        return rejectCode(new Error('Google sign-in state did not match.'));
      }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      if (error || !code) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Google sign-in was cancelled. You can close this tab.');
        return rejectCode(new Error(error || 'Google sign-in was cancelled.'));
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><title>em cheyali bhaii connected</title><body style="background:#111;color:#f1ead8;font:18px system-ui;display:grid;place-items:center;height:100vh;margin:0"><p>em cheyali bhaii is connected. You can close this tab.</p></body>');
      resolveCode(code);
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const redirectUri = `http://127.0.0.1:${server.address().port}/oauth2callback`;
    const authUrl = new URL(AUTH_URL);
    authUrl.search = new URLSearchParams({ client_id: state.clientId, redirect_uri: redirectUri, response_type: 'code', scope: TASKS_SCOPE, access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state: oauthState }).toString();
    await shell.openExternal(authUrl.toString());
    const timeout = setTimeout(() => rejectCode(new Error('Google sign-in timed out.')), 180000);
    try {
      const code = await codePromise;
      const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: state.clientId, code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri }) });
      const tokens = await response.json();
      if (!response.ok) throw new Error(tokens.error_description || 'Google did not return an access token.');
      state.tokens = { ...tokens, expires_at: Date.now() + (tokens.expires_in || 3600) * 1000 };
      await this.refreshLists();
      await this.save();
      return this.status();
    } finally {
      clearTimeout(timeout);
      server.close();
    }
  }

  async ensureAccessToken() {
    const state = await this.load();
    if (!state.tokens) throw new Error('Connect Google Tasks first.');
    if (state.tokens.access_token && state.tokens.expires_at > Date.now() + 60000) return state.tokens.access_token;
    if (!state.tokens.refresh_token) throw new Error('Google access expired. Connect again.');
    const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: state.clientId, refresh_token: state.tokens.refresh_token, grant_type: 'refresh_token' }) });
    const refreshed = await response.json();
    if (!response.ok) throw new Error(refreshed.error_description || 'Could not refresh Google access.');
    state.tokens = { ...state.tokens, ...refreshed, expires_at: Date.now() + (refreshed.expires_in || 3600) * 1000 };
    await this.save();
    return state.tokens.access_token;
  }

  async request(url, options = {}) {
    const token = await this.ensureAccessToken();
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || `Google Tasks request failed (${response.status}).`);
    return body;
  }

  async refreshLists() {
    const state = await this.load();
    const lists = [];
    let pageToken = '';
    do {
      const url = new URL(`${API_URL}/users/@me/lists`);
      url.searchParams.set('maxResults', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await this.request(url.toString());
      lists.push(...(data.items || []));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    state.lists = lists.map(({ id, title }) => ({ id, title }));
    if (!state.selectedListId || !state.lists.some((list) => list.id === state.selectedListId)) state.selectedListId = state.lists[0]?.id || '';
    await this.save();
    return this.status();
  }

  async listTasks(listId) {
    const items = [];
    let pageToken = '';
    do {
      const url = new URL(`${API_URL}/lists/${encodeURIComponent(listId)}/tasks`);
      for (const [key, value] of Object.entries({ maxResults: '100', showCompleted: 'true', showHidden: 'true', showDeleted: 'true' })) url.searchParams.set(key, value);
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await this.request(url.toString());
      items.push(...(data.items || []));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return items;
  }

  taskBody(task) {
    return { title: task.title || 'Untitled task', notes: task.notes || '', due: task.dueDate ? `${task.dueDate}T00:00:00.000Z` : null, status: task.completed ? 'completed' : 'needsAction', completed: task.completed ? new Date(task.completedAt || Date.now()).toISOString() : null };
  }

  fromGoogle(remote, existing = {}, listId = '') {
    const remoteTime = Date.parse(remote.updated || '') || Date.now();
    return { ...existing, id: existing.id || `google-${remote.id}`, title: remote.title || 'Untitled task', notes: remote.notes || '', dueDate: remote.due ? remote.due.slice(0, 10) : '', category: existing.category || 'Google', priority: existing.priority || 'medium', completed: remote.status === 'completed', completedAt: remote.completed ? Date.parse(remote.completed) : null, createdAt: existing.createdAt || remoteTime, modifiedAt: remoteTime, googleId: remote.id, googleListId: listId, googleUpdatedAt: remote.updated || '', lastSyncedAt: Date.now() };
  }

  async sync(tasks, requestedListId) {
    const state = await this.load();
    const listId = requestedListId || state.selectedListId;
    if (!listId) throw new Error('Choose a Google Tasks list first.');
    if (listId !== state.selectedListId) { state.selectedListId = listId; await this.save(); }
    const remoteTasks = await this.listTasks(listId);
    const remoteById = new Map(remoteTasks.map((task) => [task.id, task]));
    const seen = new Set();
    const result = [];
    for (const original of Array.isArray(tasks) ? tasks : []) {
      const local = { ...original };
      if (local.googleId && local.googleListId && local.googleListId !== listId) {
        local.googleId = null;
        local.googleUpdatedAt = '';
        local.lastSyncedAt = 0;
      }
      if (local._deleted) {
        if (local.googleId && remoteById.has(local.googleId) && !remoteById.get(local.googleId).deleted) await this.request(`${API_URL}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(local.googleId)}`, { method: 'DELETE' });
        continue;
      }
      if (!local.googleId) {
        const created = await this.request(`${API_URL}/lists/${encodeURIComponent(listId)}/tasks`, { method: 'POST', body: JSON.stringify(this.taskBody(local)) });
        result.push(this.fromGoogle(created, local, listId));
        seen.add(created.id);
        continue;
      }
      seen.add(local.googleId);
      const remote = remoteById.get(local.googleId);
      if (!remote || remote.deleted) continue;
      const lastSync = Number(local.lastSyncedAt || 0);
      const localChanged = Number(local.modifiedAt || local.createdAt || 0) > lastSync;
      const remoteTime = Date.parse(remote.updated || '') || 0;
      const remoteChanged = remoteTime > lastSync + 1000;
      if (localChanged && (!remoteChanged || Number(local.modifiedAt || 0) >= remoteTime)) {
        const updated = await this.request(`${API_URL}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(local.googleId)}`, { method: 'PATCH', body: JSON.stringify(this.taskBody(local)) });
        result.push(this.fromGoogle(updated, local, listId));
      } else result.push(this.fromGoogle(remote, local, listId));
    }
    for (const remote of remoteTasks) if (!remote.deleted && !seen.has(remote.id)) result.push(this.fromGoogle(remote, {}, listId));
    return { tasks: result, syncedAt: Date.now(), listId };
  }

  async disconnect() {
    const state = await this.load();
    const token = state.tokens?.access_token || state.tokens?.refresh_token;
    if (token) await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }).catch(() => {});
    state.tokens = null;
    state.lists = [];
    state.selectedListId = '';
    await this.save();
    return this.status();
  }
}

module.exports = GoogleTasksService;
