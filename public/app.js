'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
// Set your WhatsApp number in international format WITHOUT the + sign.
// Example: '48123456789' for Poland (+48).  Leave empty to open WhatsApp without a preset contact.
const WHATSAPP_NUMBER = '';

// Your Messenger self-conversation URL (messenger.com → your own chat → copy URL).
const MESSENGER_URL = 'https://www.messenger.com/e2ee/t/1256897136187768';

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS      = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const YEARS     = ['2024','2025','2026'];
const YR_COLORS = ['#4a90e2','#4caf77','#f0a500'];

// ── State ─────────────────────────────────────────────────────────────────────
let monthlyChart  = null;
let weeklyChart   = null;
let solarData     = null;
let weekData      = null;
let recipients    = [];
let scheduleTimer = null;
let scheduleInterval = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupCharts();
  await loadData();
  await loadRecipients();
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

// ── History Fetch (SSE) ───────────────────────────────────────────────────────
function startHistoryFetch() {
  const btn   = el('btnHistory');
  const wrap  = el('progressWrap');
  const bar   = el('progressBar');
  const label = el('progressLabel');

  btn.disabled    = true;
  btn.textContent = '⏳ Fetching…';
  wrap.style.display = 'block';
  bar.style.width    = '0%';
  label.textContent  = 'Connecting to inverter…';

  const evtSrc = new EventSource('/api/fetch-history');

  evtSrc.onmessage = async e => {
    const data = JSON.parse(e.data);

    if (data.done) {
      evtSrc.close();
      bar.style.width    = '100%';
      label.textContent  = `✅ Complete — ${data.totalDays} days loaded`;
      btn.disabled       = false;
      btn.textContent    = '✅ History Loaded';
      await loadData();
      showToast(`✅ ${data.totalDays} days of history loaded!`);
      setTimeout(() => { wrap.style.display = 'none'; }, 4000);

    } else if (data.error) {
      evtSrc.close();
      label.textContent  = '❌ Error: ' + data.error;
      btn.disabled       = false;
      btn.textContent    = '📥 Fetch All History';
      showToast('❌ History fetch error');

    } else {
      const pct = Math.round((data.progress / data.total) * 100);
      bar.style.width   = pct + '%';
      label.textContent = `Scanning week ${data.progress} of ${data.total} (${pct}%)…`;
    }
  };

  evtSrc.onerror = () => {
    evtSrc.close();
    label.textContent = '❌ Connection lost';
    btn.disabled      = false;
    btn.textContent   = '📥 Fetch All History';
    showToast('❌ History fetch interrupted');
  };
}

// ── Messaging ─────────────────────────────────────────────────────────────────
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

function sendToMessenger() {
  const msg = buildStatsMessage();
  navigator.clipboard.writeText(msg)
    .then(() => {
      window.open(MESSENGER_URL, '_blank');
      showToast('📋 Stats copied — paste in Messenger!');
    })
    .catch(() => {
      window.open(MESSENGER_URL, '_blank');
      showToast('💬 Messenger opened — copy stats manually');
    });
}

function sendToWhatsApp() {
  const msg     = buildStatsMessage();
  const encoded = encodeURIComponent(msg);
  const url     = WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank');
  showToast('📱 Opening WhatsApp…');
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
    tsEl.textContent = 'No data yet — click "Fetch All History" to begin';
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

// ── Recipients ────────────────────────────────────────────────────────────────
async function loadRecipients() {
  try {
    recipients = await fetch('/api/recipients').then(r => r.json());
    renderRecipients();
  } catch { recipients = []; renderRecipients(); }
}

function renderRecipients() {
  const list = el('recipientsList');
  if (!recipients.length) {
    list.innerHTML = '<li class="recipient-empty">No recipients yet — click + Add</li>';
    return;
  }
  list.innerHTML = recipients.map((r, i) => `
    <li class="recipient-item">
      <span class="recipient-icon">${r.type === 'messenger' ? '💬' : '📱'}</span>
      <span class="recipient-name">${r.name}</span>
      <span class="recipient-url">${r.url}</span>
      <button class="recipient-remove" onclick="removeRecipient(${i})" title="Remove">✕</button>
    </li>`).join('');
}

async function saveRecipients() {
  await fetch('/api/recipients', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(recipients)
  });
}

function addRecipient() {
  const name = prompt('Recipient name (e.g. "Jacek"):');
  if (!name) return;
  const url  = prompt('Messenger conversation URL\n(e.g. https://www.messenger.com/e2ee/t/...):');
  if (!url) return;
  const type = url.includes('whatsapp') ? 'whatsapp' : 'messenger';
  recipients.push({ name: name.trim(), type, url: url.trim() });
  renderRecipients();
  saveRecipients();
  showToast(`✅ Added recipient: ${name}`);
}

function removeRecipient(index) {
  const r = recipients[index];
  recipients.splice(index, 1);
  renderRecipients();
  saveRecipients();
  showToast(`🗑️ Removed: ${r.name}`);
}

// ── Send to All ───────────────────────────────────────────────────────────────
function sendToAllRecipients() {
  if (!recipients.length) { showToast('⚠️ No recipients configured'); return; }
  const msg = buildStatsMessage();
  navigator.clipboard.writeText(msg).catch(() => {});
  let delay = 0;
  for (const r of recipients) {
    setTimeout(() => window.open(r.url, '_blank'), delay);
    delay += 800;
  }
  showToast(`📨 Opened ${recipients.length} conversation(s) — paste with Ctrl+V`);
}

// ── Scheduled Send ────────────────────────────────────────────────────────────
function scheduleStats() {
  if (!recipients.length) { showToast('⚠️ Add at least one recipient first'); return; }
  const delaySec = parseInt(el('scheduleDelay').value, 10);
  let remaining  = delaySec;

  el('btnSchedule').style.display       = 'none';
  el('btnCancelSchedule').style.display = 'inline-block';
  el('countdownDisplay').style.display  = 'flex';
  el('countdownRing').textContent       = remaining;

  scheduleInterval = setInterval(() => {
    remaining--;
    el('countdownRing').textContent = remaining;
    if (remaining <= 0) {
      clearInterval(scheduleInterval);
      scheduleInterval = null;
      el('countdownDisplay').style.display  = 'none';
      el('btnSchedule').style.display       = 'inline-block';
      el('btnCancelSchedule').style.display = 'none';
      sendToAllRecipients();
    }
  }, 1000);
}

function cancelSchedule() {
  clearInterval(scheduleInterval);
  scheduleInterval = null;
  el('countdownDisplay').style.display  = 'none';
  el('btnSchedule').style.display       = 'inline-block';
  el('btnCancelSchedule').style.display = 'none';
  showToast('⏹️ Schedule cancelled');
}

// ── Utility ───────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
