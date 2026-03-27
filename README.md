# ☀️ Solar Dashboard

A local web dashboard for monitoring solar panel power generation, built for the **Altenergy** inverter system. Displays historical and real-time generation data with charts, KPI cards, and automated stats reporting to Messenger/WhatsApp.

![Dark dashboard with monthly comparison chart and last 7 days bar chart](https://img.shields.io/badge/stack-Node.js%20%2B%20Chart.js-f0a500?style=flat-square)
![Docker](https://img.shields.io/badge/docker-ready-2496ed?style=flat-square&logo=docker)

## Features

- **Monthly comparison chart** — grouped bars for 2024 / 2025 / 2026, toggleable per year
- **Last 7 days chart** — daily kWh with day labels
- **KPI cards** — this month, last 7 days, best single day, all-time total
- **History fetch** — scans all data from installation date via SSE progress stream (~120 inverter requests, run once)
- **Auto-refresh** — silently refreshes current week + last 30 days every hour
- **Recipients & scheduled send** — configure Messenger/WhatsApp contacts, set a countdown timer, stats are copied to clipboard and each conversation opens automatically
- **Docker ready** — single `docker compose up -d`

## Requirements

- Node.js 18+ (or Docker Desktop)
- Local network access to the Altenergy inverter at `http://192.168.231.240`

## Quick Start

**With Docker (recommended):**
```bash
docker compose up -d
```

**Without Docker:**
```bash
npm install
node server.js
```

Open `http://localhost:3000`, then click **Fetch All History** on first run.

## Configuration

| What | Where |
|---|---|
| WhatsApp number | `WHATSAPP_NUMBER` constant at top of `public/app.js` (international format, no `+`) |
| Messenger self-chat | `MESSENGER_URL` constant at top of `public/app.js` |
| Recipients list | `data/recipients.json` (managed via dashboard UI) |
| Inverter IP | `INVERTER_URL` / `INVERTER_OLD` constants in `server.js` |

## Data

All data is cached in `data/` (excluded from git):

| File | Contents |
|---|---|
| `solar.json` | All daily kWh values keyed by `YYYY-MM-DD` + monthly aggregates |
| `week.json` | Current 7-day window from the inverter |
| `recipients.json` | Messenger/WhatsApp recipient list |

The `data/` folder is bind-mounted in Docker so history persists across container rebuilds.

## Project Structure

```
├── server.js          # Express backend — inverter proxy, SSE, file I/O
├── public/
│   ├── index.html     # Dashboard layout
│   ├── app.js         # Charts, KPI, recipients, scheduling logic
│   └── style.css      # Dark theme (CSS variables)
├── Dockerfile
└── docker-compose.yml
```

## License

MIT — [jaccoolcode](https://github.com/jaccoolcode)
