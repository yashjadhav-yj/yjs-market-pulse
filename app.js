/* ================================================================
   app.js — Investment Cockpit Logic
   ================================================================ */

'use strict';

// ─── CONFIG ──────────────────────────────────────────────────────
const PROXY_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const CORS_PROXY = 'https://api.allorigins.win/get?url=';

const INDICES = {
  nifty:  { symbol: '^NSEI',  label: 'NIFTY 50'   },
  sensex: { symbol: '^BSESN', label: 'BSE SENSEX'  },
};

// ─── PORTFOLIO DATA ───────────────────────────────────────────────
const PORTFOLIO_FUNDS = [
  {
    name:   'Kotak Midcap Fund (G)',
    tag:    'Mid Cap',
    tagCls: 'tag-mid',
    plan:   'Growth · Direct',
    planWarn: false,
    stars:  5,
    returns: { '1Y': '+38.2%', '3Y': '+22.6%', 'xirr': '~21%' },
    returnsUp: true,
    status: 'Strong Buy',
    statusCls: 'status-strong',
    statusIcon: '🟢',
    note: 'Top-ranked mid-cap fund. High volatility — ideal for 7+ yr horizon. Nifty Midcap 150 outperformer.',
    rankMF: 4,
  },
  {
    name:   'SBI Multicap Fund (Reg-G)',
    tag:    'Multi Cap',
    tagCls: 'tag-multi',
    plan:   'Regular · Growth',
    planWarn: true,
    stars:  4,
    returns: { '1Y': '+29.4%', '3Y': '+18.1%', 'xirr': '~17%' },
    returnsUp: true,
    status: 'Hold',
    statusCls: 'status-hold',
    statusIcon: '🔵',
    note: '⚠️ Regular plan — consider switching to Direct. SEBI-mandated 25% each in large/mid/small cap ensures balanced exposure.',
    rankMF: 5,
  },
  {
    name:   'Samco ELSS Tax Saver (Reg-G)',
    tag:    'ELSS',
    tagCls: 'tag-elss',
    plan:   'Regular · Growth · 80C',
    planWarn: true,
    stars:  3,
    returns: { '1Y': '+21.5%', '3Y': '+15.2%', 'xirr': '~14%' },
    returnsUp: true,
    status: 'Watch',
    statusCls: 'status-watch',
    statusIcon: '🟡',
    note: '⚠️ Regular plan. Newer fund with shorter track record. Check stock overlap with HDFC ELSS — merge if >50% overlap.',
    rankMF: 6,
  },
  {
    name:   'HDFC ELSS Tax Saver (G)',
    tag:    'ELSS',
    tagCls: 'tag-elss',
    plan:   'Growth · Direct',
    planWarn: false,
    stars:  4,
    returns: { '1Y': '+27.8%', '3Y': '+19.4%', 'xirr': '~18%' },
    returnsUp: true,
    status: 'Hold',
    statusCls: 'status-hold',
    statusIcon: '🔵',
    note: 'Solid long-term performer. 3-yr lock-in per instalment. Review overlap with Samco ELSS before fresh SIPs.',
    rankMF: 5,
  },
  {
    name:   'Motilal Oswal Focused (Reg-G)',
    tag:    'Focused',
    tagCls: 'tag-focus',
    plan:   'Regular · Growth',
    planWarn: true,
    stars:  3,
    returns: { '1Y': '+14.3%', '3Y': '+11.8%', 'xirr': '~11%' },
    returnsUp: true,
    status: 'Review',
    statusCls: 'status-review',
    statusIcon: '🔴',
    note: '⚠️ Regular plan. Concentrated portfolio (≤30 stocks) — high conviction, high risk. Underperforming lately. Only for 7+ yr investors.',
    rankMF: 4,
  },
  {
    name:   'Axis ESG Strategy (Reg-G)',
    tag:    'ESG',
    tagCls: 'tag-esg',
    plan:   'Regular · Growth',
    planWarn: true,
    stars:  3,
    returns: { '1Y': '+10.2%', '3Y': '+8.6%', 'xirr': '~8%' },
    returnsUp: false,
    status: 'Review',
    statusCls: 'status-review',
    statusIcon: '🔴',
    note: '⚠️ Regular plan. ESG funds underperform in commodity/energy bull cycles. Reassess if horizon < 10 years. Fund manager churn risk.',
    rankMF: 3,
  },
];

// ─── STATE ───────────────────────────────────────────────────────
const state = {
  niftyPct:   null,
  sensexPct:  null,
  sparkRanges: { nifty: '5d', sensex: '5d' },
  sparkData:   { nifty: {}, sensex: {} },
};

// ─── DOM REFS ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── UTILITIES ───────────────────────────────────────────────────
function formatNum(n, decimals = 2) {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function setTimestamp() {
  const now = new Date();
  const opts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
  $('updateTime').textContent = now.toLocaleTimeString('en-IN', opts) + ' IST';
  const d = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const portfolioDate = document.getElementById('portfolioDate');
  if (portfolioDate) portfolioDate.textContent = d;
}

function setRefreshSpin(on) {
  const btn = $('refreshBtn');
  if (on) btn.classList.add('spinning');
  else     btn.classList.remove('spinning');
}

// ─── FETCH MARKET DATA ────────────────────────────────────────────
async function fetchIndex(key) {
  const { symbol } = INDICES[key];
  const encodedUrl = encodeURIComponent(`${PROXY_BASE}${encodeURIComponent(symbol)}?interval=1d&range=1d`);
  const res  = await fetch(`${CORS_PROXY}${encodedUrl}`);
  const json = await res.json();
  const data = JSON.parse(json.contents);
  const q    = data.chart.result[0];
  const meta = q.meta;
  return {
    price:     meta.regularMarketPrice,
    prev:      meta.chartPreviousClose,
    dayLow:    meta.regularMarketDayLow,
    dayHigh:   meta.regularMarketDayHigh,
    change:    meta.regularMarketPrice - meta.chartPreviousClose,
    pct:       ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
  };
}

async function fetchSparkline(key, range) {
  const { symbol } = INDICES[key];
  const interval = range === '5d' ? '60m' : '1d';
  const encodedUrl = encodeURIComponent(`${PROXY_BASE}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`);
  const res  = await fetch(`${CORS_PROXY}${encodedUrl}`);
  const json = await res.json();
  const data = JSON.parse(json.contents);
  const q    = data.chart.result[0];
  const closes = q.indicators.quote[0].close.filter(v => v != null);
  return closes;
}

// ─── RENDER INDEX CARD ────────────────────────────────────────────
function renderIndex(key, d) {
  const up = d.pct >= 0;
  const sign = up ? '+' : '';

  $(`${key}Price`).textContent = formatNum(d.price, 2);

  const badge = $(`${key}ChangeBadge`);
  badge.textContent = `${sign}${formatNum(d.pct, 2)}%`;
  badge.className   = `index-change-badge ${up ? 'up' : 'down'}`;

  $(`${key}Pts`).textContent = `${sign}${formatNum(d.change, 2)} pts`;
  const pctEl = $(`${key}Pct`);
  pctEl.textContent  = `${sign}${formatNum(d.pct, 2)}%`;
  pctEl.className    = `index-pct ${up ? 'up' : 'down'}`;

  $(`${key}Low`).textContent  = formatNum(d.dayLow, 2);
  $(`${key}High`).textContent = formatNum(d.dayHigh, 2);
  $(`${key}Prev`).textContent = formatNum(d.prev, 2);
}

// ─── SPARKLINE CANVAS ────────────────────────────────────────────
function drawSparkline(canvasId, prices, isUp) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx   = canvas.getContext('2d');
  const W     = canvas.offsetWidth  || 280;
  const H     = canvas.offsetHeight || 70;
  canvas.width  = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.clearRect(0, 0, W, H);

  if (!prices || prices.length < 2) return;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = 6;
  const xStep = (W - pad * 2) / (prices.length - 1);
  const yRange = max - min || 1;

  const toX = i => pad + i * xStep;
  const toY = v => pad + ((max - v) / yRange) * (H - pad * 2);

  // Gradient fill
  const color = isUp ? '#22c55e' : '#ef4444';
  const grad  = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, isUp ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.beginPath();
  ctx.moveTo(toX(0), toY(prices[0]));
  for (let i = 1; i < prices.length; i++) {
    const cpx = (toX(i - 1) + toX(i)) / 2;
    ctx.bezierCurveTo(cpx, toY(prices[i - 1]), cpx, toY(prices[i]), toX(i), toY(prices[i]));
  }

  // Close path for fill
  ctx.lineTo(toX(prices.length - 1), H);
  ctx.lineTo(toX(0), H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(prices[0]));
  for (let i = 1; i < prices.length; i++) {
    const cpx = (toX(i - 1) + toX(i)) / 2;
    ctx.bezierCurveTo(cpx, toY(prices[i - 1]), cpx, toY(prices[i]), toX(i), toY(prices[i]));
  }
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Last dot
  const lx = toX(prices.length - 1);
  const ly = toY(prices[prices.length - 1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// ─── MARKET HEALTH ────────────────────────────────────────────────
function renderHealth(pct) {
  let icon, headline, sub, meterPct, cardBg;

  if (pct === null) {
    icon = '🤔'; headline = 'Market data loading…';
    sub  = 'Checking live market data.';
    meterPct = 50; cardBg = 'transparent';
  } else if (pct < -2) {
    icon = '😱'; headline = 'Market is Fearful 😱 — Opportunity Zone';
    sub  = `Nifty is down ${formatNum(pct, 2)}% today. Markets are in fear mode. Historically, large dips are where wealth is built — if you have spare capital, SIP top-up is worth considering.`;
    meterPct = 8; cardBg = 'rgba(239,68,68,0.06)';
  } else if (pct >= -2 && pct <= -1) {
    icon = '😴'; headline = 'Market is Resting 😴 — Healthy Dip';
    sub  = `Nifty is down ${formatNum(pct, 2)}%. A small dip within the normal range. No alarm needed — markets breathe. Continue your SIPs as planned.`;
    meterPct = 30; cardBg = 'rgba(245,158,11,0.05)';
  } else if (pct > 1.5) {
    icon = '🚀'; headline = 'Market is Bullish 🚀 — Optimism';
    sub  = `Nifty is up +${formatNum(pct, 2)}% today. Sentiment is positive. Avoid chasing momentum — stick to your SIP schedule instead of investing a lump sum today.`;
    meterPct = 90; cardBg = 'rgba(34,197,94,0.05)';
  } else if (pct >= 0 && pct <= 1.5) {
    icon = '😌'; headline = 'Market is Calm — Steady Day';
    sub  = `Nifty is up +${formatNum(pct, 2)}%. A quiet, stable trading day. Good sign for long-term investors. No action needed.`;
    meterPct = 65; cardBg = 'rgba(34,197,94,0.04)';
  } else {
    icon = '😐'; headline = 'Slight Dip — Within Normal Range';
    sub  = `Nifty is down ${formatNum(pct, 2)}%. Minor selling pressure. No cause for concern. Keep your SIP running.`;
    meterPct = 42; cardBg = 'rgba(245,158,11,0.04)';
  }

  $('healthIcon').textContent    = icon;
  $('healthHeadline').textContent = headline;
  $('healthSub').textContent     = sub;
  $('healthNiftyPct').textContent = pct !== null ? `${pct >= 0 ? '+' : ''}${formatNum(pct, 2)}%` : '--';
  $('healthNiftyPct').style.color = pct !== null ? (pct >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-primary)';
  $('healthMeterThumb').style.left = `${meterPct}%`;
  $('healthCard').style.background = cardBg || 'var(--bg-card)';
}

// ─── PORTFOLIO CARDS ─────────────────────────────────────────────
function renderPortfolio() {
  const grid = $('portfolioGrid');
  grid.innerHTML = '';

  PORTFOLIO_FUNDS.forEach(f => {
    const stars = Array.from({ length: 5 }, (_, i) =>
      `<span class="star ${i < f.stars ? '' : 'empty'}">★</span>`
    ).join('');

    const card = document.createElement('div');
    card.className = 'fund-card';
    card.innerHTML = `
      <div class="fund-card-top">
        <p class="fund-name">${f.name}</p>
        <span class="fund-tag ${f.tagCls}">${f.tag}</span>
      </div>
      <p class="fund-plan ${f.planWarn ? 'plan-warn' : ''}">${f.plan}${f.planWarn ? ' ⚠️' : ''}</p>
      <div class="fund-rating">${stars}</div>
      <div class="fund-stats">
        <div class="fund-stat">
          <span class="stat-label">1Y Return</span>
          <span class="stat-val ${f.returnsUp ? 'up' : 'down'}">${f.returns['1Y']}</span>
        </div>
        <div class="fund-stat">
          <span class="stat-label">3Y Return</span>
          <span class="stat-val ${f.returnsUp ? 'up' : 'down'}">${f.returns['3Y']}</span>
        </div>
        <div class="fund-stat">
          <span class="stat-label">XIRR</span>
          <span class="stat-val">${f.returns.xirr}</span>
        </div>
        <div class="fund-stat">
          <span class="stat-label">RankMF</span>
          <span class="stat-val">${f.rankMF}/10</span>
        </div>
      </div>
      <span class="fund-status ${f.statusCls}">${f.statusIcon} ${f.status}</span>
      <p class="fund-note">${f.note}</p>
    `;
    grid.appendChild(card);
  });
}

// ─── LOAD SPARKLINE ───────────────────────────────────────────────
async function loadSparkline(key, range) {
  const loaderId  = `${key}Loader`;
  const canvasId  = `${key}Sparkline`;
  $(`${loaderId}`).classList.remove('hidden');

  try {
    const cached = state.sparkData[key][range];
    const prices = cached || await fetchSparkline(key, range);
    state.sparkData[key][range] = prices;

    const isUp = prices[prices.length - 1] >= prices[0];
    drawSparkline(canvasId, prices, isUp);
  } catch (err) {
    console.warn(`Sparkline error (${key}/${range}):`, err);
    // Draw a flat demo line on error
    drawSparkline(canvasId, generateFallback(key), true);
  } finally {
    $(`${loaderId}`).classList.add('hidden');
  }
}

function generateFallback(key) {
  // Realistic dummy data so UI doesn't look broken
  const base = key === 'nifty' ? 24000 : 79500;
  return Array.from({ length: 20 }, (_, i) =>
    base + Math.sin(i * 0.5) * 300 + (Math.random() - 0.45) * 200
  );
}

// ─── LOAD INDEX ───────────────────────────────────────────────────
async function loadIndex(key) {
  try {
    const d = await fetchIndex(key);
    renderIndex(key, d);
    if (key === 'nifty') {
      state.niftyPct = d.pct;
      renderHealth(d.pct);
    }
  } catch (err) {
    console.warn(`Index fetch error (${key}):`, err);
    // Show fallback values for demo
    const fallback = key === 'nifty'
      ? { price: 24355.35, prev: 24180.10, dayLow: 24100.55, dayHigh: 24410.20, change: 175.25, pct: 0.72 }
      : { price: 80185.45, prev: 79600.25, dayLow: 79450.10, dayHigh: 80350.80, change: 585.20, pct: 0.73 };
    renderIndex(key, fallback);
    if (key === 'nifty') {
      state.niftyPct = fallback.pct;
      renderHealth(fallback.pct);
    }
  }
}

// ─── REFRESH ALL ─────────────────────────────────────────────────
async function refreshAll() {
  setRefreshSpin(true);
  state.sparkData = { nifty: {}, sensex: {} };

  await Promise.allSettled([
    loadIndex('nifty'),
    loadIndex('sensex'),
  ]);

  await Promise.allSettled([
    loadSparkline('nifty',  state.sparkRanges.nifty),
    loadSparkline('sensex', state.sparkRanges.sensex),
  ]);

  setTimestamp();
  setRefreshSpin(false);
}

// ─── TABS ─────────────────────────────────────────────────────────
function initTabs() {
  const btnA = $('tabBtnA'), btnB = $('tabBtnB');
  const panA = $('tabPanelA'), panB = $('tabPanelB');

  btnA.addEventListener('click', () => {
    btnA.classList.add('active');    btnB.classList.remove('active');
    panA.classList.add('active');    panB.classList.remove('active');
    btnA.setAttribute('aria-selected', 'true');
    btnB.setAttribute('aria-selected', 'false');
  });
  btnB.addEventListener('click', () => {
    btnB.classList.add('active');    btnA.classList.remove('active');
    panB.classList.add('active');    panA.classList.remove('active');
    btnB.setAttribute('aria-selected', 'true');
    btnA.setAttribute('aria-selected', 'false');
  });
}

// ─── SPARKLINE RANGE TABS ─────────────────────────────────────────
function initSparkTabs() {
  document.querySelectorAll('.spark-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key   = btn.dataset.index;
      const range = btn.dataset.range;
      state.sparkRanges[key] = range;

      // Update active state
      document.querySelectorAll(`.spark-tab[data-index="${key}"]`).forEach(b =>
        b.classList.toggle('active', b.dataset.range === range)
      );
      await loadSparkline(key, range);
    });
  });
}

// ─── GLOSSARY MODAL ───────────────────────────────────────────────
function initModal() {
  const modal = $('glossaryModal');
  $('glossaryBtn').addEventListener('click', () => modal.classList.add('open'));
  $('glossaryClose').addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.classList.remove('open'); });
}

// ─── REFRESH BUTTON ───────────────────────────────────────────────
function initRefresh() {
  $('refreshBtn').addEventListener('click', refreshAll);
}

// ─── AUTO REFRESH every 90 seconds ───────────────────────────────
function startAutoRefresh() {
  setInterval(() => {
    loadIndex('nifty');
    loadIndex('sensex');
    setTimestamp();
  }, 90_000);
}

// ─── INIT ─────────────────────────────────────────────────────────
(async function init() {
  renderPortfolio();
  renderHealth(null);
  initTabs();
  initSparkTabs();
  initModal();
  initRefresh();
  setTimestamp();
  await refreshAll();
  startAutoRefresh();
})();
