const themeToggle = document.getElementById('theme-toggle');
const root = document.documentElement;

function applyTheme(theme) {
  root.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
}

applyTheme(localStorage.getItem('theme') || 'dark');

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
  return a >= 1e12 ? `${s}${sym}${fmt(a / 1e12, 2)}T` : a >= 1e9 ? `${s}${sym}${fmt(a / 1e9, 1)}B` : a >= 1e6 ? `${s}${sym}${fmt(a / 1e6, 0)}M` : `${s}${sym}${fmt(a, 0)}`;
};
const fmtP = (n) => `${fmt(n, 1)}%`;

const DEFAULTS = {
  companyName: '', ticker: '', currency: 'USD', sym: '$',
  revenue: 0, ebitdaMargin: 25, daPercent: 4, taxRate: 21, capexPercent: 5, nwcPercent: 2,
  revenueGrowth: [10, 9, 8, 7, 6],
  wacc: 10, terminalGrowth: 3, evEbitdaMultiple: 15, terminalMethod: 'gordon',
  netDebt: 0, sharesOut: 1000, currentPrice: 0,
};

let state = {
  inp: { ...DEFAULTS },
  ticker: 'RELIANCE.NS',
  loading: false,
  status: null,
  tab: 'inputs'
};

function calcDCF(inp) {
  let rev = inp.revenue;
  const proj = [1, 2, 3, 4, 5].map((y, i) => {
    rev = rev * (1 + inp.revenueGrowth[i] / 100);
    const ebitda = rev * (inp.ebitdaMargin / 100), da = rev * (inp.daPercent / 100);
    const ebit = ebitda - da, nopat = ebit * (1 - inp.taxRate / 100);
    const capex = rev * (inp.capexPercent / 100), nwc = rev * (inp.nwcPercent / 100);
    const fcf = nopat + da - capex - nwc, df = 1 / Math.pow(1 + inp.wacc / 100, y);
    return { year: 2024 + y, rev, ebitda, da, ebit, nopat, capex, nwc, fcf, df, pvFCF: fcf * df };
  });

  const pvFCFSum = proj.reduce((s, p) => s + p.pvFCF, 0);
  const lastFCF = proj[4].fcf, lastEBITDA = proj[4].ebitda;
  const tv = inp.terminalMethod === 'gordon'
    ? (lastFCF * (1 + inp.terminalGrowth / 100)) / ((inp.wacc - inp.terminalGrowth) / 100)
    : lastEBITDA * inp.evEbitdaMultiple;
  const pvTV = tv / Math.pow(1 + inp.wacc / 100, 5);
  const ev = pvFCFSum + pvTV, eqV = ev - inp.netDebt;
  const impliedPrice = eqV / inp.sharesOut, tvPct = (pvTV / ev) * 100;
  const upside = inp.currentPrice > 0 ? ((impliedPrice / inp.currentPrice) - 1) * 100 : null;
  const sensRows = [-2, -1, 0, 1, 2].map((d) => inp.wacc + d);
  const sensCols = [-1, -0.5, 0, 0.5, 1].map((d) => inp.terminalGrowth + d);
  const sensitivity = sensRows.map((w) => sensCols.map((tg) => {
    const tvS = inp.terminalMethod === 'gordon' ? (lastFCF * (1 + tg / 100)) / ((w - tg) / 100) : lastEBITDA * inp.evEbitdaMultiple;
    return (pvFCFSum + tvS / Math.pow(1 + w / 100, 5) - inp.netDebt) / inp.sharesOut;
  }));
  return { proj, pvFCFSum, pvTV, tv, ev, eqV, impliedPrice, tvPct, upside, sensitivity, sensRows, sensCols };
}

function setInput(k, v) { state.inp = { ...state.inp, [k]: v }; }
function setGrowth(i, v) {
  const g = [...state.inp.revenueGrowth];
  g[i] = parseFloat(v) || 0;
  setInput('revenueGrowth', g);
}

function renderStatus() {
  const el = document.getElementById('fetchStatus');
  if (!state.status) { el.className = ''; el.textContent = ''; return; }
  el.className = state.status.ok ? 'status-ok' : 'status-err';
  el.textContent = state.status.msg;
}

function renderHeader(dcf) {
  const { inp } = state;
  const sym = inp.sym || '$';
  document.getElementById('coName').innerHTML = `${inp.companyName || '— Enter ticker above & hit FETCH DATA —'}${inp.ticker ? `<span style="color:var(--muted);font-size:14px;margin-left:10px">(${inp.ticker})</span>` : ''}`;
  document.getElementById('coSub').textContent = `${inp.currentPrice > 0 ? `CURRENT PRICE: ${sym}${fmt(inp.currentPrice, 2)} · ` : ''}DCF VALUATION MODEL · ${inp.currency || 'USD'} MILLIONS`;

  const kpiGrid = document.getElementById('kpiGrid');
  if (inp.revenue <= 0) { kpiGrid.innerHTML = ''; return; }
  const items = [
    { label: 'Enterprise Value', val: fmtB(dcf.ev * 1e6, sym), cls: '' },
    { label: 'Equity Value', val: fmtB(dcf.eqV * 1e6, sym), cls: 'white' },
    { label: 'Implied Price', val: `${sym}${fmt(dcf.impliedPrice, 2)}`, cls: '' },
    ...(dcf.upside !== null ? [{ label: 'Upside/(Downside)', val: `${dcf.upside >= 0 ? '+' : ''}${fmt(dcf.upside, 1)}%`, cls: dcf.upside >= 0 ? 'green' : 'red' }] : []),
  ];
  kpiGrid.innerHTML = items.map((k) => `<div class="kpi-item"><div class="kpi-label">${k.label}</div><div class="kpi-value ${k.cls}">${k.val}</div></div>`).join('');
}

function renderInnerTabs() {
  const TABS = ['inputs', 'projections', 'valuation', 'sensitivity'];
  const tabs = document.getElementById('dcfInnerTabs');
  tabs.innerHTML = TABS.map((t) => `<button class="tab${state.tab === t ? ' active' : ''}" data-tab="${t}">${t}</button>`).join('');
  tabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; renderDCF(); }));
}

function renderInputs(sym) {
  const { inp } = state;
  return `
  <div class="grid-2">
    <div class="card">
      <div class="card-title">Company Data</div>
      ${[
        { label: 'Company Name', k: 'companyName', type: 'text' },
        { label: 'Ticker', k: 'ticker', type: 'text' },
        { label: `Revenue (${sym}M)`, k: 'revenue' },
        { label: `Net Debt (${sym}M)`, k: 'netDebt' },
        { label: 'Shares Out (M)', k: 'sharesOut' },
        { label: `Current Price (${sym})`, k: 'currentPrice' },
      ].map((f) => `<div class="inp-row"><span class="inp-label">${f.label}</span><input data-key="${f.k}" data-type="${f.type || 'number'}" type="${f.type || 'number'}" value="${inp[f.k]}" class="inp-field${f.type === 'text' ? ' tl' : ''}" /></div>`).join('')}
    </div>
    <div class="card">
      <div class="card-title">Operating Assumptions</div>
      ${[
        ['EBITDA Margin (%)', 'ebitdaMargin'], ['D&A (% Revenue)', 'daPercent'], ['Tax Rate (%)', 'taxRate'], ['CapEx (% Revenue)', 'capexPercent'], ['NWC Change (% Revenue)', 'nwcPercent']
      ].map((f) => `<div class="inp-row"><span class="inp-label">${f[0]}</span><input data-key="${f[1]}" data-type="number" type="number" step="0.5" value="${inp[f[1]]}" class="inp-field" /></div>`).join('')}
    </div>
    <div class="card">
      <div class="card-title">Revenue Growth by Year (%)</div>
      ${[1,2,3,4,5].map((y,i)=>`<div class="inp-row"><span class="inp-label">Year ${y} · ${2024+y}</span><input data-growth="${i}" type="number" step="0.5" value="${inp.revenueGrowth[i]}" class="inp-field" /></div>`).join('')}
    </div>
    <div class="card">
      <div class="card-title">Discount Rate & Terminal Value</div>
      <div class="inp-row"><span class="inp-label">WACC (%)</span><input data-key="wacc" data-type="number" type="number" step="0.25" value="${inp.wacc}" class="inp-field" /></div>
      <div class="inp-row"><span class="inp-label">Terminal Method</span>
        <select data-key="terminalMethod" data-type="text" class="inp-field tl">
          <option value="gordon" ${inp.terminalMethod==='gordon'?'selected':''}>Gordon Growth Model</option>
          <option value="multiple" ${inp.terminalMethod==='multiple'?'selected':''}>EV/EBITDA Exit Multiple</option>
        </select>
      </div>
      ${inp.terminalMethod==='gordon'
        ? `<div class="inp-row"><span class="inp-label">Terminal Growth (%)</span><input data-key="terminalGrowth" data-type="number" type="number" step="0.25" value="${inp.terminalGrowth}" class="inp-field" /></div>`
        : `<div class="inp-row"><span class="inp-label">EV/EBITDA Multiple</span><input data-key="evEbitdaMultiple" data-type="number" type="number" step="0.5" value="${inp.evEbitdaMultiple}" class="inp-field" /></div>`
      }
    </div>
  </div>`;
}

function renderProjections(dcf, sym) {
  const rows = [
    {label:'Revenue',k:'rev',bold:true},{label:'EBITDA',k:'ebitda'},{label:'D&A',k:'da'},{label:'EBIT',k:'ebit'},{label:'NOPAT',k:'nopat'},{label:'CapEx',k:'capex'},{label:'NWC Change',k:'nwc'},{label:'Free Cash Flow',k:'fcf',hi:true},{label:'Discount Factor',k:'df',fmt4:true},{label:'PV of FCF',k:'pvFCF',bold:true}
  ];
  return `<div class="card"><div class="card-title">5-Year Free Cash Flow Projections (${sym}M)</div><div style="overflow-x:auto"><table class="data-table"><thead><tr>${['Metric',...dcf.proj.map(p=>p.year)].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr class="${r.hi?'row-hi':r.bold?'row-bold':''}"><td>${r.label}</td>${dcf.proj.map(p=>`<td>${r.fmt4?fmt(p[r.k],4):fmtB(p[r.k]*1e6,sym)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}

function renderValuation(dcf, sym) {
  const { inp } = state;
  const rows = [
    {lbl:'PV of FCFs (Years 1–5)',val:fmtB(dcf.pvFCFSum*1e6,sym)},
    {lbl:'PV of Terminal Value',val:fmtB(dcf.pvTV*1e6,sym)},
    {lbl:'Enterprise Value',val:fmtB(dcf.ev*1e6,sym),cls:'val-total',sep:true},
    {lbl:'Less: Net Debt',val:`(${fmtB(inp.netDebt*1e6,sym)})`,color:'var(--red)'},
    {lbl:'Equity Value',val:fmtB(dcf.eqV*1e6,sym),cls:'val-total',sep:true},
    {lbl:'Shares Outstanding',val:`${fmt(inp.sharesOut,0)}M`},
    {lbl:'Implied Share Price',val:`${sym}${fmt(dcf.impliedPrice,2)}`,cls:'val-implied',sep:true},
    ...(inp.currentPrice>0?[{lbl:'Current Market Price',val:`${sym}${fmt(inp.currentPrice,2)}`},{lbl:'Upside / (Downside)',val:`${dcf.upside>=0?'+':''}${fmt(dcf.upside,1)}%`,color:dcf.upside>=0?'var(--green)':'var(--red)'}]:[])
  ];
  return `<div class="grid-2"><div class="card"><div class="card-title">Valuation Bridge</div>${rows.map(item=>`<div class="val-row ${item.cls||''}" style="${item.sep?'border-top:1px solid var(--border2);margin-top:2px;':''}"><span class="vl">${item.lbl}</span><span class="vn" style="font-family:var(--mono);font-weight:600;color:${item.color||'var(--amber2)'}">${item.val}</span></div>`).join('')}</div><div class="card"><div class="card-title">Key Metrics</div><div class="metric-grid">${[
    {l:'WACC',v:fmtP(inp.wacc)},
    {l:inp.terminalMethod==='gordon'?'Terminal Growth':'Exit Multiple',v:inp.terminalMethod==='gordon'?fmtP(inp.terminalGrowth):`${fmt(inp.evEbitdaMultiple,1)}x`},
    {l:'Terminal Value',v:fmtB(dcf.tv*1e6,sym)},
    {l:'TV % of EV',v:fmtP(dcf.tvPct)},
    {l:'EBITDA Margin',v:fmtP(inp.ebitdaMargin)},
    {l:'5yr Avg FCF',v:fmtB((dcf.proj.reduce((s,p)=>s+p.fcf,0)/5)*1e6,sym)},
  ].map(m=>`<div class="metric-card"><div class="ml">${m.l}</div><div class="mv">${m.v}</div></div>`).join('')}</div></div></div>`;
}

function renderSensitivity(dcf, sym) {
  const all = dcf.sensitivity.flat(); const mn = Math.min(...all), mx = Math.max(...all);
  return `<div class="card"><div class="card-title">Sensitivity · Implied Share Price (${sym}) · WACC vs Terminal Growth</div><div style="overflow-x:auto"><table class="sens-table"><thead><tr><th>WACC \\ TGR</th>${dcf.sensCols.map(c=>`<th>${fmtP(c)}</th>`).join('')}</tr></thead><tbody>${dcf.sensitivity.map((row,ri)=>`<tr><th>${fmtP(dcf.sensRows[ri])}</th>${row.map((val,ci)=>{const t=(val-mn)/(mx-mn||1); const isBase=ri===2&&ci===2; const bg=isBase?'':t>0.65?`rgba(16,185,129,${0.1+t*0.35})`:t<0.35?`rgba(239,68,68,${0.1+(1-t)*0.35})`:''; return `<td class="${isBase?'sens-base':''}" style="background:${bg};color:${isBase?'':'inherit'}">${sym}${fmt(val,2)}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div><p style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:10px">Highlighted cell = base case · Green = higher valuation · Red = lower</p></div>`;
}

function bindInputs() {
  const content = document.getElementById('dcfContent');
  content.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('input', () => {
      const key = el.dataset.key;
      const type = el.dataset.type;
      setInput(key, type === 'text' ? el.value : (parseFloat(el.value) || 0));
      renderDCF();
    });
  });
  content.querySelectorAll('[data-growth]').forEach((el) => {
    el.addEventListener('input', () => {
      setGrowth(Number(el.dataset.growth), el.value);
      renderDCF();
    });
  });
}

function renderLoading() {
  document.getElementById('dcfContent').innerHTML = `<div class="card loading-overlay"><div class="big-spinner"></div><span>Fetching financial data for <strong style="color:var(--amber)">${state.ticker.toUpperCase()}</strong>...</span><span style="font-size:10px;color:var(--muted)">Pulling revenue, EBITDA, balance sheet & price data</span></div>`;
}

function renderDCF() {
  const dcf = calcDCF(state.inp);
  const sym = state.inp.sym || '$';
  renderStatus();
  renderHeader(dcf);
  renderInnerTabs();

  if (state.loading) {
    renderLoading();
    return;
  }

  const content = document.getElementById('dcfContent');
  if (state.tab === 'inputs') content.innerHTML = renderInputs(sym);
  if (state.tab === 'projections') content.innerHTML = renderProjections(dcf, sym);
  if (state.tab === 'valuation') content.innerHTML = renderValuation(dcf, sym);
  if (state.tab === 'sensitivity') content.innerHTML = renderSensitivity(dcf, sym);
  if (state.tab === 'inputs') bindInputs();

  const note = document.querySelector('.dcf-terminal .note');
  note.textContent = `Powered by Claude AI · Data from training knowledge (verify with latest filings) · All values in ${state.inp.currency}M unless stated · For analytical purposes only`;
}

function demoProfile(ticker) {
  const t = ticker.toUpperCase();
  if (t.includes('AAPL')) return { companyName: 'Apple Inc.', ticker: 'AAPL', currency: 'USD', currencySymbol: '$', currentPrice: 210, revenue: 383000, ebitdaMargin: 33, netDebt: 60000, sharesOutstanding: 15500, capexPercent: 3.5, daPercent: 2.5, taxRate: 16, revenueGrowthLast: 8 };
  if (t.includes('MSFT')) return { companyName: 'Microsoft Corporation', ticker: 'MSFT', currency: 'USD', currencySymbol: '$', currentPrice: 430, revenue: 245000, ebitdaMargin: 46, netDebt: 35000, sharesOutstanding: 7450, capexPercent: 5, daPercent: 3, taxRate: 18, revenueGrowthLast: 12 };
  if (t.includes('RELIANCE')) return { companyName: 'Reliance Industries', ticker: 'RELIANCE.NS', currency: 'INR', currencySymbol: '₹', currentPrice: 2900, revenue: 1000000, ebitdaMargin: 16, netDebt: 285000, sharesOutstanding: 6760, capexPercent: 6, daPercent: 4, taxRate: 25, revenueGrowthLast: 10 };
  return { companyName: ticker.toUpperCase(), ticker: ticker.toUpperCase(), currency: 'USD', currencySymbol: '$', currentPrice: 120, revenue: 50000, ebitdaMargin: 25, netDebt: 10000, sharesOutstanding: 1000, capexPercent: 5, daPercent: 4, taxRate: 21, revenueGrowthLast: 10 };
}

async function fetchData() {
  const tickerInput = document.getElementById('dcfTicker').value.trim();
  state.ticker = tickerInput || state.ticker;

  if (!state.ticker.trim()) {
    state.status = { ok: false, msg: 'Enter a ticker symbol.' };
    renderDCF();
    return;
  }

  state.loading = true;
  state.status = null;
  renderDCF();

  try {
    const prompt = `You are a financial data assistant. Return ONLY a valid JSON object (no markdown, no explanation) with real financial data for ticker: ${state.ticker.toUpperCase()} and fields companyName,ticker,currency,currencySymbol,currentPrice,revenue,ebitdaMargin,netDebt,sharesOutstanding,capexPercent,daPercent,taxRate,revenueGrowthLast.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const text = (data.content || []).map((c) => c.text || '').join('').trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const fin = JSON.parse(clean);

    const g0 = Math.min(35, Math.max(3, fin.revenueGrowthLast || 10));
    const growthArr = [g0, g0 * 0.88, g0 * 0.78, g0 * 0.70, g0 * 0.64].map((x) => parseFloat(x.toFixed(1)));

    state.inp = {
      companyName: fin.companyName || state.ticker,
      ticker: fin.ticker || state.ticker,
      currency: fin.currency || 'USD',
      sym: fin.currencySymbol || '$',
      currentPrice: fin.currentPrice || 0,
      revenue: fin.revenue || 0,
      ebitdaMargin: parseFloat((fin.ebitdaMargin || 25).toFixed(1)),
      daPercent: parseFloat((fin.daPercent || 4).toFixed(1)),
      taxRate: parseFloat((fin.taxRate || 21).toFixed(1)),
      capexPercent: parseFloat((fin.capexPercent || 5).toFixed(1)),
      nwcPercent: 2,
      netDebt: fin.netDebt || 0,
      sharesOut: fin.sharesOutstanding || 1000,
      revenueGrowth: growthArr,
      wacc: fin.currency === 'INR' ? 12 : 10,
      terminalGrowth: fin.currency === 'INR' ? 4 : 3,
      evEbitdaMultiple: 15,
      terminalMethod: 'gordon',
    };
    state.status = { ok: true, msg: `✓ Loaded ${state.inp.companyName} (${state.inp.ticker}) · ${state.inp.currency} · FY data` };
    state.tab = 'inputs';
  } catch (e) {
    const fin = demoProfile(state.ticker);
    const g0 = Math.min(35, Math.max(3, fin.revenueGrowthLast || 10));
    const growthArr = [g0, g0 * 0.88, g0 * 0.78, g0 * 0.70, g0 * 0.64].map((x) => parseFloat(x.toFixed(1)));
    state.inp = {
      companyName: fin.companyName,
      ticker: fin.ticker,
      currency: fin.currency,
      sym: fin.currencySymbol,
      currentPrice: fin.currentPrice,
      revenue: fin.revenue,
      ebitdaMargin: fin.ebitdaMargin,
      daPercent: fin.daPercent,
      taxRate: fin.taxRate,
      capexPercent: fin.capexPercent,
      nwcPercent: 2,
      netDebt: fin.netDebt,
      sharesOut: fin.sharesOutstanding,
      revenueGrowth: growthArr,
      wacc: fin.currency === 'INR' ? 12 : 10,
      terminalGrowth: fin.currency === 'INR' ? 4 : 3,
      evEbitdaMultiple: 15,
      terminalMethod: 'gordon'
    };
    state.status = { ok: false, msg: `Live fetch unavailable (${e.message}). Loaded demo data for ${fin.ticker}.` };
    state.tab = 'inputs';
  } finally {
    state.loading = false;
    renderDCF();
  }
}

document.getElementById('dcfTicker').value = state.ticker;
document.getElementById('fetchDataBtn').addEventListener('click', fetchData);
document.getElementById('dcfTicker').addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchData(); });
renderDCF();
