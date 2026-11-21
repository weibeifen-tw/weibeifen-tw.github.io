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
- [ ] S02 Threads 與冗餘檔案
- [ ] S03 AI 開發索引
- [ ] S04 CSS／JS
- [ ] S05 效能
- [ ] S06 跨裝置導覽
- [ ] S07 小說頁面
- [ ] S08 探索與研究所
- [ ] S09 會員／私訊前端退役
- [ ] S10 PWA
- [ ] S11 總測試與部署

## 待蔡決定／待補證
- schedule-chapters.yml（每天自動發章）vs 會員進度「排程發章：不做」：本次不停用（第十一章）。
- 22 縣市 SVG 幾何資料來源（需開放授權）。
- 每日 30 天／每月 12 個月備份政策：保留缺口。
