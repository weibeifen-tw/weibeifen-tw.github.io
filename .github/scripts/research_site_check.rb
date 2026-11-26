# 檢查正式 Jekyll 產生的網站（自我測試用）：網站地圖、註腳、證據卡、歷史版本、撤回清單、搜尋索引
# 用法：ruby .github/scripts/research_site_check.rb <_site 目錄>
Encoding.default_external = Encoding::UTF_8
require 'json'
S = ARGV[0] || '_site'; fails = []; ok = []
t = ->(name, cond) { (cond ? ok : fails) << name }
sm = File.read(File.join(S, 'sitemap.xml')) rescue ''
t.('網站地圖有現行文章', sm.include?('/literature/ind-test-a/'))
t.('網站地圖有專書首頁', sm.include?('/literature/indigenous/'))
t.('網站地圖沒有歷史版本', !sm.include?('/literature/ind-test-a/v1.0/'))
t.('網站地圖沒有撤回網址', !sm.include?('/v0.9/'))
a = File.read(File.join(S, 'literature/ind-test-a/index.html'))
t.('註腳：正文有 class="footnote" 連到 #fn:1', a.match?(/<a href="#fn:1" class="footnote"/))
t.('註腳：註腳有返回連結 reversefootnote', a.include?('class="reversefootnote"'))
t.('註腳：雙向 id（fn:1、fnref:1）', a.include?('id="fn:1"') && a.include?('id="fnref:1"'))
t.('目錄有出現（標題有 id）', a.include?('class="lit-toc"'))
t.('證據卡 EV-001～004 顯示、L3 EV-005 不顯示', %w[EV-001 EV-002 EV-003 EV-004].all? { |i| a.include?(%(id="ev-#{i}")) } && !a.include?('id="ev-EV-005"'))
t.('L1／L2 連結隱藏、EV-001 連結顯示', !a.include?('example.org/EV-003') && !a.include?('example.org/EV-004') && a.include?('example.org/EV-001'))
t.('未核讀標示為「尚未核讀」', a.include?('尚未核讀'))
v = File.read(File.join(S, 'literature/ind-test-a/v1.0/index.html'))
t.('舊版 noindex', v.include?('noindex'))
t.('舊版 EV-001 對得上→連結', v.include?('data-ev="EV-001"'))
t.('舊版 EV-002 對不上→歷史引用對應無法確認', !v.include?('data-ev="EV-002"') && v.include?('歷史引用對應無法確認'))
t.('舊版有比較區', v.include?('id="compare"'))
t.('專書首頁列出已發布文章', File.read(File.join(S, 'literature/indigenous/index.html')).include?('假文章甲'))
t.('撤回清單 withdrawn.json', JSON.parse(File.read(File.join(S, 'withdrawn.json')))['urls'] == ['/literature/ind-test-a/v0.9/'])
s = JSON.parse(File.read(File.join(S, 'assets/search.json')))
t.('搜尋有文章、沒有歷史版本', s['arts'].any? { |x| x['u'].include?('ind-test-a') } && s['arts'].none? { |x| x['u'].include?('/v1.0') })
p = File.read(File.join(S, 'literature/phil-test/index.html'))
t.('其他分類文章沒有專書介面', !p.include?('ev-panel') && !p.include?('ind-pos'))
(1..7).each do |i|
  page = File.read(File.join(S, 'literature/indigenous', "v0#{i}", 'index.html'))
  t.("卷冊 #{i} 目錄存在", page.include?('ind-volume-toc'))
end
catalog = JSON.parse(File.read('_data/indigenous_catalog.json'))
(1..7).each do |i|
  page = File.read(File.join(S, 'literature/indigenous', "v0#{i}", 'index.html'))
  expected = catalog.select { |c| c['volume'] == i }.flat_map { |c| c['pieces'].map { |p| "#{c['no']}.#{p['piece']}" } }
  actual = page.scan(/data-ind-piece="([^"]+)"/).flatten
  puts "卷冊 #{i}：實際 #{actual.size} / 預期 #{expected.size}，缺少 #{(expected-actual).join(',')}，多出 #{(actual-expected).join(',')}"
  t.("卷冊 #{i} 逐篇篇號完整且依序", actual == expected)
  t.("卷冊 #{i} 籌備中篇目無連結", page.scan(/<li data-ind-piece="[^"]+"><div class="ind-pending">.*?<\/li>/m).none? { |row| row.match?(/<a\b/) })
end
all_vols = (1..7).map { |i| File.read(File.join(S, 'literature/indigenous', "v0#{i}", 'index.html')) }.join
t.('210篇目錄全部顯示', all_vols.scan(/data-ind-piece="/).size == 210)
t.('籌備中篇目沒有文章連結', !all_vols.match?(/<a[^>]*class="ind-pending"/))
idx = a[/<script id="wb-research-index" type="application\/json">\s*(.*?)<\/script>/m, 1]
registry = JSON.parse(idx)
t.('研究會員索引只含七卷及兩篇測試文章', registry.keys.sort == ((1..7).map { |i| "/literature/indigenous/v0#{i}/" } + ['/literature/ind-test-a/', '/literature/ind-test-b/']).sort)
t.('研究文章與卷冊有收藏留言入口', a.include?('research-actions') && all_vols.scan(/class="research-actions r-acts"/).size == 7)
t.('其他研究領域不加入研究會員互動', !p.include?('research-actions'))
ok.each { |n| puts "通過 #{n}" }; fails.each { |n| puts "失敗 #{n}" }
puts "正式 Jekyll 輸出檢查：通過 #{ok.size}、失敗 #{fails.size}"; exit(fails.empty? ? 0 : 1)
