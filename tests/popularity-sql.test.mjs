// 《未備份》公開人氣 SQL 結構防回歸檢查
// node --test tests/popularity-sql.test.mjs
// 這是靜態契約檢查，不代表 PostgreSQL 解析、RLS 或併發測試通過。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/drafts/026_popularity_v1_DRAFT.sql', import.meta.url),
  'utf8'
);
const edge = readFileSync(
  new URL('../supabase/functions/popularity-view/index.ts', import.meta.url),
  'utf8'
);
const matches = (re) => [...sql.matchAll(re)].length;

test('唯一 BEGIN/COMMIT，避免歷史草案意外串接', () => {
  assert.equal(matches(/^BEGIN;$/gm), 1);
  assert.equal(matches(/^COMMIT;$/gm), 1);
});

test('九張預定資料表各建立一次', () => {
  const tables = [...sql.matchAll(/^CREATE TABLE public\.([a-z_]+)\s*\(/gm)].map(m => m[1]);
  assert.deepEqual(tables, [
    'popularity_works', 'popularity_chapters', 'popularity_view_events',
    'popularity_rate_buckets', 'popularity_work_totals', 'popularity_chapter_totals',
    'popularity_baselines', 'popularity_adjustment_log', 'popularity_public_snapshot'
  ]);
});

test('每個函式只有一份，PL/pgSQL 有正確終止符', () => {
  assert.equal(matches(/^CREATE FUNCTION public\.admin_set_popularity\(/gm), 1);
  assert.equal(matches(/^CREATE FUNCTION public\.popularity_record_view\(/gm), 1);
  assert.equal(matches(/^CREATE FUNCTION public\.popularity_snapshot_read\(/gm), 1);
  assert.equal(matches(/END;\n\$fn\$;/g), 2);
});

test('章節歸屬採聯合外鍵且要確認已公開', () => {
  assert.equal(matches(/REFERENCES public\.popularity_chapters\(work_id, chapter_path\)/g), 2);
  assert.match(sql, /chapter_path = p_chapter_path AND is_public/);
});

test('限流為資料庫原子 upsert，限制採後端金鑰', () => {
  assert.match(sql, /PRIMARY KEY \(rate_key, minute_bucket\)/);
  assert.match(sql, /p_rate_key text/);
  assert.match(sql, /ON CONFLICT \(rate_key, minute_bucket\) DO UPDATE/);
  assert.match(sql, /WB_RATE_LIMITED/);
  assert.match(sql, /WB_INVALID_RATE_KEY/);
});

test('公開表格已啟用 RLS，訪客不可直接寫觀看事件', () => {
  assert.equal(matches(/ALTER TABLE public\.popularity_[a-z_]+ ENABLE ROW LEVEL SECURITY;/g), 9);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.popularity_record_view\(uuid,text,text,text\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.popularity_record_view\(uuid,text,text,text\) TO service_role/);
});

test('公開觀看 Edge Function 仍強制停用', () => {
  assert.match(edge, /return json\(503, \{ error: "counter_unavailable" \}, allowedOrigin\);/);
  assert.match(edge, /BLOCKED_UNTIL_GATE_04/);
});

test('並發去重先於共享配額，避免事件重送多占用限流', () => {
  const eventInsert = sql.indexOf("INSERT INTO public.popularity_view_events(event_id, work_id, chapter_path)");
  const bucketInsert = sql.indexOf("INSERT INTO public.popularity_rate_buckets(rate_key, minute_bucket, event_count)");
  const workUpdate = sql.indexOf("INSERT INTO public.popularity_work_totals(work_id,total_views)");
  assert.ok(eventInsert >= 0 && bucketInsert > eventInsert && workUpdate > bucketInsert);
  assert.match(sql, /ON CONFLICT \(event_id\) DO NOTHING/);
  assert.match(sql, /IF v_inserted IS NULL THEN RETURN false; END IF;/);
});
