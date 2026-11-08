/* Gilded Ace floor review. All figures are computed client-side from window.DATA (see submission/code/build_data.py). */
(function () {
'use strict';
const D = window.DATA, R = D.results, M = D.machines, P = D.prop, Z = D.zones;
const dates = P.dates, ND = dates.length;
const $ = s => document.querySelector(s);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const usd = (n, d = 0) => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const usdK = n => { const a = Math.abs(n), s = n < 0 ? '−' : ''; return a >= 1e6 ? s + '$' + (a / 1e6).toFixed(2) + 'M' : a >= 1e4 ? s + '$' + (a / 1e3).toFixed(0) + 'k' : a >= 1e3 ? s + '$' + (a / 1e3).toFixed(1) + 'k' : s + '$' + a.toFixed(0); };
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const spct = (x, d = 1) => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d) + '%';
const num = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d });
const sum = (a, i0, i1) => { let s = 0; for (let i = i0; i <= i1; i++) s += a[i]; return s; };
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const monthOf = d => d.slice(0, 7);
const MONTHS = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'];
const MLAB = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const idx = d => dates.indexOf(d);
const uniq = a => [...new Set(a)].sort();

/* ---------------------------------------------------------------- state & controls */

const S = { gran: 'week', d0: 0, d1: ND - 1, zone: 'All', bank: 'All', theme: 'All', mfr: 'All', reg: 'All', age: 'All', tier: 'All', lor: 'all|all' };
const GL = { day: 'day', week: 'week', month: 'month', quarter: 'quarter', year: 'year' };
function bucketize(i0, i1, g) {
  const keyOf = d => { if (g === 'day') return d; if (g === 'month') return d.slice(0, 7); if (g === 'year') return d.slice(0, 4);
    if (g === 'quarter') return d.slice(0, 4) + 'Q' + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1);
    const t = new Date(d + 'T00:00:00Z'), dow = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dow); return t.toISOString().slice(0, 10); };
  const labelOf = (k, d) => g === 'day' || g === 'week' ? d.slice(5) : g === 'month' ? MLAB[+d.slice(5, 7) - 1] : g === 'quarter' ? 'Q' + k.slice(-1) + ' ' + k.slice(0, 4) : k;
  const of = new Array(ND).fill(-1), spans = [], labels = [], keys = []; 
  for (let i = i0; i <= i1; i++) { const k = keyOf(dates[i]); let j = keys.indexOf(k); if (j < 0) { keys.push(k); spans.push([i, i]); labels.push(labelOf(k, dates[i])); j = keys.length - 1; } else spans[j][1] = i; of[i] = j; }
  if (g === 'week' && labels.length >= 3) { // leave out partial weeks at the edges so a one-day week does not distort the line
    const keep = spans.map(([a, b], j) => (b - a + 1 === 7) || (j > 0 && j < spans.length - 1)); const kept = keep.map((k, j) => k ? j : -1).filter(j => j >= 0);
    if (kept.length >= 2 && kept.length < spans.length) { const remap = {}; kept.forEach((j, n) => remap[j] = n);
      const ns = kept.map(j => spans[j]), nl = kept.map(j => labels[j]); const nof = of.map(j => j < 0 ? -1 : (j in remap ? remap[j] : (j < kept[0] ? 0 : kept.length - 1)));
      return { labels: nl, spans: ns, of: nof, n: nl.length }; }
  }
  return { labels, spans, of, n: labels.length };
}
const chartType = B => B.n <= 3 ? 'bar' : 'line';
const spanTitle = (B, j) => { const [a, b] = B.spans[j]; return a === b ? dates[a] : dates[a] + ' to ' + dates[b] + ' (' + (b - a + 1) + ' days)'; };
const MINDAYS = { day: 1, week: 7, month: 28, quarter: 89, year: 365 };
function updateGran() {
  const n = S.d1 - S.d0 + 1; let ok = Object.keys(MINDAYS).filter(g => n >= MINDAYS[g]);
  if (!ok.includes(S.gran)) S.gran = ok[ok.length - 1];
  document.querySelectorAll('#gran button').forEach(b => { const dis = n < MINDAYS[b.dataset.g]; b.disabled = dis; b.title = dis ? (b.dataset.g === 'year' ? 'Not available: the data covers six months' : 'Not available: the selected range is too short') : ''; b.classList.toggle('on', b.dataset.g === S.gran); });
}
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); $('#themeLbl').textContent = t === 'dark' ? 'Dark' : 'Light'; try { localStorage.setItem('gilded-theme', t); } catch (e) { } }
function fillSel(id, vals, cur) { $(id).innerHTML = ['All', ...vals].map(v => `<option${v === cur ? ' selected' : ''}>${v}</option>`).join(''); }
function fillBanks() { fillSel('#fBank', uniq(M.filter(m => S.zone === 'All' || m.zone === S.zone).map(m => m.bank)), S.bank); }
function initControls() {
  $('#d0').value = dates[S.d0]; $('#d1').value = dates[S.d1];
  const onDate = () => { let a = idx($('#d0').value), b = idx($('#d1').value); if (a < 0 || b < 0) return; if (a > b) [a, b] = [b, a]; S.d0 = a; S.d1 = b; $('#d0').value = dates[a]; $('#d1').value = dates[b]; renderAll(); };
  $('#d0').onchange = onDate; $('#d1').onchange = onDate;
  document.querySelectorAll('#gran button').forEach(b => { b.onclick = () => { if (b.disabled) return; S.gran = b.dataset.g; renderAll(); }; });
  fillSel('#fZone', uniq(M.map(m => m.zone)), S.zone); fillSel('#fTheme', uniq(M.map(m => m.theme)), S.theme); fillSel('#fMfr', uniq(M.map(m => m.mfr)), S.mfr); fillBanks();
  const c = D.cube.cols, rows = D.cube.rows, col = n => c.indexOf(n);
  fillSel('#gReg', uniq(rows.map(r => r[col('reg')])), S.reg); fillSel('#gAge', uniq(rows.map(r => r[col('age')])), S.age); fillSel('#gTier', uniq(rows.map(r => r[col('tier')])), S.tier);
  const bind = (id, k) => $(id).onchange = e => { S[k] = e.target.value; if (k === 'zone') { S.bank = 'All'; fillBanks(); } renderAll(); };
  bind('#fZone', 'zone'); bind('#fBank', 'bank'); bind('#fTheme', 'theme'); bind('#fMfr', 'mfr'); bind('#gReg', 'reg'); bind('#gAge', 'age'); bind('#gTier', 'tier');
  $('#reset').onclick = () => { Object.assign(S, { gran: 'week', d0: 0, d1: ND - 1, zone: 'All', bank: 'All', theme: 'All', mfr: 'All', reg: 'All', age: 'All', tier: 'All' }); initControls(); renderAll(); };
  const lg = ['all|all', ...Object.keys(D.conc.all).filter(k => k !== 'all|all')];
  $('#lorGroup').innerHTML = lg.map(k => `<option value="${k}">${k === 'all|all' ? 'All guests' : k.replace('|', ': ')}</option>`).join('');
  $('#lorGroup').value = S.lor; $('#lorGroup').onchange = e => { S.lor = e.target.value; renderLorenz(); };
}
const zoneMs = () => M.filter(m => S.zone === 'All' || m.zone === S.zone);
const selected = () => M.filter(m => (S.zone === 'All' || m.zone === S.zone) && (S.bank === 'All' || m.bank === S.bank) && (S.theme === 'All' || m.theme === S.theme) && (S.mfr === 'All' || m.mfr === S.mfr));

/* ---------------------------------------------------------------- charts */
const charts = {};
Chart.defaults.font.family = 'Manrope,system-ui,sans-serif'; Chart.defaults.font.size = 12;
function theme() { Chart.defaults.color = css('--ink2'); Chart.defaults.borderColor = css('--grid'); }
Chart.register({ id: 'bands', beforeDatasetsDraw(ch) {
  const bands = ch.data.bandList; if (!bands) return; const { ctx, chartArea: ca, scales: { x } } = ch, n = ch.data.labels.length; ctx.save();
  bands.forEach(b => { if (b.to < 0 || b.from > n - 1) return; const a0 = Math.max(0, b.from), a1 = Math.min(n - 1, b.to), hw = (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2, x0 = x.getPixelForValue(a0) - hw, x1 = x.getPixelForValue(a1) + hw;
    ctx.fillStyle = b.color; ctx.globalAlpha = b.alpha || .16; ctx.fillRect(x0, ca.top, x1 - x0, ca.bottom - ca.top); });
  ctx.restore(); } });
function mk(id, cfg) {
  const el = document.getElementById(id); if (!el) return;
  if (charts[id]) charts[id].destroy();
  { const bo = cfg.options && cfg.options.plugins && cfg.options.plugins.bands; if (bo) { cfg.data.bandList = bo.list; delete cfg.options.plugins.bands; } }
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false } }, cfg.options || {});
  cfg.options.plugins = Object.assign({ legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } } }, cfg.options.plugins || {});
  charts[id] = new Chart(el, cfg);
  const card = el.closest('.card'), hd = card && card.querySelector('.head'); if (!hd) return;
  let btn = card.querySelector(`button[data-t="${id}"]`);
  if (!btn) { btn = document.createElement('button'); btn.className = 'tbtn'; btn.textContent = 'Table'; btn.dataset.t = id; btn.setAttribute('aria-label', 'Show this chart as a table'); hd.appendChild(btn);
    const tv = document.createElement('div'); tv.className = 'tbl-view'; tv.id = 'tv_' + id; el.closest('.ch').after(tv);
    btn.onclick = () => { const v = $('#tv_' + id), show = v.style.display !== 'block'; v.style.display = show ? 'block' : 'none'; btn.classList.toggle('on', show); if (show) fillTable(id); }; }
  if ($('#tv_' + id) && $('#tv_' + id).style.display === 'block') fillTable(id);
}
function fillTable(id) {
  const ch = charts[id]; if (!ch) return; const ds = ch.data.datasets.filter(d => !d.hideInTable), lab = ch.data.labels && ch.data.labels.length ? ch.data.labels : null;
  let h = '<table><tr><th class="l">' + (lab ? '' : 'x') + '</th>' + ds.map(d => `<th>${d.label || ''}</th>`).join('') + '</tr>'; const n = Math.max(...ds.map(d => d.data.length));
  for (let i = 0; i < n; i++) h += `<tr><td class="l">${lab ? lab[i] : ''}</td>` + ds.map(d => { const v = d.data[i]; return `<td>${v && typeof v === 'object' ? `${(+v.x).toFixed(2)}, ${(+v.y).toFixed(2)}` : v == null ? '' : typeof v === 'number' ? (Math.abs(v) >= 100 ? num(v) : v.toFixed(3)) : v}</td>`; }).join('') + '</tr>';
  $('#tv_' + id).innerHTML = h + '</table>';
}
const ax = (title, o = {}) => Object.assign({ title: title ? { display: true, text: title } : undefined, grid: { color: css('--grid') } }, o);
const moneyTick = v => usdK(v);
const xdate = (L, n = 7) => ({ grid: { display: false }, ticks: { maxTicksLimit: n, callback(v) { return L[v].slice(5); } } });

/* ---------------------------------------------------------------- machine analytics */
function machineTable() {
  const rows = M.map(m => ({ m, ci: sum(m.ci, S.d0, S.d1), hw: sum(m.hw, S.d0, S.d1), theo: sum(m.theo, S.d0, S.d1), av: sum(m.av, S.d0, S.d1), sch: sum(m.sch, S.d0, S.d1), v: sum(m.var, S.d0, S.d1), sp: sum(m.sp, S.d0, S.d1), ht: sum(m.ht, S.d0, S.d1) })).filter(r => r.sch > 0);
  const act = rows.filter(r => r.av > 0), zs = uniq(act.map(r => r.m.zone)), gs = uniq(act.map(r => r.m.theme)), zf = {}, gf = {}; zs.forEach(z => zf[z] = 1); gs.forEach(g => gf[g] = 1);
  for (let it = 0; it < 60; it++) {
    zs.forEach(z => { let t = 0, d = 0; act.forEach(r => { if (r.m.zone === z) { t += r.theo; d += r.av * gf[r.m.theme]; } }); zf[z] = t / d; });
    gs.forEach(g => { let t = 0, d = 0; act.forEach(r => { if (r.m.theme === g) { t += r.theo; d += r.av * zf[r.m.zone]; } }); gf[g] = t / d; });
  }
  const Rbar = act.reduce((s, r) => s + r.theo, 0) / act.reduce((s, r) => s + r.av, 0), maxSch = Math.max(...rows.map(r => r.sch));
  rows.forEach(r => {
    r.rate = r.av > 0 ? r.theo / r.av : 0; r.exp = zf[r.m.zone] * gf[r.m.theme]; r.appeal = r.av > 0 ? r.rate / r.exp : NaN; r.luck = r.hw - r.theo; r.z = r.v > 0 ? r.luck / Math.sqrt(r.v) : 0; r.avail = r.av / r.sch;
    r.hr = r.sp > 0 ? r.ht / r.sp : 0; r.hz = r.sp > 0 ? (r.hr - r.m.hp) / Math.sqrt(r.m.hp * (1 - r.m.hp) / r.sp) : 0;
    r.cTen = Rbar * (maxSch - r.sch); r.cAv = Rbar * (r.sch - r.av); r.cStr = (Rbar - r.exp) * r.av; r.cApp = (r.exp - r.rate) * r.av; r.cLuck = -r.luck; r.gap = Rbar * maxSch - r.hw;
  });
  const full = rows.filter(r => r.sch >= .9 * maxSch && r.av > 0), lg = full.map(r => Math.log(r.appeal)).sort((a, b) => a - b), med = lg[Math.floor(lg.length / 2)];
  const mad = 1.4826 * lg.map(x => Math.abs(x - med)).sort((a, b) => a - b)[Math.floor(lg.length / 2)] || .05;
  rows.forEach(r => r.arz = (Math.log(r.appeal) - med) / mad);
  return { rows, Rbar, maxSch, mad, typical: mean(full.map(r => r.hw)) };
}
const isLeak = r => Math.abs(r.hz) > 4 || Math.abs(r.z) > 3.5;
function reasons(r) {
  if (isLeak(r)) return [['Payout setting looks wrong', 'bad']];
  const c = [['Not on the floor all period', r.cTen], ['Quiet spot, low-margin game', r.cStr], ['Bad luck', r.z < -1 ? r.cLuck : 0], ['Out of service a lot', r.avail < .98 ? r.cAv : 0], ['The machine itself looks weak', r.arz < -2.5 ? r.cApp : 0]].sort((a, b) => b[1] - a[1]);
  const out = [[c[0][0], '']]; if (c[1][1] > .25 * r.gap && c[1][1] > 2000) out.push([c[1][0], '']); return out;
}
function zoneStats() {
  return uniq(M.map(m => m.zone)).map(z => { const mm = M.filter(m => m.zone === z), h = mm.reduce((s, m) => s + sum(m.hw, S.d0, S.d1), 0), d = mm.reduce((s, m) => s + sum(m.sch, S.d0, S.d1) / 24, 0); return { z, v: d ? h / d : 0 }; }).sort((a, b) => b.v - a.v);
}

/* ---------------------------------------------------------------- 1 floor */
function renderS1() {
  const ms = zoneMs(), i0 = S.d0, i1 = S.d1, B = bucketize(i0, i1, S.gran);
  const ci = ms.reduce((s, m) => s + sum(m.ci, i0, i1), 0), hw = ms.reduce((s, m) => s + sum(m.hw, i0, i1), 0), th = ms.reduce((s, m) => s + sum(m.theo, i0, i1), 0), n = mean(dates.slice(i0, i1 + 1).map((_, k) => ms.filter(m => m.sch[i0 + k] > 0).length));
  const k = [['Money wagered', usdK(ci), 'put through the machines'], ['Money the house kept', usdK(hw), `${(hw / ci * 100).toFixed(1)}¢ of every $1 wagered`], ['Designed to keep', usdK(th), `${(th / ci * 100).toFixed(1)}¢ of every $1, from the games' payout rules`], ['Machines on the floor', num(n), 'average per day' + (S.zone === 'All' ? ', all 7 zones' : ', ' + S.zone)]];
  $('#kpis1').innerHTML = k.map(x => `<div class="tile"><div class="num">${x[1]}</div><div class="lab">${x[0]}</div><div class="foot">${x[2]}</div></div>`).join('');
  const H = B.spans.map(([a, b]) => ms.reduce((s, m) => s + sum(m.hw, a, b), 0) / (b - a + 1)), E = B.spans.map(([a, b]) => ms.reduce((s, m) => s + sum(m.theo, a, b), 0) / (b - a + 1));
  $('#t1').textContent = S.gran === 'day' ? 'Money the house kept per day' : 'Money the house kept per day, by ' + GL[S.gran];
  const bar = chartType(B) === 'bar';
  mk('cTrend', { type: bar ? 'bar' : 'line', data: { labels: B.labels, datasets: [{ label: 'House kept per day', data: H, borderColor: css('--accent'), backgroundColor: bar ? css('--accent') : css('--accent') + '22', fill: !bar, pointRadius: 0, borderWidth: 2.4, tension: B.n > 20 ? .25 : 0, borderRadius: 6 }, { label: 'Designed to keep per day', data: E, borderColor: css('--muted'), backgroundColor: css('--line'), pointRadius: 0, borderWidth: bar ? 0 : 2, borderDash: bar ? [] : [6, 4], tension: B.n > 20 ? .25 : 0, borderRadius: 6 }] },
    options: { scales: { y: Object.assign(ax(''), { ticks: { callback: moneyTick }, beginAtZero: bar }), x: { grid: { display: false }, ticks: { maxTicksLimit: 9 } } }, plugins: { tooltip: { callbacks: { title: c => spanTitle(B, c[0].dataIndex), label: c => c.dataset.label + ': ' + usd(c.parsed.y) } } } } });
  const zs = zoneStats(), worst = zs[zs.length - 1], best = zs[0];
  mk('cZones', { type: 'bar', data: { labels: zs.map(t => t.z), datasets: [{ label: 'House win per machine per day', data: zs.map(t => t.v), backgroundColor: zs.map(t => S.zone === 'All' || S.zone === t.z ? css('--accent') : css('--line')), borderRadius: 6, borderSkipped: false }] },
    options: { onClick: (e, els) => { if (!els.length) return; const z = zs[els[0].index].z; S.zone = S.zone === z ? 'All' : z; S.bank = 'All'; $('#fZone').value = S.zone; fillBanks(); renderAll(); }, onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      scales: { y: Object.assign(ax(''), { ticks: { callback: v => '$' + v }, beginAtZero: true }), x: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => usd(c.parsed.y) + ' per machine per day' } } } } });
  $('#sw1').innerHTML = `The house kept ${(hw / ci * 100).toFixed(1)}¢ of every $1 against ${(th / ci * 100).toFixed(1)}¢ designed, so the floor performs as expected. ${worst.z} earns ${usd(worst.v)} per machine per day against ${usd(best.v)} in ${best.z}.`;
}

/* ---------------------------------------------------------------- 2 demand */
function evBands() {
  const col = { sports_viewing: css('--s1'), convention: css('--s2'), festival: css('--s7'), property_promotion: css('--s3') };
  const bs = D.events.map(e => ({ from: idx(e.start), to: idx(e.end), color: col[e.type], label: e.name })); bs.push({ from: idx('2025-03-03'), to: idx('2025-04-06'), color: css('--s8'), alpha: .08, label: 'Walkway closure' }); return bs;
}
function renderS2() {
  const ms = zoneMs(), i0 = S.d0, i1 = S.d1, L = dates.slice(i0, i1 + 1), B = bucketize(i0, i1, S.gran);
  const ciD = dates.map((_, k) => ms.reduce((s, m) => s + (m.sch[k] > 0 ? m.ci[k] : 0), 0)), mdD = dates.map((_, k) => ms.filter(m => m.sch[k] > 0).length);
  const bci = B.spans.map(([a, b]) => { const d = sum(mdD, a, b); return d ? sum(ciD, a, b) / d : null; });
  const showBands = S.gran === 'day' || S.gran === 'week', bands = !showBands ? [] : evBands().map(b => { const a = Math.max(b.from, i0), z = Math.min(b.to, i1); return a > z ? null : { ...b, from: B.of[a], to: B.of[z] }; }).filter(Boolean);
  mk('cDaily', { type: 'bar', data: { labels: B.labels, datasets: [{ label: S.zone === 'All' ? 'All zones' : S.zone, data: bci, backgroundColor: css('--ink'), borderRadius: 3, barPercentage: .9, categoryPercentage: 1 }] },
    options: { scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 9 } }, y: Object.assign(ax('Wagered per machine per day ($)'), { ticks: { callback: moneyTick } }) }, plugins: { bands: { list: bands }, legend: { display: false }, tooltip: { callbacks: { title: c => { const j = c[0].dataIndex, e = S.gran === 'day' ? P.ev[B.spans[j][0]] : ''; return spanTitle(B, j) + (e ? ' · ' + e : ''); }, label: c => usd(c.parsed.y) + ' per machine per day' } } } } });
  const wds = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], acc = Object.fromEntries(wds.map(w => [w, []]));
  L.forEach((d, k) => { if (!P.ev[i0 + k] && mdD[i0 + k]) acc[P.wd[i0 + k]].push(ciD[i0 + k] / mdD[i0 + k]); });
  mk('cWd', { type: 'bar', data: { labels: wds, datasets: [{ label: 'Wagered per machine', data: wds.map(w => acc[w].length ? mean(acc[w]) : null), backgroundColor: css('--ink'), borderRadius: 3 }] }, options: { scales: { y: Object.assign(ax(''), { ticks: { callback: moneyTick } }), x: { grid: { display: false } } }, plugins: { legend: { display: false } } } });
  const evs = [...R.events].sort((a, b) => b.ci_lift - a.ci_lift), tcol = { sports_viewing: css('--s1'), convention: css('--s2'), festival: css('--s7'), property_promotion: css('--s3') };
  mk('cEv', { type: 'bar', data: { labels: evs.map(e => e.name), datasets: [{ label: 'Lift', data: evs.map(e => e.ci_lift * 100), backgroundColor: evs.map(e => tcol[e.type]), borderRadius: 3 }] },
    options: { indexAxis: 'y', scales: { x: ax('% more than a normal day'), y: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.parsed.x.toFixed(1)}% · extra expected win ${usd(evs[c.dataIndex].extra_theo)}` } } } } });
  const zi = Z.zones.indexOf('Back Forty'), oth = Z.zones.map((z, i) => i).filter(i => !['Back Forty', 'High-Limit Room'].includes(Z.zones[i]));
  const ratio = B.spans.map(([a, b]) => { let c1 = 0, m1 = 0, c2 = 0, m2 = 0; for (let k = a; k <= b; k++) { c1 += Z.ci[zi][k]; m1 += Z.md[zi][k]; oth.forEach(i => { c2 += Z.ci[i][k]; m2 += Z.md[i][k]; }); } return (c1 / m1) / (c2 / m2); });
  const cb = !showBands ? [] : [{ from: B.of[Math.max(idx('2025-03-03'), i0)], to: B.of[Math.min(idx('2025-04-06'), i1)], color: css('--s8'), alpha: .14 }].filter(b => idx('2025-03-03') <= i1 && idx('2025-04-06') >= i0 && b.from >= 0 && b.to >= 0), bar2 = chartType(B) === 'bar';
  mk('cB40', { type: bar2 ? 'bar' : 'line', data: { labels: B.labels, datasets: [{ label: 'Back Forty ÷ other zones', data: ratio, borderColor: css('--accent'), backgroundColor: css('--accent'), pointRadius: 0, borderWidth: 2, borderRadius: 4 }] },
    options: { scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 5 } }, y: Object.assign(ax(''), { min: bar2 ? 0 : .35, max: bar2 ? 1 : .8 }) }, plugins: { bands: { list: cb }, legend: { display: false }, tooltip: { callbacks: { title: c => spanTitle(B, c[0].dataIndex) } } } } });
  const b = R.b40_ratio; $('#b40Note').textContent = `Whole period: ${b.pre.toFixed(2)} before, ${b.closure.toFixed(2)} during the closure, ${b.after.toFixed(2)} after`;
  $('#tMonthly').innerHTML = '<tr><th class="l">Month</th><th>Wagered</th><th>Per machine-day</th><th>Hold</th><th>Occupancy</th></tr>' + R.monthly.map(r => `<tr><td class="l">${r.m}</td><td>${usdK(r.ci)}</td><td>${usdK(r.ci_per_md)}</td><td>${pct(r.hold, 2)}</td><td>${pct(r.occ_rate)}</td></tr>`).join('');
  const f = k => R.events.find(e => e.name.startsWith(k));
  $('#sw2').innerHTML = `Saturdays run about ${pct(R.weekday_mean_ci.Sat / R.weekday_mean_ci.Tue - 1, 0)} above Tuesdays, and big sports and festival weekends add ${pct(f('EDC').ci_lift, 0)}–${pct(f('Super').ci_lift, 0)}. The Back Forty closure cut that zone's traffic by ${pct(-R.b40_closure_effect, 0)} for five weeks.`;
}

/* ---------------------------------------------------------------- 3 downtime */
function renderS3() {
  const ms = zoneMs(), mfrs = ['Halcyon', 'Northwind', 'Ridgeline'], mcol = [css('--s3'), css('--s1'), css('--s2')], fm = D.faults_mfr_month, tf = D.tech_fill, rp = D.repair, bm = R.downtime_by_mfr;
  const B = bucketize(S.d0, S.d1, S.gran), rate = m => { const tot = sum(m.theo, 0, ND - 1), av = sum(m.av, 0, ND - 1); return av > 0 ? tot / av : 0; };
  const byM = mfrs.map(mf => B.spans.map(([a, b]) => ms.filter(m => m.mfr === mf).reduce((s, m) => s + (sum(m.sch, a, b) - sum(m.av, a, b)) * rate(m), 0) / (b - a + 1)));
  const lost = ms.reduce((s, m) => s + (sum(m.sch, S.d0, S.d1) - sum(m.av, S.d0, S.d1)) * rate(m), 0), th = ms.reduce((s, m) => s + sum(m.theo, S.d0, S.d1), 0), hrsLost = ms.reduce((s, m) => s + sum(m.sch, S.d0, S.d1) - sum(m.av, S.d0, S.d1), 0);
  $('#kpis3').innerHTML = [['Win lost to downtime', usdK(lost), pct(lost / (th || 1), 2) + ' of what the machines should earn'], ['Machine-hours out of service', num(hrsLost), 'across the selection'], ['Ridgeline share of the loss', pct(bm.Ridgeline.lost_theo / R.downtime_total_lost_theo, 0), `${bm.Ridgeline.faults_per_machine_month.toFixed(1)} breakdowns per machine-month vs ${bm.Halcyon.faults_per_machine_month.toFixed(1)} for Halcyon`]].map(x => `<div class="tile"><div class="num">${x[1]}</div><div class="lab">${x[0]}</div><div class="foot">${x[2]}</div></div>`).join('');
  mk('cLost', { type: 'bar', data: { labels: B.labels, datasets: mfrs.map((mf, i) => ({ label: mf, data: byM[i], backgroundColor: mcol[i], stack: 's', borderSkipped: false })) }, options: { scales: { y: Object.assign(ax('Expected win lost per day ($)', { stacked: true }), { ticks: { callback: moneyTick } }), x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 9 } } }, plugins: { tooltip: { callbacks: { title: c => spanTitle(B, c[0].dataIndex), label: c => `${c.dataset.label}: ${usd(c.parsed.y)} per day` } } } } });
  mk('cFaults', { type: 'line', data: { labels: MLAB, datasets: mfrs.map((mf, i) => ({ label: mf, data: MONTHS.map(m => fm[m][mf]), borderColor: mcol[i], backgroundColor: mcol[i], pointRadius: 3, borderWidth: 2 })) }, options: { scales: { y: Object.assign(ax(''), { beginAtZero: true }), x: { grid: { display: false } } } } });
  mk('cTech', { type: 'bar', data: { labels: MLAB, datasets: [{ label: 'Day shift', data: MONTHS.map(m => tf[m].day * 100), backgroundColor: css('--s1'), borderRadius: 2 }, { label: 'Swing shift', data: MONTHS.map(m => tf[m].swing * 100), backgroundColor: css('--s4'), borderRadius: 2 }] }, options: { scales: { y: Object.assign(ax('% of planned'), { min: 0, max: 105 }), x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { afterBody: i => 'Mean wait for a technician: ' + rp[i[0].dataIndex].wait_h.toFixed(1) + ' h' } } } } });
  mk('cHour', { type: 'bar', data: { labels: [...Array(24).keys()].map(h => h + ':00'), datasets: [{ label: 'Unavailable', data: D.dt_hour.map(x => x * 100), backgroundColor: css('--ink'), borderRadius: 2 }] }, options: { scales: { y: Object.assign(ax('%'), { beginAtZero: true }), x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } } }, plugins: { legend: { display: false } } } });
  $('#sw3').innerHTML = `Downtime cost about ${usdK(R.downtime_total_lost_theo)} of expected win in six months, under 0.4%. Ridgeline machines break down about ${(bm.Ridgeline.faults_per_machine_month / bm.Halcyon.faults_per_machine_month).toFixed(0)} times as often as Halcyon.`;
}

/* ---------------------------------------------------------------- 4 the ten */
function renderS4() {
  const T = machineTable(), sel = new Set(selected().map(m => m.id)), pool = T.rows.filter(r => sel.has(r.m.id)), bottom = [...pool].sort((a, b) => a.hw - b.hw).slice(0, 10);
  const flagged = bottom.filter(isLeak);
  mk('cList', { type: 'bar', data: { labels: bottom.map(r => r.m.id + ' · ' + r.m.zone), datasets: [{ label: 'What it earned', data: bottom.map(r => r.hw), backgroundColor: css('--accent'), borderRadius: 4 }, { label: 'A typical machine on the floor all period', data: bottom.map(() => T.typical), backgroundColor: css('--line'), borderRadius: 4 }] },
    options: { indexAxis: 'y', scales: { x: Object.assign(ax('House win in the selected period ($)'), { ticks: { callback: moneyTick } }), y: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: c => c.dataset.label + ': ' + usd(c.parsed.x) } } } } });
  const keys = ['cTen', 'cAv', 'cStr', 'cApp', 'cLuck'];
  const cellOf = (r, k) => { const v = r[k], mxr = Math.max(1, ...keys.map(x => r[x])), top = v === mxr && v > 500;
    if (v < -500) return `<td class="cell"><span class="v pos">helped ${usdK(-v)}</span></td>`;
    if (v < 500) return `<td class="cell"><span class="na">–</span></td>`;
    return `<td class="cell${top ? ' top' : ''}" style="background:color-mix(in srgb,var(--accent) ${Math.round(v / mxr * 42)}%,transparent)"><span class="v">${usdK(v)}</span></td>`; };
  $('#tWhy').innerHTML = '<thead><tr><th class="l">Machine</th><th>Days on floor</th><th>Not there all period</th><th>Out of service</th><th>Quiet spot or low-margin game</th><th>The machine itself</th><th>Bad luck</th><th class="l">Main reason</th></tr></thead><tbody>' +
    bottom.map(r => `<tr><td class="l"><b>${r.m.id}</b><br><span class="sub">${r.m.zone} · ${r.m.theme}</span></td><td>${Math.round(r.sch / 24)} of ${Math.round(T.maxSch / 24)}</td>${keys.map(k => cellOf(r, k)).join('')}<td class="l">${reasons(r).map(x => `<span class="pill ${x[1]}">${x[0]}</span>`).join(' ')}</td></tr>`).join('') + '</tbody>';
  const bset = new Set(bottom.map(r => r.m.id)), hl = pool.filter(r => isLeak(r)), others = pool.filter(r => !bset.has(r.m.id));
  mk('cScatter', { type: 'scatter', data: { datasets: [{ label: 'Other machines', data: others.map(r => ({ x: r.appeal, y: r.z, id: r.m.id })), backgroundColor: css('--muted') + '77', pointRadius: 3 }, { label: 'The ten lowest', data: bottom.filter(r => !isLeak(r)).map(r => ({ x: r.appeal, y: r.z, id: r.m.id })), backgroundColor: css('--ink'), pointRadius: 6, borderColor: css('--card'), borderWidth: 2 }, { label: 'Payout anomaly', data: hl.map(r => ({ x: r.appeal, y: r.z, id: r.m.id })), backgroundColor: css('--accent'), pointRadius: 8, borderColor: css('--card'), borderWidth: 2 }] },
    options: { interaction: { mode: 'nearest', intersect: true }, scales: { x: ax('Draw vs. similar machines (1.00 = typical)'), y: ax('Luck score (below 0 = unlucky)') }, plugins: { tooltip: { callbacks: { label: c => `${c.raw.id}: draw ${c.raw.x.toFixed(2)}, luck ${c.raw.y.toFixed(1)}` } } } } });
  const lm = R.M1158_monthly, m58 = M.find(m => m.id === 'M-1158');
  mk('cLeak', { type: 'line', data: { labels: lm.map(r => r.month), datasets: [{ label: 'M-1158 actual', data: lm.map(r => r.hit_rate * 100), borderColor: css('--accent'), backgroundColor: css('--accent'), pointRadius: 4, borderWidth: 2 }, { label: 'Published rate (31.5%)', data: lm.map(r => r.published * 100), borderColor: css('--muted'), borderDash: [6, 4], pointRadius: 0, borderWidth: 2 }] }, options: { scales: { y: Object.assign(ax('% of spins that pay'), { min: 28, max: 42 }), x: { grid: { display: false } } } } });
  $('#leakNote').innerHTML = `Over ${num(sum(m58.sp, 0, ND - 1))} spins it paid on ${pct(lm.reduce((s, r) => s + r.hit_rate, 0) / 6)} against ${pct(lm[0].published)} published, far beyond chance. Its hold was ${pct(R.M1158_hold)} against a 10% design, so it under-earns by about <b>${usd(R.M1158_shortfall_per_day)} a day</b>. This is a lead to inspect, not proof of wrongdoing.`;
  const rm = R.replace_model, ln = rm.map(() => 3380);
  mk('cRepl', { type: 'bar', data: { labels: rm.map(r => r.id + ' · ' + r.theme), datasets: [{ label: 'Swapped for the best-earning title in its zone', data: rm.map(r => r.gain16_best), backgroundColor: css('--s3'), borderRadius: 4 }, { label: 'Swapped for a typical title', data: rm.map(r => r.gain16_median), backgroundColor: css('--s1'), borderRadius: 4 }, { type: 'line', label: 'Lease cost for 16 days ($3,380)', data: ln, borderColor: css('--accent'), borderDash: [6, 4], pointRadius: 0, borderWidth: 2 }] },
    options: { scales: { y: Object.assign(ax('Expected extra house win ($)'), { ticks: { callback: moneyTick } }), x: { grid: { display: false }, ticks: { maxRotation: 40, minRotation: 40 } } }, plugins: { tooltip: { callbacks: { label: c => c.dataset.label + ': ' + usd(c.parsed.y) } } } } });
  const roy = rm.find(r => r.theme === 'Royal Draw'), payback = roy ? Math.ceil(2500 / ((roy.best_per_day - roy.cur_per_day) - 55)) : null;
  $('#replNote').innerHTML = `Model 2 predicts what each slot would earn per day with every other game. Even picking the best title, <b>none of the ten gains more than the lease costs within July</b> (best case ${usd(R.replace_model_total_best16)} in total against ${usd(10 * 3380)} to lease ten). ${roy ? `The one pattern worth testing later: Royal Draw in Back Forty (95% payout, so the house keeps only 5%) could pay back in about ${payback} operating days if the game effect is real, but that is an observed pattern, not a proven one.` : ''}`;
  const lab = r => reasons(r)[0][0], cnt = k => bottom.filter(r => lab(r) === k).length;
  $('#sw4').innerHTML = `<b>${bottom.length - flagged.length} of the ${bottom.length} are not bad machines.</b> They sit in a weak spot or run a low-margin game (${cnt('Quiet spot, low-margin game')}), were not on the floor all period (${cnt('Not on the floor all period')}), or were unlucky (${cnt('Bad luck')}). ${flagged.length ? `<b>${flagged.map(r => r.m.id).join(', ')}</b> pays out more often than published and should be inspected.` : ''} Replacing machines would not pay back in July.`;
}

/* ---------------------------------------------------------------- 5 guests */
function cubeRows(ignoreGuest) {
  const c = D.cube.cols, col = n => c.indexOf(n), m0 = monthOf(dates[S.d0]), m1 = monthOf(dates[S.d1]);
  return D.cube.rows.filter(r => r[col('m')] >= m0 && r[col('m')] <= m1 && (ignoreGuest || ((S.reg === 'All' || r[col('reg')] === S.reg) && (S.age === 'All' || r[col('age')] === S.age) && (S.tier === 'All' || r[col('tier')] === S.tier)))).map(r => Object.fromEntries(c.map((k, i) => [k, r[i]])));
}
function renderPlayers() {
  const rows = cubeRows(false), agg = (rs, f) => rs.reduce((s, r) => s + r[f], 0), t = Object.fromEntries(['n', 'ci', 'pay', 'net', 'theo', 'comp', 'contrib'].map(f => [f, agg(rows, f)]));
  $('#kpis5').innerHTML = [['Wagered', usdK(t.ci), 'by card holders'], ['Paid back', usdK(t.pay), pct(t.pay / (t.ci || 1)) + ' of wagers'], ['Net result', usdK(t.net), pct(t.net / (t.ci || 1), 1) + ' of wagers'], ['Expected loss', usdK(t.theo), 'what the games are designed to take']].map(x => `<div class="tile"><div class="num">${x[1]}</div><div class="lab">${x[0]}</div><div class="foot">${x[2]}</div></div>`).join('');
  const bm = MONTHS.map(m => rows.filter(r => r.m === m));
  mk('cPlayerM', { type: 'bar', data: { labels: MLAB, datasets: [{ label: 'Wagered', data: bm.map(r => agg(r, 'ci')), backgroundColor: css('--ink'), borderRadius: 3 }, { label: 'Paid back', data: bm.map(r => agg(r, 'pay')), backgroundColor: css('--s3'), borderRadius: 3 }] },
    options: { scales: { y: Object.assign(ax(''), { ticks: { callback: moneyTick }, beginAtZero: true }), x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: c => c.dataset.label + ': ' + usd(c.parsed.y) } } } } });
  mk('cPlayerNet', { type: 'bar', data: { labels: MLAB, datasets: [{ label: 'Net result', data: bm.map(r => agg(r, 'net')), backgroundColor: css('--accent'), borderRadius: 3 }] },
    options: { scales: { y: Object.assign(ax(''), { ticks: { callback: moneyTick } }), x: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => 'Net result: ' + usd(c.parsed.y) } } } } });
  renderLorenz();
  const ctx = cubeRows(true); let h = '<tr><th class="l">Group</th><th>Player-months</th><th>Wagered</th><th>Net</th><th>Net % of wagers</th><th>Comp cost</th><th>Contribution per player-month</th></tr>';
  [['region', 'reg'], ['age', 'age'], ['tier', 'tier']].forEach(([nm, k]) => uniq(ctx.map(r => r[k])).forEach(v => { const rs = ctx.filter(r => r[k] === v), c = agg(rs, 'ci'); h += `<tr><td class="l">${nm}: ${v}</td><td>${num(agg(rs, 'n'))}</td><td>${usdK(c)}</td><td>${usdK(agg(rs, 'net'))}</td><td>${pct(agg(rs, 'net') / c, 1)}</td><td>${usdK(agg(rs, 'comp'))}</td><td>${usd(agg(rs, 'contrib') / agg(rs, 'n'))}</td></tr>`; }));
  $('#tGroups').innerHTML = h;
  const ca = R.conc_all;
  $('#sw5').innerHTML = `Card holders bet ${usdK(R.players_total.ci)} and lost ${usdK(-R.players_total.net)}, about what the games are designed to take. The top 1% of players account for ${pct(ca.loss_top1, 0)} of losses.`;
}
function renderLorenz() {
  const m0 = monthOf(dates[S.d0]), m1 = monthOf(dates[S.d1]), pk = m0 === m1 ? m0 : 'all', g = D.conc[pk][S.lor] || D.conc.all[S.lor], base = D.conc[pk]['all|all'], xs = [...Array(21).keys()].map(i => i * 5);
  mk('cLorenz', { type: 'line', data: { labels: xs, datasets: [{ label: S.lor === 'all|all' ? 'All guests' : S.lor.replace('|', ': '), data: g.lorenz.map(v => v * 100), borderColor: css('--accent'), pointRadius: 0, borderWidth: 2.4 }, ...(S.lor === 'all|all' ? [] : [{ label: 'All guests', data: base.lorenz.map(v => v * 100), borderColor: css('--muted'), pointRadius: 0, borderWidth: 2, borderDash: [6, 4] }]), { label: 'Even split', data: xs, borderColor: css('--line'), pointRadius: 0, borderWidth: 1, hideInTable: true }] },
    options: { scales: { x: Object.assign(ax('% of players (largest losers first)'), { ticks: { callback: v => xs[v] + '%', maxTicksLimit: 6 } }), y: Object.assign(ax('% of all losses'), { min: 0, max: 100 }) } } });
  $('#concNote').innerHTML = `${pk === 'all' ? 'Six months' : pk}: top 1% = <b>${pct(g.loss_top1, 0)}</b> of losses, top 5% = ${pct(g.loss_top5, 0)}, top 10% = ${pct(g.loss_top10, 0)}; ${pct(g.winners, 0)} of players ended ahead; ${num(g.players)} players.${m0 !== m1 ? ' (Uses all six months unless the period is a single month.)' : ''}`;
}

/* ---------------------------------------------------------------- 6 comps */
function renderS6() {
  const w = D.comp_weekly, pp = R.comp_pre_post, b = R.comp_behaviour;
  mk('cPpf', { type: 'line', data: { labels: w.map(r => r.w.slice(5)), datasets: [{ label: 'Points per $1 of free items', data: w.map(r => r.ppf), borderColor: css('--accent'), backgroundColor: css('--accent'), pointRadius: 3, borderWidth: 2.4 }] }, options: { scales: { y: Object.assign(ax('Points'), { beginAtZero: true }), x: { grid: { display: false }, ticks: { maxTicksLimit: 9 } } }, plugins: { legend: { display: false } } } });
  const B = bucketize(S.d0, S.d1, S.gran), dc = B.spans.map(([a, b]) => sum(P.comp, a, b) / sum(P.ci, a, b) * 1000), bar = chartType(B) === 'bar', showB = S.gran === 'day' || S.gran === 'week';
  const cbands = !showB || idx('2025-04-29') > S.d1 ? [] : [{ from: B.of[Math.max(idx('2025-04-29'), S.d0)], to: B.n - 1, color: css('--s2'), alpha: .12 }];
  mk('cCompCost', { type: bar ? 'bar' : 'line', data: { labels: B.labels, datasets: [{ label: 'Comp cost per $1,000 wagered', data: dc, borderColor: css('--ink'), backgroundColor: css('--ink'), pointRadius: 0, borderWidth: 2, borderRadius: 4 }] }, options: { scales: { y: ax('$ per $1,000'), x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } } }, plugins: { bands: { list: cbands }, legend: { display: false }, tooltip: { callbacks: { title: c => spanTitle(B, c[0].dataIndex) } } } } });
  $('#tComp').innerHTML = '<tr><th class="l">Metric</th><th>Before</th><th>After</th><th>Change</th></tr>' + [['Points per $1 of comps', R.comp_ppf_pre.toFixed(1), R.comp_ppf_post.toFixed(1), spct(R.comp_price_cut_pct, 0)], ['Comp cost per day', usd(pp[0].cost_per_day), usd(pp[1].cost_per_day), spct(pp[1].cost_per_day / pp[0].cost_per_day - 1, 1)], ['Comp cost per $1,000 wagered', '$' + pp[0].comp_cost_per_1k_ci.toFixed(3), '$' + pp[1].comp_cost_per_1k_ci.toFixed(3), spct(pp[1].comp_cost_per_1k_ci / pp[0].comp_cost_per_1k_ci - 1, 1)], ['Card holders wagered per visit', usd(b[0].ci_per_visit), usd(b[1].ci_per_visit), spct(b[1].ci_per_visit / b[0].ci_per_visit - 1, 1)]].map(r => `<tr><td class="l">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('');
  $('#compNote').innerHTML = `Before = Jan 1–Apr 28, after = Apr 29–Jun 30. Guests now redeem at less than half the points, comp cost per dollar wagered rose about ${pct(pp[1].comp_cost_per_1k_ci / pp[0].comp_cost_per_1k_ci - 1, 0)} (about ${usd((pp[1].cost_per_day - pp[0].cost_per_day) * 30)} more per 30 days), and play per visit did not visibly change. This is a before/after comparison with no control group.`;
  $('#sw6').innerHTML = `On about April 28 comps got twice as cheap for guests. The casino now spends about ${pct(pp[1].comp_cost_per_1k_ci / pp[0].comp_cost_per_1k_ci - 1, 0)} more per dollar wagered, with no visible rise in play.`;
}

/* ---------------------------------------------------------------- 7 models */
function renderS7() {
  const F = R.forecast, MMd = R.machine_model, i0 = idx('2025-05-01');
  mk('cFc', { type: 'line', data: { labels: dates, datasets: [{ label: 'Actual', data: P.ci, borderColor: css('--ink'), pointRadius: 0, borderWidth: 1.5 }, { label: 'Model 1', data: D.fc.pred, borderColor: css('--accent'), pointRadius: 0, borderWidth: 2 }, { label: 'Simple guess: average day', data: D.fc.const, borderColor: css('--muted'), pointRadius: 0, borderWidth: 2, borderDash: [6, 4] }] },
    options: { scales: { y: Object.assign(ax('Daily wagered ($)'), { ticks: { callback: moneyTick }, min: 0 }), x: xdate(dates, 7) }, plugins: { bands: { list: [{ from: i0, to: ND - 1, color: css('--s1'), alpha: .1 }] }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + usd(c.parsed.y) } } } } });
  const r1 = (n, o, b) => `<tr><td class="l">${b ? '<b>' + n + '</b>' : n}</td><td>${b ? '<b>' + usd(o.mae) + '</b>' : usd(o.mae)}</td><td>${pct(o.mape)}</td></tr>`;
  $('#tFc').innerHTML = '<tr><th class="l">Test: May 1–Jun 30 (61 days)</th><th>Average error per day</th><th>% error</th></tr>' + r1('Average day (training mean)', F.baseline_const) + r1('Weekday average', F.baseline_weekday_mean) + r1('Model 1: weekday pattern × recent level', F.model, true);
  $('#fcExtra').innerHTML = `Rolling four-week checks agree. It over-predicts by ${pct(F.model.bias / mean(P.ci.slice(i0)), 1)} and misses unfamiliar events like EDC.`;
  mk('cMach', { type: 'scatter', data: { datasets: [{ label: 'Machines (61-day total wagered)', data: D.mm_scatter.map(r => ({ x: r.actual, y: r.pred, id: r.id })), backgroundColor: css('--s1') + 'aa', pointRadius: 3 }, { type: 'line', label: 'Perfect prediction', data: [{ x: 0, y: 0 }, { x: 600000, y: 600000 }], borderColor: css('--muted'), borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5, hideInTable: true }] },
    options: { interaction: { mode: 'nearest', intersect: true }, scales: { x: Object.assign(ax('Actual ($)'), { ticks: { callback: moneyTick } }), y: Object.assign(ax('Model 2 prediction ($)'), { ticks: { callback: moneyTick } }) }, plugins: { tooltip: { callbacks: { label: c => c.raw.id ? `${c.raw.id}: actual ${usd(c.raw.x)}, predicted ${usd(c.raw.y)}` : '' } } } } });
  const dm = MMd.daily_mae, tm = MMd.total_mae, names = [['model', 'Model 2: gradient-boosted trees', true], ['training_mean', 'Average machine-day'], ['machine_own_mean', "Each machine's own average"], ['zone_game_mean', 'Zone × game average'], ['zone_game_weekday_mean', 'Zone × game × weekday average']];
  $('#tMM').innerHTML = '<tr><th class="l">Test: May 1–Jun 30</th><th>Error per machine-day</th><th>Error on a 61-day total</th></tr>' + names.map(([k, n, b]) => `<tr><td class="l">${b ? '<b>' + n + '</b>' : n}</td><td>${b ? '<b>' + usd(dm[k]) + '</b>' : usd(dm[k])}</td><td>${b ? '<b>' + usd(tm[k]) + '</b>' : usd(tm[k])}</td></tr>`).join('');
  $('#mmNote').innerHTML = `Model 2 cuts error ${pct(1 - dm.model / dm.training_mean, 0)} against the average machine-day and ${pct(1 - dm.model / dm.machine_own_mean, 0)} against each machine's own average. A zone × game × weekday table is about as accurate (${usd(dm.zone_game_weekday_mean)} vs ${usd(dm.model)}), so Model 2's main use is estimating what a different game would earn in the same slot.`;
  $('#leakGuard').innerHTML = `<ul style="margin:0;padding-left:18px"><li>Both models are fitted only on <b>Jan 1–Apr 30</b> and scored on <b>May 1–Jun 30</b>. No random splits.</li><li>Model 1's weekday pattern comes from non-event training days. Its level uses only the last 28 training days.</li><li>Model 2 uses only things known in advance: zone, game, weekday, holidays, published events and the scheduled walkway closure. No same-day results, repairs or availability.</li><li>Later-published tourism and survey tables are not used. Weather is not a model input.</li><li>Model 1 takes the number of machines on the floor as given (300–308, known in advance).</li></ul>`;
  mk('cJuly', { type: 'bar', data: { labels: F.july.map(r => r.d.slice(5) + ' ' + r.wd), datasets: [{ label: 'Forecast wagered', data: F.july.map(r => r.pred), backgroundColor: F.july.map(r => ['Fri', 'Sat', 'Sun'].includes(r.wd) ? css('--accent') : css('--line')), borderRadius: 2 }] }, options: { scales: { y: Object.assign(ax(''), { ticks: { callback: moneyTick } }), x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } } }, plugins: { legend: { display: false } } } });
  $('#sw7').innerHTML = `Model 1 predicts daily wagering within ${pct(F.model.mape, 0)}, ${(F.baseline_const.mae / F.model.mae).toFixed(0)}× better than the average day. Model 2 shows that swapping the ten machines would not pay back in July.`;
}

/* ---------------------------------------------------------------- 8 decision */
function plan() {
  const pr = R.promo, sg = R.signage, hold = pr.hold_theo, base = pr.weekend1.base_ci, tour = R.events.find(e => e.id === 'EV-P-TOURN'), loc = R.events.find(e => e.id === 'EV-P-LOCALS');
  const lifts = { low: loc.theo_lift, base: .10, high: tour.theo_lift }, promoG = k => base * lifts[k] * hold, inspectBase = R.M1158_shortfall_per_day * 29;
  const signG = k => ({ low: 0, base: -R.b40_after_effect, high: -R.b40_after_effect * 2 })[k] * sg.theo_per_day * sg.effective_days;
  const A = [
    { id: 'A-INSPECT', link: ['#s4', 'Section 4'], cost: 1200, gross: { low: 0, base: .9 * inspectBase, high: inspectBase }, pTitle: 'Have M-1158 inspected', pWhat: "A technician checks the machine's payout settings.", pWhy: 'It pays out more often than its published rules, costing about ' + usd(R.M1158_shortfall_per_day) + ' a day.', pCheck: 'The share of spins that pay returns to about 31.5% and the house keeps close to 10% again.', qty: '1 machine' },
    { id: 'A-PROMO', link: ['#s2', 'Sections 2 and 7'], cost: 30000, gross: { low: 2 * promoG('low'), base: 2 * promoG('base'), high: 2 * promoG('high') }, pTitle: 'Two promotion weekends', pWhat: 'Fri–Sun on Jul 18–20 and Jul 25–27, the busiest days of the week.', pWhy: 'Our own tournament weekend lifted play ' + pct(tour.ci_lift, 0) + '. We plan for ' + pct(lifts.base, 0) + ' to be safe, on a ' + usdK(base) + ' weekend baseline from Model 1.', pCheck: 'Compare each weekend with the Model 1 forecast. Check losses do not concentrate (top 1% of players stay at or below 20% of losses) and look at the days after for a dip.', qty: '2 events (Jul 18–20, 25–27)' },
    { id: 'A-WAYFINDING', link: ['#s2', 'Section 2'], cost: 7500, gross: { low: signG('low'), base: signG('base'), high: signG('high') }, pTitle: 'New signs in Back Forty', pWhat: 'Clearer signage and sightlines to the weakest zone.', pWhy: 'When access was cut that zone lost ' + pct(-R.b40_closure_effect, 0) + ' of its traffic, so guests depend on the route. It never fully recovered (' + spct(R.b40_after_effect, 1) + '). Break-even needs a ' + pct(sg.breakeven_lift, 1) + ' lift over ' + sg.effective_days + ' days.', pCheck: 'Back Forty compared with the rest of the floor rises from ' + R.b40_ratio.after.toFixed(2) + ' to at least ' + (R.b40_ratio.after * (1 + sg.breakeven_lift)).toFixed(2) + ' within three weeks of the signs going up.', qty: '1 zone' }
  ];
  A.forEach(a => ['low', 'base', 'high'].forEach(k => a['net_' + k] = a.gross[k] - a.cost)); return A;
}
function renderS8() {
  const A = plan(), cost = A.reduce((s, a) => s + a.cost, 0), netB = A.reduce((s, a) => s + a.net_base, 0), netL = A.reduce((s, a) => s + a.net_low, 0), netH = A.reduce((s, a) => s + a.net_high, 0), kept = 100000 - cost;
  const cols = [css('--s3'), css('--s1'), css('--s7')];
  mk('cBudget', { type: 'bar', data: { labels: ['$100,000'], datasets: [...A.map((a, i) => ({ label: a.pTitle + ' ' + usd(a.cost), data: [a.cost], backgroundColor: cols[i], stack: 's', borderSkipped: false })), { label: 'Kept ' + usd(kept), data: [kept], backgroundColor: css('--line'), stack: 's', borderSkipped: false }] },
    options: { indexAxis: 'y', scales: { x: Object.assign(ax('', { stacked: true }), { max: 100000, ticks: { callback: moneyTick } }), y: { stacked: true, display: false } }, plugins: { tooltip: { callbacks: { label: c => c.dataset.label } } } } });
  $('#planCards').innerHTML = A.map(a => `<div class="pc"><div class="cost">${usd(a.cost)}</div><h3>${a.pTitle}</h3><p class="what">${a.pWhat}</p><dl><dt>Why</dt><dd>${a.pWhy}</dd><dt>Expected gain after cost</dt><dd><span class="gain">${usdK(a.net_base)}</span> <span class="sub">(${usdK(a.net_low)} to ${usdK(a.net_high)})</span></dd><dt>How we will know it worked</dt><dd>${a.pCheck}</dd></dl><p style="margin:10px 0 0"><a href="${a.link[0]}">Evidence: ${a.link[1]}</a></p></div>`).join('');
  $('#finalBox').innerHTML = `<h3>Recommendation</h3><ol><li><b>Do not replace the ten machines.</b> Nine are not bad machines, and swapping any of them would not pay back in July.</li><li><b>Spend ${usd(cost)}:</b> inspect M-1158, run two promotion weekends, and put up signs in Back Forty.</li><li><b>Keep ${usd(kept)}.</b> Expected net gain is about ${usdK(netB)} (range ${usdK(netL)} to ${usdK(netH)}), almost all from the promotions.</li></ol>`;
  mk('cScen', { type: 'bar', data: { labels: A.map(a => a.id.replace('A-', '')), datasets: [{ label: 'Low', data: A.map(a => a.net_low), backgroundColor: css('--muted') + 'aa', borderRadius: 3 }, { label: 'Base', data: A.map(a => a.net_base), backgroundColor: css('--s1'), borderRadius: 3 }, { label: 'High', data: A.map(a => a.net_high), backgroundColor: css('--s3'), borderRadius: 3 }] }, options: { scales: { y: Object.assign(ax(''), { ticks: { callback: moneyTick } }), x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: c => c.dataset.label + ': ' + usd(c.parsed.y) } } } } });
  const pm = R.pm, tc = R.tech, cp = R.comp_pre_post;
  const rej = [['Replace the ten (lease)', usd(33800), `${usd(R.replace_model_total_best16)} at best (Model 2)`, 'No machine gains more than its lease costs in July'], ['Replace the ten (purchase)', usd(220000), `${usd(R.replace_model_total_best16)} at best`, 'More than a fifth of the budget for a small gain'], ['Preventive maintenance: Ridgeline', usd(pm.cost), `${usd(pm.benefit_if_faults_cut_30pct)} if faults fall 30%, minus ${usd(pm.pm_downtime_cost)} of downtime`, 'Ridgeline loses only about ' + usd(pm.ridgeline_lost_theo_per_month) + ' a month'], ['Extra technician, 30 days', usd(tc.cost), `${usd(tc.upper_bound_month)} a month even if waiting were zero`, 'Day-shift cover recovered in June'], ['Move a machine or bank', '$1,800 / $9,500', 'Back Forty is weak zone-wide', 'Signs address the whole zone first'], ['Comp pilot or comp change', '$4,000 / $1,500', '≈ ' + usd((cp[1].cost_per_day - cp[0].cost_per_day) * 30) + ' a month extra comp cost', 'Small. Revisit if it keeps rising'], ['Bigger guest survey', usd(3500), 'Information only', 'No decision here waits on it']];
  $('#tReject').innerHTML = '<tr><th class="l">Option</th><th>Cost</th><th>Likely benefit</th><th class="l">Why not</th></tr>' + rej.map(r => `<tr><td class="l">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="l">${r[3]}</td></tr>`).join('');
  $('#tPlan').innerHTML = '<tr><th class="l">Action</th><th>Cost</th><th>Net low</th><th>Net base</th><th>Net high</th><th class="l">Evidence and assumption</th><th class="l">How we will measure it</th></tr>' + A.map(a => `<tr><td class="l"><b>${a.id}</b><br>${a.qty}</td><td>${usd(a.cost)}</td><td>${usdK(a.net_low)}</td><td>${usdK(a.net_base)}</td><td>${usdK(a.net_high)}</td><td class="l">${a.pWhy}</td><td class="l">${a.pCheck}</td></tr>`).join('') + `<tr><td class="l"><b>Total</b></td><td>${usd(cost)}</td><td>${usdK(netL)}</td><td>${usdK(netB)}</td><td>${usdK(netH)}</td><td class="l" colspan="2">Kept: ${usd(kept)}. No conflicting moves or replacements, and no comp actions.</td></tr>`;
}

/* ---------------------------------------------------------------- 9 evidence */
function renderEvidence() {
  const F = R.forecast, bm = R.downtime_by_mfr, ca = R.conc_all, pp = R.comp_pre_post, mm = R.machine_model;
  const rows = [
    ['M-1158 has a payout anomaly', 'machine_day + game_math: hits ÷ spins vs. hit_probability', `38.6% vs 31.5%, z = ${R.bottom10.find(b => b.machine_id === 'M-1158').hit_z.toFixed(0)}; hold ${pct(R.M1158_hold)} vs 10% design; shortfall ${usd(R.M1158_shortfall_usd)}`, 'Pure luck? Hit rate barely depends on bet size and the gap is stable at 38–39% every month.', 'Cause unknown. A lead to inspect, not an accusation.'],
    ['The other nine are normal for their slot', 'prepared_daily_view; zone × game benchmark', `Draw vs. peers 0.9–1.2; machine-to-machine noise ${pct(R.appeal_robust_sd)}; zone and game explain ${pct(R.zone_game_r2, 0)} of expected win per hour`, 'Manufacturer and lease class add nothing (p > 0.3).', 'Zone and game are partly entangled; we cannot split them cleanly.'],
    ['Luck is the main noise in house win', 'machine_day: luck = house win − expected win; variance from Σbet² × payout variance', `Luck score sd ${R.luck_z_sd.toFixed(2)} (${R.luck_z_sd_ex_M1158.toFixed(2)} without M-1158) vs 1.0 for pure chance; the ten lost ${usd(-R.bottom10_total_luck)} to luck`, 'A mis-set payout would push the spread well above 1; only M-1158 does.', 'The normal approximation is rough for high-volatility games.'],
    ['Back Forty is quiet, and the closure cost it 31%', 'prepared_daily_view; Mar 3–Apr 6 closure', `Share of other zones' play: ${R.b40_ratio.pre.toFixed(2)} → ${R.b40_ratio.closure.toFixed(2)} → ${R.b40_ratio.after.toFixed(2)}; other zones ${spct(R.other_zones_closure_change)}`, 'Seasonality: other zones did not fall in the same weeks.', 'One zone, one event. Not randomised. Traffic counters have outages.'],
    ['Events drive demand; conventions barely do', 'property_day vs. same-weekday normal days', R.events.map(e => `${e.name} ${spct(e.ci_lift, 0)}`).join('; '), 'Weekday mix and machine count controlled in the baseline; weather effect is small.', 'One instance per event.'],
    ['Downtime is small; Ridgeline drives it', 'prepared_daily_view; operations; shift_roster', `${usd(R.downtime_total_lost_theo)} lost (${pct(R.downtime_pct_of_theo, 2)}); Ridgeline ${bm.Ridgeline.faults_per_machine_month.toFixed(1)} vs ${bm.Halcyon.faults_per_machine_month.toFixed(1)} breakdowns per machine-month`, 'Technician shortage: waits rose to 2.2 h in May, but waiting is only ' + pct(R.repair_wait_share_of_downtime, 0) + ' of repair time.', "Lost win uses each machine's own average rate."],
    ['Player losses are concentrated', 'player_period (card holders only)', `Top 1% = ${pct(ca.loss_top1, 0)} of losses, top 10% = ${pct(ca.loss_top10, 0)}; ${pct(ca.winners, 0)} ahead; net ${usdK(R.players_total.net)} vs. expected ${usdK(-R.players_total.theo)}`, 'Measured per player over six months.', 'Card holders only (about 66% of play); never reconcile to machine meters.'],
    ['Comp price halved around April 28', 'loyalty_ledger: points per $ of menu value, weekly', `${R.comp_ppf_pre.toFixed(1)} → ${R.comp_ppf_post.toFixed(1)}; comp cost per $1,000 wagered ${pp[0].comp_cost_per_1k_ci.toFixed(2)} → ${pp[1].comp_cost_per_1k_ci.toFixed(2)}`, 'Mix of items: house cost ÷ menu value is flat at about 28%, so it is a price change.', 'Before/after, no control group.'],
    ['Model 1 beats the average day on a time holdout', 'property_day; train Jan–Apr, test May–Jun', `Error ${usd(F.model.mae)} vs. ${usd(F.baseline_const.mae)} (average day) vs. ${usd(F.baseline_weekday_mean.mae)} (weekday mean)`, 'Rolling windows agree at every origin.', 'Misses unfamiliar events; over-predicts about 2.7% in June.'],
    ['Model 2 estimates expected play per machine', 'prepared_daily_view; train Jan–Apr, test May–Jun', `Error per machine-day ${usd(mm.daily_mae.model)} vs. ${usd(mm.daily_mae.training_mean)} (average) and ${usd(mm.daily_mae.machine_own_mean)} (own average); zone × game × weekday table ${usd(mm.daily_mae.zone_game_weekday_mean)}`, 'A lookup table is about as good, and own history wins on 61-day totals.', 'Used for the what-if on other games, which is observational.'],
    ['Replacing the ten would not pay back in July', 'Model 2 what-if + action_catalog', `Best case ${usd(R.replace_model_total_best16)} gain over 16 days vs. ${usd(33800)} to lease ten; none exceeds $3,380`, 'A longer horizon could favour Royal Draw swaps in Back Forty (about 3 weeks to break even).', 'Game effect on play is observed, not tested.'],
    ['Promotion weekends pay for themselves', 'events + Model 1 forecast', `Tournament expected win ${spct(R.promo.tour_theo_lift, 0)}; Locals Week ${spct(R.promo.locals_ci_lift, 0)}; at 10% two weekends add ${usdK(2 * R.promo.weekend1.base_ci * .10 * R.promo.hold_theo)}`, 'Pull-forward: no dip in the four days after the tournament.', 'Two events only; $15k is assumed to cover all costs.']
  ];
  $('#tClaims').innerHTML = '<tr><th class="l">Claim</th><th class="l">Table / query</th><th class="l">Result</th><th class="l">Alternative we tested</th><th class="l">Limitation</th></tr>' + rows.map(r => `<tr>${r.map(c => `<td class="l" style="vertical-align:top">${c}</td>`).join('')}</tr>`).join('');
  $('#methodText').innerHTML = `<h3>Definitions and method</h3><ul style="padding-left:18px;margin:8px 0 0" class="def">
  <li><b>Gaming day</b> runs 06:00–06:00; March 8 has 23 hours. Days before install or after retirement are excluded.</li>
  <li><b>Ratios</b> are ratios of sums. <b>Expected win</b> = wagered × (1 − the game's payout rate). <b>Luck</b> = house win − expected win; its spread uses Σbet² × the game's payout variance.</li>
  <li><b>Draw vs. similar machines</b> = expected win per available hour ÷ a zone × game benchmark fitted on all machines in the period.</li>
  <li><b>Gap split</b> versus a typical full-period machine: days on floor + out of service + spot and game + the machine itself + luck. The parts add up exactly.</li>
  <li><b>Model 1</b>: weekday pattern from non-event days × trailing 28-day level × machines on the floor. <b>Model 2</b>: gradient-boosted trees (scikit-learn) on zone, game, weekday, holiday, event flags and the closure flag.</li>
  <li><b>Pricing</b> follows the action catalogue; leases count only the days after the lead time.</li></ul>`;
  $('#aiText').innerHTML = `<h3>AI-use disclosure</h3><p class="def" style="margin:8px 0">Claude (Anthropic) was used as a coding and analysis assistant: to explore the data, write the Python build script, the dashboard and the text. Every number is computed from the supplied tables by <code>submission/code/build_data.py</code> and the code in this page. There is no live AI on the page; all text is fixed.</p><p class="def" style="margin:0">Outside data: NOAA weather only (public domain), used for a descriptive check. LVCVA and Missouri tables are not used because their redistribution terms are not cleared.</p>`;
}

/* ---------------------------------------------------------------- orchestration */
function renderAll() { theme(); updateGran(); $('#granHint').textContent = S.d1 - S.d0 + 1 < 365 ? 'Yearly is unavailable: the data covers January 1 to June 30, 2025.' : ''; renderS1(); renderS2(); renderS3(); renderS4(); renderPlayers(); renderS6(); renderS7(); renderS8(); renderEvidence(); }
let startTheme = 'light'; try { startTheme = localStorage.getItem('gilded-theme') || 'light'; } catch (e) { }
applyTheme(startTheme);
$('#themeBtn').onclick = () => { applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); renderAll(); };
initControls(); renderAll();
document.querySelectorAll('details.more').forEach(d => d.addEventListener('toggle', () => Object.values(charts).forEach(c => c.resize())));
const links = [...document.querySelectorAll('#steps a')], secs = links.map(a => document.querySelector(a.getAttribute('href')));
const spy = () => { let cur = 0; secs.forEach((s, i) => { if (s.getBoundingClientRect().top < 170) cur = i; }); links.forEach((a, i) => a.classList.toggle('on', i === cur)); };
window.addEventListener('scroll', spy, { passive: true }); spy();
})();
