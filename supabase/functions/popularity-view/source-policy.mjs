// 《未備份》觀看來源信任邊界 V0.1（草案；不得當作啟用計數的依據）。
// 此模組不承諾判定真人、不從可被請求者控制的 HTTP 標頭推導可信任 IP。
// 待核實 Supabase 託管入口的代理行為後，再新增可被證明的可信任來源處理器。

export const TRUST_DECISION = Object.freeze({
  BLOCKED: "source_unverified",
});

// 拒絕直接將瀏覽器 HTTP Request（包括 x-forwarded-for、cf-connecting-ip、
// x-real-ip、origin、referer、user-agent）用作可信來源。
// 目前所有外部訪客來源均為未核驗；正式實作前一律 fail-closed。
export function resolveTrustedSource(_request) {
  return { allowed: false, reason: TRUST_DECISION.BLOCKED };
}

// CORS 僅控制瀏覽器可否讀取結果，不是身分憑證或防機器人證明。
// 即使 Origin 看似來自本站，這個函式仍不認可其為可信流量。
export function mayCountPublicView(request) {
  const result = resolveTrustedSource(request);
  return result.allowed === true;
}
