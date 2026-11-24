# 《未備份》P3-01 T03｜V2.3 第二輪手機與跨分頁回歸交接紀錄

日期：2026-11-24。僅在 T03 獨立分支及獨立 Vercel 假資料預覽進行。未核准正式站部署、main 合併、SQL、真實 Supabase、會員資料或真實小說正文。

## 一、最新分支變動

- assets/member.js：在會員頁加入跨分頁 storage session 更動或 localStorage.clear 的監聽，拒絕舊會員卡及未完成的舊驗證回應；登出時重畫訪客卡，切換新會員時重新驗證。
- .dev/test-t03-page-integration.cjs：加上實際 member.js 雙分頁變更測試：其他分頁登出 A、切換 B、執行 localStorage.clear，確認會員卡及 WBReadingStore 隔離。
- GitHub Actions 原 T03 分支專用 Chromium 步驟含此新增測試，但尚未獲得能核實的最新 success workflow run／job 日誌。不可將其標記為正式建置通過。

## 二、獨立手機預覽

- https://weibeifen-t03-isolated-preview-dguginzg4-moon372856-7475.vercel.app/
- Deployment ID：dpl_7P7gvrf1SRukZCkR4mi41H3G1PCd
- Target：preview（null），Vercel READY。
- 共五個檔案：index.html、style.css、fake.js、reading-store.js、member.js；其中後兩個採用 T03 開發分支正式原始碼（不包含真實後端 SDK）。
- CSP 禁止 connect-src、資源只取本站。只使用假會員 A/B、假閱讀紀錄、離線未驗證模擬。
- 這是「雙分頁／會員頁」專用預覽，不是正式 Jekyll 網站，也不涵蓋正式 Supabase 雲端同步。

## 三、手機實機人工驗收待辦（本輪）

1. 第一分頁 A 登入，寫入一筆假閱讀，畫面應為 A 及一筆閱讀。
2. 第二分頁登出 A，返回第一分頁，應顯示訪客畫面而非 A 的會員卡。
3. 第二分頁登入 B，第一分頁應顯示 B，且閱讀紀錄為 0 筆。
4. 切回 A，應能看到 A 先前的 1 筆閱讀紀錄。
5. 第二分頁切換離線／未驗證，第一分頁應進入 unknown，不能讀取會員閱讀紀錄。
6. iPhone Safari：請保留截圖及實際使用的瀏覽器資訊。
7. Android Chrome：待實機同項檢查；不能以 iPhone 或 Chromium 模擬代替。

**未通過這些人工步驟前不得聲稱 V2.3 第二輪實機驗收通過。**

## 四、必須保留的限制及 GitHub 建置缺口

- 最新 GitHub Actions「建置檢查（不部署）」成功 run ID、對應 SHA、Chromium／Jekyll job 日誌：未取得核實證據。
- 原 33 項手機回歸原件未逐項完成；保留原測試 ID，不自行編造其 33 項內容。
- iPhone BFCache、離線 PWA／Service Worker、真實 Jekyll 產物、Android Chrome：仍待驗證。此五檔 Vercel 假測試頁不能代替真實 PWA。
- 真實 Supabase RLS/JWT、會員刪除、雲端在途同步、正式資料備份與 Rollback 仍為部署阻擋。
- 保留 T01/T02、T03-R01～R03、T03-U01～U03、原 116 審查 ID、前 11 頁已核准決策、五階段計畫、S1-F01～S1-F04。S1-02、P3-01-D、T04 繼續暫停。

## 五、交付狀態

開發分支修改已提交；獨立五檔 Vercel preview READY。正式 main、weibeifen.com、正式 Supabase 保持不變。此輪停下，等待站長手機測試結果與人工驗收。