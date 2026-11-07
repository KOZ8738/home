# 邊飛邊存軌跡（Cloudflare Worker）

網頁關掉也一樣記錄：Worker 每分鐘去讀 VATSIM 即時資料，你在線上就把位置存進 KV。
航班頁開啟時，讀 `/trail` 就能畫出完整的真實軌跡（所有訪客看到的都一樣）。
另外 `/live` 只回傳你這位飛行員目前的即時資料，航班頁優先用它，不用每位訪客各自去下載 VATSIM 全球的完整資料。

## 網址
網域已經在 Cloudflare，所以直接把 Worker 綁在子網域 `trail.koz8738.com`（`wrangler.toml` 已寫好）。
不用動你網站（GitHub Pages）本身的 DNS 設定。

預設的 `flight-trail.<帳號名稱>.workers.dev` 網址已用 `workers_dev = false` 關掉，只剩自己的網域能打到這個 Worker。

## 部署

KV 已經建好並寫進 `wrangler.toml`（id `03f3687d…`），可以跳過下面「建立 KV」的步驟。

### 方法 C：用 Cloudflare 的 Git 整合（推薦，push 就自動部署）
1. Cloudflare 後台 → Workers & Pages → Create application → 選 GitHub → 選這個網站的儲存庫。
2. Worker 名稱填 `flight-trail`（必須跟 `wrangler.toml` 裡的 `name` 一樣）。
3. Build 設定裡把 Root directory（根目錄）設成 `workers/flight-trail`，Deploy command 用預設的 `npx wrangler deploy`。
4. 之後每次 push 這個資料夾的變動，Cloudflare 會自動重新部署。

### 其他方法（二選一）

### 方法 A：用指令（需要 Node.js）
1. 在這個資料夾打開終端機：
   ```
   npx wrangler login
   npx wrangler kv namespace create TRAIL
   ```
2. 把印出來的 `id` 貼進 `wrangler.toml` 的 `kv_namespaces`。
3. 確認 `wrangler.toml` 裡的 `VATSIM_CID` 和 `ALLOWED_ORIGINS`（改成你的網址）。
4. 部署：
   ```
   npx wrangler deploy
   ```
5. 部署完成後，Worker 的網址就是 `https://trail.koz8738.com`（Cloudflare 會自動建立這筆 DNS 紀錄，憑證也是自動的，可能要等一兩分鐘）。

### 方法 B：只用網頁後台
1. Cloudflare 後台 → Workers & Pages → Create → Create Worker，名稱 `flight-trail`，貼上 `src/index.js` 的內容並 Deploy。
2. Storage & Databases → KV → Create namespace，名稱 `TRAIL`。
3. 回到 Worker → Settings → Bindings → Add → KV namespace：變數名稱填 `TRAIL`，選剛建立的 namespace。
4. Settings → Variables and Secrets：新增 `VATSIM_CID`（你的會員編號）和 `ALLOWED_ORIGINS`（例如 `https://koz8738.com,https://www.koz8738.com`）。
5. Settings → Triggers → Cron Triggers → Add：`* * * * *`。
6. 同一頁 Domains & Routes → Add → Custom domain：填 `trail.koz8738.com`。

## 接到網頁
網址和會員編號都寫在根目錄的 `site-config.json`（`trailBase`、`vatsimCid`），執行 `node scripts/sync-shared.mjs` 後會寫進網頁讀的 `config.js`，航班頁再用 `trailBase + '/trail'` 和 `trailBase + '/live'`。
同一個腳本也會把 `VATSIM_CID`、`ALLOWED_ORIGINS` 和 `routes` 的網域抄進這個資料夾的 `wrangler.toml`（Cloudflare 只看這個資料夾，讀不到根目錄的設定），所以這三個值不要直接改 `wrangler.toml`。

`LIVE_URL` 讀不到（Worker 當機、還沒部署）時，網頁會自動退回直接讀 VATSIM 全球資料，並且 2 分鐘內不再重試 Worker。

## 檢查
- 瀏覽器直接開 `https://trail.koz8738.com/trail`：沒在飛會看到 `null`，在飛會看到一串 JSON。（直接用網址列開不受 CORS 限制，但網頁上只有 `ALLOWED_ORIGINS` 裡的網站讀得到。）
- 開 `https://trail.koz8738.com/live`：沒連線會看到 `{"updated":"…","pilot":null}`，連線中 `pilot` 會是你的位置、高度、速度、航向和飛行計畫。
- 後台 Worker → Logs 可看排程有沒有跑。

## 額度（免費方案）
- KV 每天 1,000 次寫入：只有在線上時才寫，每分鐘一次，一天飛 16 小時以內夠用；沒在飛不會寫。
- KV 讀取每天 10 萬次：網頁有 15 秒邊緣快取，一般用量遠遠不到。
- `/live` 不用 KV，只有邊緣快取失效時才會向 VATSIM 抓一次（約每 15 秒一次，跟 VATSIM 資料更新頻率一樣），計入 Workers 請求數（免費每天 10 萬次）。
- Cron Triggers、Workers 請求數都在免費額度內。額度以 Cloudflare 官網為準，數字可能調整。

## 資料格式
`GET /trail` 回傳（沒有紀錄時是 `null`）：
```json
{
  "id": "EVA123|RCTP|RJAA", "callsign": "EVA123", "dep": "RCTP", "arr": "RJAA", "aircraft": "B77W",
  "started": 1794000000000, "updated": 1794003600000, "ended": null,
  "pts": [[25.0777, 121.2328, 1794000060, 0, 0], ...]
}
```
每個點是 `[緯度, 經度, 時間(秒), 高度ft, 地速kt]`。

`GET /live` 回傳：
```json
{
  "updated": "2026-11-07T12:00:00.123456Z",
  "pilot": {
    "cid": 1931319, "callsign": "OVO4FD", "latitude": 31.1, "longitude": 121.8,
    "altitude": 5000, "groundspeed": 250, "heading": 170, "logon_time": "2026-11-07T09:20:00Z",
    "flight_plan": { "departure": "RCSS", "arrival": "ZSPD", "aircraft_short": "A320" }
  }
}
```
沒在線上時 `pilot` 是 `null`；向 VATSIM 抓資料失敗時回 502（不會被快取）。欄位名稱跟 VATSIM 官方資料一樣。
