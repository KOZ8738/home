# Polaris Cam Stage 3：長時間＋限速上傳壓測工具組

這個工具組讓 `polaris-cam.exe` 的遠端上傳（H.264／JPEG → CamRelay → 後台觀眾）在**真實程式、真實顯示卡、真實 CamRelay** 上，
跑數分鐘到數小時的限速、壅塞、斷線、閒置與恢復，最後自動產出 PASS／FAIL 報告。

| 檔案 | 用途 |
|---|---|
| `soak-proxy.mjs` | 純 Node 22、零 npm 依賴的壓測代理：本機 CamRelay（`--local`）或透明限速轉發到正式後台（`--upstream`），負責階段排程、TCP 限速、斷線注入與所有統計 |
| `run-soak.ps1` | 一鍵啟動、監控（每 5 秒寫 `metrics.csv`）、清理，並自動產出 `summary.md` |
| `throttle-qos.ps1` | 選用：用 Windows 內建 `New-NetQosPolicy` 對 `polaris-cam.exe` 出站流量做系統層限速（需系統管理員） |

需求：Windows 10/11、Node.js 22 以上、PowerShell 5.1 以上；`-Mode local` 未給 `-Bin` 時還需要已登入的 `gh`（GitHub CLI）。
NVIDIA 顯示卡有 `nvidia-smi` 時會一併記錄 GPU／NVENC／VRAM。

---

## 一、快速開始

### 本機模式（不需部署、不需 MSFS）

```powershell
cd tools\polaris-cam\test\soak
# 3 分鐘快速壓測，自動從最新成功的 "Build Polaris Cam" run 下載 bin
powershell -ExecutionPolicy Bypass -File .\run-soak.ps1 -Mode local -Preset quick
# 指定已下載的 bin
powershell -ExecutionPolicy Bypass -File .\run-soak.ps1 -Mode local -Preset quick -Bin "$env:TEMP\polaris-cam-stage3-bin"
# 3 小時長跑
powershell -ExecutionPolicy Bypass -File .\run-soak.ps1 -Mode local -Preset soak -DurationMin 180
```

它會：

1. 啟動 `soak-proxy.mjs --local`：直接 `import` repo 裡的 `workers/polaris-efb-api/src/cam.js`，用一個最小的 Durable Object
   執行環境（`WebSocketPair`、`acceptWebSocket`、`getWebSockets`、`getTags`、`storage`、ping/pong 自動回應、單一事件閘門）
   跑**真正的 `CamRelay`**，連線經由真正的 `camPublic` 路由，對外是真正的 RFC 6455 伺服器
   `ws://127.0.0.1:<port>/live/cam/<token>/ws`。
2. 建立隔離的 `POLARIS_CAM_SETTINGS` 資料夾（在結果目錄的 `settings\`），寫入 UTF-16 BOM 的 `polaris-cam.ini`：
   `enabled=1, height=1080, fps=30, cameras=15, windows=0`，`[remote] enabled=1, url=http://127.0.0.1:<port>/live/cam/<token>`。
   使用者自己的 `%APPDATA%\Polaris Cam` 完全不會被動到。
3. 啟動 `polaris-cam-selftest.exe --serve <秒數> <expected.txt> --hardware`：用真實顯示卡餵 4 路動態 1080p 畫面（代替 MSFS 內的 bridge）。
4. 啟動真實 `polaris-cam.exe`，**以最小化、不搶焦點的方式**（`SW_SHOWMINNOACTIVE`）開啟，避免點到它的視窗改變了量測條件；
   要看視窗請加 `-ShowWindow`（仍不搶焦點）。
5. 本機 CamRelay 內建兩個模擬後台觀眾：
   - `fast`：每收 8 格或 400 ms 回一次 `{"t":"ack"}`，驗證正常觀眾持續收到流暢畫面。
   - `slow`：在 `baseline`／`recovery`（soak 另含 `mild_throttle`）階段中，每 30 秒有 12 秒完全停止 ack，驗證 CamRelay
     不再送它 P-frame、只每 3 秒給一張關鍵格探測，恢復 ack 後正常續播。
6. 想用眼睛看：Chrome／Edge 打開 `http://127.0.0.1:18787/view`（WebCodecs 解碼 4 路畫面，上方顯示階段與即時統計）。

安全機制：

- 已有 `polaris-cam.exe` 或 `polaris-cam-selftest.exe` 在跑時，會清楚警告並中止，**絕不關掉不是自己啟動的程式**。
- 若共享區塊 `Local\PolarisCam.Link.1`（本版 bridge／self-test 使用）已被別的程式開著（例如 MSFS 裡跑著同版 bridge），也會中止；
  MSFS 在跑但 bridge 不是同一個 link 時只警告（顯示卡共用，fps／GPU 數字會含 MSFS 的負載）。
- `-OutDir` 若在 git repo 裡面會直接拒絕，預設放 `%TEMP%\polaris-cam-soak\<時間>`。

### 正式後台模式（`-Mode live`，可開著 MSFS 飛行）

```powershell
powershell -ExecutionPolicy Bypass -File .\run-soak.ps1 -Mode live -Preset soak -DurationMin 180 `
    -Link https://efb-api.koz8738.com/live/cam/<token>
```

`soak-proxy.mjs --upstream` 在本機監聽 `ws://127.0.0.1:<port>/live/cam/<token>/ws`，每條來自 `polaris-cam.exe` 的連線都用 Node 22
內建 `WebSocket` 轉接到真實 Cloudflare `wss://efb-api.koz8738.com/live/cam/<token>/ws`，文字（`hello`、`ping`/`pong`、`watch`、
`key`）與二進位影格雙向原封不動轉發，關閉碼也照轉（例如後台換連結時的 4004 會原樣送回 `polaris-cam.exe`）。
**不需要系統管理員權限，也不需要 Clumsy。**

使用步驟：

1. 執行上面指令，畫面會印出 `http://127.0.0.1:18787/live/cam/<token>`。
2. 在**你自己的** `polaris-cam.exe` 遠端欄位貼上這個本機連結（取代原本的正式連結）。
3. 開著正式後台 `/admin#bc`（有人觀看，`polaris-cam.exe` 才會送影格）。
4. 時間到或按 Ctrl+C 結束；腳本**不會**關掉你的 `polaris-cam.exe`，結束後記得把遠端連結改回正式連結。

live 模式沒有 `idle_and_resume`（觀看人數由正式後台決定），改為 `normal_cruise`；若沒有人觀看，影格相關檢查會標成 SKIP。

---

## 二、參數

| 參數 | 預設 | 說明 |
|---|---|---|
| `-Mode local\|live` | `local` | 本機 CamRelay，或轉接正式後台 |
| `-Preset quick\|soak` | `quick` | `quick` 一輪 6 階段約 180 秒；`soak` 一輪約 20 分鐘，循環跑滿時長 |
| `-DurationMin <int>` | quick=3、soak=180 | 階段時長（暖機不計，暖機最多 60 秒／live 300 秒） |
| `-Link <url>` | — | `-Mode live` 必填：後台複製的 `https://efb-api.koz8738.com/live/cam/<token>` |
| `-Bin <path>` | 自動下載 | local：含 `polaris-cam.exe`、`polaris-cam-selftest.exe` 的資料夾；未給時用 `gh run download` 取最新成功的 `Build Polaris Cam` 的 `bin`（快取在 `%TEMP%\polaris-cam-soak\bin-<runId>`） |
| `-Port <int>` | `18787` | 代理監聽埠 |
| `-OutDir <path>` | `%TEMP%\polaris-cam-soak\<時間>` | 結果目錄（不可在 repo 內） |
| `-SampleSec <int>` | `5` | 遙測取樣間隔 |
| `-ShowWindow` | 關 | local：正常顯示 polaris-cam.exe 視窗（仍不搶焦點） |
| `-Rejudge <結果目錄>` | — | 不跑測試，只用該目錄既有的 `metrics.csv`、`metrics-final.json`、`run-info.json` 重新產出 `summary.md`（例如調整門檻後） |

`soak-proxy.mjs` 也可單獨執行：`node soak-proxy.mjs --help`。

---

## 三、階段（`--preset quick`，合計 180 秒）

| # | 階段 | 秒 | 上傳限速 | 做什麼、驗什麼 |
|---|---|---:|---:|---|
| 1 | `baseline` | 30 | 無 | 建立 4 路 H.264 基準 fps／kbps／RAM／VRAM；慢觀眾 4–16 秒停 ack |
| 2 | `mild_throttle` | 25 | 1500 kbps | 四路總計限速 |
| 3 | `severe_congestion` | 35 | 250 kbps | 遠低於四路碼率，逼出 `polaris-cam.exe` 1 秒上傳佇列溢位 → 丟棄 → 強制關鍵格 |
| 4 | `disconnect_blackout` | 25 | 無 | 第 2 秒送 `1011` 關閉並切斷 TCP，之後 10 秒對新連線回 HTTP 503，再恢復接受；量測自動重連與重送 `hello` + IDR |
| 5 | `recovery` | 30 | 無 | fps 回到基準、不再累積；慢觀眾再測一次 |
| 6 | `idle_and_resume` | 20 + 15 | 無 | 所有觀眾離開（`watch n=0`）20 秒：影格必須停止、NVENC 歸 0；觀眾回來（`watch n≥1`）15 秒：立即以關鍵格續播 |

`--preset soak`：同樣 6 階段，一輪約 20 分鐘（180／180／240／120／240／120+120 秒），循環到 `-DurationMin`。

---

## 四、限速怎麼做的（真實 TCP 背壓）

代理在接受 `polaris-cam.exe` 的那條 TCP socket 上做 token bucket 讀取限速：每秒最多從 TCP 讀入 `throttleKbps × 1000 / 8` bytes，
超過就 `socket.pause()`，等額度補足再 `socket.resume()`。暫停期間 OS 的 TCP 接收視窗會被填滿，`polaris-cam.exe` 那端的
`WinHttpWebSocketSend` 就真的會被卡住，跟網路上行塞車一樣。

- 限速放寬或解除的那一刻，正在等待的讀取立即放行（不必等舊限速排定的暫停結束），所以階段切換的時間點是準的。
- 只對上行那一條 socket 節流；`/metrics`、`/control`、`/view` 與觀眾連線都不受影響。
- Node 每次最多讀 64 KB 一塊，所以在很低的限速下（250 kbps ≈ 31 KB/s）會呈現「一塊進來、停 1–2 秒」的節奏，但平均速率準確。
- live 模式若正式後台比 `polaris-cam.exe` 慢（Node `WebSocket.bufferedAmount` 超過 1 MB），也會暫停讀取，背壓一路傳回去。

`throttle-qos.ps1` 是另一種選擇（系統層、需系統管理員）：

```powershell
.\throttle-qos.ps1 -Action apply -Kbps 1500    # 限制 polaris-cam.exe 出站 1500 kbit/s（ActiveStore，重開機即消失）
.\throttle-qos.ps1 -Action status
.\throttle-qos.ps1 -Action remove
```

注意：Windows 的 QoS 封包排程器**不處理 127.0.0.1 迴路流量**，所以它只對「`polaris-cam.exe` → 網際網路上的正式後台」有效，
對本機代理無效。本機或 live 代理模式請用 `soak-proxy.mjs` 的限速。

---

## 五、統計與不變量

代理解析每個二進位影格的 16-byte header（用 `cam.js` 的 `frameIn`，`hello` 用 `helloIn`），每顆鏡頭記錄：

`frames`、`keyframes`、`bytes`、`fps5s`、`kbps5s`、`lastSeq`、`seqGaps`（缺格次數）／`gapFrames`（缺幾格）、
**`gapKeyViolations`**、`seqBackwards`、`startNonKey`、`codec`（`h264`／`jpeg`）、`unexpectedFallbacks`、`maxGapMs`。

- **`gapKeyViolations`**：只要 `seq > lastSeq + 1`（中間有格被丟）而這一格不是 `flags & 1` 關鍵格就 +1。正確行為**永遠是 0**：
  `polaris-cam.exe` 丟格後一定要從關鍵格重新開始，後台才解得出來。
- **`startNonKey`**：每條新連線上每顆鏡頭的第一格必須是關鍵格（H.264）。
- **`unexpectedFallbacks`**：一路曾經是 H.264，之後影格或 `hello` 變成 JPEG。
- 觀眾端也各自檢查一次（`viewerGapKeyViolations`），對應 cam.js 的承諾「A page never gets a broken GOP」。

總計：`connections`、`disconnectsInjected`、`unexpectedDisconnects`、`refusedConnections`、`reconnectLatenciesMs[]`
（自注入斷線起到 4 路都收到關鍵格，含 10 秒拒連）、`reconnectHelloMs[]`、`maxReconnectMs`。

**慢觀眾（local）**：模擬觀眾自己算「上次 ack 之後收到幾格」，這正是 CamRelay 給它的 ring 長度。CamRelay 只有在 ring < 45
時才會送下一張 P-frame，所以停 ack 後收到的第 46 張以後如果出現 P-frame，就記入 **`slowViewerPFramesWhilePaused`（必須 0）**；
之後的關鍵格記為探測（`probeKeys`、最短間隔 `probeMinIntervalMs`，應約 ≥ 3 秒）；恢復 ack 後到第一張 P-frame 的時間記入
`resumeMs`（> 6 秒算慢）。

---

## 六、HTTP 介面（代理）

| 路徑 | 說明 |
|---|---|
| `GET /metrics` | 即時 JSON；`?full=1` 附每秒序列 |
| `GET /control?phase=<名稱>` | 跳到某階段（如 `severe_congestion`、`idle_and_resume/idle`） |
| `GET /control?throttle=<kbps>\|auto` | 手動覆寫限速／交還給階段 |
| `GET /control?disconnect=1&refuse=10` | 立刻注入一次斷線 |
| `GET /control?slow=pause\|resume\|auto` | 手動控制慢觀眾 |
| `GET /control?stop=1`、`?quit=1` | 結束階段／結束代理（會先寫 `proxy-final.json`） |
| `GET /view` | local：4 路 WebCodecs 畫面 |
| `WS /admin/api/cam/ws?role=view` | local：後台觀眾連線（`/view` 用的就是這個） |

---

## 七、結果目錄

| 檔案 | 內容 |
|---|---|
| `summary.md` | 自動判定報告：各階段 fps／kbps／GPU／NVENC、每顆鏡頭 fps、記憶體與 Handle 趨勢、PASS／FAIL 檢查 |
| `metrics.csv` | 每 5 秒：`polaris-cam.exe` 的 `WorkingSetMB`、`PrivateMB`、`Handles`、`Threads`、`CpuPct`、`Alive`；`nvidia-smi` 的 `GpuUtilPct`、`EncUtilPct`、`VramMB`；代理的 `phase`、`throttleKbps`、`mode`、`totalFps`、`totalKbps`、`totalGaps`、`gapKeyViolations`、`reconnects`、`slowViewerPFramesWhilePaused`、`cycle`（第幾輪）等 |
| `metrics-final.json` | 結束時的 `/metrics`（含各階段摘要） |
| `proxy-final-full.json`、`proxy-series.ndjson` | 含每秒序列（每顆鏡頭每秒 fps／kbit） |
| `proxy-events.log`、`proxy.log` | 代理事件（階段切換、斷線、重連、違規） |
| `polaris-cam.log` | 測試用 `polaris-cam.exe` 的 log（local 從隔離設定夾複製；live 從 `%APPDATA%\Polaris Cam`） |
| `serve.log` | local：self-test 的輸出 |
| `run-info.json` | 這次執行的參數、起訖時間、程式是否中途結束與結束碼（`-Rejudge` 會用到） |

---

## 八、PASS／FAIL 門檻

長跑會循環多輪：檢查 2–6 逐輪檢查**每一輪**跑滿時長的階段，任何一輪不合格就 FAIL，並在說明中列出是第幾輪、為什麼。
跑到一半就被結束的階段（不到預定長度 90%，`partial`）不納入。比較基準一律是**第 1 輪** baseline。

| # | 檢查 | 門檻 |
|---|---|---|
| 0 | 測試期間無人手動更改設定（local） | `polaris-cam.log` 本次執行內沒有任何 `settings:` 變更行，也就是 Polaris Cam 設定檔維持不變（畫面來源 1080p／30 fps／4 路開／遠端開；遠端實際上傳為各路 960x540 H.264） |
| 1 | `polaris-cam.exe` 全程存活 | 每次取樣都活著；結束碼 0 代表視窗被關（WM_CLOSE），非 0 疑似當機 |
| 2 | 每一輪 baseline 與 recovery 4 路皆 H.264 | 每段開著的每一路都有 H.264 影格，全程 `unexpectedFallbacks = 0` |
| 3 | 每一輪 severe_congestion 限速有效且不違規 | 每一輪上傳 ≤ 限速 × 1.3 + 40 kbps 且 `gapFrames > 0`（列出最接近上限的一輪）；全程 `gapKeyViolations = 0`、`startNonKey = 0`、`viewerGapKeyViolations = 0` |
| 4 | 每一輪斷線後自動重連 | 每一輪都有注入、在階段內等到 4 路關鍵格恢復（live 無人觀看時看 `hello`），單次重連 ≤ 35000 ms（自注入起算，含 10 s 拒連與 polaris-cam 的 1／2／4／8 s 退避），該輪尾段 fps > 0；全程恢復次數 = 注入次數 |
| 5 | 每一輪 recovery 回到基準 | 每一輪 recovery 最後 10 秒平均 fps ≥ 第 1 輪 baseline 最後 10 秒的 90% |
| 6 | 每一輪 idle_and_resume（local） | 每一輪 idle 開始 3 秒後收到 0 格、NVENC 最高 ≤ max(2%, 第 1 輪 baseline 平均的 20%)；每一輪 resume 4 路關鍵格 ≤ 5 秒、尾段 fps > 0 且 ≥ baseline 的 80% |
| 7 | 記憶體／Handle 不失控 | 以**第 1 輪** baseline 中位數為基線：結束時 WorkingSet、Private 增加 ≤ max(150 MB, 基線 50%)，Handles 增加 ≤ max(300, 基線 50%)；有 ≥ 3 輪時，各輪 baseline 的 Private 中位數對時間的趨勢 ≤ 30 MB／小時 |
| 8 | CamRelay 慢觀眾保護（local） | 至少一次被截斷、截斷後 P-frame = 0、探測間隔 ≥ 2.5 秒、每次恢復都在 6 秒內續播 |

總結：

- **PASS**（結束碼 0）：每一項適用的檢查都通過。
- **FAIL**（結束碼 1）：任一項 FAIL、執行未跑完，或程式中途結束。
- **INCONCLUSIVE**（結束碼 1，不算通過）：有檢查沒有資料，或 `-Mode live` 全程沒收到任何影格（通常是忘了開著後台 Broadcast 觀看），也就是上傳路徑根本沒被驗證到。

記憶體趨勢只用每輪 baseline 的中位數，不用原始樣本：每次斷線與 idle，編碼器都會釋放約 300 MB（Private 約 507 → 200 MB），
形成鋸齒；如果對不是整數輪的原始樣本做直線回歸，會被鋸齒帶歪（健康的長跑可能被判 FAIL，真的洩漏也可能被蓋掉）。

---

## 九、已知限制與判讀提醒

- **self-test 的畫面來源約每路 21 fps**：`polaris-cam-selftest.exe --serve` 以 `GetTickCount64` + `Sleep(1)` 排程、`next_ms = now + 33`，
  在 Windows 預設 15.6 ms 計時器解析度下會被進位成約 47 ms 一張（約 21.3 fps）。所以本機模式「30 fps」設定實際基準約 4 × 21 ≈ 85 fps，
  這是測試替身的上限，不是 `polaris-cam.exe` 或 CamRelay 的問題；MSFS 內真正的 bridge 不受此影響。
- self-test 的動態畫面很好壓縮，四路合計基準碼率約 1.2–1.3 Mbps，低於 `mild_throttle` 的 1500 kbps，所以本機模式的
  `mild_throttle` 幾乎不會丟格；真正的壅塞測試看 `severe_congestion`（250 kbps）。飛行畫面碼率高很多，live 模式下兩者都會有感。
- `nvidia-smi` 的 GPU／NVENC／VRAM 是整張卡的數字（含其他程式，例如開著的 MSFS、OBS）。
- local 模式的 CamRelay 執行環境是最小模擬：事件依序處理（如 Durable Object 的 input gate），但沒有休眠（hibernation）與跨機房延遲。
