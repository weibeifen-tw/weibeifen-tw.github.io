# 01 架構與共用規範
- `_config.yml`：permalink `/t/:title/`（章節）、collection `literature`（研究文章，`/literature/:name/`）、exclude 開發文件。
- `_layouts/default.html`：全站外框（頂部列、搜尋 sbox、抽屜導覽 drawer、通知 inbox、頁尾、SW 註冊）。
- `_layouts/thread.html`：章節頁；`_layouts/literature-article.html`：研究文章頁。
- 全站 JS：`assets/app.js`（搜尋、抽屜、閱讀設定、分享、WBAvatar）；會員相關只在需要時載入。
- PWA：`manifest.webmanifest`、`sw.js`、`offline.html`。
