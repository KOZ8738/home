# polaris-efb-api

Polaris EFB 的資料伺服器，網址 `https://efb-api.koz8738.com`。
EFB 本體放在 `https://koz8738.com/efb/`，在這個網域上打開時會自動使用這個伺服器，不用到 Settings 填網址。

它負責：
- FAA 和台灣 AIP 的航圖、機場滑行道圖、METAR/TAF、SIGMET、FIR 邊界、雷達、高空風
- VATSIM 即時航班，和線上的管制員（`/api/efb/vatsim-atc`，見 `src/vatspy.js`）：從 callsign 對出每位管制員負責的區域——區域管制（CTR/FSS）用 VATSpy Data Project 的 FIR／UIR 邊界，進近（APP/DEP）用 SimAware TRACON Project 的範圍，沒有範圍的畫 30 NM 圓；DEL/GND/TWR 和 ATIS 標在機場上（D/G/T/A）。兩份資料都是 CC BY-SA 4.0。索引不在 Worker 裡建（約 200 ms CPU，Workers Free 方案每次請求只有 10 ms）：GitHub Action「VATSIM ATC index」每週一、以及 `src/vatspy.js` 改動時跑 `scripts/atc-index.mjs --put`，寫進 KV 的 `atc:v2:lk`、`atc:v2:geo:<id>`、`atc:v2:apt:<id>`（需要 `CLOUDFLARE_API_TOKEN` secret；也可以在自己電腦 `npx wrangler login` 後執行 `node workers/polaris-efb-api/scripts/atc-index.mjs --put`）。KV 還沒有索引時，這個端點回 503，EFB 顯示「ATC: not ready on the EFB server yet」。VATSIM 的資料檔每次更新只讀一次，航班、管制員、ATIS 和 datalink 清單都從同一份來
- vAMSYS 的飛行員資料、預訂、機隊和在空中的航班
- 飛行員登入（Login with vAMSYS）
- Polaris Mail 和給部門的訊息（Mail 和 AOC 都可以寄給全部、單一飛行員或整個機組，機組規則見 `crewTo` / `toMatch`，在 `src/crew.js`）
- Polaris 公司文件（手冊、SOP、通告）：工作人員在後台上傳，飛行員在 EFB 的 Flight › Documents 看
- AOC 訊息：工作人員在後台 Messages 分頁選「AOC」（或從 Live 航班卡片的 AOC 按鈕）發給全部、單一飛行員或整個機組（呼號加上機組成員，雙人機組兩位都收得到；正在飛這個呼號的 EFB 在 18 小時內也收得到），飛行員在 EFB 的 Flight › Messages 看（不能回覆）；同一頁也顯示 Hoppie ACARS 等著這個呼號的訊息（只用 type=peek 讀取，不會發送，也不會把訊息從 Hoppie 拿走，見 `src/aoc.js`）
- 公司行事曆：後台 Calendar 分頁排行程（團體飛行、訓練、會議、公告、維護；一次或每週；給所有人、部分飛行員或某個機組；開始前推播提醒；可選是否放進 EFB）。vAMSYS Events 一起顯示，預設都放進 EFB，可隱藏或加 Polaris 備註（只讀 vAMSYS，不寫回）。EFB 日曆讀 `/api/efb/cal`（見 `src/cal.js`）
- Flight Watch：後台 Live 分頁上方列出需要注意的航班（緊急應答機 7700/7600/7500、超過 ETA 20 分鐘還在飛、VATSIM 飛行計畫目的地和訂位不同、訂 VATSIM 卻沒連線、ACARS 位置停住、等待航線、在 SIGMET 內、落地前 2 小時目的地 IFR/LIFR 或雷雨凍雨大雪冰雹），可以一鍵看航班或發 AOC（見 `src/watch.js`）
- 自動 AOC（後台 Automatic messages 頁，2026 年 11 月從 Settings 和 Gates 分出來）：五則訊息各一列，開關按下就生效，顯示最後一次發給誰；Edit 打開時間設定（到達登機門：落地前幾分鐘、沒有規則時發不發 CONTACT GROUND）和文字（`src/aoctpl.js`）。最終艙單、SIGMET 和到達報告預設開啟，兩個登機門預設關閉。自動發的 AOC 會帶 `auto`（訊息種類），「最後一次」由此而來（`aocAutoLast`，在 `src/aoc.js`）
- 出發登機門：飛行員在 EFB 報到（check-in）時，依登機門計畫在出發機場挑一個空的登機門，用 AOC 發給機組（`departureGate`，在 `src/stands.js`）
- 最終艙單：飛行員報到後，EFB 把載入的 SimBrief 計畫重量送到 `/api/efb/crew/ofp`；STD 前 15 分鐘 crew Durable Object 用 AOC 發「LOADSHEET FINAL」（計畫數字加上少量變動：少幾位 no-show 或多一位候補、貨物 ±2%，絕不超過限制，並列出和 OFP 的差異；見 `src/loadsheet.js`）
- 自動簽派放行（Dispatch release，2026 年 11 月）：Polaris 不是 24 小時有人值班，所以由伺服器自己放行。飛行員報到後，EFB 把載入的 SimBrief 計畫摘要（油量組成、重量、備降場、時間）和艙單重量一起送到 `/api/efb/crew/ofp`；crew Durable Object 一次讀出發、目的地和備降場的 TAF（aviationweather.gov），照後台設定的簽派政策檢查（見 `src/dispatch.js`）。結果分三種：硬性（超過重量限制、油量低於最低起飛油量、最終備份油不足、沒有備降場）一定要重新排計畫；可由機長決定（應變油不足、目的地低於標準又只有一個備降場、備降場低於標準或沒有 TAF、起飛機場低於落地標準卻沒有起飛備降場）機長在 EFB 填理由後放行，電報標註 CAPT DISCRETION；提醒（雷雨、TEMPO 低於標準、計畫太舊、航班號或註冊號和訂位不同）附在放行電報上。通過就發 AOC「DISPATCH RELEASE」（附放行編號，文字可在後台改，`aoctpl.js` 的 `rel`）；沒通過就推播告訴機組要改什麼。EFB 的報到頁（Flight › Download › Check-in 和 Roster）顯示結果，可以「Check again」重新檢查。後台 Automatic messages › Dispatch release 開關、設定門檻（KV `disp:v1:policy`）並看最近 30 天的檢查（`disp:v1:log`）；Flight Watch 顯示「沒有放行就在動」和「機長決定放行」的航班。預設關閉。我們沒辦法擋住沒放行的航班（vAMSYS 對我們是唯讀）。這些規則是參考 EASA、FAA 簡化的 Polaris 自訂規則，只用於 VATSIM 模擬飛行
- 自動登機門（AOC）：後台 Gates 頁設定每個機場的登機門規則（例如 `C1-C10, D5`，分國內／國際、窄體／寬體、航廈）。規則畫在 OpenStreetMap 的機場圖上（停機位依規則上色、VATSIM 上有飛機的打叉、派給 Polaris 班機的加圈，點停機位就能加進或移出規則；`/admin/api/stands/busy` 給 VATSIM 佔用的停機位），也有清單模式和「Try it」試算；開啟後每 2 分鐘檢查一次 Polaris 航班，落地前 30 分鐘（可調）用 AOC 發停機位給機組，避開 VATSIM 上停著飛機的位置和前後 45 分鐘派給其他 Polaris 班機的位置（見 `src/stands.js`，cron `*/2 * * * *`）。預設關閉
- OOOI 和準點率：同一個每 2 分鐘的 cron 記下每個 Polaris 航班的 OUT（離開停機位）、OFF（離地）、ON（落地）、IN（停妥）時間，和 vAMSYS 訂位的 STD／STA 比較（D15／A15：15 分鐘內算準點）。後台 On-time 分頁看今天、7、30、90 天的準點率、進行中的航班、已完成航班的時間表，可以替誤點航班選延誤原因（IATA 延誤代碼分組），也能下載 CSV。只在時間有變時寫入 KV（`ooo:v1:live`、`ooo:v1:log`，保留 90 天；見 `src/ooo.js`）
- 後台 Settings 只剩 People（每個人的角色、最後登入時間，KV `admin:v1:seen`，每人最多半小時寫一次）和 Roles，只有 Administrator 看得到；寄件 email 有沒有設好也顯示在這頁上方。Messages 的 From 名稱和 AOC 範本移到 Messages 頁（「From names and AOC templates」）。角色的頁面 `settings` 現在就是 Automatic messages 頁（舊的角色不用改）
- AIRAC 換期提醒（email）：中國和日本的 AIP 資料、航圖要在後台 Nav Data 手動上傳。下一期 AIRAC 生效前 7 天、生效當天、生效後 3 天，如果還有沒上傳的，就寄 email 給所有角色可以更新 Nav Data 的人（Administrator，或在 Settings › Roles 勾了「run Nav Data checks or uploads」的角色；角色功能還沒開時，用 `ADMIN_EMAILS` 清單）。只算已經在用的來源，全部上傳了就不寄；每封每期只寄一次，沒人收到時每 2 小時重試。Nav Data 頁上方會顯示收件人、寄送結果，並有「Send me a test」（見 `src/airacmail.js`，KV `nav:v1:remind`）。
  - 一次性設定：Cloudflare 後台 → koz8738.com → Email → Email Routing 打開；Workers 免費方案只能寄到「Destination addresses」裡驗證過的地址，所以每位收件人的 email 都要在那裡加入並點驗證信。寄件人是 `wrangler.toml` 的 `MAIL_FROM`（`noreply@koz8738.com`）。
- 任務 email 通知（`src/taskmail.js`，用同一個 `EMAIL` 綁定和 `MAIL_FROM`）：任務發給某人、或發給某部門而還沒人接時，寄給那個人／那個部門的每個人；任務被轉給某人時寄給他；別人完成你發的任務時寄給你；任務在 24 小時內到期還沒完成時，寄一次給負責的人（沒人接就寄給整個部門；每 20 分鐘的排程檢查）。做這個動作的人自己不會收到。每個人可以在 Tasks 頁上方取消勾選「Email me about my tasks」自己關掉（KV `tk:mailoff`）。email 還沒設好時什麼都不寄，Tasks 頁會顯示「email isn’t set up on the server yet」。收件人一樣要在上面說的 Destination addresses 驗證過（Workers 免費方案）。
- 到達報告（IN report）自動 AOC：OOOI 記到 IN（停到登機門）時，不分國內外，發給機組一則 AOC：OUT／OFF／ON／IN 時間、輪擋和空中時間、滑入分鐘、和 STA 比是否準點（±15 分鐘內算準點）、AOC 給的登機門、到達機場最新 METAR，並推播到機組裝置，落地時 EFB 沒開也收得到。每個航班一次；斷線前已落地的航班在消失 10 分鐘後補發。預設開啟，文字可在訊息範本裡改（見 `src/inreport.js`，在 `src/ooo.js` 的 `oooWatch` 呼叫）
- 航路 SIGMET 自動 AOC：每 10 分鐘看一次在空中的 Polaris 航班，沿著飛機到目的地的大圓航線往前看 900 nm／2.5 小時，用巡航高度（VATSIM 飛行計畫，否則目前高度）推算每一點的高度（爬升約 200 ft/nm、下降 3 度），航線穿過有效的 SIGMET（不含 AIRMET）而且高度在範圍內時，用 AOC 發給機組（附 SIGMET 原文），同一班機同一個 FIR 和天氣現象只發一次，一個航班最多 3 次。預設開啟，可在後台 Auto AOC 分頁關閉（見 `src/sigroute.js`，KV `sigroute:v1:sent`）
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
1. `efb/index.html` 裡有三處要一起改：`<link rel="preload" href="app-….js">` 和 `<script src="app-….js">` 改成新檔名，`<meta name="efb-build" content="…">` 改成新的版本號（檔名中間那段，例如 `1121.1108`）。版本號沒改的話，已經開著的 EFB 不會自動重新載入新版。（GitHub Actions 的 `efb-build-stamp.yml` 會在每次推送 `efb/index.html` 後自動把版本號和 preload 對齊 `<script src>` 的檔名，忘了改也會補上，但仍建議一起改。）
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
