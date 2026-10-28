// 미국 주식 대시보드 프런트엔드
// 서버의 /api/series 에서 최근 2거래일 일봉을 받아
// 현재가, 등락률, 거래량, 전일 대비 거래량 증감을 계산해 표시합니다.

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META'];
const REFRESH_MS = 60 * 1000; // 1분마다 갱신 (무료 API 한도 고려)
const STORE_KEY = 'stock-dashboard:symbols';

let symbols = loadSymbols();
let rows = [];
let sort = { key: 'volChangePct', asc: false };

const $ = (id) => document.getElementById(id);

function loadSymbols() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (_) {}
  return [...DEFAULT_SYMBOLS];
}
function saveSymbols() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(symbols)); } catch (_) {}
}

// ---------- 데이터 ----------
function toRow(symbol, data) {
  if (!data || data.status === 'error' || !Array.isArray(data.values) || !data.values.length) {
    return { symbol, error: (data && data.message) || '데이터 없음' };
  }
  const [today, prev] = data.values; // 최신순
  const price = Number(today.close);
  const volume = Number(today.volume);
  const prevClose = prev ? Number(prev.close) : NaN;
  const prevVolume = prev ? Number(prev.volume) : NaN;

  return {
    symbol,
    date: today.datetime,
    price,
    change: price - prevClose,
    changePct: ((price - prevClose) / prevClose) * 100,
    volume,
    prevVolume,
    volChange: volume - prevVolume,
    volChangePct: prevVolume ? ((volume - prevVolume) / prevVolume) * 100 : NaN,
    demo: !!data.demo,
    stale: !!data.stale,
  };
}

async function load() {
  if (!symbols.length) { rows = []; render(); return; }
  $('updated').textContent = '불러오는 중…';
  try {
    const res = await fetch(`/api/series?symbols=${encodeURIComponent(symbols.join(','))}`);
    const json = await res.json();
    rows = symbols.map((s) => toRow(s, json[s]));
    $('updated').textContent = `업데이트 ${new Date().toLocaleTimeString('ko-KR')}`;
  } catch (err) {
    $('updated').textContent = '불러오기 실패';
  }
  render();
}

// ---------- 표시 ----------
const fmtPrice = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n) => Math.round(n).toLocaleString('ko-KR');
const fmtCompact = (n) => {
  const a = Math.abs(n);
  if (a >= 1e8) return (n / 1e8).toFixed(2) + '억';
  if (a >= 1e4) return (n / 1e4).toFixed(1) + '만';
  return fmtInt(n);
};
const sign = (n) => (n > 0 ? '+' : '');
const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
const arrow = (n) => (n > 0 ? '▲' : n < 0 ? '▼' : '');
const ok = (n) => Number.isFinite(n);

function render() {
  const good = rows.filter((r) => !r.error);
  const bad = rows.filter((r) => r.error);

  good.sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    const cmp = typeof x === 'string' ? x.localeCompare(y) : (x ?? -Infinity) - (y ?? -Infinity);
    return sort.asc ? cmp : -cmp;
  });

  const maxRatio = Math.max(1, ...good.map((r) => (r.prevVolume ? r.volume / r.prevVolume : 0)));

  $('rows').innerHTML = [...good, ...bad].map((r) => {
    if (r.error) {
      return `<tr><td class="sym">${r.symbol}</td><td colspan="5" class="err">${escapeHtml(r.error)}</td>
        <td><button class="remove" data-remove="${r.symbol}" aria-label="${r.symbol} 삭제">✕</button></td></tr>`;
    }
    const ratio = r.prevVolume ? r.volume / r.prevVolume : 0;
    return `<tr>
      <td class="sym">${r.symbol}<span class="date">${r.date}${r.stale ? ' · 이전 데이터' : ''}</span></td>
      <td class="num">$${fmtPrice(r.price)}</td>
      <td class="num ${cls(r.change)}">${ok(r.changePct) ? `${arrow(r.change)} ${sign(r.changePct)}${r.changePct.toFixed(2)}%<span class="date">${sign(r.change)}${fmtPrice(r.change)}</span>` : '-'}</td>
      <td class="num">
        <div class="volcell">
          <div class="volbar" title="전일 대비 ${(ratio * 100).toFixed(0)}%"><span style="width:${Math.min(100, (ratio / maxRatio) * 100)}%"></span></div>
          ${fmtCompact(r.volume)}
        </div>
      </td>
      <td class="num">${ok(r.prevVolume) ? fmtCompact(r.prevVolume) : '-'}</td>
      <td class="num ${cls(r.volChange)}">${ok(r.volChangePct) ? `${arrow(r.volChange)} ${sign(r.volChangePct)}${r.volChangePct.toFixed(1)}%<span class="date">${sign(r.volChange)}${fmtCompact(r.volChange)}주</span>` : '-'}</td>
      <td><button class="remove" data-remove="${r.symbol}" aria-label="${r.symbol} 삭제">✕</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="err">종목을 추가해 주세요.</td></tr>`;

  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.sort === sort.key);
    th.classList.toggle('asc', th.dataset.sort === sort.key && sort.asc);
  });

  $('demo-badge').hidden = !good.some((r) => r.demo);
  renderSummary(good);
}

function renderSummary(good) {
  if (!good.length) { $('summary').innerHTML = ''; return; }
  const valid = good.filter((r) => ok(r.volChangePct));
  const topVol = [...valid].sort((a, b) => b.volChangePct - a.volChangePct)[0];
  const lowVol = [...valid].sort((a, b) => a.volChangePct - b.volChangePct)[0];
  const topGain = [...good].sort((a, b) => b.changePct - a.changePct)[0];
  const totalVol = good.reduce((s, r) => s + r.volume, 0);
  const totalPrev = good.reduce((s, r) => s + (r.prevVolume || 0), 0);
  const totalPct = totalPrev ? ((totalVol - totalPrev) / totalPrev) * 100 : NaN;

  const tile = (label, value, detail, c = '') =>
    `<div class="tile"><div class="label">${label}</div><div class="value">${value}</div><div class="detail ${c}">${detail}</div></div>`;

  $('summary').innerHTML = [
    tile('관심종목 전체 거래량', fmtCompact(totalVol), ok(totalPct) ? `전일 대비 ${sign(totalPct)}${totalPct.toFixed(1)}%` : '', cls(totalPct)),
    topVol ? tile('거래량 급증', topVol.symbol, `${sign(topVol.volChangePct)}${topVol.volChangePct.toFixed(1)}%`, cls(topVol.volChangePct)) : '',
    lowVol ? tile('거래량 급감', lowVol.symbol, `${sign(lowVol.volChangePct)}${lowVol.volChangePct.toFixed(1)}%`, cls(lowVol.volChangePct)) : '',
    tile('상승률 1위', topGain.symbol, `${sign(topGain.changePct)}${topGain.changePct.toFixed(2)}%`, cls(topGain.changePct)),
  ].join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 이벤트 ----------
$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const s = $('symbol-input').value.trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,10}$/.test(s) || symbols.includes(s)) return;
  symbols.push(s);
  saveSymbols();
  $('symbol-input').value = '';
  load();
});

$('rows').addEventListener('click', (e) => {
  const s = e.target.dataset.remove;
  if (!s) return;
  symbols = symbols.filter((x) => x !== s);
  rows = rows.filter((r) => r.symbol !== s);
  saveSymbols();
  render();
});

document.querySelectorAll('th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    sort = { key, asc: sort.key === key ? !sort.asc : key === 'symbol' };
    render();
  });
});

$('refresh').addEventListener('click', load);

load();
setInterval(load, REFRESH_MS);
