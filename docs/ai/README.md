# 《未備份》共用開發規範（CLAUDE.md／AGENTS.md 共用）

## 架構（不得更換）
Jekyll（GitHub Pages）＋HTML／CSS／原生 JS＋Supabase＋GitHub Actions＋PWA。不得換大型框架、不得新增付費服務或高權限金鑰。

## 工作規則
- 先讀 `PROGRESS.md`，再只讀當前任務相關的索引區（01–06），不要一次讀全部小說、文章或圖片。
- 每次改動開分支 `feat/site-*`（會觸發 GitHub「建置檢查」）；通過後才合併 main（main＝正式網站）。
- 合併用 `git merge --no-ff`，可用 `git revert -m 1 <commit>` 復原。
- SQL 一律由站長在 Supabase SQL Editor 執行；Claude 只寫草案。
- 安全門檻 GATE-2、GATE-3 未通過：不得啟用受限會員功能、不得降低 RLS、不得只靠隱藏按鈕當安全措施。
- 研究文章未核准不得進入建置輸出、搜尋索引、sitemap、PWA 快取（不能只用 CSS 隱藏）。
- 只更新受影響的開發文件（Q09）。
- 臺字規範：使用者可見文字用「臺」；URL、id、變數、引文、書名、非地名詞彙不改。

## 本機測試
`cd .dev && npm i && node render.js .. /tmp/site`（liquidjs 模擬 Jekyll）→ `./regress.sh /tmp/舊 /tmp/新`（回歸比對）→ `node shot.js /tmp/site /tmp/shots "/,/novel/chaojian/" 320,390,768,1024,1440`（截圖＋水平溢出）。

## 索引
| 區 | 檔案 |
|---|---|
| 01 架構與共用規範 | [01-architecture.md](01-architecture.md) |
| 02 頁面、版型與樣式 | [02-pages-styles.md](02-pages-styles.md) |
| 03 小說、角色及研究文章 | [03-content.md](03-content.md) |
| 04 SVG、圖片與資源 | [04-assets.md](04-assets.md) |
| 05 會員與安全 | [05-member-security.md](05-member-security.md) |
| 06 測試、部署與維護 | [06-test-deploy.md](06-test-deploy.md) |
