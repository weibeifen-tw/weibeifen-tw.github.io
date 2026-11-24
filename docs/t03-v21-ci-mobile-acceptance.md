# 《未備份》P3-01 T03-R01～R03｜V2.1 最新建置確認與手機實機驗收

> 2026-11-24 啟動。這份文件只整理 V2.1 已取得的證據與後續待核驗項目；**沒有授權 PR／Merge／Deploy 或正式 Supabase 操作**。

## 1. 來源與版本界線

- 指定開發分支：`feat/site-t03-reading-isolation`。
- 對照 main：`01f9924da8c106992f2490f59d90750293c6f817`。
- GitHub Actions #336（`build` Success）是使用者提供的兩張實際步驟截圖：Commit 簡寫 `5b3ff48`；截圖可見「T03 閱讀隔離假資料測試」、「T03 Chromium 隔離瀏覽器整合」、「Jekyll 建置（GitHub Pages 官方工具）」、「T03 閱讀隔離建置產物檢查」為綠色勾勾。此成功只適用該次測試版本。
- V2.0 最近變更過 `.dev/test-t03-browser.cjs` 及 `.github/workflows/build-check.yml`，所以 **#336 不可代表最新 Commit 已通過**。
- GitHub API 的 combined status 回傳空陣列，PR workflow runs 列表也沒有提供最新 SHA 的成功 run。缺失證據不代表建置失敗，也不能宣稱成功。

## 2. 已核對的測試程式

- `.dev/test-t03-reading.cjs`：原分支維持閱讀隔離 38 項假資料測試，上一階段隔離執行結果 38／38 通過。
- `.dev/test-t03-rollback.cjs`：上一階段假資料回退演練結果 15／15 通過。
- `.dev/test-t03-browser.cjs`：原生 Chromium 瀏覽器假資料測試，另有 390×844、412×915 的手機尺寸／觸控模擬。單一虛擬假頁不等於真實作品頁 UI 或真實手機。
- `.github/workflows/build-check.yml`：T03 測試限定 `feat/site-t03-reading-isolation` 的 push、或該分支作為 head 的 Pull Request；不得因條件不符合而把 skipped 算作成功。

## 3. 目前不能簽核的門檻

| 門檻 | 現況 | 必要證據 |
| --- | --- | --- |
| 最新 GitHub Jekyll 建置 | 待證 | 對應最新 SHA 的 run ID、success、全部必跑步驟 |
| 最新 Chromium 手機尺寸模擬 | 待證 | 390／412px 情境成功、無 JS 例外；不是 iOS Safari |
| iPhone Safari 真實裝置 | 未測 | 隔離假資料預覽環境、設備資訊、操作結果與畫面 |
| Android Chrome 真實裝置 | 未測 | 同上 |
| 原手機 33 項完整重新回歸 | 未測 | 找回原始 33 項逐項清單，保留原通過紀錄，不得憑空重建編號 |
| 正式 Supabase RLS／JWT | 未授權 | 另立安全門檻及站長授權 |
| 真正安全 Rollback、資料備份復原 | 未執行 | 隔離環境演練和版本／資料復原證據 |

## 4. 手機人工驗收流程（僅隔離預覽）

1. 先取得沒有正式 Supabase、正式會員或正式小說內容的隔離預覽；若沒有，**停止操作，不以正式網站代替**。
2. 記錄手機型號、OS、瀏覽器版號、預覽來源 SHA、測試日期；使用假會員 A／B 與訪客。
3. 用 `docs/t03-v17-device-checklist.md` 的測試情境逐項操作：登入與登出、書櫃／目錄／繼續閱讀、已讀與捲動位置、跨帳號隔離、跨分頁、BFCache、網路中斷、PWA 離線。
4. 原「手機 33 項」必須拿原件逐條重新核對；目前 Repo 並無可直接對照的完整原件，不得將新增清單誤稱原 33 項。
5. 記錄 PASS／FAIL／BLOCKED、重現步驟、截圖和追蹤編號。所有安全風險未解除前不得授權合併／正式部署。

## 5. 嚴格保留

保留原手機 33 項既有通過紀錄、T01/T02 待補證、T03-R01～R03、T03-U01～U03、V1.0 原 116 審查 ID、前 11 頁核准決策、原五階段計畫和 S1-F01～S1-F04。S1-02、P3-01-D、T04 繼續暫停。

本輪可交付：最新分支／CI 設定只讀核驗、V2.1 驗收對照文件。正式建置成功與真實手機實測須保留待補證。
