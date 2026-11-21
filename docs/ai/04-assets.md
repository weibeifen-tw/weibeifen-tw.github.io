# 04 SVG、圖片與資源
- `assets/covers/<id>.svg`：小說封面（3:4，不得改動作品視覺）。
- `assets/comics/<id>-1..3.webp`：作品頁貼文圖（novel-post.html 用 site.static_files 動態判斷，搜尋不到檔名≠沒用到）。
- `assets/stories/`：限動／備用圖（缺漫畫時才用）；`gongdi.webp`、`shanhai-*.webp` 有引用。
- `assets/avatars/`、`assets/icons/`、`assets/og/`、`assets/img/`。
- 刪除任何資源前：查原始碼＋渲染輸出（.dev/render.js）＋sw.js＋manifest，並先做外部備份。
