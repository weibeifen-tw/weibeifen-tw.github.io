# 研究所自我測試用假資料（只在 CI 的臨時機器上產生，不會 commit、不會 push）
# 用法：ruby .github/scripts/research_fixture.rb [根目錄]
require 'yaml'; require 'digest'; require 'fileutils'
Encoding.default_external = Encoding::UTF_8
R = File.expand_path(ARGV[0] || '.')
def bsha(b) = Digest::SHA256.hexdigest(b.gsub(/\s+/, ''))
def h(s) = Digest::SHA256.hexdigest(s)
def fm(d) = d.to_yaml + "---\n"
FileUtils.mkdir_p(%W[#{R}/_literature #{R}/_lit_versions/ind-test-a #{R}/_data/evidence])
body_a = <<~MD
  假資料，僅供自動測試，不是研究內容。

  ## 第一節

  第一段測試文字{% include ev.html id="EV-001" %}，第二句[^1]。[〔1〕](#ref-1)

  ## 第二節

  第二段測試文字，現行版新增這一句{% include ev.html id="EV-002" %}。

  ## 第三節

  第三段{% include ev.html id="EV-003" %}{% include ev.html id="EV-004" %}。

  ## 第四節

  第四段。

  [^1]: （假資料）註腳內容。
MD
body_v = <<~MD
  假資料，僅供自動測試，不是研究內容。

  ## 第一節

  第一段測試文字{% include ev.html id="EV-001" %}。

  ## 第二節

  第二段測試文字{% include ev.html id="EV-002" %}。
MD
claims = { 'EV-001' => '（假）主張一', 'EV-002' => '（假）主張二（現行文字）', 'EV-003' => '（假）主張三', 'EV-004' => '（假）主張四' }
art = lambda do |slug, aid, v, c, p, body, title|
  File.write("#{R}/_literature/#{slug}.md", fm('title' => title, 'date' => '2026-11-01', 'category' => '原住民族', 'article_type' => 'knowledge',
    'description' => '假資料測試摘要', 'series_key' => 'indigenous-history', 'article_id' => aid, 'volume_no' => v, 'chapter_no' => c, 'piece' => p,
    'version' => 'v2.0', 'body_sha256' => bsha(body), 'approved_tag' => "ind/#{aid}/v2.0", 'references' => [{ 'title' => '假參考' }]) + body)
end
art.('ind-test-a', 'IND-1-01-01', 1, 1, 1, body_a, '假文章甲')
art.('ind-test-b', 'IND-1-01-02', 1, 1, 2, "假資料乙。\n", '假文章乙')
File.write("#{R}/_literature/phil-test.md", fm('title' => '哲學假文章', 'date' => '2026-11-02', 'category' => '哲學專區', 'article_type' => 'opinion', 'description' => '假摘要') + "假資料。\n")
File.write("#{R}/_lit_versions/ind-test-a/v1.0.md", fm('article' => 'ind-test-a', 'article_id' => 'IND-1-01-01', 'version' => 'v1.0', 'date' => '2026-10-01',
  'title' => '假文章甲（舊）', 'body_sha256' => bsha(body_v), 'approved_tag' => 'ind/IND-1-01-01/v1.0',
  'ev_map' => { 'EV-001' => h(claims['EV-001']), 'EV-002' => h('（假）主張二（舊文字）') }) + body_v)
card = ->(id, rs, extra = {}) { { 'id' => id, 'source' => { 'title' => "假來源#{id}", 'url' => "https://example.org/#{id}" }, 'read_status' => rs,
  'claim' => claims[id], 'claim_hash' => h(claims[id]), 'license' => { 'cite' => 'allowed', 'display' => 'allowed', 'reproduce' => 'restricted' } }.merge(extra) }
cards = [card.('EV-001', 'direct', 'read_date' => '2026-10-01'), card.('EV-002', 'unverified'),
         card.('EV-003', 'indirect', 'withdrawal' => { 'level' => 'L1', 'date' => '2026-11-10' }),
         card.('EV-004', 'indirect', 'withdrawal' => { 'level' => 'L2', 'date' => '2026-11-11' }),
         { 'id' => 'EV-005', 'source' => { 'title' => '假來源 L3' }, 'read_status' => 'indirect', 'claim' => '（假）主張五', 'claim_hash' => h('（假）主張五'),
           'license' => { 'cite' => 'restricted', 'display' => 'restricted', 'reproduce' => 'restricted' }, 'withdrawal' => { 'level' => 'L3', 'date' => '2026-11-12' } }]
File.write("#{R}/_data/evidence/IND-1-01-01.yml", cards.to_yaml)
File.write("#{R}/_data/withdrawn.yml", "urls:\n  - { url: /literature/ind-test-a/v0.9/, date: 2026-11-15, level: L3 }\n")
puts '假資料已產生（只在這台臨時機器）'
