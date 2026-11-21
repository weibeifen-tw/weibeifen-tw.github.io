# 03 小說、角色及研究文章
- `_data/novels.yml`：每部小說一段（id、city、region、era、tags、intro、caption…）。上架新小說：只讀這段＋該小說章節。
- `_data/characters.yml`：角色（novel、avatar、glyph…）。
- `_posts/YYYY-MM-DD-<slug>.md`：章節（layout thread、novel、character、chapter）。
- `_data/era.yml`：年代事件（只收正文提到且可查證的事件）。
- `_data/counties.yml`：臺灣故事 22 縣市（固定順序、bbox、各縣市小說；pending＝待確認）；幾何在 `assets/taiwan/counties.svg`。另有兩個特殊分類：`prehistoric`（史前與古地理，列表最上方，《山海有痕》）、`unlocated`（地點未定，最下方，只放尚未設定地點的作品）；不在地圖上、不計入縣市，同一部小說不可同時在縣市與特殊分類；列由 `_includes/cty-special-row.html` 產生，圖示在 `assets/taiwan/special.svg`。
- `_data/regions.yml`：舊 13 個地理分區（保留資料，目前不顯示）。
- `_data/literature.yml`＋`_literature/`：未備份研究所六大專區與文章（選填 series／volume／chapter_no／piece／version／revisions）；`.github/scripts/validate_literature.rb` 驗證欄位。
- 原住民族專書的規劃篇目不得當成已完成或自行撰寫；只有已核准文章可進 repo。
- 原住民族專書：`literature-indigenous.html`、`_data/indigenous_book.yml`、`_data/evidence/`、`_lit_versions/`、`_data/withdrawn.yml`；設計與流程見 `docs/research/indigenous-design.md`、`.github/approver/README.md`。
