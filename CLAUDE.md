# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Start the server (runs on http://localhost:3000)
node server.js

# Kill whatever is on port 3000 and restart
npx kill-port 3000 && node server.js
```

There are no tests or linting configured.

## Architecture

This is a **local solar panel dashboard** — a Node.js/Express backend that proxies a local Altenergy inverter and serves a vanilla JS frontend.

### Inverter API (local network only)
- **GET** `http://192.168.231.240/index.php/realtimedata/energy_graph` — returns HTML with current-week data embedded in a Highcharts JS snippet (must be regex-parsed, not JSON)
- **POST** `http://192.168.231.240/index.php/realtimedata/old_energy_graph` — body: `date=YYYY-MM-DD&period=weekly|monthly|yearly`; returns `{ energy: [{date: "MM/DD", energy: 3.14}], total_energy, subtitle }`. **Date must be `YYYY-MM-DD`** — `MM/DD/YYYY` silently returns "No Data" for historical dates. The `monthly` period returns a **30-day sliding window** ending on the given date, not a calendar month. The `yearly` period is unreliable. Weekly (7-day) scanning is used for accurate history.

### Data flow
1. `server.js` fetches from the inverter, stores everything in `data/solar.json` and `data/week.json`.
2. The frontend (`public/app.js`) fetches only from `localhost:3000/api/*` — no direct inverter access (CORS would block it).
3. History is gathered once via `GET /api/fetch-history` (SSE stream, ~120 requests at 60 ms intervals). Daily data is keyed as `YYYY-MM-DD` in `solar.json`. Monthly aggregates are recomputed from daily data on every save.

### Year inference for weekly scan
Returned dates have no year (`"MM/DD"`). `server.js` infers the year: if the returned month is more than 3 months after the request month, it belongs to `requestYear - 1` (handles Dec→Jan boundary).

### Key files
| File | Purpose |
|---|---|
| `server.js` | Express server — inverter proxy, SSE history fetch, JSON file I/O, recipients API |
| `public/app.js` | All frontend logic — charts (Chart.js 4), KPI cards, recipients, scheduling, messaging |
| `public/index.html` | Dashboard layout |
| `public/style.css` | Dark theme (CSS variables in `:root`) |
| `data/solar.json` | Persisted daily + monthly cache (`days`, `months`, `lastFetched`, `lastHistoryFetch`) |
| `data/week.json` | Current week data refreshed on demand |
| `data/recipients.json` | Messenger/WhatsApp recipient list `[{name, type, url}]` |

### API routes (backend)
| Route | Notes |
|---|---|
| `GET /api/data` | Returns `solar.json` |
| `GET /api/week` | Returns `week.json` |
| `POST /api/refresh` | Fetches current week (GET) + last 30 days (monthly POST) from inverter; upserts into solar.json |
| `GET /api/fetch-history` | SSE stream — scans every 7 days from 2024-01-07 to today |
| `GET /api/recipients` | Returns `recipients.json` |
| `POST /api/recipients` | Overwrites `recipients.json` with request body array |

### Frontend features
- **Monthly comparison chart**: grouped bars, years 2024/2025/2026 (`#4a90e2` / `#4caf77` / `#f0a500`), toggleable via checkboxes
- **Last 7 days chart**: teal bars, data from `week.json`
- **Auto-refresh**: `setInterval` every 3 600 000 ms calls `POST /api/refresh` silently
- **Scheduled send**: countdown timer opens each recipient URL in a new tab and copies stats to clipboard; recipients managed via `data/recipients.json` and `/api/recipients`
- **Messenger button**: opens `MESSENGER_URL` constant (top of `app.js`) + copies stats to clipboard
- **WhatsApp button**: `WHATSAPP_NUMBER` constant at top of `app.js` (international format, no `+`)

### Adding a new year
Add the year string to the `YEARS` array and a matching colour to `YR_COLORS` in `public/app.js`. The chart datasets are built dynamically from those arrays.
