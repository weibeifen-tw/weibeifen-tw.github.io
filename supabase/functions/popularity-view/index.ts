// 《未備份》公開人氣 V1.0｜觀看入口，仍未部署／未啟用。
// GATE-04 未通過：絕不計數、不讀取資料庫、不初始化私密金鑰。
// 解除停用須另行審查：可信任來源辨識、反灌水、發行清單、DB 交易與完整測試。
import { parsePublicPath } from "./path.mjs";
import { mayCountPublicView } from "./source-policy.mjs";

const ORIGINS = new Set(["https://weibeifen.com", "https://www.weibeifen.com"]);

function reply(status: number, error: string, origin?: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "vary": "Origin",
      ...(origin ? { "access-control-allow-origin": origin } : {}),
    },
  });
}

export function handlePopularityRequest(request: Request): Response {
  const origin = request.headers.get("origin") || "";
  const trustedBrowserOrigin = ORIGINS.has(origin) ? origin : undefined;
  if (request.method === "OPTIONS") {
    if (!trustedBrowserOrigin) return reply(403, "origin_denied");
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": trustedBrowserOrigin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, apikey, authorization",
        "access-control-max-age": "600",
        "vary": "Origin",
      },
    });
  }
  if (request.method !== "POST") return reply(405, "method_not_allowed", trustedBrowserOrigin);
  if (!trustedBrowserOrigin) return reply(403, "origin_denied");

  // GATE-04 之前硬性關閉；Origin 不能防止非瀏覽器偽造請求。
  // parsePublicPath 僅留待安全入口整合，不能代替可信任的發布清單驗證。
  void parsePublicPath;
  if (!mayCountPublicView(request)) {
    return reply(503, "counter_unavailable", trustedBrowserOrigin);
  }
  // 第二道固定阻擋：即使未來來源政策實作，仍不得意外開始寫入。
  return reply(503, "counter_unavailable", trustedBrowserOrigin);
}

Deno.serve(handlePopularityRequest);
