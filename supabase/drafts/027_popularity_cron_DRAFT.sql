-- 《未備份》人氣每日 03:00（Asia/Taipei）排程草案，尚未執行。
-- PostgreSQL/Supabase Cron 預設 UTC：臺灣 03:00 = 前一天 UTC 19:00。
-- 正式 Supabase 2026-11-24 唯讀查詢尚未安裝 pg_cron 或 pg_net。
-- 執行前：需確認擴充安裝、備份、權限、成本、失敗重試與通知方案，未通過不得執行。
--
-- 這份檔案與 026 SQL 草案分離：由站長核准後在可回退的部署流程內執行。
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule(
  'weibeifen-popularity-0300-taipei-v1',
  '0 19 * * *',
  $$SELECT public.popularity_publish_snapshot(now());$$
);
COMMIT;

-- 回滾方式（不得在未經確認的正式環境直接執行）：
-- SELECT cron.unschedule('weibeifen-popularity-0300-taipei-v1');
--
-- Cron 只更新資料庫內單一快照。公開讀者由 read-only RPC 取快照；
-- 每日失敗重試三次、失敗郵件通知及輪替清理工作尚未設計完成。
