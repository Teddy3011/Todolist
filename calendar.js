const ICAL = require('ical.js');
const { createFeedStore } = require('./canvas');

// Read-only import of a Google Calendar "Secret address in iCal format" (works for school accounts that block app sign-in).
// Events stay events: they are shown in the schedule and week view, never turned into tasks.
const DAYS_AHEAD = 8;
const { status, setFeedUrl } = createFeedStore('calendar.json', 'Google Calendar secret address');

async function fetchEvents(now = new Date()) {
  const { feedUrl } = await createFeedStore('calendar.json').load();
  if (!feedUrl) throw new Error('Add your Google Calendar secret address first.');
  const response = await fetch(feedUrl);
  if (!response.ok) throw new Error(`Google Calendar did not return the calendar (${response.status}). Check the secret address.`);
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from);
  to.setDate(to.getDate() + DAYS_AHEAD);
  return expandEvents(await response.text(), from.getTime(), to.getTime());
}

// Expands repeating events (weekly classes etc.) into the window, honouring time zones, skipped dates and moved or cancelled sessions.
function expandEvents(text, from, to) {
  const calendar = new ICAL.Component(ICAL.parse(text));
  for (const zone of calendar.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(zone);
  const vevents = calendar.getAllSubcomponents('vevent');
  const overrides = vevents.filter((vevent) => vevent.hasProperty('recurrence-id'));
  const events = [];
  const add = (item, startDate, endDate) => {
    if ((item.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') return;
    const start = startDate.toJSDate().getTime();
    const end = (endDate || startDate).toJSDate().getTime();
    if (end <= from || start >= to) return;
    events.push({ uid: `${item.uid}:${start}`, title: item.summary || 'Busy', location: item.location || '', start, end, allDay: startDate.isDate });
  };

  for (const vevent of vevents.filter((entry) => !entry.hasProperty('recurrence-id'))) {
    const event = new ICAL.Event(vevent);
    for (const override of overrides) if (override.getFirstPropertyValue('uid') === event.uid) event.relateException(override);
    if (!event.isRecurring()) { add(event, event.startDate, event.endDate); continue; }
    const iterator = event.iterator();
    // ponytail: walks every occurrence from the first one; fine for years of weekly classes, cap guards runaway rules.
    for (let next = iterator.next(), steps = 0; next && steps < 20000; next = iterator.next(), steps++) {
      if (next.toJSDate().getTime() >= to) break;
      const details = event.getOccurrenceDetails(next);
      add(details.item, details.startDate, details.endDate);
    }
  }
  // One entry per occurrence, earliest first.
  return [...new Map(events.map((event) => [event.uid, event])).values()].sort((a, b) => a.start - b.start);
}

module.exports = { status, setFeedUrl, fetchEvents, expandEvents };
