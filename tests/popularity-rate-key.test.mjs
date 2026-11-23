// node --test tests/popularity-rate-key.test.mjs
// 僅測試雜湊工具功能；來源標頭真偽與抗濫用仍須整合測試。
import test from "node:test";
import assert from "node:assert/strict";
import { makeDailyRateKey } from "../supabase/functions/popularity-view/rate-key.mjs";

const secret = "test-only-secret-not-for-production-1234567890";
test("相同可信任來源與日期會得到相同長度 HMAC", async () => {
  const a = await makeDailyRateKey("198.51.100.10", secret, "2026-11-24");
  const b = await makeDailyRateKey("198.51.100.10", secret, "2026-11-24");
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.ok(!a.includes("198.51.100.10"));
});
test("不同日期、來源、密鑰的雜湊不同", async () => {
  const a = await makeDailyRateKey("198.51.100.10", secret, "2026-11-24");
  assert.notEqual(a, await makeDailyRateKey("198.51.100.10", secret, "2026-11-25"));
  assert.notEqual(a, await makeDailyRateKey("198.51.100.11", secret, "2026-11-24"));
  assert.notEqual(a, await makeDailyRateKey("198.51.100.10", secret + "x", "2026-11-24"));
});
test("拒絕空來源、短密鑰、格式錯誤日期", async () => {
  await assert.rejects(makeDailyRateKey("", secret, "2026-11-24"), /invalid_trusted_source/);
  await assert.rejects(makeDailyRateKey("a\nb", secret, "2026-11-24"), /invalid_trusted_source/);
  await assert.rejects(makeDailyRateKey("198.51.100.10", "weak", "2026-11-24"), /invalid_rate_secret/);
  await assert.rejects(makeDailyRateKey("198.51.100.10", secret, "tomorrow"), /invalid_day/);
});
