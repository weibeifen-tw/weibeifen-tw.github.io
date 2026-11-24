
# 《未備份》V2.2 第三輪｜網站頁面整合及最新建置待驗證紀錄

日期：2026-11-24。只限 feat/site-t03-reading-isolation 開發分支；不修改 main、不 Merge、PR 或 Deploy，不存取正式 Supabase、真實會員資料或小說正文。

## 版本及測試對象

- GitHub Repo：weibeifen-tw/weibeifen-tw.github.io
- main 比較基準：01f9924da8c106992f2490f59d90750293c6f817
- V2.2 第二輪基準：ff1bc8b5b7fcab28a7ce25eeb376726985eeb626
- 舊 GitHub Actions #336（5b3ff48）成功紀錄只適用舊版，不能當本輪最新成功證據。

## 本輪新增測試

**一、.dev/test-t03-page-integration.cjs**

使用本機 HTTP 假資料頁，實際載入分支中的 assets/js/reading-store.js、assets/app.js、assets/member.js。

合成測試頁分別模擬：假章節 /t/demo01/、假作品頁 /novel/demo/、書櫃 /shelf/、會員頁 /member/；章節狀態索引與身份驗證均由本機假資料提供。沒有真實小說正文、真正 OAuth、Supabase SDK 或外部 API 請求。

覆蓋訪客進度／捲動位置、作品頁繼續閱讀、書櫃章節驗證、未驗證身份隔離、會員 A／B 閱讀分離、帳號切換即時更新書櫃、會員頁 A／B 假個資顯示以及登出。外部網路請求及瀏覽器 JavaScript 例外均設定為測試失敗。

**二、.dev/test-t03-rendered-pages.cjs**

在官方 Jekyll 本機建置完成後，核對 _site/index.html、_site/shelf/index.html、_site/member/index.html 均存在，並檢查 reading-store.js → app.js → member.js → cloud.js 的載入順序；確認 _site 未含測試用 .dev 目錄、Supabase SQL 目錄、假會員名稱，並有 reading-store.js 產物。

**三、.github/workflows/build-check.yml**

只在 T03 分支或以此分支為來源的 PR 執行本輪新增的 Chromium 合成頁面整合檢查及 Jekyll 輸出檢查；不部署，也沒有正式後端金鑰。

## 執行證據

- 既有閱讀隔離假資料 JS 測試：38／38 通過。
- 既有安全回退假資料模擬：15／15 通過。
- 獨立預覽假資料測試：23／23 通過。
- V2.2 第二輪非同步競態假資料測試：11／11 通過。
- 新增頁面 Chromium 整合腳本：語法檢查通過，真實 Chromium CI 執行 **待補證**。
- 新增 Jekyll 產物檢查腳本：語法檢查通過，正式 runner 實際執行 **待補證**。
- 最新 GitHub Actions run ID、job log、Success：**尚未取得可核實證據，不得宣稱建置通過**。

## 明確保留的正式部署阻擋

1. 最新 Commit GitHub Actions 全套建置與 Chromium 測試成功日誌。
2. 真實 Jekyll 頁面及原手機 33 項回歸、iPhone Safari 和 Android Chrome 實機完整驗證。
3. V22-R01～R04 安全待補證：正式 Supabase RLS/JWT、登入／登出競態、在途同步、帳號刪除、真正 Rollback、備份復原。
4. 合成假資料頁只使用真實前端 JS，不等於正式 Supabase 端到端整合測試。
5. 即使全部技術 Gate 達成，PR／Merge／Deploy 仍需要站長另行核准。

保留全部 T01/T02 待補證、T03-R01～R03、T03-U01～U03、原 116 審查 ID、前 11 頁人工核准決策、原五階段計畫、原手機 33 項紀錄及 S1-F01～S1-F04。S1-02、P3-01-D、T04 持續暫停。

本輪完成後停下供站長人工驗收；未修改 main、正式網站、正式 Supabase 或既有 Vercel 四檔獨立測試版。
