'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS      = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const YEARS     = ['2024','2025','2026'];
const YR_COLORS = ['#4a90e2','#4caf77','#f0a500'];

// ── State ─────────────────────────────────────────────────────────────────────
let monthlyChart = null;
let weeklyChart  = null;
let solarData    = null;
let weekData     = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupCharts();
  await loadData();
  startAutoRefresh();
});

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const [solar, week] = await Promise.all([
      fetch('/api/data').then(r => r.json()),
      fetch('/api/week').then(r => r.json())
    ]);
    solarData = solar;
    weekData  = week;
    renderAll();
  } catch (err) {
    console.error('Load error:', err);
    document.getElementById('lastUpdated').textContent =
      '⚠️ Server unreachable — run: node server.js';
  }
}

function renderAll() {
  renderCards();
  renderMonthlyChart();
  renderWeeklyChart();
  updateTimestamp();
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────
function renderCards() {
  const days   = solarData?.days   || {};
  const months = solarData?.months || {};
  const now    = new Date();
  const y      = String(now.getFullYear());
  const m      = String(now.getMonth() + 1).padStart(2, '0');

  // This month
  const monthTotal = months[y]?.[m] || 0;
  el('kpiMonth').textContent = monthTotal.toFixed(1);

  // Last 7 days total
  const weekTotal = +(weekData?.total || 0);
  el('kpiWeek').textContent  = weekTotal.toFixed(1);
  el('weekTotal').textContent = weekTotal.toFixed(1);

  // Best single day
  let bestDate = null, bestVal = 0;
  for (const [date, val] of Object.entries(days)) {
    if (val > bestVal) { bestVal = val; bestDate = date; }
  }
  if (bestDate) {
    el('kpiBest').textContent     = bestVal.toFixed(1);
    const [by, bm, bd] = bestDate.split('-');
    el('kpiBestDate').textContent = `${bd}/${bm}/${by}`;
  } else {
    el('kpiBest').textContent     = '—';
    el('kpiBestDate').textContent = 'kWh';
  }

  // All-time total
  const total = Object.values(days).reduce((a, b) => a + b, 0);
  el('kpiTotal').textContent = total >= 1000
    ? (total / 1000).toFixed(2) + ' MWh'
    : total.toFixed(0);
}

// ── Charts ────────────────────────────────────────────────────────────────────
function setupCharts() {
  Chart.defaults.color       = '#5e7399';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';

  // Monthly comparison
  const mCtx = document.getElementById('monthlyChart').getContext('2d');
  monthlyChart = new Chart(mCtx, {
    type: 'bar',
    data: {
      labels:   MONTHS,
      datasets: YEARS.map((yr, i) => ({
        label:           yr,
        data:            Array(12).fill(0),
        backgroundColor: YR_COLORS[i],
        borderRadius:    5,
        borderSkipped:   false,
      }))
    },
    options: {
      responsive:         true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} kWh`
          }
        }
      },
      scales: {
        x: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { font: { size: 12 } }
        },
        y: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          title: { display: true, text: 'kWh', color: '#5e7399', font: { size: 11 } },
          beginAtZero: true,
          ticks: { font: { size: 12 } }
        }
      }
    }
  });

  // Last 7 days
  const wCtx = document.getElementById('weeklyChart').getContext('2d');
  weeklyChart = new Chart(wCtx, {
    type: 'bar',
    data: {
      labels:   [],
      datasets: [{
        label:           'Energy (kWh)',
        data:            [],
        backgroundColor: 'rgba(0,201,201,0.72)',
        borderColor:     '#00c9c9',
        borderWidth:     1,
        borderRadius:    7,
        borderSkipped:   false,
      }]
    },
    options: {
      responsive:         true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y.toFixed(2)} kWh`
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { size: 12 } } },
        y: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          title: { display: true, text: 'kWh', color: '#5e7399', font: { size: 11 } },
          beginAtZero: true,
          ticks: { font: { size: 12 } }
        }
      }
    }
  });
}

function renderMonthlyChart() {
  if (!monthlyChart || !solarData) return;
  const months = solarData.months || {};
  YEARS.forEach((yr, i) => {
    const yData = months[yr] || {};
    monthlyChart.data.datasets[i].data = MONTHS.map((_, mi) => {
      const mm = String(mi + 1).padStart(2, '0');
      return yData[mm] || 0;
    });
  });
  monthlyChart.update();
}

function renderWeeklyChart() {
  if (!weeklyChart || !weekData) return;
  const { dates = [], values = [] } = weekData;
  const now = new Date();

  weeklyChart.data.labels = dates.map(d => {
    const [mm, dd] = d.split('/');
    const dateObj  = new Date(now.getFullYear(), parseInt(mm) - 1, parseInt(dd));
    return `${DAYS[dateObj.getDay()]} ${d}`;
  });
  weeklyChart.data.datasets[0].data = values;
  weeklyChart.update();
}

function toggleYear(index) {
  if (!monthlyChart) return;
  const ds = monthlyChart.data.datasets[index];
  ds.hidden = !ds.hidden;
  monthlyChart.update();
}

// ── Refresh ───────────────────────────────────────────────────────────────────
async function refresh() {
  const btn = el('btnRefresh');
  btn.disabled    = true;
  btn.textContent = '⏳ Refreshing…';
  try {
    const res  = await fetch('/api/refresh', { method: 'POST' });
    const body = await res.json();
    if (body.success) {
      await loadData();
      showToast('✅ Data refreshed!');
    } else {
      showToast('❌ Refresh failed: ' + (body.error || 'Unknown'));
    }
  } catch {
    showToast('❌ Cannot reach server');
  } finally {
    btn.disabled    = false;
    btn.textContent = '🔄 Refresh';
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function buildStatsMessage() {
  const now       = new Date();
  const y         = String(now.getFullYear());
  const m         = String(now.getMonth() + 1).padStart(2, '0');
  const monthName = MONTHS[now.getMonth()];
  const monthKwh  = ((solarData?.months?.[y]?.[m]) || 0).toFixed(1);

  const { dates = [], values = [], total = 0 } = weekData || {};

  const dayLines = dates.map((d, i) => {
    const [mm, dd] = d.split('/');
    const dateObj  = new Date(now.getFullYear(), parseInt(mm) - 1, parseInt(dd));
    return `  ${DAYS[dateObj.getDay()]} ${d}: ${(values[i] || 0).toFixed(2)} kWh`;
  });

  return [
    '☀️ Solar Stats Report',
    '',
    '📅 Last 7 days:',
    ...dayLines,
    `  ──────────────────`,
    `  Total: ${(+total).toFixed(1)} kWh`,
    '',
    `📊 ${monthName} ${y} total so far: ${monthKwh} kWh`
  ].join('\n');
}

function copyStats() {
  const msg = buildStatsMessage();
  navigator.clipboard.writeText(msg)
    .then(() => showToast('📋 Stats copied to clipboard!'))
    .catch(() => showToast('❌ Clipboard access denied'));
}

// ── Auto-refresh (hourly) ─────────────────────────────────────────────────────
function startAutoRefresh() {
  setInterval(async () => {
    try {
      await fetch('/api/refresh', { method: 'POST' });
      await loadData();
    } catch { /* silent */ }
  }, 3_600_000);  // 1 hour
}

// ── Timestamp ─────────────────────────────────────────────────────────────────
function updateTimestamp() {
  const tsEl = el('lastUpdated');
  if (solarData?.lastFetched) {
    tsEl.textContent = 'Last updated: ' + new Date(solarData.lastFetched).toLocaleString();
  } else {
    tsEl.textContent = 'No data yet — click Refresh to begin';
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Utility ───────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
