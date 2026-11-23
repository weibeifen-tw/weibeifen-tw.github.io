# 《未備份》公開人氣 V1.0｜開發與阻擋條件

狀態：**僅開發分支草案，未部署，正式資料庫未變更**。

## 已讀取的現況
- GitHub main 基準：`cd6b39ac29871c3e1c83e2ff9465244d19ac2644`（開始此工作時）。
- 靜態網站：Jekyll / GitHub Pages、原生 JavaScript、Supabase Auth / PostgreSQL。
- 首頁 `index.html` 以 `_data/novels.yml` 建卡；`assets/js/home.js` 目前依上架順序產生熱門書架，桌面用 `cloneNode(true)`。
- 既有管理後台 `/admin/` 使用 `public.is_admin()`（含 MFA）；不新增第二套管理員權限。
- `supabase/schema_2026-11-20.sql` 只是歷史結構存檔，不能代表當前正式資料庫。
- `docs/ai/README.md` 規定 SQL 由站長手動執行，GATE-2 / GATE-3 未通過前不得啟用受限功能。
- `supabase/drafts/026_popularity_v1_DRAFT.sql` 是未執行的資料層草案；不能單獨視為完整後端。

## 核准的功能邊界
- 每次正常開啟作品／章節計數，重新整理也算；事件重送不重複加算；管理員觀看也算。
- 作品與章節觀看同時納入作品真實總數；章節數字只供後台。
- 公開人氣 = 最近一次管理員設定值 +（目前真實觀看－當時真實觀看基準）；每次重設須原子寫入稽核紀錄。
- 全站首頁小眼睛位於封面下方、書名前方，兩側垂直間距各 4px，14px 圖示、12px 數字、18px 預留高度，靠左對齊。
- 熱門前十按公開人氣排序；同分延續完整昨日相對順序；下架作品留存歷史但不入榜；不額外標名次。
- 臺灣時間 03:00 每日快照；失敗後重試最多三次，保留上一份成功快照；持續失敗按日寄信。
- 快照優先獨立部署，不每天觸發整站建置；頁面及閱讀不能等待計數 API。
- 拆書或章節移動的歷史人氣須另行人工審查。

## 尚未完成：禁止正式合併及部署的阻擋項目
1. **GATE-01**：核對即時 Supabase schema、作品發布清單、所有章節歸屬及最新 main。
2. **GATE-02**：實際驗證 `is_admin()`、現有 MFA／RLS／GRANT，並修正任何資料存取風險。
3. **GATE-03**：完成 Edge Function／API、管理員重設 UI、資料一致性測試與假資料隔離。
4. **GATE-04**：伺服器驗證事件、章節對照、事件冪等、限速與防灌水；不能信任客戶端自報作品歸屬。
5. **GATE-05**：完成獨立公開快照、03:00 排程、重試、故障通知、原子發布、穩定排序。
6. **GATE-06**：以 `PROGRESS.md` 的既有 Lighthouse 基準及當前實測對照，檢查 320–1920px、LCP、CLS、INP、雙書架、載入失敗降級。
7. **GATE-07**：SQL 備份及回復路徑、建置檢查、完整回歸、安全部署／回滾驗證。
8. **GATE-08**：核對當次授權範圍與全部通過證據，全部通過後才可依使用者授權自動合併部署。

## 目前待確認的外部存取
- 需要可驗證的 Supabase 正式／測試專案讀取能力；不能僅憑 GitHub 中的結構備份直接執行 SQL。
- GitHub 連線已可讀寫程式碼，但此分支尚無完整 API、排程和效能測試證據。
- 不將任何 service_role / secret key 放進 GitHub 公開儲存庫或瀏覽器。

## 已完成變更
- 新建 `feat/site-popularity-v1` 分支。
- 新增 `supabase/drafts/026_popularity_v1_DRAFT.sql`，僅供安全與相容性審查。
- 未修改 `main`、未執行 SQL、未觸發正式部署。

## 2026-11-23 正式 Supabase 唯讀核對（GATE-01 局部完成）
- 已透過 Supabase 專案連線讀取 `weibeifen-members`（project ref：`tqicconarhpddejxdvmf`）。
- `public` 有 10 張資料表，全部啟用 RLS；現有 `popularity% `資料表 0、同名函式 0，因此人氣結構尚未套用。
- `public.user_roles` 中 admin 數量為 1；正式 `public.is_admin()` 定義檢查 `auth.jwt()->>'aal' = 'aal2'` 且該使用者 `user_roles.role='admin'`。
- `public.delete_my_account()` 在正式資料庫存在；修正先前「020 未核對」的狀態，但其安全性與功能行為尚未測試。
- Supabase migration history 是空陣列；GitHub 的 SQL 檔案不應被當成 migrations 已記錄。
- Security Advisor 指出 14 個 authenticated 可執行的 SECURITY DEFINER 函式、2 個啟用 RLS 但無政策資料表、密碼外洩保護未啟用；不能直接判斷每項皆為漏洞，需逐一核對函式內部與最小權限。
- 尚未確認完整的章節 URL→作品對照、Edge Function、事件驗證、防灌水、快照排程、通知及本地效能回歸，因此 GATE-01–08 **仍未全部通過**。
- 此輪未向正式資料庫寫入或執行 DDL。

## 2026-11-23 第二輪：後端章節歸屬與 API 安全盤點
- 正式 Supabase Edge Functions 清單是空的；目前沒有可複用的訪客觀看驗證入口。
- 依 Supabase 最新 API 安全文件，GRANT 與 RLS 是不同層級；本次草案對資料表 `anon` 和 `authenticated` 明確撤銷權限，公開只透過經審查的快照函式讀取。
- 更新 `026_popularity_v1_DRAFT.sql` 新增 `popularity_chapters` 作品／章節對照表；新觀看事件與章節彙總使用聯合外鍵；計數前須確認對應章節處於公開狀態。
- **待修正設計**：必須以發行授權清單同步作品與章節的公開狀態，而非只參考檔案存在與否；未建立同步工具前禁止啟用。
- **待修正設計**：真正的每次觀看 API 需要訪客／登入者都可使用，且不接受自報增量；需正確定義每次進入／重整的事件身分、來源驗證、流量限制、暫存與失敗降級。
- **待修正設計**：每日統計不得只從永久保留全部事件的單表讀取，應規劃資料保留、每日彙總及核對／回填規則；刪除原始事件不得影響累積總數。
- **待驗證**：測試非管理員調整被拒、管理員 MFA 要求、事件重送冪等、併發下重設基準與計數一致、無效章節不能計數、下架作品不計數；不可僅以 SQL 文字閱讀視為通過。
- **待完成**：Edge Functions、每日快照、郵件告警、GitHub Pages 整合與頁面效能實測。
- 本輪僅更新 GitHub 開發分支；正式 Supabase **0 項寫入／0 項 schema 變更**。
