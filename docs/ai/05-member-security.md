# 05 會員與安全
- 前端：`assets/auth.js`（登入／MFA）、`assets/cloud.js`（收藏、書櫃、留言、通知）、`assets/member.js`（我的資料）、`assets/admin.js`（後台）、`_includes/auth-config.html`。
- 後端：`supabase/002–021*.sql`（已執行 002–019、021；020 執行狀態待確認）；`schema_2026-11-20.sql` 為結構存檔（不含 011 之後）。
- 管理員只有站長一人：`is_admin()` 要求 aal2；FIX-01／FIX-06 草案 `supabase/drafts/023_*`（未執行）。
- 安全工作狀態總表：`supabase/drafts/README.md`。
- GATE-2、GATE-3 未通過；私訊依 DM-A 全面退役：前端已移除（S09），後端封鎖草案 `supabase/drafts/022_*` 須站長執行後才算完成；歷史資料保留。
- 修改會員功能前必讀本檔；不得把私訊、會員資料、管理頁放進公開搜尋或 PWA 快取。
