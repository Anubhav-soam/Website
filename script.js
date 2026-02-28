const themeToggle = document.getElementById('theme-toggle');
const root = document.documentElement;

function applyTheme(theme) {
  root.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
}

const storedTheme = localStorage.getItem('theme') || 'dark';
applyTheme(storedTheme);

themeToggle.addEventListener('click', () => {
  const nextTheme = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  localStorage.setItem('theme', nextTheme);
});

function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.nav-links a').forEach((a) => a.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
  document.getElementById('nav-' + tab)?.classList.add('active');
  window.scrollTo(0, 0);
}

const fmt = (n, d = 1) => (isNaN(n) || n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtB = (n, sym = '$') => {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e12) return `${s}${sym}${fmt(a / 1e12, 2)}T`;
  if (a >= 1e9) return `${s}${sym}${fmt(a / 1e9, 1)}B`;
  if (a >= 1e6) return `${s}${sym}${fmt(a / 1e6, 0)}M`;
  return `${s}${sym}${fmt(a, 0)}`;
};
const fmtP = (n) => `${fmt(n, 1)}%`;

const DEFAULTS = {
  companyName: '', ticker: '', currency: 'USD', sym: '$',
  revenue: 50000, ebitdaMargin: 25, daPercent: 4, taxRate: 21, capexPercent: 5, nwcPercent: 2,
  revenueGrowth: [10, 9, 8, 7, 6],
  wacc: 10, terminalGrowth: 3, evEbitdaMultiple: 15, terminalMethod: 'gordon',
  netDebt: 10000, sharesOut: 1000, currentPrice: 120,
};

let inp = { ...DEFAULTS };
let ticker = 'RELIANCE.NS';
let tab = 'inputs';
const TABS = ['inputs', 'projections', 'valuation', 'sensitivity'];

function calcDCF(data) {
  let rev = data.revenue;
  const proj = [1, 2, 3, 4, 5].map((y, i) => {
    rev *= 1 + data.revenueGrowth[i] / 100;
    const ebitda = rev * (data.ebitdaMargin / 100);
    const da = rev * (data.daPercent / 100);
    const ebit = ebitda - da;
    const nopat = ebit * (1 - data.taxRate / 100);
    const capex = rev * (data.capexPercent / 100);
    const nwc = rev * (data.nwcPercent / 100);
    const fcf = nopat + da - capex - nwc;
    const df = 1 / Math.pow(1 + data.wacc / 100, y);
    return { year: 2024 + y, rev, ebitda, da, ebit, nopat, capex, nwc, fcf, df, pvFCF: fcf * df };
  });

  const pvFCFSum = proj.reduce((s, p) => s + p.pvFCF, 0);
  const lastFCF = proj[4].fcf;
  const lastEBITDA = proj[4].ebitda;
  const tv = data.terminalMethod === 'gordon'
    ? (lastFCF * (1 + data.terminalGrowth / 100)) / ((data.wacc - data.terminalGrowth) / 100)
    : lastEBITDA * data.evEbitdaMultiple;
  const pvTV = tv / Math.pow(1 + data.wacc / 100, 5);
  const ev = pvFCFSum + pvTV;
  const eqV = ev - data.netDebt;
  const impliedPrice = eqV / data.sharesOut;
  const tvPct = (pvTV / ev) * 100;
  const upside = data.currentPrice > 0 ? ((impliedPrice / data.currentPrice) - 1) * 100 : null;

  const sensRows = [-2, -1, 0, 1, 2].map((d) => data.wacc + d);
  const sensCols = [-1, -0.5, 0, 0.5, 1].map((d) => data.terminalGrowth + d);
  const sensitivity = sensRows.map((w) => sensCols.map((tg) => {
    const tvS = data.terminalMethod === 'gordon'
      ? (lastFCF * (1 + tg / 100)) / ((w - tg) / 100)
      : lastEBITDA * data.evEbitdaMultiple;
    return (pvFCFSum + tvS / Math.pow(1 + w / 100, 5) - data.netDebt) / data.sharesOut;
  }));

  return { proj, pvFCFSum, pvTV, tv, ev, eqV, impliedPrice, tvPct, upside, sensitivity, sensRows, sensCols };
}

function demoDataForTicker(t) {
  const u = t.toUpperCase();
  if (u.includes('AAPL')) return { companyName: 'Apple Inc.', ticker: 'AAPL', currency: 'USD', sym: '$', revenue: 383000, ebitdaMargin: 33, netDebt: 60000, sharesOut: 15500, currentPrice: 210 };
  if (u.includes('MSFT')) return { companyName: 'Microsoft Corp.', ticker: 'MSFT', currency: 'USD', sym: '$', revenue: 245000, ebitdaMargin: 46, netDebt: 35000, sharesOut: 7450, currentPrice: 430 };
  if (u.includes('RELIANCE')) return { companyName: 'Reliance Industries', ticker: 'RELIANCE.NS', currency: 'INR', sym: '₹', revenue: 1000000, ebitdaMargin: 16, netDebt: 285000, sharesOut: 6760, currentPrice: 2900, wacc: 12, terminalGrowth: 4 };
  return { companyName: t.toUpperCase(), ticker: t.toUpperCase(), currency: 'USD', sym: '$', revenue: 50000, ebitdaMargin: 25, netDebt: 10000, sharesOut: 1000, currentPrice: 120 };
}

function renderKpis(dcf) {
  const grid = document.getElementById('kpiGrid');
  const sym = inp.sym;
  const list = [
    { label: 'Enterprise Value', val: fmtB(dcf.ev * 1e6, sym), cls: '' },
    { label: 'Equity Value', val: fmtB(dcf.eqV * 1e6, sym), cls: 'white' },
    { label: 'Implied Price', val: `${sym}${fmt(dcf.impliedPrice, 2)}`, cls: '' },
  ];
  if (dcf.upside !== null) list.push({ label: 'Upside/(Downside)', val: `${dcf.upside >= 0 ? '+' : ''}${fmt(dcf.upside, 1)}%`, cls: dcf.upside >= 0 ? 'green' : 'red' });
  grid.innerHTML = list.map((k) => `<div class="kpi-item"><div class="kpi-label">${k.label}</div><div class="kpi-value ${k.cls}">${k.val}</div></div>`).join('');
}

function renderTabs() {
  const c = document.getElementById('dcfInnerTabs');
  c.innerHTML = TABS.map((t) => `<button class="tab${tab === t ? ' active' : ''}" data-tab="${t}">${t}</button>`).join('');
  c.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; renderDCF(); }));
}

function inputsView() {
  const sym = inp.sym;
  const rows = [
    ['Company Name', 'companyName', 'text'], ['Ticker', 'ticker', 'text'], [`Revenue (${sym}M)`, 'revenue', 'number'],
    [`Net Debt (${sym}M)`, 'netDebt', 'number'], ['Shares Out (M)', 'sharesOut', 'number'], [`Current Price (${sym})`, 'currentPrice', 'number'],
    ['EBITDA Margin (%)', 'ebitdaMargin', 'number'], ['D&A (% Revenue)', 'daPercent', 'number'], ['Tax Rate (%)', 'taxRate', 'number'],
    ['CapEx (% Revenue)', 'capexPercent', 'number'], ['NWC Change (% Revenue)', 'nwcPercent', 'number'], ['WACC (%)', 'wacc', 'number'],
    ['Terminal Growth (%)', 'terminalGrowth', 'number'], ['EV/EBITDA Multiple', 'evEbitdaMultiple', 'number']
  ];

  const growth = [1, 2, 3, 4, 5].map((y, i) => `<div class="inp-row"><span class="inp-label">Year ${y} Growth (%)</span><input data-growth="${i}" class="inp-field" type="number" value="${inp.revenueGrowth[i]}"></div>`).join('');

  return `<div class="card"><div class="card-title">Inputs</div>${rows.map(([l,k,t])=>`<div class="inp-row"><span class="inp-label">${l}</span><input data-key="${k}" class="inp-field ${t==='text'?'tl':''}" type="${t}" value="${inp[k]}"></div>`).join('')}<div class="card-title" style="margin-top:12px;">Revenue Growth by Year</div>${growth}</div>`;
}

function projectionsView(dcf) {
  return `<div class="card"><div class="card-title">5-Year Free Cash Flow Projections (${inp.sym}M)</div><div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Metric</th>${dcf.proj.map(p=>`<th>${p.year}</th>`).join('')}</tr></thead><tbody>${[
    ['Revenue','rev'],['EBITDA','ebitda'],['D&A','da'],['EBIT','ebit'],['NOPAT','nopat'],['CapEx','capex'],['NWC Change','nwc'],['Free Cash Flow','fcf'],['Discount Factor','df'],['PV of FCF','pvFCF']
  ].map(r=>`<tr><td>${r[0]}</td>${dcf.proj.map(p=>`<td>${r[1]==='df'?fmt(p[r[1]],4):fmtB(p[r[1]]*1e6,inp.sym)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}

function valuationView(dcf) {
  return `<div class="grid-2"><div class="card"><div class="card-title">Valuation Bridge</div>
  <div class="val-row"><span class="vl">PV of FCFs (Years 1–5)</span><span>${fmtB(dcf.pvFCFSum*1e6,inp.sym)}</span></div>
  <div class="val-row"><span class="vl">PV of Terminal Value</span><span>${fmtB(dcf.pvTV*1e6,inp.sym)}</span></div>
  <div class="val-row val-total"><span class="vl">Enterprise Value</span><span>${fmtB(dcf.ev*1e6,inp.sym)}</span></div>
  <div class="val-row"><span class="vl">Less: Net Debt</span><span>(${fmtB(inp.netDebt*1e6,inp.sym)})</span></div>
  <div class="val-row val-total"><span class="vl">Equity Value</span><span>${fmtB(dcf.eqV*1e6,inp.sym)}</span></div>
  <div class="val-row"><span class="vl">Implied Share Price</span><span>${inp.sym}${fmt(dcf.impliedPrice,2)}</span></div>
  </div><div class="card"><div class="card-title">Key Metrics</div><div class="metric-grid">
  <div class="metric-card"><div class="ml">WACC</div><div class="mv">${fmtP(inp.wacc)}</div></div>
  <div class="metric-card"><div class="ml">Terminal Growth</div><div class="mv">${fmtP(inp.terminalGrowth)}</div></div>
  <div class="metric-card"><div class="ml">Terminal Value</div><div class="mv">${fmtB(dcf.tv*1e6,inp.sym)}</div></div>
  <div class="metric-card"><div class="ml">TV % of EV</div><div class="mv">${fmtP(dcf.tvPct)}</div></div>
  </div></div></div>`;
}

function sensitivityView(dcf) {
  const all = dcf.sensitivity.flat(); const mn = Math.min(...all), mx = Math.max(...all);
  return `<div class="card"><div class="card-title">Sensitivity · Implied Share Price (${inp.sym})</div><div style="overflow-x:auto"><table class="sens-table"><thead><tr><th>WACC \\ TGR</th>${dcf.sensCols.map(c=>`<th>${fmtP(c)}</th>`).join('')}</tr></thead><tbody>${dcf.sensitivity.map((row,ri)=>`<tr><th>${fmtP(dcf.sensRows[ri])}</th>${row.map((v,ci)=>{const t=(v-mn)/(mx-mn||1);const isBase=ri===2&&ci===2;const bg=isBase?'':'rgba('+ (t>0.5?'16,185,129':'239,68,68') +','+(0.15+t*0.25)+')';return `<td class="${isBase?'sens-base':''}" style="background:${bg}">${inp.sym}${fmt(v,2)}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}

function renderDCF() {
  const dcf = calcDCF(inp);
  document.getElementById('coName').innerHTML = `${inp.companyName || '—'} ${inp.ticker ? `<span style="color:var(--muted);font-size:14px">(${inp.ticker})</span>` : ''}`;
  document.getElementById('coSub').textContent = `${inp.currentPrice ? `CURRENT PRICE: ${inp.sym}${fmt(inp.currentPrice, 2)} · ` : ''}DCF VALUATION MODEL · ${inp.currency} MILLIONS`;
  renderKpis(dcf);
  renderTabs();

  const content = document.getElementById('dcfContent');
  if (tab === 'inputs') content.innerHTML = inputsView();
  if (tab === 'projections') content.innerHTML = projectionsView(dcf);
  if (tab === 'valuation') content.innerHTML = valuationView(dcf);
  if (tab === 'sensitivity') content.innerHTML = sensitivityView(dcf);

  content.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('input', () => {
      const k = el.dataset.key;
      inp[k] = el.type === 'text' ? el.value : (parseFloat(el.value) || 0);
      renderDCF();
    });
  });
  content.querySelectorAll('[data-growth]').forEach((el) => {
    el.addEventListener('input', () => {
      inp.revenueGrowth[Number(el.dataset.growth)] = parseFloat(el.value) || 0;
      renderDCF();
    });
  });
}

function fetchData() {
  const t = document.getElementById('dcfTicker').value.trim();
  if (!t) return;
  const info = demoDataForTicker(t);
  inp = { ...inp, ...info, revenueGrowth: [10, 9, 8, 7, 6] };
  document.getElementById('fetchStatus').className = 'status-ok';
  document.getElementById('fetchStatus').textContent = `✓ Loaded sample profile for ${info.ticker}`;
  renderDCF();
}

document.getElementById('dcfTicker').value = ticker;
document.getElementById('fetchDataBtn').addEventListener('click', fetchData);
renderDCF();
