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

## 2026-11-23 第三輪：觀看 API 草稿
- 確認正式 Supabase 無 Edge Functions；新增 `supabase/functions/popularity-view/index.ts` 僅在 GitHub 獨立分支。
- 草稿示範 POST-only、指定合法作品／章節網址、UUIDv4 事件 ID、限制請求大小、後端核對章節歸屬，且沒有前端暴露 service_role。
- **刻意強制停用**：在 GATE-04 可信任限流、防灌水與實際整合測試完成前，所有合法 POST 都返回 503，後方的計數範例碼被註解。不得將此草稿視為可用 API。
- Origin/CORS 只能限制瀏覽器跨來源呼叫，不能證明是真人；UUID 只能防止相同事件重送，不能防惡意大量新事件。
- 未實作公開入口的攻擊防護、每日彙總、持續快照、郵件通知、管理後台與前端，因此仍不得套用 SQL、部署 Edge Function、合併 main 或發布網站。
- 目前無本地 Deno 執行環境；API 尚未執行型別檢查及整合測試。

## 2026-11-23 第四輪：防灌水設計與草案修復
- 開發分支舊版 `026_popularity_v1_DRAFT.sql` 被核對出章節路徑 CHECK 不完整、重複部分 DDL、且有重複 COMMIT。該檔**不曾套用資料庫**。
- 已用單一完整交易草案取代，保留作品、核准章節、冪等事件、作品／章節計數、手動人氣基準、稽核紀錄、公開快照（共 8 張表）。
- 草案本身**尚未經 PostgreSQL 語法解析或交易實測**，不可當成可執行正式遷移。SQL 草案中的服務角色執行權限、公開函式界線與事件儲存策略仍需安全審查。
- 觀看入口目前硬性回傳 503，不會寫入計數。不可因 CORS 白名單、Origin、UUID 或隱藏網址就解除停用。
- 擬採防濫用方案（未實作、未核准數值）：可信任服務端對短時間來源行為做共享限流（多個 Edge Function 執行個體仍需一致）；限制同源異常突增、同裝置／帳號／網路特徵短時間爆量；避免儲存原始 IP／過度蒐集資料；對一般重新整理不採每日一次去重。
- 同一事件 UUID 重送為冪等且不得再次累加；新開頁／正常重新整理要用新事件 ID；流量限制必須同時支援匿名訪客。
- 不應信任 `X-Forwarded-For` 等未確定由可信任代理覆寫的標頭，不自行認定其能防假來源。
- 限流拒絕、API 故障、達配額時不能阻擋閱讀，也不得讓前端無限制重試。
- 事件保存、日彙總、03:00 快照截點及管理員基準寫入應採一致性設計；歷史事件清理不得影響累積真實觀看。
- 必須加入可重現測試：相同事件 ID 並行重送只算一次；合法新事件分別加算；偽造來源與章節錯配被拒；多實例共享限流；MFA 失效無法設人氣；站長有效重設與計數競爭不漏計。
- 正式 Supabase schema、資料、Edge Functions、GitHub main **未更動**，GATE-04 未通過。

## 2026-11-23 第五輪：原子共享限流草案與回歸檢查
- **已在 GitHub 草案加入** `popularity_rate_buckets`：以後端產生的 HMAC 雜湊來源識別，加上分鐘時間窗建立複合主鍵；`ON CONFLICT DO UPDATE ... WHERE` 原子加算，設計上可跨 Edge Function 執行個體共享限流。
- 暫定限流為**單一來源每分鐘 30 次**，僅測試假設，沒有站長核准或壓測證據，絕對不可當成正式限制。
- 觀看事件 ID 先查重，再使用共享限流桶；相同事件重試不應重算。由於事件可能在不同作品並發提交，仍須在測試資料庫驗證重送與配額競爭。
- `p_rate_key` 必須只由後端以祕密金鑰和**可信任的來源訊號**產生，不能讓匿名訪客傳入任意值。尚未證明部署平台可信任代理標頭的來源，也未實作 HMAC/金鑰輪替/限流桶清理。
- SQL 草案中的 RPC 現在預期四個參數：`(event_id, work_id, rate_key, chapter_path)`。Edge Function 的停用範例**尚未更新為可用呼叫**，這是明確阻擋條件；解除強制 503 前須先完成整合及測試。
- 開發過程發現字串改寫時可能導致重複 SQL，已從最後一份正常 commit 重建，透過 GitHub 重新讀回確認：**1 組 BEGIN/COMMIT、9 張表、3 個函式**；新增 `tests/popularity-sql.test.mjs` 作為靜態契約防回歸測試。
- 目前已進行**靜態結構核對**，沒有 PostgreSQL 實際解析／遷移測試，也沒有 Edge Function 實際執行測試；GATE-03/04 尚未通過。
- `main`、正式 Supabase schema、正式 Edge Functions 及網站仍未修改。

## 2026-11-24 第六輪：原子去重順序、來源 HMAC 模組
- 修正 `popularity_record_view` 草案的並發邏輯：先嘗試插入唯一 `event_id`，成功者才占用限流配額；交易中若超額拋錯，事件插入也回滾。較上一版「先占額度再判斷重送」更符合 Q16 冪等要求。
- 增加 `supabase/functions/popularity-view/rate-key.mjs`：對**已由可信任代理確定的來源字串**以伺服器密鑰和 UTC 日期執行 HMAC-SHA256，產生 64 字元十六進位雜湊；拒絕無效來源、短密鑰或錯誤日期格式。
- 增加 `tests/popularity-rate-key.test.mjs`；另在 SQL 靜態測試加入「唯一事件插入必須在限流桶插入之前」檢查。
- 以 Node 22 在隔離本機環境重建並執行**等效 HMAC 核心功能測試**：3 項通過。但尚未透過 CI 對 GitHub 目前提交的完整測試檔執行測試；不可記為 GATE-04 通過。
- **阻擋仍存在**：尚未確認任何不可偽造的可信任來源標頭；不能以 Origin、任意的 X-Forwarded-For 或訪客提供的 rate_key 當身分。HMAC 模組未接上 Edge Function，API 仍強制回傳 503。
- **必要後續驗證**：真正的代理來源辨識、多人同網路正常流量、IPv6/IPv4 來源規格、共享限流併發測試、匿名訪客、SQL 交易回滾、失敗後優雅降級、配額桶清理與成本評估。
- 先前草案限流數值 30 次／分鐘仍只是假設，非正式設定；現有 SQL 完整語法、RLS、Edge 和資料庫整合尚未實測。
- 本輪沒有寫入正式 Supabase、沒有修改 main，也沒有部署。

## 2026-11-24 第七輪：CI 與草稿 PR
- 新增獨立 `.github/workflows/popularity-draft-check.yml`，僅在 `feat/site-popularity-v1` push/手動觸發時執行 Node.js 22 的兩份測試；無資料庫金鑰與寫入權限，不執行任何部署。
- 建立 **草稿 PR #1**：https://github.com/weibeifen-tw/weibeifen-tw.github.io/pull/1 。仍為 draft，GATE 未通過前禁止轉成 ready 或合併。
- 直接從 GitHub 重新讀取 SQL、Edge、HMAC 原始碼，執行 12 項**靜態契約判定**：12/12 通過。此檢查不等於 Node 測試完成，也不等於 PostgreSQL 執行或多實例安全性通過。
- 本工作階段 GitHub 連線的 workflow run 查詢未回傳可驗證的測試執行結果，因此 CI **狀態待查**，不得宣稱成功。
- 仍需真實驗證可信任來源訊號、HMAC 接入、Edge Function 服務端共享限流、SQL 實際執行、保留政策、快照與管理後台。

## 2026-11-24 第八輪：取得實際 CI 證據與 API 清理
- 已直接取得 GitHub Actions 成功證據：`45213250890`（2026-11-23 UTC）：11 個 Node.js 草案測試全部通過、0 失敗；同版網站建置 push/PR 檢查成功。這些僅為草案測試與 Jekyll 建置，不是資料庫交易或真人流量防灌水驗證。
- 核對 `index.html`：首頁作品路徑為 `/novel/{id}/`，與草案格式吻合；章節 `/t/{slug}/` 的歸屬仍須核准清單。
- 將 Edge Function 檔案過時的、被註解的示例計數程式刪除，改為小型 **fail-closed 503** 處理器：沒有任何 service_role 秘密金鑰讀取或計數 RPC 呼叫；僅處理方法、CORS 預檢與停用回應。
- 抽出純路徑解析模組 `path.mjs`，新增 `tests/popularity-path.test.mjs` 驗證合法作品／章節網址及外站／畸形網址拒絕；更新 CI 同時執行三份測試。
- API 明確仍為不可用草案；HMAC 信任界線尚未實作，不能解除 503，也不能因為 CI 成功就視 GATE-03、04 通過。
- 本輪只修改 `feat/site-popularity-v1`，不更動正式 Supabase／GitHub main／正式網站。

## 2026-11-24 第九輪：PostgreSQL 17 隔離整合測試
- 新增 `tests/popularity-pg-setup.sql` 和 `tests/popularity-pg-integration.sql`，GitHub Actions `isolated-postgres` job 使用一次性 PostgreSQL 17 service；不連正式 Supabase、不持有正式機密、不保留測試資料。
- GitHub Actions run `45214792696` 已核對 `isolated-postgres` 與 `popularity-unit` 兩個 job 的各步驟皆成功：SQL 草案可在隔離容器執行；模擬 auth 下的函式授權、事件去重、30 次／分鐘限流、超額回滾、未公開作品／章節拒絕計數、模擬管理員基準調整與稽核紀錄均通過。
- 這些測試用的 `auth.uid()`、`public.is_admin()` 是模擬函式；不能取代正式 JWT／MFA AAL2、真正 RLS 隔離與授權測試。
- 未涵蓋真正多交易併發、多 Edge 執行個體負載、可信任來源識別、HMAC/Edge 整合、發布清單同步、定時快照與郵件告警。
- 因此 GATE-01–08 尚未全部通過，Edge API 仍 503 強制停用；正式 Supabase、main 與正式網站均未變更。

## 2026-11-24 第十輪：正式 Supabase 權限只讀盤點
- 已直接讀取正式資料庫 system catalog（僅 metadata、函式定義和 RLS 政策名稱；不查詢會員私人資料內容）。
- `public.user_roles` 現有 `admin` 角色數量為 1。
- 正式 `public.is_admin()` 的安全門檻為 JWT AAL2 和 `user_roles.role='admin'`，並設置 `SECURITY DEFINER SET search_path TO ''`。
- 七個 `admin_*` 函式為 SECURITY DEFINER，authenticated 具有 EXECUTE、anon 無 EXECUTE；七個函式定義文字皆包含 `is_admin()` 檢查，且設置空 search_path。尚未逐條分析其權限檢查是否覆蓋所有執行路徑，**不能把此檢查視為完整 GATE-02 驗收**。
- `user_roles` 可讀自身角色政策存在；`comments`、`dm_messages`、`profiles` 已有對應 RLS 政策。尚未做真實匿名、一般會員、MFA 過期及管理員登入的 API 行為測試。
- 新的人氣 `admin_set_popularity()` 草案與已存在的 `is_admin()` 介面相容，但尚未套用正式資料庫；不得聲稱已正式驗證授權路徑。
- PostgreSQL 17 隔離測試、既有 GitHub 建置檢查及 Node 單元測試已有成功證據。正式 Supabase、GitHub main 與線上網站未變更。

## 2026-11-24 第十一輪：MFA／管理員授權隔離驗證
- 已只讀核對正式 `public.is_admin()` 的原始判斷式：JWT `aal = aal2`，且 `public.user_roles` 中當前使用者角色為 `admin`。
- 在一次性 PostgreSQL 17 測試環境中替換原先 `wb_test.admin` 布林開關，改用相同的 `is_admin()` 邏輯；`auth.uid()` 與 `auth.jwt()` 仍為測試用設定模擬。
- 驗證 AAL1 管理員與 AAL2 一般會員均無法重設人氣；AAL2 管理員可設定基準並留下稽核紀錄；以 `SET ROLE authenticated` 測試一般會員直接呼叫人氣調整 RPC，仍被拒絕。
- 過程中兩次測試失敗源於測試稿不一致及 SQL DO 區塊分隔符錯誤；修正為 `$gate$` 後，GitHub Actions run `45216363086` 的 `isolated-postgres` 與 `popularity-unit` jobs 均顯示 success。
- **仍非真實登入／MFA／API 越權測試**，不能據此判定正式 Supabase GATE-02 已完全通過。尚無真正多使用者會話或 Edge Function 流量實測。
- API 仍強制 503 停用；正式 Supabase、main、線上網站未修改。

## 2026-11-24 第十二輪：來源信任邊界明確阻擋
- 核對 Supabase 文件未取得可充分證明託管 Edge Function 所有來源 IP 標頭皆由可信代理清理／覆寫的證據；因此**不能**直接採信 `X-Forwarded-For`、`X-Real-IP`、`CF-Connecting-IP`、Origin、Referer 或訪客自報的限流金鑰。
- 新增 `supabase/functions/popularity-view/source-policy.mjs`：目前所有公開請求一律回傳 `source_unverified`，不會被當成可信觀看事件。此為防誤啟用的保護，不是已完成的來源認證。
- 新增 `tests/popularity-source-policy.test.mjs`，測試本站 Origin、偽造代理 IP 標頭及空來源的阻擋行為；CI 已納入該組測試。
- `index.ts` 新增「來源政策檢查」及「即使未來來源政策改變仍固定停用」兩道阻擋，仍完全不接計數 RPC、也不讀取資料庫密鑰。
- **仍缺**：託管代理標頭實際信任模型的官方證據、反濫用入口的驗證方案及負載測試、HMAC 與資料庫 RPC 的安全整合、匿名訪客正常行為及共用網路公平性評估。GATE-04 不通過。
- 此輪只修改獨立 GitHub 開發分支；正式 Supabase、main、正式網站均未改動。

## 2026-11-24 最後整合開發｜不重複盤點
- 站長同意停止反覆逐輪討論，直接完成必要整合及最後安全驗收；但 GATE-01–08、正式 SQL／角色權限與防灌水必須真正通過才能部署。
- 依最新 main 整合首頁：作品卡新增固定 18px 小眼睛／人氣欄位（14px 圖示／12px 數字，4px 間隔）；沒有成功取得有效快照顯示「—」，不偽造人氣。
- `assets/js/home.js`：以公開 publishable key 讀取 `public.popularity_snapshot_read()`（不需要 service_role）；快照有效才將熱門前十按人氣排序、同分沿用上次順序，失敗時原本書架與閱讀不受影響，不要求每天 GitHub Pages 全站部署。
- `admin.html`／`assets/admin.js`：新增人氣調整分頁，僅出現在既有登入及 MFA 管理員驗證後；手動輸入目標人氣、二次確認，呼叫受後端 `is_admin()` 保護的 `admin_set_popularity` RPC，未建立 RPC 時顯示錯誤，不可繞過權限。
- `026_popularity_v1_DRAFT.sql`：追加僅 `service_role` 可執行的 `popularity_publish_snapshot(timestamptz)`，使用作品累積真實觀看與管理員基準計算單一原子快照。
- `tests/popularity-pg-integration.sql`：追加快照讀取／內容核對；GitHub Actions 已在獨立 PostgreSQL 17 隔離庫執行成功，與正式 Supabase 無關。
- `_config.yml` 加入排除 `tests`，避免測試腳本意外發布到 GitHub Pages。
- 新增 `027_popularity_cron_DRAFT.sql`：03:00 臺灣時間對應 UTC 19:00，需安裝 `pg_cron` 才可排程。正式 Supabase 唯讀盤點顯示 `pg_cron`／`pg_net` 目前未安裝。此檔仍是**未執行草案**。
- **不可忽略的阻擋**：仍未有具可信來源辨識的匿名觀看 API（目前固定 503）、站長授權發布清單與後端公開資料同步、正式環境 SQL 套用與恢復演練、03:00 快照三次重試／失敗信件、完整正式前權限及效能測試。不得把已完成的首頁與後台畫面當作人氣系統正式上線。
- 修改僅在 `feat/site-popularity-v1`；沒有正式 Supabase DDL，沒有合併 main 或部署。
