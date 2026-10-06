const fs = require('node:fs/promises');
const path = require('node:path');
const { app, safeStorage } = require('electron');

// Encrypted storage for a pasted calendar-feed link (shared by Canvas and the Google Calendar import).
function createFeedStore(fileName, label) {
  const dataFile = () => path.join(app.getPath('userData'), fileName);

  async function load() {
    try {
      const stored = JSON.parse(await fs.readFile(dataFile(), 'utf8'));
      const feedUrl = stored.encryptedUrl && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(stored.encryptedUrl, 'base64')) : '';
      return { feedUrl, hidden: stored.hidden || [] };
    } catch {
      return { feedUrl: '', hidden: [] };
    }
  }

  async function save({ feedUrl, hidden }) {
    if (feedUrl && !safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable on this computer.');
    const stored = { encryptedUrl: feedUrl ? safeStorage.encryptString(feedUrl).toString('base64') : null, hidden };
    await fs.mkdir(path.dirname(dataFile()), { recursive: true });
    await fs.writeFile(dataFile(), JSON.stringify(stored, null, 2), 'utf8');
  }

  async function status() {
    const { feedUrl } = await load();
    return { connected: Boolean(feedUrl), host: feedUrl ? new URL(feedUrl).hostname : '' };
  }

  async function setFeedUrl(value) {
    const feedUrl = String(value || '').trim().replace(/^webcal:\/\//i, 'https://');
    if (feedUrl) {
      let parsed;
      try { parsed = new URL(feedUrl); } catch { throw new Error(`Paste the full ${label}.`); }
      if (parsed.protocol !== 'https:' || !parsed.pathname.endsWith('.ics')) throw new Error('That is not a calendar feed link. It should start with https:// and end in .ics.');
    }
    const state = await load();
    await save({ feedUrl, hidden: feedUrl === state.feedUrl ? state.hidden : [] });
    return status();
  }

  async function hide(uid) {
    const state = await load();
    if (uid && !state.hidden.includes(uid)) state.hidden.push(uid);
    await save(state);
  }

  return { load, status, setFeedUrl, hide };
}

// Read-only import of the Canvas calendar feed (Canvas → Calendar → Calendar Feed).
const PAST_DAYS = 14;
const { load, status, setFeedUrl, hide } = createFeedStore('canvas.json', 'Canvas calendar feed link');

async function fetchEvents() {
  const { feedUrl, hidden } = await load();
  if (!feedUrl) throw new Error('Add your Canvas calendar feed link first.');
  const response = await fetch(feedUrl);
  if (!response.ok) throw new Error(`Canvas did not return the calendar (${response.status}). Check the feed link.`);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PAST_DAYS);
  const oldest = cutoff.toLocaleDateString('en-CA');
  return parseIcs(await response.text()).filter((event) => event.dueDate >= oldest && !hidden.includes(event.uid));
}

const unescapeText = (value) => value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

// 20261005 → 2026-10-05; 20261005T182900Z → the local date of that UTC time.
function icsDate(value) {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(value || '');
  if (!match) return '';
  const [, y, mo, d, h, mi, s, utc] = match;
  if (h && utc) return new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +s)).toLocaleDateString('en-CA');
  return `${y}-${mo}-${d}`;
}

// Exact due time in ms for timed UTC events (Canvas assignments); all-day events have none.
function icsTime(value) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(value || '');
  if (!match) return null;
  const [, y, mo, d, h, mi, sec] = match;
  return Date.UTC(+y, mo - 1, +d, +h, +mi, +sec);
}

function parseIcs(text) {
  const events = [];
  let event = null;
  for (const line of text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
    if (line === 'BEGIN:VEVENT') event = {};
    else if (line === 'END:VEVENT') {
      if (event?.uid && event.dueDate) events.push({ title: 'Untitled', url: '', dueAt: null, ...event });
      event = null;
    } else if (event) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const name = line.slice(0, colon).split(';')[0].toUpperCase();
      const value = line.slice(colon + 1);
      if (name === 'UID') event.uid = value;
      else if (name === 'SUMMARY') event.title = unescapeText(value);
      else if (name === 'URL') event.url = value;
      else if (name === 'DTSTART') { event.dueDate = icsDate(value); event.dueAt = icsTime(value); }
    }
  }
  return events;
}

module.exports = { status, setFeedUrl, hide, fetchEvents, parseIcs, load, createFeedStore };
