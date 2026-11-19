-- 《未備份》會員系統第二批：收藏（整本小說＋章節書籤）、雲端書櫃
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- 注意：PostgreSQL 正規表示式的重複次數上限是 255，長度改用 char_length 檢查（2026-11-20 修正）。
--
-- 兩張表都只有「本人」能讀寫自己的資料（RLS），訪客完全碰不到。
-- 管理員（你）在 Supabase 後台看得到所有人的資料，網站上的管理員帳號一樣看不到別人的。

BEGIN;

-- 1. 收藏：path = '' 代表收藏整本小說；否則是章節網址（書籤）
CREATE TABLE public.favorites (
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  novel      text NOT NULL CHECK (novel ~ '^[a-z0-9_-]{1,40}$'),
  path       text NOT NULL DEFAULT '' CHECK (path = '' OR (path ~ '^/[^/\s][^\s]*$' AND char_length(path) <= 300)),
  title      text CHECK (title IS NULL OR char_length(title) <= 100),
  no         text CHECK (no IS NULL OR char_length(no) <= 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, novel, path)
);

-- 2. 雲端書櫃：k = 小說 id，或「小說 id:角色 id」（跟瀏覽器裡 wb:last: 後面那段一樣）
CREATE TABLE public.reading_progress (
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  k          text NOT NULL CHECK (k ~ '^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$'),
  url        text NOT NULL CHECK (url ~ '^/[^/\s][^\s]*$' AND char_length(url) <= 300),
  no         text CHECK (no IS NULL OR char_length(no) <= 10),
  title      text CHECK (title IS NULL OR char_length(title) <= 100),
  chr        text CHECK (chr IS NULL OR char_length(chr) <= 40),
  t          bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, k)
);

DROP TRIGGER IF EXISTS reading_progress_set_updated_at ON public.reading_progress;
CREATE TRIGGER reading_progress_set_updated_at
  BEFORE UPDATE ON public.reading_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. RLS：只能動自己的
ALTER TABLE public.favorites        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own favorites select" ON public.favorites FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "own favorites insert" ON public.favorites FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "own favorites delete" ON public.favorites FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "own progress select" ON public.reading_progress FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "own progress insert" ON public.reading_progress FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "own progress update" ON public.reading_progress FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

-- 4. 權限：先全部收回，再只開需要的（訪客一律沒有）
REVOKE ALL ON public.favorites, public.reading_progress FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT SELECT, INSERT ON public.reading_progress TO authenticated;
GRANT UPDATE ON public.reading_progress TO authenticated;  -- upsert 需要；RLS 保證只能改自己的

COMMIT;
