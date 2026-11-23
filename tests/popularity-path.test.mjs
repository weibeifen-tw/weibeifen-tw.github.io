import test from "node:test";
import assert from "node:assert/strict";
import { parsePublicPath } from "../supabase/functions/popularity-view/path.mjs";

test("作品網址能辨識小說 ID", () => {
  assert.deepEqual(parsePublicPath("/novel/yu/"), {kind:"work", workId:"yu", path:"/novel/yu/"});
  assert.deepEqual(parsePublicPath("/novel/shanhai/"), {kind:"work", workId:"shanhai", path:"/novel/shanhai/"});
});
test("章節網址只返回路徑，不信任前端自報歸屬", () => {
  assert.deepEqual(parsePublicPath("/t/hongdian09/"), {kind:"chapter", path:"/t/hongdian09/"});
  assert.deepEqual(parsePublicPath("/t/shanhai32/"), {kind:"chapter", path:"/t/shanhai32/"});
});
test("拒絕非章節、可疑與完整外站網址", () => {
  for (const p of ["/admin/", "/member/", "/novel/yu?x=1", "/novel/yu//", "/novel/YU/", "/t/a/../b/", "https://evil.example/novel/yu/", "/t/%2f/", "/novel/yu/#frag", null, ""]) {
    assert.equal(parsePublicPath(p), null, String(p));
  }
});
