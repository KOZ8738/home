# 邊飛邊存軌跡（Cloudflare Worker）

網頁關掉也一樣記錄：Worker 每分鐘去讀 VATSIM 即時資料，你在線上就把位置存進 KV。
航班頁開啟時，讀 `/trail` 就能畫出完整的真實軌跡（所有訪客看到的都一樣）。

## 網址
網域已經在 Cloudflare，所以直接把 Worker 綁在子網域 `trail.koz8738.com`（`wrangler.toml` 已寫好）。
不用動你網站（GitHub Pages）本身的 DNS 設定。

## 部署（二選一）

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
把 `https://trail.koz8738.com/trail` 填進 `flights.html` 的設定：

```js
const CONFIG = {
    VATSIM_CID: 1931319,
    TRAIL_URL: 'https://trail.koz8738.com/trail',
    ...
};
```

## 檢查
- 瀏覽器直接開 `https://trail.koz8738.com/trail`：沒在飛會看到 `null`，在飛會看到一串 JSON。（直接用網址列開不受 CORS 限制，但網頁上只有 `ALLOWED_ORIGINS` 裡的網站讀得到。）
- 後台 Worker → Logs 可看排程有沒有跑。

## 額度（免費方案）
- KV 每天 1,000 次寫入：只有在線上時才寫，每分鐘一次，一天飛 16 小時以內夠用；沒在飛不會寫。
- KV 讀取每天 10 萬次：網頁有 15 秒邊緣快取，一般用量遠遠不到。
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
