// 邊飛邊存軌跡的 Cloudflare Worker
//
// 做兩件事：
//   1. 排程（Cron，每分鐘一次）：去讀 VATSIM 即時資料，找到你的 CID 在線上就把位置記進 KV
//   2. GET /trail：把目前這一趟飛行的軌跡以 JSON 回傳給網頁（只允許你的網站讀取）
//   3. GET /live：只回傳你這位飛行員目前的即時資料（很小的 JSON），航班頁用它取代每位訪客各自去抓
//      VATSIM 全球的完整資料。邊緣快取 5 秒；VATSIM 自己每 15 秒才更新一次，所以資料最多比 VATSIM 晚幾秒
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
const LIVE_CACHE_S = 5;                   // /live 的邊緣快取秒數（網頁每 10 秒問一次；VATSIM 本身每 15 秒才更新一次，再快也不會有新資料）
const UPSTREAM_CACHE_S = 5;               // 向 VATSIM 抓的完整資料，邊緣快取秒數

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
    if (request.method === 'GET' && url.pathname === '/live') {
      // 同樣邊緣快取：不管多少人同時開著航班頁，同一個機房每 5 秒最多向 VATSIM 抓一次
      const cacheKey = new Request(url.origin + '/live');
      const cache = caches.default;
      let body;
      const hit = await cache.match(cacheKey);
      if (hit) {
        body = await hit.text();
      } else {
        try {
          body = JSON.stringify(await fetchLive(env));
        } catch (err) {
          // 抓不到就不要快取，讓網頁自己退回直接讀 VATSIM
          return new Response(JSON.stringify({ error: 'upstream' }), {
            status: 502, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' },
          });
        }
        ctx.waitUntil(cache.put(cacheKey, new Response(body, {
          headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${LIVE_CACHE_S}` },
        })));
      }
      return new Response(body, { headers: { ...cors, 'content-type': 'application/json', 'cache-control': `public, max-age=${LIVE_CACHE_S}` } });
    }
    return new Response('not found', { status: 404, headers: cors });
  },
};

// 從 VATSIM 全球資料裡只挑出你這位飛行員（沒在線上就是 null），欄位名稱和官方資料一樣，
// 所以網頁可以不改解析邏輯。
export function pickPilot(feed, cid) {
  const p = (feed.pilots || []).find((x) => x.cid === cid);
  if (!p) return null;
  const fp = p.flight_plan || null;
  return {
    cid: p.cid,
    callsign: p.callsign,
    latitude: p.latitude,
    longitude: p.longitude,
    altitude: p.altitude,
    groundspeed: p.groundspeed,
    heading: p.heading,
    // VATSIM 資料裡的 altitude 是用當地 QNH 修正過的海平面高度；要換算成飛行高度層（FL）要靠 QNH
    qnh_i_hg: p.qnh_i_hg,
    qnh_mb: p.qnh_mb,
    logon_time: p.logon_time,
    flight_plan: fp && {
      departure: fp.departure || '',
      arrival: fp.arrival || '',
      aircraft_short: fp.aircraft_short || '',
      altitude: fp.altitude || '',   // 申報的巡航高度，例如 "34100" 或 "FL341"
    },
  };
}

export async function fetchLive(env) {
  const cid = Number(env.VATSIM_CID);
  // cf.cacheTtl：Cloudflare 邊緣也把 VATSIM 的完整資料快取幾秒，同一個機房的多次請求只會真的去抓一次
  const res = await fetch(FEED, { headers: { 'User-Agent': 'flight-trail-worker' }, cf: { cacheTtl: UPSTREAM_CACHE_S, cacheEverything: true } });
  if (!res.ok) throw new Error('feed HTTP ' + res.status);
  const feed = await res.json();
  return {
    updated: (feed.general && feed.general.update_timestamp) || null,
    pilot: cid ? pickPilot(feed, cid) : null,
  };
}

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
