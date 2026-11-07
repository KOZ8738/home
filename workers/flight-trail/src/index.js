// 邊飛邊存軌跡的 Cloudflare Worker
//
// 做兩件事：
//   1. 排程（Cron，每分鐘一次）：去讀 VATSIM 即時資料，找到你的 CID 在線上就把位置記進 KV
//   2. GET /trail：把目前這一趟飛行的軌跡以 JSON 回傳給網頁（只允許你的網站讀取）
//
// 設定（wrangler.toml 或 Cloudflare 後台的 Variables）：
//   VATSIM_CID       你的 VATSIM 會員編號
//   ALLOWED_ORIGINS  允許讀取的網站，用逗號分隔，例如 https://koz8738.com,https://www.koz8738.com
// 綁定：KV namespace，綁定名稱必須是 TRAIL

const FEED = 'https://data.vatsim.net/v3/vatsim-data.json';
const SAME_FLIGHT_MS = 3 * 3600 * 1000;   // 中斷超過 3 小時就當成新的一趟
const ENDED_AFTER_MS = 10 * 60 * 1000;    // 離線超過 10 分鐘標記為「已結束」
const REFRESH_MS = 5 * 60 * 1000;         // 沒有新位置時，最多每 5 分鐘才寫一次（省 KV 寫入額度）
const MAX_POINTS = 6000;
const KEY = 'current';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(record(env));
  },

  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    if (allowed.includes(origin)) cors['Access-Control-Allow-Origin'] = origin;

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/trail') {
      // 邊緣快取 15 秒，避免很多人同時開頁面時狂讀 KV
      const cacheKey = new Request(url.origin + '/trail');
      const cache = caches.default;
      let body;
      const hit = await cache.match(cacheKey);
      if (hit) {
        body = await hit.text();
      } else {
        body = (await env.TRAIL.get(KEY)) || 'null';
        ctx.waitUntil(cache.put(cacheKey, new Response(body, {
          headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=15' },
        })));
      }
      return new Response(body, { headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'public, max-age=15' } });
    }
    return new Response('not found', { status: 404, headers: cors });
  },
};

export async function record(env) {
  const cid = Number(env.VATSIM_CID);
  if (!cid) return;
  const res = await fetch(FEED, { headers: { 'User-Agent': 'flight-trail-worker' } });
  if (!res.ok) return;
  const feed = await res.json();
  const p = (feed.pilots || []).find((x) => x.cid === cid);
  const now = Date.now();

  let cur = null;
  try { cur = JSON.parse(await env.TRAIL.get(KEY)); } catch (err) { cur = null; }

  if (!p) {
    // 不在線上：離線夠久就標記這趟已結束（之後同一趟重新連線會自動接回來）
    if (cur && !cur.ended && now - cur.updated > ENDED_AFTER_MS) {
      cur.ended = now;
      await env.TRAIL.put(KEY, JSON.stringify(cur));
    }
    return;
  }

  const fp = p.flight_plan || {};
  const id = `${p.callsign}|${fp.departure || ''}|${fp.arrival || ''}`;
  if (!cur || cur.id !== id || now - cur.updated > SAME_FLIGHT_MS) {
    cur = {
      id, callsign: p.callsign, dep: fp.departure || null, arr: fp.arrival || null,
      aircraft: fp.aircraft_short || null, started: now, updated: now, pts: [],
    };
  }
  const wasEnded = !!cur.ended;
  delete cur.ended;

  // 每個點：[緯度, 經度, 時間(秒), 高度(ft), 地速(kt)]
  const pt = [+p.latitude.toFixed(4), +p.longitude.toFixed(4), Math.round(now / 1000), Math.round(p.altitude), Math.round(p.groundspeed)];
  const last = cur.pts[cur.pts.length - 1];
  const moved = !last || Math.abs(last[0] - pt[0]) > 0.0005 || Math.abs(last[1] - pt[1]) > 0.0005;
  if (moved) {
    cur.pts.push(pt);
    if (cur.pts.length > MAX_POINTS) cur.pts = cur.pts.filter((_, i) => i % 2 === 0 || i === cur.pts.length - 1);
  }
  if (!moved && !wasEnded && now - cur.updated < REFRESH_MS) return;   // 沒變動就不寫
  cur.updated = now;
  await env.TRAIL.put(KEY, JSON.stringify(cur));
}
