# polaris-efb-api

Polaris EFB 的資料伺服器，網址 `https://efb-api.koz8738.com`。
EFB 本體放在 `https://koz8738.com/efb/`，在這個網域上打開時會自動使用這個伺服器，不用到 Settings 填網址。

它負責：FAA 航圖、機場滑行道圖、SIGMET、管制區邊界、天氣雷達，以及 vAMSYS 的飛行員資料、預訂和在空中的航班。

## 部署（跟 flight-trail 一樣用 Cloudflare 的 Git 整合）

1. 在 VS Code 把 `efb/` 和 `workers/polaris-efb-api/` 一起 commit 並 push。
2. Cloudflare 後台 → Workers & Pages → Create application → Import a repository → 選 `home`。
3. Worker 名稱填 `polaris-efb-api`（要和 `wrangler.toml` 的 `name` 一樣）。
4. Path（根目錄）填 `workers/polaris-efb-api`，前後不加斜線。Build command 留空，Deploy command 用預設的 `npx wrangler deploy`。
5. 建議 Build watch paths 填 `workers/polaris-efb-api/*`，之後只有改這個資料夾才會重新部署。
6. 部署完成後，瀏覽器開 `https://efb-api.koz8738.com/api/efb/health`，看到 JSON 就是通了。

這時航圖、SIGMET、滑行道圖、管制區和雷達就能用了，這些不需要 vAMSYS 金鑰。

## 加上 vAMSYS 金鑰（Logbook、Dispatch、Map 的 Polaris 航班要用）

Cloudflare 後台 → `polaris-efb-api` → Settings → Variables and Secrets → Add，**類型選 Secret**：

| 名稱 | 內容 |
|---|---|
| `VAMSYS_CLIENT_ID` | Operations API 的 Client ID |
| `VAMSYS_CLIENT_SECRET` | Operations API 的 Client Secret |

- 一定要選 Secret，不要選 Text。Text 類型的變數下次 push 重新部署時會被 `wrangler.toml` 蓋掉，Secret 不會。
- 金鑰不要寫進 `wrangler.toml`，那個檔案會上 GitHub。
- 加好後再開一次 `/api/efb/health`，應該會顯示金鑰已設定。

## 出錯時

| 狀況 | 處理 |
|---|---|
| 建置失敗，說名稱不符 | Worker 名稱要是 `polaris-efb-api` |
| 找不到 `wrangler.toml` | Path 要填 `workers/polaris-efb-api` |
| 部署時說網域衝突 | DNS 裡已經有 `efb-api` 的紀錄，刪掉後重新部署 |
| 網址打不開 | 剛部署，憑證還在簽發，等幾分鐘 |
| EFB 顯示讀不到伺服器 | 確認 EFB 是從 `https://koz8738.com/efb/` 打開的；其他網址會被 `ALLOWED_ORIGINS` 擋掉 |

## 之後搬到 Polaris 官網

1. 把 `wrangler.toml` 的網域和 `ALLOWED_ORIGINS` 改成官網的。
2. EFB 的 `index.html` 裡搜尋 `koz8738`，把預設伺服器改成新網址（或在 Settings 手動填）。
