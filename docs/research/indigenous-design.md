# 未備份研究所｜原住民族數位歷史專書：技術設計（DEV-02）

只記技術設計，不含任何研究內容。研究正文、審查資料、未發布篇目**不得**進入本 repo（任何分支）。

## 1. 網址與檔案
| 用途 | 檔案 | 網址 |
|---|---|---|
| 專書首頁＋七卷目錄 | `literature-indigenous.html`、`_data/indigenous_book.yml` | `/literature/indigenous/` |
| 現行文章 | `_literature/<slug>.md`（category: 原住民族、series_key: indigenous-history） | `/literature/<slug>/` |
| 歷史版本（只存完整正文） | `_lit_versions/<slug>/<version>.md` | `/literature/<slug>/<version>/` |
| 證據卡 | `_data/evidence/<article_id>.yml` | 內嵌於文章頁 |
| 撤回清單（只有網址，沒有內容） | `_data/withdrawn.yml` → `/withdrawn.json` | — |
| 核准者公鑰 | `.github/approver/allowed_signers` | — |
| 驗證 | `.github/scripts/validate_literature.rb`、`.github/scripts/verify_approvals.rb` | — |

`indigenous` 是保留檔名，文章不得使用。歷史版本不進搜尋、不進 sitemap、頁面 noindex。

## 2. 專書首頁
- 七卷固定顯示（第一卷～第七卷）。卷名、卷介紹只在 `indigenous_book.yml` 填了已核准公開的文字才顯示，否則顯示「籌備中」。
- 可點的目錄＝repo 裡 series_key 為 indigenous-history 的文章（repo 只放已核准文章），依卷→章→篇排序、章可摺疊。
- 不顯示規劃篇目清單、未發布篇目、研究進度、內部審查資料。

## 3. 證據卡
欄位：`id`、`source{title, identifier, author, institution, date, locator, url}`、`read_status`（direct 直接核讀／indirect 間接引用／unverified 尚未核讀）、`read_date`、`claim`、`claim_hash`、`limits`、`license{cite, display, reproduce}`（allowed／restricted／unknown）、`excerpt`、`withdrawal{level, date, note}`。
- 正文引用：`{% include ev.html id="EV-001" %}`。
- 手機：底部面板；電腦：側邊面板；文章末尾「研究證據」清單（無 JS 也可讀、可用鍵盤）。
- 驗證：direct 必須有 read_date；`excerpt` 只在 `license.reproduce: allowed` 時允許；claim_hash 必須等於 claim 的 SHA-256（由驗證重算）。

## 4. 版本（Q05 B、Q09 A、Q10 B、Q12 A、Q15 B）
- 公開歷史版本；版本檔只存完整正文＋`ev_map`（當時引用的證據卡 → 當時 claim_hash），不存證據卡快照。
- 舊版引用：現行卡片的 claim_hash 等於 ev_map 記錄值才連到現行卡片；不等或卡片不存在／已撤回 → 顯示「歷史引用對應無法確認」，不連結。
- 修訂摘要＝現行文章 `revisions`；差異比較在瀏覽器計算（段落 LCS＋段內字元 LCS），不需建置外掛。
- 完整性：正文指紋 `body_sha256`（去除空白後的 SHA-256）＋`approved_tag`。可信基準＝站長以自己的 SSH 金鑰簽章的 git tag（訊息含 article_id、version、body_sha256、commit），用 `allowed_signers` 驗簽；同 repo 內重算雜湊不算基準。

## 5. 撤回分級
| 級 | 情形 | 網站處理 | 驗證 |
|---|---|---|---|
| L1 | 連結失效 | 卡片隱藏連結、標「連結失效」 | — |
| L2 | 部分內容授權問題 | 卡片隱藏連結與摘錄、標「部分內容因授權限制不公開」 | 有 excerpt 就失敗 |
| L3 | 重大證據或文化敏感 | 卡片不顯示 | 任何現行文章或歷史版本仍引用 → 建置失敗，須人工修訂 |
- 整篇或某版撤下：移除檔案，網址加入 `_data/withdrawn.yml`；驗證確認該網址已不存在；`/withdrawn.json` 讓 service worker 清掉讀者裝置上的副本。
- 搜尋、sitemap 在下次建置自動排除。Git 歷史、fork、搜尋引擎快取為殘餘風險（見交付報告）。

## 6. 發布關卡（需站長設定，程式不能自行完成）
部署前 strict 驗證（`.github/workflows/deploy-pages.yml`），Pages Source 須為 GitHub Actions；詳見 `docs/research/release-plan.md`。
