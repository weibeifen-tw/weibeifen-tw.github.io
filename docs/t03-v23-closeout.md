# T03 V2.3 收尾決策紀錄（待 CI 驗證）
- G01：f2224c3 的 run 45447425527 已確認 success。仍未執行正式 SQL；兩階段草案需另行核准。
- G02：沿用版本庫 2026-11-20 schema 的 reading_progress RLS／GRANT，在 G01 無網路的暫時 PostgreSQL 容器驗證 A/B/anon/空身分、own upsert、跨帳號寫入拒絕。模擬 claims 不是實際 Supabase JWT，PostgREST、session 撤銷、管理員 MFA、帳號刪除端到端仍未驗證。
- G03：保留原 15/15 假資料回退測試；新增來源及 Jekyll 產物的緊急版單行差異與語法驗證。緊急版基於已核准的新版本，將 assets/cloud.js 的 READING_SYNC_ENABLED 改為 false，保留新 reading-store，不回舊 main、不清資料。重新建置、隔離檢查後另行核准發布；恢復同步採新版本 true。不得宣稱已實際部署演練。
- G04：原 iPhone/Android 五項人工回報與 Chromium 證據保留；原 33 項原件缺失及 BFCache/PWA 安全缺口保留，非安全問題移入維護。
- G05：曾暴露的正式 DB 密碼需由站長安全輪換並確認依賴；不得在聊天貼密碼。
- G06：完整 Auth/Storage 備份及隔離復原暫停；既有阻擋未解除。
- 最終建議：開發版 CI 通過後可完成隔離開發驗收，但不得宣稱正式部署安全門檻通過。須保留上述阻擋；沒有正式 SQL、merge、deploy 或正式 Supabase 操作授權。
