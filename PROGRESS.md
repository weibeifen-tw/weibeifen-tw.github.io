# 《未備份》V1.0 開發進度（S01–S11）

授權：2026-11-22 正式授權（一次授權、連續開發、符合第十七章條件才自動合併部署）。
規格：原始 V1.0 Q01–Q65、R01–R10＋D01–D05＋DM-A＋FIX＋T 系列。設計 R01–R09、DM-A/DM-T、FIX/T 原文、D17–D21 原文：待補證。
新工作階段只讀：本檔 → CLAUDE.md → 當前階段相關檔案。不要重掃全專案。

## 基準
- 開工 main：ebc7b8c（2026-11-21）。復原點：遠端分支 backup/pre-v1-s01-s11-20261122（＝ebc7b8c）。
- 遠端另有 feat/v1-s01-s11-integration（＝ebc7b8c、無 commit，來源不明，不動它）。
- 本機無法安裝 Jekyll（rubygems 被擋）→ 用 .dev/render.js（liquidjs 模擬）截圖；正式建置以 GitHub「建置檢查」為準（分支名須 feat/site-*）。
- 測試：`cd .dev && npm i && node render.js .. /tmp/site && node shot.js /tmp/site /tmp/shots "/,/novel/chaojian/" 320,390,768,1024,1440`

## 效能基準（S01，本機實驗室數據：Lighthouse 13.6 行動版模擬節流，本機伺服器，外部連線被擋）
| 頁面 | Perf | A11y | LCP | CLS | TBT | 大小 |
|---|---|---|---|---|---|---|
| / | 95 | 96 | 2.7 s | 0 | 50 ms | 251 KiB |
| /novel/chaojian/ | 96 | 96 | 2.6 s | 0 | 0 ms | 230 KiB |
| /t/yincang01/ | 99 | 96 | 1.7 s | 0 | 10 ms | 227 KiB |
| /taiwan/ | 94 | 96 | 2.7 s | 0 | 0 ms | 282 KiB |
| /era/ | 96 | 96 | 2.3 s | 0 | 0 ms | 231 KiB |
- Best-practices 77 是本機環境造成（非 https、外部 Supabase 被擋產生主控台錯誤），不是網站實況。
- A11y 扣分：color-contrast。
- 真實使用者數據（CrUX／正式網站）：本環境連不到 weibeifen.com，無法量測 → 待蔡用 PageSpeed Insights 補。
- 基準截圖 8 頁 × 5 寬度，水平溢出 0。

## 階段狀態
- [x] S01 盤點與備份（feat/site-v1-s01）
- [x] S02 Threads 與冗餘檔案（feat/site-v1-s02）
  - Threads：threads.yml、threads-token.yml 早已停用（只剩手動觸發空殼、if:false），保留當退役紀錄；移除 post_threads.py、.github/threads（queue／sent／outbox／done.txt，F06、F07）、__pycache__（F01）
  - F08–F16＝assets/stories 九張被漫畫取代的備用圖（chaosheng chuwang exam hongdian houdiao hue market shuangshuang xiwei，合計 1,553,318 bytes）；novel-post.html 只在缺漫畫時才用，九本漫畫齊全
  - F02 logo.webp、F03 mu-couple.webp、F04 pin.webp：原始碼與渲染輸出皆無引用 → 移除
  - gongdi.webp 有引用，保留；F05 login-test 保留（U08=A）
  - 外部備份：weibeifen_S02_backup_2026-11-22.zip（117 檔，sha256 前綴 cda78a4395cf1bb8，已交給蔡）；另可 git checkout ebc7b8c -- <路徑> 還原
  - 回歸：441 頁渲染輸出與基準相同（.dev/regress.sh）
  - 待蔡：Threads 憑證（GitHub Secrets／Meta 後台）自行撤銷；「新章節上架」技能的「排脆」步驟改手動
- [x] S03 AI 開發索引（CLAUDE.md、AGENTS.md、docs/ai/ 六區；_config exclude）
- [x] S04 CSS／JS（feat/site-v1-s04）
  - style.css 70,188→55,442 bytes：依 class 前綴拆出 assets/css/admin、literature、era、taiwan.css（頁面 front matter `page_css:`；研究文章依 collection 自動載入）
  - app.js 38,465→32,769：拆出 assets/js/taiwan.js、home.js（front matter `page_js:`）；搜尋索引原本就按需載入
  - 回歸：像素比對 11 頁×390／1440 與基準相同（首頁、admin、member 的差異在基準自比也出現＝隨機排序與動態文字）；首頁熱門分頁、臺灣地圖點選互動正常、無 JS 錯誤
  - 私訊區塊（app.js 338–477）留到 S09 前端退役時移除
- [x] S05 效能（feat/site-v1-s05）
  - Google 字型改成不擋首次繪製（preload＋onload，noscript 後備；display=swap）
  - 圖片：首頁封面、漫畫原本就有寬高與 lazy；未發現 CLS 來源
  - 試過：600w 漫畫縮圖（Lighthouse 以 2.6 倍螢幕仍取原圖，無效）、AVIF（比現有 WebP 大）→ 均撤回
  - 未達標：作品頁 LCP 實驗室 2.9 s（LCP＝第一張漫畫 ~120KB，基準也是 2.9 s）；再降需降低畫質，規格禁止 → 待蔡決定
  - 同條件量測（gzip 本機伺服器、行動版模擬節流；.dev/lh.sh）：

| 頁面 | 改版前 perf／LCP | S04+S05 perf／LCP |
|---|---|---|
| / | 99／1.8 s | 99／1.7 s |
| /novel/chaojian/ | 95／2.9 s | 96／2.9 s |
| /t/yincang01/ | 100／1.5 s | 100／0.9 s |
| /taiwan/ | 99／1.7 s | 99／1.6 s |
| /era/ | 100／1.5 s | 100／1.3 s |
| /literature/ | 100／1.5 s | 100／1.3 s |

  （S01 表格的數字是沒有 gzip、且渲染工具漏了漫畫圖的版本，以這張為準）
- [x] S06 跨裝置導覽（feat/site-v1-s06）
  - 同一個抽屜 nav：≥1024 固定左側 240px、768–1023 窄版圖示欄 72px（title 提示）、≤767 維持抽屜＋新增底部導覽「首頁／探索／書櫃／會員」；閱讀頁（body.reading）不固定、不顯示底部導覽（Q25 專注）
  - 「故事之外」→「探索」：臺灣故事、互動年代、未備份研究所（D02、D05）；關於畝、糖果、個人功能位置不變；頂端放大鏡不變
  - 底部「探索」開小選單（Esc／點外面關閉）；右下通知鈕在手機上移到底部導覽上方
  - 測試：9 頁 × 12 寬度無水平溢出、無 JS 錯誤；Esc、焦點、視窗縮放切換、閱讀頁專注模式皆通過
- [x] S07 小說頁面（feat/site-v1-s07）
  - 首頁（Q27、Q28）：≥768 「全部作品（隨機）」「熱門作品（暫依最新上架）」兩區上下排列、整頁往下捲；電腦一列 6 本、寬 1120；手機維持切換＋約 2.5 本
  - 作品頁（Q29）：≥1024 左側主視覺（捲動固定）、右側標題／標籤／簡介／開始閱讀；手機上下不變
  - 閱讀器（Q30）：章節頁加可收合「目錄」，第一次展開才載 posts.json（assets/js/reader.js）；目前章節標示；深色模式沿用
  - 角色（Q31）：電腦兩欄、手機單欄
  - 測試：5 頁 × 12 寬度無溢出；其他頁像素不變；目錄延遲載入驗證（展開前 0 次請求）
- [x] S08 探索與研究所（feat/site-v1-s08）
  - 臺灣故事（D04、Q32）：22 縣市，核准固定順序；電腦／平板＝互動縣市地圖＋列表，手機＝各縣市獨立輪廓列表（整列可點）；共用 assets/taiwan/counties.svg（內政部村里界圖，政府資料開放授權條款第 1 版，經 taiwan-atlas MIT；RDP 簡化，52KB）；小面積縣市加 18 單位點擊圈
  - 縣市對應在 _data/counties.yml；不確定的 pending：yincang（嘉義市／縣）、xiwei（嘉義市／縣）、shanhai（臺灣東部）→ 待蔡確認；舊 13 地理分區資料與 include 保留未刪
  - 未備份研究所（Q53–Q65、R10、D03）：六大專區（順序固定）電腦三欄／平板兩欄／手機列表，無公開文章＝籌備中；下接最新發布文章；舊八類存為 legacy_categories（核對時 0 篇使用）；故事之外、文學創作在網站上沒有資料
  - 研究文章版型：修訂紀錄、系列卷／章摺疊目錄、上一篇／下一篇（用暫存假文章測過，未提交）；驗證腳本改六大專區、允許 article_id version keywords series volume chapter_no piece revisions
  - 互動年代（D05）：頁面標題改名，網址 /era/ 不變
  - 臺字：網站自己寫的標題、說明、年份・地點、地圖註記改「臺」；小說簡介、角色介紹、作品頁 SEO 標題等作者文案未改（待蔡決定）；台中高工、台地不改
  - 搜尋：臺／台互通；分類名「研究文章」
- [x] S09 會員／私訊前端退役（feat/site-v1-s09）
  - 前端：app.js 收件匣只剩「留言新回應」通知；cloud.js 不再讀寫 dm_messages、不呼叫 dm_mark_seen／dm_delete_thread；後台私訊分頁移除（admin_dm_threads 不再呼叫）；💬 按鈕原本就全站 notalk，標籤改「留言」、點了前往公開留言
  - 本機瀏覽器測試：私訊相關請求 0、後台無私訊分頁、無 JS 錯誤
  - 後端：supabase/drafts/022_dm_retire_DRAFT.sql（撤銷權限、拿掉政策、停用 RPC、保留歷史）**未執行** → 私訊「後端」尚未安全退役
  - FIX-01／FIX-06：supabase/drafts/023_admin_whitelist_session_DRAFT.sql（白名單表＋aal2＋8 小時＋閒置 30 分，is_admin 簽章不變）**未執行**
  - FIX-02～10、T01–T15、DM-T 狀態：supabase/drafts/README.md（全部未驗證）
  - 會員、書櫃、後台版面：12 寬度無溢出；管理後台手機實機操作待人工測試
- [x] S10 PWA（feat/site-v1-s10）
  - sw.js：網頁／章節／研究文章／JSON 網路優先、失敗才用副本（Q43、Q44）；CSS／JS 依版本號快取，舊版本快取自動刪；圖片按需快取
  - 上限＋最近使用淘汰（Q45）：頁面 160、圖片 300（暫定，待實測核定）
  - 404／410：刪掉舊副本，不再顯示已撤回內容
  - 不快取：/admin /auth /member /favorites /my-comments /login-test；外部連線（Supabase、字型、統計）不攔；離線時這些頁只給離線頁
  - 更新（Q46）：不自動接管；頁面顯示「網站有新版本｜更新｜稍後」，按更新才換並回到原捲動位置；第一次安裝不重新整理
  - 瀏覽器實測：受控、上限 4 時只留最近 4 頁、離線讀已存章節、被淘汰的顯示離線頁、/member/ 不入快取、410 後副本消失、更新提示與捲動位置保留
- [x] S11 總測試與部署（2026-11-22）
  - main 合併點：bf9ee72（S01–S03）→ 059955f（S04–S06）→ a4ce65b（S07–S08）→ f76b619（S09–S10）；每段 `git revert -m 1 <commit>` 可退回；開工前復原點 backup/pre-v1-s01-s11-20261122
  - 每段 GitHub「建置檢查」皆成功
  - 響應式：16 頁 × 12 寬度（320–1920）無水平溢出、無 JS 錯誤（本機 Chrome）
  - 最終效能（同基準條件；實驗室數據）：/ 100／1.7 s、作品頁 95／2.9 s（未達 2.5 s）、章節 100／0.9 s、臺灣故事 100／1.3 s、互動年代 100／1.3 s、研究所 100／1.3 s；CLS 全部 ≤0.002；A11y 95–96（扣分：color-contrast）
  - 未做／需人工：Android Chrome、iOS Safari、Edge、Firefox、PWA 獨立模式實機；真實使用者效能數據；後端 T01–T15、DM-T 實測

## S12 補充決策（2026-11-22 站長補充，納入原授權；feat/site-v1-s12）
- 縣市：《席位》＝嘉義市；《隱藏》＝嘉義市＋雲林（依專案設定集：霜嘉義市人、主要場景嘉義市；堤雲林北港人）；《山海有痕》不歸縣市，臺灣故事頁「未指定縣市」顯示區域（臺灣東部史前山地與海岸）
- 臺字：小說簡介、角色介紹、作品頁 SEO 標題的地名改「臺」（39 字）；「台中高工」（校名）與「」引號內台詞不改；章節正文、書名、URL、id 不動
- LCP（不降畫質）：試過重新壓縮（q85 也比原檔大）、AVIF、模糊預覽（LCP 不變）→ 均不採用；採用「第 2、3 張漫畫延後到頁面載完或讀者滑動才下載」＋head 預載第一張原圖。作品頁 LCP：《潮間》2.9→2.3 s、《忌色》2.9→2.3 s、《雙雙》4.3→2.9 s（首圖 207KB，仍未達 2.5 s）
- Threads：移除 threads.yml、threads-token.yml（已停用空殼）。專用金鑰＝THREADS_TOKEN（發文）、GH_PAT（只被 threads-token.yml 用來寫回金鑰）；現行 workflow 沒有任何一支用到 secrets。GitHub Secrets 與 Meta 權杖撤銷 Claude 無權限 → 站長手動（見最終回報）；新章節技能已提出修改卡片（排脆改手動），待站長儲存
- schedule-chapters.yml：未動（獨立待核對）
- 020：本環境連不到 Supabase（連線被拒）→ 未核對；唯讀檢查 SQL：supabase/drafts/check_020_readonly.sql（repo 版函式內容指紋 15031cb36d60df5f1a8bc98949919d42）

## 待蔡決定／待補證（S11 彙整）
- 《雙雙》等首圖較大的作品頁 LCP 仍約 2.9 s
- SQL 草案 022（私訊後端封鎖）、023（管理員白名單＋工作階段）待站長審閱、執行；020 是否已執行
- FIX-02／05／09 需最新資料庫結構（export_schema.sql）
- Threads：GitHub Secrets 刪 THREADS_TOKEN、GH_PAT；Meta 端撤銷授權；儲存技能修改卡片
- 020：在 SQL Editor 跑 check_020_readonly.sql，結果交給 Claude 比對
- 原始條文待補證：設計 R01–R09、S02-01-C、C01–C10、T01–T15、DM-A／DM-T、D17–D21、X1–X6、G01–G08、E01–E25、P01–P09、JU／PU／NU／VU／MU／CW
- schedule-chapters.yml（每天自動發章）vs 會員進度「排程發章：不做」：本次不停用（第十一章）。
- 22 縣市 SVG 幾何資料來源（需開放授權）。
- 每日 30 天／每月 12 個月備份政策：保留缺口。
