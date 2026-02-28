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
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
  document.getElementById('nav-' + tab)?.classList.add('active');
  window.scrollTo(0, 0);
}

// Fix nav IDs
document.getElementById('nav-portfolio').setAttribute('id','nav-portfolio');

function fmt(n) {
  if (Math.abs(n) >= 1000) return '₹' + (n/1000).toFixed(1) + 'K Cr';
  return '₹' + n.toFixed(1) + ' Cr';
}

function fmtP(n) { return n.toFixed(1) + '%'; }

function runDCF() {
  // Inputs
  const company   = document.getElementById('companyName').value || 'Company';
  const stockP    = parseFloat(document.getElementById('stockPrice').value);
  const shares    = parseFloat(document.getElementById('shares').value);
  const netDebt   = parseFloat(document.getElementById('netDebt').value);
  const rev0      = parseFloat(document.getElementById('revenue').value);
  const ebitdaMgn = parseFloat(document.getElementById('ebitdaMargin').value)/100;
  const tax       = parseFloat(document.getElementById('taxRate').value)/100;
  const capexPct  = parseFloat(document.getElementById('capex').value)/100;
  const gHigh     = parseFloat(document.getElementById('growthHigh').value)/100;
  const gLow      = parseFloat(document.getElementById('growthLow').value)/100;
  const tgr       = parseFloat(document.getElementById('tgr').value)/100;
  const wacc      = parseFloat(document.getElementById('wacc').value)/100;
  const evEbitdaM = parseFloat(document.getElementById('evEbitda').value);
  const peM       = parseFloat(document.getElementById('pe').value);
  const eps       = parseFloat(document.getElementById('eps').value);

  // Build projection rows
  let rows = [];
  let rev = rev0;
  let totalPV = 0;

  for (let yr = 1; yr <= 10; yr++) {
    const g = yr <= 5 ? gHigh : gLow;
    rev = rev * (1 + g);
    const ebitda = rev * ebitdaMgn;
    const nopat  = ebitda * (1 - tax);
    const capexA = rev * capexPct;
    const fcf    = nopat - capexA;
    const df     = Math.pow(1 + wacc, yr);
    const pvFcf  = fcf / df;
    totalPV += pvFcf;
    rows.push({ yr, rev, ebitda, fcf, pvFcf });
  }

  // Terminal value
  const lastFCF = rows[9].fcf;
  const tv      = lastFCF * (1 + tgr) / (wacc - tgr);
  const pvTV    = tv / Math.pow(1 + wacc, 10);
  const enterpriseValue = totalPV + pvTV;
  const equityValue     = enterpriseValue - netDebt;
  const intrinsic       = equityValue / shares;
  const upside          = ((intrinsic - stockP) / stockP) * 100;

  // EV/EBITDA & P/E
  const ebitdaY5  = rows[4].ebitda;
  const evByEbitda= ebitdaY5 * evEbitdaM;
  const eqEV      = (evByEbitda - netDebt) / shares;
  const peVal     = eps * peM;

  // Render
  const container = document.getElementById('dcfResults');
  container.innerHTML = `
    <div class="result-card">
      <div class="result-card-title">Valuation Summary — ${company}</div>
      <div class="valuation-summary">
        <div class="val-metric">
          <div class="val-metric-label">DCF Intrinsic Value</div>
          <div class="val-metric-value">₹${intrinsic.toFixed(0)}</div>
        </div>
        <div class="val-metric">
          <div class="val-metric-label">Current Price</div>
          <div class="val-metric-value" style="color:var(--text);">₹${stockP.toFixed(0)}</div>
        </div>
        <div class="val-metric">
          <div class="val-metric-label">Upside / Downside</div>
          <div class="val-metric-value ${upside>=0?'positive':'negative'}">${upside>=0?'+':''}${upside.toFixed(1)}%</div>
        </div>
        <div class="val-metric">
          <div class="val-metric-label">Enterprise Value</div>
          <div class="val-metric-value" style="font-size:1.1rem;">${fmt(enterpriseValue)}</div>
        </div>
        <div class="val-metric">
          <div class="val-metric-label">EV/EBITDA Value</div>
          <div class="val-metric-value" style="font-size:1.1rem;">₹${eqEV.toFixed(0)}</div>
        </div>
        <div class="val-metric">
          <div class="val-metric-label">P/E Value</div>
          <div class="val-metric-value" style="font-size:1.1rem;">₹${peVal.toFixed(0)}</div>
        </div>
      </div>
    </div>

    <div class="result-card">
      <div class="result-card-title">10-Year Free Cash Flow Projection</div>
      <table>
        <thead>
          <tr>
            <th>Year</th>
            <th>Revenue (₹Cr)</th>
            <th>EBITDA (₹Cr)</th>
            <th>FCF (₹Cr)</th>
            <th>PV of FCF (₹Cr)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r=>`
            <tr ${r.yr===5||r.yr===10?'class="highlight"':''}>
              <td>Year ${r.yr}</td>
              <td>${r.rev.toFixed(0)}</td>
              <td>${r.ebitda.toFixed(0)}</td>
              <td>${r.fcf.toFixed(0)}</td>
              <td>${r.pvFcf.toFixed(0)}</td>
            </tr>
          `).join('')}
          <tr class="highlight">
            <td>Terminal Value</td>
            <td>—</td>
            <td>—</td>
            <td>${tv.toFixed(0)}</td>
            <td>${pvTV.toFixed(0)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="result-card">
      <div class="result-card-title">Football Field Analysis</div>
      <div class="football-field" id="ffChart">
        ${buildFootballField(intrinsic, eqEV, peVal, stockP)}
      </div>
    </div>

    <div class="result-card">
      <div class="result-card-title">Sensitivity Analysis — Intrinsic Value (₹) vs WACC & Terminal Growth</div>
      ${buildHeatmap(rev0, ebitdaMgn, tax, capexPct, gHigh, gLow, netDebt, shares, wacc, tgr, stockP)}
    </div>
  `;
}

function buildFootballField(dcf, ev, pe, current) {
  const values = [dcf, ev, pe, current];
  const max = Math.max(...values) * 1.2;

  const pct = v => Math.min((v/max)*100, 100);

  return `
    <div style="margin-bottom:1rem;font-size:0.75rem;color:var(--muted);font-family:'DM Mono',monospace;">
      All values in ₹ per share &nbsp;|&nbsp; ●Current Price: ₹${current.toFixed(0)}
    </div>
    <div class="ff-row">
      <div class="ff-label">DCF Value</div>
      <div class="ff-bar-container">
        <div class="ff-bar dcf-bar" style="width:${pct(dcf)}%">₹${dcf.toFixed(0)}</div>
      </div>
    </div>
    <div class="ff-row">
      <div class="ff-label">EV/EBITDA</div>
      <div class="ff-bar-container">
        <div class="ff-bar ev-bar" style="width:${pct(ev)}%">₹${ev.toFixed(0)}</div>
      </div>
    </div>
    <div class="ff-row">
      <div class="ff-label">P/E Multiple</div>
      <div class="ff-bar-container">
        <div class="ff-bar pe-bar" style="width:${pct(pe)}%">₹${pe.toFixed(0)}</div>
      </div>
    </div>
    <div class="ff-row">
      <div class="ff-label">Current Price</div>
      <div class="ff-bar-container">
        <div class="ff-bar" style="width:${pct(current)}%;background:var(--border);color:var(--text);">₹${current.toFixed(0)}</div>
      </div>
    </div>
  `;
}

function buildHeatmap(rev0, ebitdaMgn, tax, capexPct, gHigh, gLow, netDebt, shares, baseWacc, baseTgr, stockP) {
  const waccRange = [-0.02, -0.01, 0, 0.01, 0.02];
  const tgrRange  = [-0.01, -0.005, 0, 0.005, 0.01];

  function calcIntrinsic(w, t) {
    let rev = rev0;
    let totalPV = 0;
    for (let yr = 1; yr <= 10; yr++) {
      const g = yr <= 5 ? gHigh : gLow;
      rev = rev * (1 + g);
      const fcf = rev * ebitdaMgn * (1-tax) - rev * capexPct;
      const pvFcf = fcf / Math.pow(1+w, yr);
      totalPV += pvFcf;
    }
    const lastFCF = rev * ebitdaMgn * (1-tax) - rev * capexPct;
    const tv = lastFCF * (1+t) / (w - t);
    const pvTV = tv / Math.pow(1+w, 10);
    return (totalPV + pvTV - netDebt) / shares;
  }

  const cells = [];
  for (let i = 0; i < tgrRange.length; i++) {
    for (let j = 0; j < waccRange.length; j++) {
      cells.push(calcIntrinsic(baseWacc + waccRange[j], baseTgr + tgrRange[i]));
    }
  }

  const minV = Math.min(...cells), maxV = Math.max(...cells);

  function cellColor(v) {
    const pct = (v - minV) / (maxV - minV);
    if (pct > 0.7) return `hsl(160,60%,${25+pct*20}%)`;
    if (pct > 0.4) return `hsl(45,70%,${30+pct*15}%)`;
    return `hsl(0,55%,${25+pct*20}%)`;
  }

  let html = `
    <div class="sensitivity-label">Rows: Terminal Growth Rate &nbsp;|&nbsp; Columns: WACC (base ± delta)</div>
    <div class="heatmap-grid">
      <div class="hm-header">TGR \\ WACC</div>
      ${waccRange.map(w=>`<div class="hm-header">${((baseWacc+w)*100).toFixed(1)}%</div>`).join('')}
  `;

  for (let i = 0; i < tgrRange.length; i++) {
    html += `<div class="hm-row-label">${((baseTgr+tgrRange[i])*100).toFixed(1)}%</div>`;
    for (let j = 0; j < waccRange.length; j++) {
      const v = cells[i*5+j];
      const isBase = (waccRange[j]===0 && tgrRange[i]===0);
      html += `<div class="hm-cell" style="background:${cellColor(v)};${isBase?'outline:2px solid var(--accent);':''}">${v.toFixed(0)}</div>`;
    }
  }

  html += `</div>
    <div style="margin-top:1rem;font-size:0.72rem;color:var(--muted);font-family:'DM Mono',monospace;">
      Green = Higher intrinsic value &nbsp;|&nbsp; Red = Lower intrinsic value &nbsp;|&nbsp; Outlined cell = Base case
    </div>
  `;

  return html;
}
