// 《未備份》公開人氣：來源識別雜湊工具（未部署）。
// 僅能由「可信任的入口」傳入來源特徵。此模組本身無法驗證 HTTP 標頭真偽。
// 不接收瀏覽器自報的 rate_key，也不記錄明文 IP。
const encoder = new TextEncoder();
const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export async function makeDailyRateKey(trustedSource, secret, dayUTC) {
  if (typeof trustedSource !== "string" || !trustedSource ||
      trustedSource.length > 128 || /[\r\n]/.test(trustedSource)) {
    throw new Error("invalid_trusted_source");
  }
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("invalid_rate_secret");
  }
  if (typeof dayUTC !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dayUTC) ||
      Number.isNaN(Date.parse(dayUTC + "T00:00:00Z"))) {
    throw new Error("invalid_day");
  }
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const data = encoder.encode("weibeifen-popularity-v1|" + dayUTC + "|" + trustedSource);
  const digest = await crypto.subtle.sign("HMAC", key, data);
  return toHex(new Uint8Array(digest));
}
