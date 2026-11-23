import test from "node:test";
import assert from "node:assert/strict";
import { mayCountPublicView, resolveTrustedSource, TRUST_DECISION } from
  "../supabase/functions/popularity-view/source-policy.mjs";

const mkReq = (headers) => ({headers: new Headers(headers)});

test("任意宣稱本站 Origin 的請求仍無可信來源", () => {
  const req = mkReq({origin:"https://weibeifen.com"});
  assert.equal(mayCountPublicView(req), false);
  assert.deepEqual(resolveTrustedSource(req), {allowed:false,reason:TRUST_DECISION.BLOCKED});
});

test("偽造常見的代理 IP 標頭也不會變成可信任", () => {
  for (const key of ["x-forwarded-for","x-real-ip","cf-connecting-ip","forwarded"]) {
    const req=mkReq({origin:"https://weibeifen.com",[key]:"198.51.100.123"});
    assert.equal(mayCountPublicView(req), false, key);
  }
});

test("沒有標頭或缺乏來源也不得放行計數", () => {
  assert.equal(mayCountPublicView(mkReq({})), false);
  assert.equal(mayCountPublicView(null), false);
});
