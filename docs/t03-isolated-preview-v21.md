# 《未備份》V2.1｜獨立隔離假資料預覽方案與驗收紀錄

> 站長授權：選擇 B，允許建立不影響正式網站的獨立測試版，禁止正式 Supabase、真實會員資料與小說正文，不 Merge main、不部署正式網站。本文件記錄目前已建立內容與未完成的外部託管步驟，**不得誤稱已取得公開測試網址**。

## 一、來源與隔離界線

- Repository：`weibeifen-tw/weibeifen-tw.github.io`。
- 僅操作獨立分支：`feat/site-t03-reading-isolation`。
- `main`、正式 GitHub Pages、`weibeifen.com`、CNAME、GitHub Pages 來源設定及正式會員資料一律不修改。
- 原站 `_data/auth.yml` 指向正式 Supabase，因此**禁止把 Jekyll 正式建置輸出 `_site` 整包當成隔離測試版發布**。
- 測試版只使用 `assets/js/reading-store.js` 的本機閱讀紀錄隔離功能，**不載入 `assets/auth.js`、`assets/cloud.js`、正式 SDK、小說頁或會員資料**。
- 使用獨立網域 origin 才能保障 localStorage、cookies 與正式網站完全分離；禁止將測試頁放在正式 `weibeifen.com` 的同源路徑。

## 二、已建立的隔離預覽來源

`.dev/t03-preview/`：

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 假資料互動頁、禁止 API 的 CSP、noindex |
| `style.css` | 手機優先響應式設計 |
| `preview.js` | 純本機訪客、假會員 A/B、身分未驗證、閱讀、已讀、書櫃操作 |
| `reading-store.js` | 由現有 `assets/js/reading-store.js` 複製到**產出的四檔測試包**；不向原站請求程式 |

安全性：HTML 的 CSP `connect-src 'none'`，無外部 script、圖片、API 呼叫、正式 Supabase Key、小說正文或真實會員資訊。所用 JWT/Session 為本機假字串，不是可用的 Supabase 憑證。

## 三、分支 CI 及測試包

- `.dev/test-t03-preview.cjs`：靜態安全掃描、純本機互動假資料測試。隔離 JS 測試 **23／23 通過**。
- `.github/workflows/t03-preview-isolated.yml`：僅本 T03 分支，權限 `contents: read`，重新跑測試後只複製四個預覽檔到 `t03-preview-artifact/`，拒絕包含真實站點／Supabase 端點的內容，將檔案上傳為短期 GitHub Actions artifact（7 天），**不包含 Pages 部署步驟**。
- CI 觸發條件包含本隔離預覽來源、測試程式、共用 reading-store、workflow 的分支推送；已有建立工作流程，但**未取得最新執行成功的 run ID／artifact ID**，因此不能宣稱 GitHub artifact 已成功產出。

## 四、正式獨立網址的安全部署方式（尚未執行）

- 使用**不同託管專案與不同網域**（例如獨立 Vercel 預覽專案）；不能更動現有 GitHub Pages 設定或網站正式 CNAME。
- **只上傳／發布 CI 驗證後的四檔測試包**，不得直接對整個正式網站 Repo 使用預設自動部署；防止整站內容、原站設定或正式 SDK 被誤發布。
- 設定 `noindex`、不掛正式網域、不設定正式 Supabase 環境變數或任何 Secret，不連正式 API。
- 第一次公開後在手機上核對獨立網域、CSP、網路請求與沒有正式站點資產，再以假會員實測。
- 現有 GitHub 工具不提供建立另一個獨立 Pages 站點的受控 API；外部託管需要另外連接有權限的部署服務。**在確認託管連接與成功部署回傳以前，不得提供虛構預覽 URL**。

## 五、仍待正式驗收與限制

- [ ] GitHub preview artifact 工作流程最新 run success、四檔產物 SHA／下載佐證
- [ ] 外部獨立託管部署及可開啟 URL（尚未取得）
- [ ] iPhone Safari、Android Chrome 真實裝置預覽測試
- [ ] 原手機 33 項原件逐項重新回歸（本假資料預覽只能驗證部分閱讀邏輯）
- [ ] 正式網站完整 UI／真實 Supabase RLS 與安全 Rollback 的獨立驗收
- [ ] 站長核准任何後續部署前，都要確認新預覽不碰正式網站或資料

保留所有 T01/T02 待補證、T03-R01～R03／T03-U01～U03、V1.0 原 116 審查 ID、前 11 頁核准決策、原五階段計畫及 S1-F01～S1-F04。S1-02、P3-01-D、T04 仍暫停。
