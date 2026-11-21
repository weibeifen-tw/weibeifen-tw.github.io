# 03 小說、角色及研究文章
- `_data/novels.yml`：每部小說一段（id、city、region、era、tags、intro、caption…）。上架新小說：只讀這段＋該小說章節。
- `_data/characters.yml`：角色（novel、avatar、glyph…）。
- `_posts/YYYY-MM-DD-<slug>.md`：章節（layout thread、novel、character、chapter）。
- `_data/era.yml`：年代事件（只收正文提到且可查證的事件）。
- `_data/counties.yml`：臺灣故事 22 縣市（固定順序、bbox、各縣市小說；pending＝待確認）；幾何在 `assets/taiwan/counties.svg`。
- `_data/regions.yml`：舊 13 個地理分區（保留資料，目前不顯示）。
- `_data/literature.yml`＋`_literature/`：未備份研究所六大專區與文章（選填 series／volume／chapter_no／piece／version／revisions）；`.github/scripts/validate_literature.rb` 驗證欄位。
- 原住民族歷史 7 卷 30 章 210 篇只是規劃，不得當成已完成或自行撰寫。
- 原住民族專書：`literature-indigenous.html`、`_data/indigenous_book.yml`、`_data/evidence/`、`_lit_versions/`、`_data/withdrawn.yml`；設計與流程見 `docs/research/indigenous-design.md`、`.github/approver/README.md`。
