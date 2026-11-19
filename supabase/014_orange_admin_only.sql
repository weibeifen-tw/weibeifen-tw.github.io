-- 《未備份》頭貼橘色只有管理員能用
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- 改個人資料的政策多一個條件：avatar_color = 'orange' 只有 admin 角色可以存（看 user_roles，不需要兩步驟驗證）。
-- 已經選了橘色的讀者（如果有）改回「沒選」，網站會依會員 ID 給一個非橘色的預設色。

BEGIN;

UPDATE public.profiles p SET avatar_color = NULL
WHERE p.avatar_color = 'orange'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin');

DROP POLICY "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK (
    (SELECT auth.uid()) = id
    AND NOT (SELECT public.is_banned())
    AND (coalesce(avatar_color, '') <> 'orange'
         OR EXISTS (SELECT 1 FROM public.user_roles r
                    WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'admin'))
  );

COMMIT;
