-- 025（草案，未執行）《上釉》拆書後的會員資料對齊（2026-11-23）
-- 由站長在 Supabase SQL Editor 自行決定是否執行；Claude 不執行。
-- 只「改標記」不刪任何列：原《上釉》第 51–55 篇（現《來路》1–5）的書籤與留言，novel 欄位從 yu 改成 lailu。
-- 不執行也能正常使用：前端已改成章節書籤用網址判斷、閱讀紀錄在瀏覽器端轉換章號。
-- 不執行的影響：「我的收藏」「我的留言」裡這五篇仍歸在《上釉》、顯示舊篇號。
-- 下架的五篇（/t/threads/ 等）的書籤、留言、閱讀紀錄保留不動（網址已失效）。
-- 風險：若 favorites 有 (user_id, novel, path) 唯一鍵，而同一會員已在新網址重新收藏過，UPDATE 會撞唯一鍵 → 先跑第 1 段檢查。

-- 1. 檢查（唯讀）
SELECT 'favorites' AS t, novel, path, count(*) FROM public.favorites
 WHERE path IN ('/t/shutter/','/t/drumstick/','/t/net/','/t/bamboo-goal/','/t/gutter/') GROUP BY 1,2,3
UNION ALL
SELECT 'comments', novel, path, count(*) FROM public.comments
 WHERE path IN ('/t/shutter/','/t/drumstick/','/t/net/','/t/bamboo-goal/','/t/gutter/') GROUP BY 1,2,3;

-- 2. 對齊（確認第 1 段結果後才執行）
-- BEGIN;
-- UPDATE public.favorites f SET novel = 'lailu'
--  WHERE f.novel = 'yu' AND f.path IN ('/t/shutter/','/t/drumstick/','/t/net/','/t/bamboo-goal/','/t/gutter/')
--    AND NOT EXISTS (SELECT 1 FROM public.favorites g WHERE g.user_id = f.user_id AND g.novel = 'lailu' AND g.path = f.path);
-- UPDATE public.comments SET novel = 'lailu'
--  WHERE novel = 'yu' AND path IN ('/t/shutter/','/t/drumstick/','/t/net/','/t/bamboo-goal/','/t/gutter/');
-- COMMIT;
