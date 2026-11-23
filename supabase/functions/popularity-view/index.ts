// 《未備份》人氣系統 V1.0｜觀看入口（開發草案，尚未部署）
// 安全條件：預設停用；待限流、來源驗證與正式 DB 測試完成才可啟用。
// 不儲存個資於前端，不向瀏覽器暴露任何 service_role 密鑰。
//
// [待解決阻擋] Origin/Referer 不是安全認證，腳本能偽造；正式啟用前必須
// 在可信任入口實作有效的濫用限制。請勿只靠 CORS / Origin / UUID。
//
// [待解決阻擋] 發布清單必須由站長核准內容同步至 popularity_works /
// popularity_chapters；不可自動把任意已存在的章節當成公開內容。
//
// [待解決阻擋] 必須配置 supabase/functions/config.toml 對此公開事件入口
// verify_jwt=false，配合伺服器自有防護；此檔不會自行變更設定。

type Incoming = {
  event_id?: unknown;
  path?: unknown;
};

const ALLOWED_ORIGINS = new Set(["https://weibeifen.com", "https://www.weibeifen.com"]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORK_PATH = /^\/novel\/([a-z0-9_-]{1,40})\/$/;
const CHAPTER_PATH = /^\/t\/[a-zA-Z0-9_-]{1,80}\/$/;

function json(status: number, body: Record<string, unknown>, origin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "vary": "Origin",
      ...(origin ? { "access-control-allow-origin": origin } : {}),
    },
  });
}

// 不接受客戶端自報的「小說 ID」或「加幾次」。
// 作品頁從受限格式網址識別；章節歸屬只能由 DB 的核准對照取得。
export function parsePublicPath(path: unknown):
  | { kind: "work"; workId: string; path: string }
  | { kind: "chapter"; path: string }
  | null {
  if (typeof path !== "string" || path.length > 180) return null;
  const w = WORK_PATH.exec(path);
  if (w) return { kind: "work", workId: w[1], path };
  if (CHAPTER_PATH.test(path)) return { kind: "chapter", path };
  return null;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : undefined;
  if (request.method === "OPTIONS") {
    if (!allowedOrigin) return json(403, { error: "origin_denied" });
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": allowedOrigin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, apikey, authorization",
        "access-control-max-age": "600",
        "vary": "Origin",
      },
    });
  }
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, allowedOrigin);
  if (!allowedOrigin) return json(403, { error: "origin_denied" });

  // Fail-closed：尚無正式防濫用機制及 GATE-04 實測，永遠不能預設啟用。
  // GATE-04 尚未完成：強制停用，不能只靠環境旗標意外啟用。
  // 完成可信任入口限流及防濫用測試後，才以獨立審查的提交解除此阻擋。
  return json(503, { error: "counter_unavailable" }, allowedOrigin);

  /* BLOCKED_UNTIL_GATE_04
  if (Deno.env.get("WB_POPULARITY_INGEST_ENABLED") !== "true") {
    return json(503, { error: "counter_unavailable" }, allowedOrigin);
  }

  // 接口最小驗證；不能以這些檢查取代正式限流、反機器人及源驗證。
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().startsWith("application/json")) {
    return json(415, { error: "invalid_content_type" }, allowedOrigin);
  }
  const len = Number(request.headers.get("content-length") || 0);
  if (len > 2048) return json(413, { error: "too_large" }, allowedOrigin);

  let input: Incoming;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return json(413, { error: "too_large" }, allowedOrigin);
    input = JSON.parse(raw) as Incoming;
  } catch {
    return json(400, { error: "bad_json" }, allowedOrigin);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return json(400, { error: "bad_payload" }, allowedOrigin);
  }
  if (typeof input.event_id !== "string" || !UUID_V4.test(input.event_id)) {
    return json(400, { error: "invalid_event_id" }, allowedOrigin);
  }
  const parsed = parsePublicPath(input.path);
  if (!parsed) return json(400, { error: "invalid_path" }, allowedOrigin);

  const endpoint = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!endpoint || !serviceKey) return json(503, { error: "counter_unavailable" }, allowedOrigin);

  // 後端取得章節所屬小說 ID，且只接受站長核准公開的章節。
  let workId: string;
  if (parsed.kind === "work") {
    workId = parsed.workId;
  } else {
    const lookup = await fetch(
      endpoint + "/rest/v1/popularity_chapters?select=work_id&chapter_path=eq." +
        encodeURIComponent(parsed.path) + "&is_public=eq.true&limit=1",
      { headers: { apikey: serviceKey, authorization: "Bearer " + serviceKey } },
    );
    if (!lookup.ok) return json(503, { error: "counter_unavailable" }, allowedOrigin);
    const rows = (await lookup.json()) as Array<{ work_id: string }>;
    if (!rows.length) return json(404, { error: "not_published" }, allowedOrigin);
    workId = rows[0].work_id;
  }

  try {
    const result = await fetch(endpoint + "/rest/v1/rpc/popularity_record_view", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: serviceKey,
        authorization: "Bearer " + serviceKey,
      },
      body: JSON.stringify({
        p_event_id: input.event_id,
        p_work_id: workId,
        p_chapter_path: parsed.kind === "chapter" ? parsed.path : null,
      }),
    });
    if (result.status === 400 || result.status === 404) {
      return json(404, { error: "not_published" }, allowedOrigin);
    }
    if (!result.ok) return json(503, { error: "counter_unavailable" }, allowedOrigin);
    // true: 首次有效事件，false: 相同 event_id 已處理；兩者都視為正常。
    return json(200, { ok: true }, allowedOrigin);
  } catch {
    return json(503, { error: "counter_unavailable" }, allowedOrigin);
  }
  END_BLOCKED_UNTIL_GATE_04 */
});
