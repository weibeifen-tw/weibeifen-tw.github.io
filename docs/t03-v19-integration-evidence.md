# 《未備份》P3-01 T03-R01～R03｜V1.9 建置及瀏覽器整合驗證紀錄

> 階段：開發測試中，正式上線阻擋維持。此文件不得視為 GitHub Actions 綠燈、iPhone/Android 實機驗收或正式 Supabase 安全驗證。

## 一、驗證對象

- GitHub Repo：`weibeifen-tw/weibeifen-tw.github.io`
- 唯一授權開發分支：`feat/site-t03-reading-isolation`
- 最初 main 基準：`01f9924da8c106992f2490f59d90750293c6f817`
- 本輪不建立 PR、不 Merge、不 Deploy、不執行 SQL，不操作正式 Supabase／會員資料／小說正文。

## 二、V1.9 新增工作

1. 新增 `.dev/test-t03-browser.cjs`：以 `playwright-core` 及本機 HTTP 假頁，在 Chromium 裡載入分支現有 `assets/js/reading-store.js`；測試訪客、會員 A／B、跨分頁登出與切換、舊資料隔離、假 BFCache 過期驗證結果。
2. 修改 `.github/workflows/build-check.yml`：僅在 `feat/site-t03-reading-isolation` 執行此 Chromium 測試。以 `.dev/package.json` 安裝測試依賴、使用 runner 上 Chrome／Chromium；不需要正式 Supabase。
3. 保留原本的 T03 假資料單元測試、停用與恢復同步模擬，以及 Jekyll 建置產物檢查。
4. GitHub CI 已有此測試的執行設定，但截至本次記錄，尚未取得與分支最新 Commit 對應的 **成功工作流程執行日誌**，因此不得認列通過。

## 三、已取得的證據

| 項目 | 成果 | 證據限制 |
|---|---|---|
| `.dev/test-t03-reading.cjs` | 36／36 通過 | 在隔離 JS 假環境執行，非正式網站 |
| `.dev/test-t03-rollback.cjs` | 15／15 通過 | 假資料回退模擬，非實際版本回退 |
| Chromium 測試程式語法 | 通過 | 不是瀏覽器執行成功 |
| 目前主要 JavaScript 語法 | 通過 | 不是正式 Jekyll 完整建置 |
| Chromium 本機執行嘗試 | **受阻** | 瀏覽器無法連線到本機測試頁，回報 `ERR_BLOCKED_BY_ADMINISTRATOR` |
| GitHub 官方 Jekyll 建置 | **待證** | 尚無對應最新 Commit 的成功 run ID／Job log |
| Chromium GitHub Actions 整合測試 | **待證** | 只建立工作流程，尚無成功日誌 |

## 四、尚未解決的正式上線阻擋

- GitHub Actions 必須提供對應正確分支、最新 Commit 的完整 Jekyll 建置結果，包含 T03 Node mock 與 Chromium 工作流程日誌。
- 真實 iPhone Safari、Android Chrome 與原有 33 項手機回歸仍待執行。
- 正式 Supabase RLS／JWT、在途請求以及安全回退的真實環境演練仍待安全審查。
- 舊 main 仍含有跨會員同步風險，**禁止以直接還原舊 main 當作安全 Rollback**。

## 五、追蹤紀錄保留

保留手機既有 33 項通過紀錄、全部 T01/T02 待補證、T03-R01～R03 與 T03-U01～U03、V1.0 原 116 個審查 ID、前 11 頁核准決策、原五階段計畫及 S1-F01～S1-F04。S1-02、P3-01-D、T04 維持暫停。

本紀錄交付後停下等站長正式人工驗收，不自行啟動合併部署。
