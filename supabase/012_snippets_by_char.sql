-- 《未備份》常用語改成每個角色各自設定
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- admin_snippets 加上 chr（角色 id）：
--   * chr = 角色 id → 只有回覆這個角色的私訊時出現
--   * chr = NULL    → 通用，所有角色都會出現（之前存的常用語都會變成通用）
-- 權限不變：只有管理員（aal2）能讀、新增、刪除。

BEGIN;

ALTER TABLE public.admin_snippets
  ADD COLUMN chr text CHECK (chr IS NULL OR chr ~ '^[a-z0-9_-]{1,40}$');
CREATE INDEX admin_snippets_chr_idx ON public.admin_snippets (chr);

GRANT INSERT (body, chr) ON public.admin_snippets TO authenticated;

COMMIT;
