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
- [ ] S07 小說頁面
- [ ] S08 探索與研究所
- [ ] S09 會員／私訊前端退役
- [ ] S10 PWA
- [ ] S11 總測試與部署

## 待蔡決定／待補證
- schedule-chapters.yml（每天自動發章）vs 會員進度「排程發章：不做」：本次不停用（第十一章）。
- 22 縣市 SVG 幾何資料來源（需開放授權）。
- 每日 30 天／每月 12 個月備份政策：保留缺口。
