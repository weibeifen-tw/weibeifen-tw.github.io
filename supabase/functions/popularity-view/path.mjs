// 《未備份》人氣系統 V1.0：公開作品／章節網址解析，無資料庫副作用。
// 最終可計數資格仍須後端查詢站長核准的公開清單。
const WORK_PATH = /^\/novel\/([a-z0-9_-]{1,40})\/$/;
const CHAPTER_PATH = /^\/t\/[a-zA-Z0-9_-]{1,80}\/$/;

export function parsePublicPath(path) {
  if (typeof path !== "string" || path.length > 180) return null;
  const match = WORK_PATH.exec(path);
  if (match) return { kind: "work", workId: match[1], path };
  if (CHAPTER_PATH.test(path)) return { kind: "chapter", path };
  return null;
}
