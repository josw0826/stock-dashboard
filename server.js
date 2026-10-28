// 미국 주식 대시보드 서버 (Node 18+ / 외부 패키지 없음)
// - public/ 폴더의 정적 파일 제공
// - /api/series 로 Twelve Data API를 대신 호출 (API 키를 브라우저에 노출하지 않음)
// - 종목별로 응답을 캐시해서 방문자가 많아도 API 호출 수가 늘지 않음
//
// 실행:  TWELVE_DATA_API_KEY=발급받은키 node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.TWELVE_DATA_API_KEY || '';
const CACHE_MS = (Number(process.env.CACHE_SECONDS) || 60) * 1000;
const MAX_SYMBOLS = 20;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SYMBOL_RE = /^[A-Z0-9.\-]{1,10}$/;

const cache = new Map(); // symbol -> { at, data }

// API 키 없이 실행했을 때 쓰는 가짜 데이터 (종목명으로 값이 고정됨)
function demoSeries(symbol) {
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const prevClose = 20 + rnd() * 480;
  const close = prevClose * (1 + (rnd() - 0.5) * 0.08);
  const prevVol = Math.round(2e6 + rnd() * 6e7);
  const vol = Math.round(prevVol * (0.5 + rnd() * 1.2));
  const day = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  const yest = new Date(today.getTime() - 86400000);
  const bar = (dt, o, c, v) => ({
    datetime: day(dt),
    open: o.toFixed(2),
    high: (Math.max(o, c) * 1.01).toFixed(2),
    low: (Math.min(o, c) * 0.99).toFixed(2),
    close: c.toFixed(2),
    volume: String(v),
  });
  return {
    meta: { symbol, currency: 'USD', exchange: 'DEMO' },
    values: [bar(today, prevClose, close, vol), bar(yest, prevClose * 0.99, prevClose, prevVol)],
    status: 'ok',
    demo: true,
  };
}

async function getSeries(symbols) {
  const now = Date.now();
  const out = {};
  const need = [];

  for (const s of symbols) {
    const hit = cache.get(s);
    if (hit && now - hit.at < CACHE_MS) out[s] = hit.data;
    else need.push(s);
  }
  if (!need.length) return out;

  if (!API_KEY) {
    // 키가 없으면 데모 데이터로 화면 확인 가능
    for (const s of need) out[s] = demoSeries(s);
    return out;
  }

  const url = 'https://api.twelvedata.com/time_series'
    + `?symbol=${encodeURIComponent(need.join(','))}`
    + '&interval=1day&outputsize=2'
    + `&apikey=${encodeURIComponent(API_KEY)}`;

  let map = {};
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (need.length === 1) map = { [need[0]]: json };
    else if (json.status === 'error') map = Object.fromEntries(need.map((s) => [s, json]));
    else map = json;
  } catch (err) {
    map = Object.fromEntries(need.map((s) => [s, { status: 'error', message: 'API 요청 실패' }]));
  }

  for (const s of need) {
    const d = map[s];
    if (d && d.status !== 'error' && Array.isArray(d.values)) {
      cache.set(s, { at: now, data: d });
      out[s] = d;
    } else {
      // 실패하면 마지막으로 받은 데이터를 대신 보여줌 (한도 초과 등)
      const stale = cache.get(s);
      out[s] = stale
        ? { ...stale.data, stale: true, staleReason: d && d.message }
        : (d || { status: 'error', message: '응답 없음' });
    }
  }
  return out;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, body) {
  res.writeHead(code, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (pathname === '/api/series') {
    const symbols = [...new Set(
      (searchParams.get('symbols') || '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => SYMBOL_RE.test(s))
    )].slice(0, MAX_SYMBOLS);
    if (!symbols.length) return sendJson(res, 400, { error: 'symbols 파라미터가 필요합니다' });
    return sendJson(res, 200, await getSeries(symbols));
  }

  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, pathname);
}).listen(PORT, () => {
  console.log(`주식 대시보드: http://localhost:${PORT}`);
  if (!API_KEY) console.log('※ TWELVE_DATA_API_KEY가 없어 데모 데이터로 실행합니다.');
});
