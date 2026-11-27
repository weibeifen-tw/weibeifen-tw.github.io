# 07 統一內容上架流程（V2.0）

本文件整合既有發布規範，不取代授權清單、研究簽章或正式建置檢查。

## 小說上架
1. 確認作品 ID、既有 slug、角色 ID、公開章節範圍；不得自行變更永久網址。
2. 新作品更新 `_data/novels.yml`、`_data/characters.yml`，新增共用模板作品頁；既有作品只修改必要欄位。
3. 章節置於 `_posts/YYYY-MM-DD-<slug>.md`，沿用 layout、novel、character、chapter 與故事時間。
4. 未授權章節維持 published: false；已授權章節依既有制度更新 .github/release/authorized.txt。不得以建置日期代替公開授權。
5. 圖片沿用 docs/ai/04-assets.md 的命名；優先採 WebP，舊網址不任意刪除。
6. 目錄、上下篇、搜尋、SEO 由現有共用模板及索引產生，不手動複製一套。
7. 必要時檢查年代誌、臺灣故事、角色頁等相關資料，不新增未核准設定。

## 研究文章上架
1. 確認核准正文、來源、分類、文章 ID、版本、引用及研究限制。
2. 依既有 front matter 規格放入 _literature/；系列資料、歷史版本與證據卡依 docs/research/indigenous-design.md 處理。
3. 保留原文章網址；修訂不得覆蓋應保留的歷史版本。
4. 依 .github/approver/README.md 取得必要的站長簽章；不得繞過 strict 驗證。

## 共用驗收
- 先在 feat/site-* 或 feat/research-* 分支修改，再走 GitHub Actions 建置檢查與 PR。
- 既有發布、研究、SEO、章節狀態及安全檢查全部保留。
- 核對建置輸出中的作品圖片、章節連結及目錄。
- 保留 B02 原有模擬互動數字機制；不得與本次維護流程清理混為一談。
- 測試通過才合併；合併後確認正式 Pages 部署結果與實際網址。
- 無法驗證者標示未驗證，不宣稱完成。
