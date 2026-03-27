'use strict';
const express = require('express');
const fetch   = require('node-fetch');
const fs      = require('fs');
const path    = require('path');

const app   = express();
const PORT  = 3000;
const DATA_DIR        = path.join(__dirname, 'data');
const SOLAR_FILE      = path.join(DATA_DIR, 'solar.json');
const WEEK_FILE       = path.join(DATA_DIR, 'week.json');
const INVERTER_URL    = 'http://192.168.231.240/index.php/realtimedata/energy_graph';
const INVERTER_OLD    = 'http://192.168.231.240/index.php/realtimedata/old_energy_graph';
const HISTORY_START   = new Date('2024-01-07'); // First 7-day scan date

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── helpers ──────────────────────────────────────────────────────────────────

function loadJson(file, def) {
  if (!fs.existsSync(file)) return def;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; }
}
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function emptyData() {
  return { days: {}, months: {}, lastFetched: null, lastHistoryFetch: null };
}

/** Re-build monthly aggregates from all daily entries. */
function computeMonths(days) {
  const months = {};
  for (const [key, val] of Object.entries(days)) {
    const [y, m] = key.split('-');
    if (!months[y]) months[y] = {};
    months[y][m] = Math.round(((months[y][m] || 0) + val) * 100) / 100;
  }
  return months;
}

function pad(n) { return String(n).padStart(2, '0'); }
function dateToStr(d) { return `${pad(d.getMonth()+1)}/${pad(d.getDate())}/${d.getFullYear()}`; }

/**
 * Infer the year for a "MM/DD" date string given the request Date.
 * A weekly window is only 7 days, so if the returned month is much later
 * than the request month it must belong to the previous year
 * (e.g. request Jan 3 → Dec 28 dates are in year-1).
 */
function inferYear(mmdd, reqDate) {
  const m  = parseInt(mmdd.split('/')[0]);
  const rm = reqDate.getMonth() + 1;
  const ry = reqDate.getFullYear();
  return m > rm + 3 ? ry - 1 : ry;
}

function toKey(mmdd, year) {
  const [mm, dd] = mmdd.split('/');
  return `${year}-${mm}-${dd}`;
}

// ── inverter fetchers ─────────────────────────────────────────────────────────

async function fetchCurrentWeek() {
  const res  = await fetch(INVERTER_URL, { timeout: 12000 });
  const html = await res.text();

  // Extract categories: ["03/21","03/22",...,]
  const catM  = html.match(/categories:\s*\[([^\]]*)\]/);
  // Extract data array after name:'Energy'
  const datM  = html.match(/name:\s*['"]Energy['"]\s*,\s*data:\s*\[([^\]]*)\]/);
  // Extract weekly total
  const totM  = html.match(/Solar Generated Current Week:\s*([\d.]+)\s*kWh/);

  if (!catM || !datM) throw new Error('Cannot parse inverter HTML response');

  const clean = s => JSON.parse('[' + s.trim().replace(/,\s*$/, '') + ']');
  const dates  = clean(catM[1]);
  const values = clean(datM[1]);
  const total  = totM ? parseFloat(totM[1]) : values.reduce((a, b) => a + b, 0);
  return { dates, values, total };
}

async function fetchOld(date, period) {
  const res = await fetch(INVERTER_OLD, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `date=${dateToStr(date)}&period=${period}`,
    timeout: 12000
  });
  return res.json();
}

// ── routes ────────────────────────────────────────────────────────────────────

app.get('/api/data', (_req, res) => {
  res.json(loadJson(SOLAR_FILE, emptyData()));
});

app.get('/api/week', (_req, res) => {
  res.json(loadJson(WEEK_FILE, { dates: [], values: [], total: 0 }));
});

/** Refresh current week + last 30 days and persist. */
app.post('/api/refresh', async (_req, res) => {
  try {
    const solar = loadJson(SOLAR_FILE, emptyData());
    const now   = new Date();

    // 1 – current week via GET endpoint
    const week = await fetchCurrentWeek();
    saveJson(WEEK_FILE, { ...week, fetchedAt: now.toISOString() });
    const wy = now.getFullYear();
    week.dates.forEach((d, i) => { solar.days[toKey(d, wy)] = week.values[i]; });

    // 2 – last 30 days via monthly period
    const monthly = await fetchOld(now, 'monthly');
    if (monthly.energy?.length) {
      for (const e of monthly.energy) {
        solar.days[toKey(e.date, inferYear(e.date, now))] = e.energy;
      }
    }

    solar.months      = computeMonths(solar.days);
    solar.lastFetched = now.toISOString();
    saveJson(SOLAR_FILE, solar);
    res.json({ success: true, lastFetched: solar.lastFetched });
  } catch (err) {
    console.error('Refresh error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/fetch-history — SSE stream.
 * Walks every 7 days from HISTORY_START to today, collecting weekly data.
 */
app.get('/api/fetch-history', async (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const sse = obj => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`); };

  const solar = loadJson(SOLAR_FILE, emptyData());
  const today = new Date();

  // Build list of scan dates (every 7 days)
  const dates = [];
  const cur   = new Date(HISTORY_START);
  while (cur <= today) { dates.push(new Date(cur)); cur.setDate(cur.getDate() + 7); }
  // Ensure we include today for the current partial week
  const last = dates[dates.length - 1];
  if (!last || last.toDateString() !== today.toDateString()) dates.push(new Date(today));

  const total = dates.length;
  let done = 0;

  for (const d of dates) {
    if (res.writableEnded) break;
    try {
      const data = await fetchOld(d, 'weekly');
      if (data.energy?.length) {
        for (const e of data.energy) {
          solar.days[toKey(e.date, inferYear(e.date, d))] = e.energy;
        }
      }
    } catch { /* continue on network error */ }

    done++;
    sse({ progress: done, total });
    await new Promise(r => setTimeout(r, 60));   // gentle pacing
  }

  // Grab fresh current-week data via GET
  try {
    const week = await fetchCurrentWeek();
    saveJson(WEEK_FILE, { ...week, fetchedAt: today.toISOString() });
    const wy = today.getFullYear();
    week.dates.forEach((d, i) => { solar.days[toKey(d, wy)] = week.values[i]; });
  } catch { /* non-fatal */ }

  solar.months           = computeMonths(solar.days);
  solar.lastHistoryFetch = today.toISOString();
  solar.lastFetched      = today.toISOString();
  saveJson(SOLAR_FILE, solar);

  sse({ done: true, totalDays: Object.keys(solar.days).length });
  res.end();
});

const RECIPIENTS_FILE = path.join(DATA_DIR, 'recipients.json');

app.get('/api/recipients', (_req, res) => {
  res.json(loadJson(RECIPIENTS_FILE, []));
});

app.post('/api/recipients', (req, res) => {
  const list = req.body;
  if (!Array.isArray(list)) return res.status(400).json({ error: 'Expected array' });
  saveJson(RECIPIENTS_FILE, list);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`\n☀️  Solar Dashboard → http://localhost:${PORT}\n`);
});
