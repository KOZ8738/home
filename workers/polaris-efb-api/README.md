# polaris-efb-api

Polaris EFB 的資料伺服器，網址 `https://efb-api.koz8738.com`。
EFB 本體放在 `https://koz8738.com/efb/`，在這個網域上打開時會自動使用這個伺服器，不用到 Settings 填網址。

它負責：
- FAA 和台灣 AIP 的航圖、機場滑行道圖、METAR/TAF、SIGMET、FIR 邊界、雷達、高空風
- VATSIM 即時航班
- vAMSYS 的飛行員資料、預訂、機隊和在空中的航班
- 飛行員登入（Login with vAMSYS）
- Polaris Mail 和給部門的訊息（Mail 和 AOC 都可以寄給全部、單一飛行員或整個機組，機組規則見 `crewTo` / `toMatch`，在 `src/crew.js`）
- Polaris 公司文件（手冊、SOP、通告）：工作人員在後台上傳，飛行員在 EFB 的 Flight › Documents 看
- AOC 訊息：工作人員在後台 Messages 分頁選「AOC」（或從 Live 航班卡片的 AOC 按鈕）發給全部、單一飛行員或整個機組（呼號加上機組成員，雙人機組兩位都收得到；正在飛這個呼號的 EFB 在 18 小時內也收得到），飛行員在 EFB 的 Flight › Messages 看（不能回覆）；同一頁也顯示 Hoppie ACARS 等著這個呼號的訊息（只用 type=peek 讀取，不會發送，也不會把訊息從 Hoppie 拿走，見 `src/aoc.js`）
- 推播通知、報到（check-in）、Kneeboard 同步，以及 Backup PFD 的轉送

完整的端點清單寫在 `src/index.js` 開頭的註解裡。

## 部署

### 自動部署（目前的做法）

推到 GitHub `main` 時，如果 `workers/polaris-efb-api` 有變動，Cloudflare 會自動部署這個 Worker。設定位置在 Cloudflare 後台 → Workers & Pages → polaris-efb-api → Settings → Build：已連結 `KOZ8738/home`，根目錄是 `workers/polaris-efb-api`，部署指令是 `npx wrangler deploy`。之後不需要再手動執行 `wrangler deploy`。

repo 裡另外有一個 GitHub Actions 的部署流程（`.github/workflows/deploy-efb-worker.yml`）：
- 它只在 GitHub repo 設了 `CLOUDFLARE_API_TOKEN` 這個 Actions secret 時才會部署。
- 沒設的時候會直接跳過，但 Actions 還是顯示綠勾，可以在執行記錄裡看到「Skipping」的提示。
- 這兩種部署方式只要開一種就好。兩種都開的話，每次 push 會部署兩次。

### 第一次設定（從零開始時才需要）

1. 在 VS Code 把 `efb/` 和 `workers/polaris-efb-api/` 一起 commit 並 push。
2. Cloudflare 後台 → Workers & Pages → Create application → Import a repository → 選 `home`。
3. Worker 名稱填 `polaris-efb-api`，要和 `wrangler.toml` 的 `name` 一樣。
4. Path（根目錄）填 `workers/polaris-efb-api`，前後不加斜線。Build command 留空，Deploy command 用預設的 `npx wrangler deploy`。
5. 建議 Build watch paths 填 `workers/polaris-efb-api/*`，之後只有改這個資料夾才會重新部署。
6. 部署完成後，用瀏覽器開 `https://efb-api.koz8738.com/api/efb/health`，看到 JSON 就是通了。

這時航圖、SIGMET、滑行道圖、管制區和雷達就能用了，這些都不需要 vAMSYS 金鑰。

## Secrets

位置：Cloudflare 後台 → `polaris-efb-api` → Settings → Variables and Secrets → Add。**類型一律選 Secret**。

| 名稱 | 要不要設 | 用途 | 沒設時會怎樣 |
|---|---|---|---|
| `VAMSYS_CLIENT_ID` | 必填 | vAMSYS Operations API 的 Client ID | Logbook、Dispatch、Map 的 Polaris 航班、機隊和報到都不能用；`/api/efb/health` 的 `configured` 會是 `false` |
| `VAMSYS_CLIENT_SECRET` | 必填 | vAMSYS Operations API 的 Client Secret | 同上 |
| `OPENAIP_API_KEY` | 建議 | openAIP 的空域圖層（`/api/efb/oaip/...`），以及官方 FIR 邊界（`/api/efb/fir`） | Map 的 openAIP 空域圖層讀不到；FIR 邊界只剩 VATSpy 的資料；`/api/efb/health` 的 `openaip` 會是 `false` |
| `SESSION_KEY` | 建議 | 簽發飛行員的登入狀態，請用一串隨機字串（例如 `openssl rand -base64 32` 產生的） | 改用 `VAMSYS_CLIENT_SECRET` 推算出來的金鑰，所以換 vAMSYS 金鑰時所有人都會被登出；兩個都沒有時，會在 KV 裡自動產生一個 |
| `ADMIN_EMAILS` | 建議 | `/admin` 的額外允許名單，多個信箱用逗號分隔 | 只靠 Cloudflare Access 的政策把關，任何通過 Access 的人都能進後台 |

注意事項：
- 一定要選 Secret，不要選 Text。Text 類型的變數會在下次部署時被 `wrangler.toml` 蓋掉，Secret 不會。`ADMIN_EMAILS` 雖然不算機密，也要選 Secret。
- 金鑰不要寫進 `wrangler.toml`，那個檔案會公開在 GitHub 上。
- 換掉 `SESSION_KEY`（包括第一次設定它），所有已登入的飛行員都會被登出一次。
- 加好後再開一次 `/api/efb/health` 確認。

## `wrangler.toml` 裡的設定（不是機密，會上 GitHub）

| 名稱 | 用途 |
|---|---|
| `VAMSYS_SCOPE` | Operations API 的權限範圍，EFB 只需要 `ops:read` |
| `ALLOWED_ORIGINS` | 只有這些網站的網頁可以讀這個 Worker（CORS） |
| `ACCESS_TEAM_DOMAIN`、`ACCESS_AUD` | `/admin` 用的 Cloudflare Access 設定，在 Zero Trust → Access → Applications 裡查；任一個是空的，後台就保持鎖住 |
| `VAMSYS_PILOT_CLIENT_ID` | 「Login with vAMSYS」用的 Pilot API Client ID。vAMSYS 那邊登記的 Redirect URL 是 `https://efb-api.koz8738.com/auth/callback` |
| `EFB_URL` | 飛行員登入後，如果 EFB 沒指定要回到哪裡，就回到這個網址 |

## 資料存放

| 綁定 | 類型 | 存什麼 |
|---|---|---|
| `STORE` | Workers KV | 航圖清單、機場滑行道圖、Polaris Mail 和附件、Polaris 公司文件、AOC 訊息、共享的航圖對位、FIR 邊界快取 |
| `PM` | Durable Object（`Mailbox`，`src/pm.js`） | 飛行員寫給部門的訊息，以及工作人員的回覆 |
| `CREW` | Durable Object（`Crew`，`src/crew.js`） | 推播訂閱和 VAPID 金鑰、報到、提示通知、飛行中的航跡 |
| `KB` | Durable Object（`Kneeboard`，`src/kb.js`） | 每個飛行員的 Kneeboard 頁面，在他自己的裝置之間同步；只有飛行員本人讀得到 |
| `PFD` | Durable Object（`PfdRelay`，`src/pfd.js`） | Backup PFD 的即時轉送，把模擬器電腦的姿態和速度傳到 iPad；不存任何資料 |

- 這 4 個 Durable Object 在 Workers Free 方案就能用，部署時會依照 `wrangler.toml` 的 `[[migrations]]` 自動建立，不用到後台手動設定。
- 已經有的 `[[migrations]]` 不要改、也不要刪，否則部署會失敗，甚至可能弄丟資料。要加新的 Durable Object 時，另外加一段新的 `[[migrations]]`，並取一個新的 `tag`。

## Polaris 公司文件（`src/docs.js`）

工作人員在後台的 **Documents** 分頁（`/admin#docs`）上傳 PDF，填標題、資料夾和版次；登入的飛行員在 EFB 的 Flight › Documents › Polaris Airways 看到，依資料夾分組，打開一次就存在裝置上，可以離線看。

- 檔案存在 KV（`STORE`）：每 8 MB 一塊（`docs:v1:f:<id>:<版本>:<第幾塊>`），封面是後台用 pdf.js 從第一頁做的小 JPEG（`docs:v1:c:<id>:<版本>`），清單在 `docs:v1:index`。
- 上限：每個檔案 100 MB，全部加起來 700 MB，最多 300 份。KV 免費方案總共 1 GB、每天 1,000 次寫入；上傳一份 100 MB 的檔案大約用 15 次寫入。
- 換檔案（Replace file）會變成新版本，舊版本的檔案在新版本上傳完成後刪掉。EFB 發現新版本時會自己下載換掉，刪掉的文件也會從飛行員的裝置上移除。
- 給飛行員的檔案和封面連結帶簽章，6 到 12 小時後失效，跟 Mail 附件一樣；EFB 會自己重新拿清單。
- 上傳到一半中斷留下的碎片，一天後會在工作人員打開 Documents 分頁時清掉。

## 定時工作（每 20 分鐘）

- 補抓美國大型機場的滑行道圖和本期 AIRAC 的航圖清單：只抓缺的或最舊的，每次最多 3 座。
- 檢查已報到航班的目的地和備降場天氣：變差時推播給飛行員，回到 VFR/MVFR 時再通知一次。檢查時段是起飛前 3 小時到落地後 1 小時。

## 後台的 Live 分頁（`admin-live/`）

`admin-live/` 裡的程式會打包成 `src/live-bundle.js`。分頁切換（Mail、Live、Inbox、Documents、Pilots）也在 `live.ts` 裡。改了 `admin-live/` 裡的東西之後要重新打包，再 push：

```
cd workers/polaris-efb-api/admin-live
npm install
npm run build
```

細節寫在 `admin-live/README.md`。

## EFB 本體的版本檔（`efb/app-*.js`）

EFB 的主程式放在 `efb/app-MMDD.HHMM.js`，每次改版都會用新的檔名，這樣瀏覽器一定會抓到新版。

改版時：
1. `efb/index.html` 裡有三處要一起改：`<link rel="preload" href="app-….js">` 和 `<script src="app-….js">` 改成新檔名，`<meta name="efb-build" content="…">` 改成新的版本號（檔名中間那段，例如 `1121.1108`）。版本號沒改的話，已經開著的 EFB 不會自動重新載入新版。
2. 上一版的檔案先留著，因為瀏覽器或 CDN 可能還快取著指向舊檔名的 `index.html`。
3. 同時把上上一版以前的檔案刪掉。`efb/` 裡最多只放「目前版」和「上一版」兩個 `app-*.js`。

## 出錯時

| 狀況 | 處理 |
|---|---|
| 建置失敗，說名稱不符 | Worker 名稱要是 `polaris-efb-api` |
| 找不到 `wrangler.toml` | Path 要填 `workers/polaris-efb-api` |
| 部署時說網域衝突 | DNS 裡已經有 `efb-api` 的紀錄，刪掉後重新部署 |
| 部署時說 migration 有問題 | 檢查是不是改到或刪到已經存在的 `[[migrations]]`（見「資料存放」） |
| 網址打不開 | 剛部署，憑證還在簽發，等幾分鐘 |
| EFB 顯示讀不到伺服器 | 確認 EFB 是從 `https://koz8738.com/efb/` 打開的；其他網址會被 `ALLOWED_ORIGINS` 擋掉 |
| EFB 打開是空白頁 | `index.html` 指向的 `app-*.js` 不存在，檢查檔名是否一致（見「EFB 本體的版本檔」） |
| 所有人突然都被登出 | `SESSION_KEY` 或 `VAMSYS_CLIENT_SECRET` 被換掉了 |
| 推到 GitHub 了，Worker 卻沒更新 | 到 Cloudflare 的 Build 記錄看看有沒有失敗；如果用的是 GitHub Actions，確認 `CLOUDFLARE_API_TOKEN` 有設 |

## 之後搬到 Polaris 官網

1. 把 `wrangler.toml` 的網域、`ALLOWED_ORIGINS` 和 `EFB_URL` 改成官網的。
2. 到 vAMSYS 把 Pilot API 的 Redirect URL 改成新網域的 `/auth/callback`。
3. 在 `efb/index.html`（`preconnect` 那一行）和 EFB 的主程式（`efb/app-*.js`）裡搜尋 `koz8738`，把預設伺服器改成新網址（或在 Settings 手動填）。
