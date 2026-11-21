# frozen_string_literal: true
# 未備份研究所文章資料驗證（P06；V1.0 S08 改六大專區）
# 用法：ruby .github/scripts/validate_literature.rb [網站根目錄，預設 .]
# 只用 Ruby 標準函式庫（YAML、Date），不需要另外安裝套件。
# 錯誤（ERROR）會讓檢查失敗；提醒（WARN）只列出，不擋。
# 劇透與史實正確性仍需人工審查，這支程式不檢查內容對錯。
require 'yaml'
require 'date'

ROOT = File.expand_path(ARGV[0] || '.')
DIR = File.join(ROOT, '_literature')
SITE_NAME = '未備份'
AUTHOR = '畝 MU'
TYPES = %w[knowledge opinion].freeze
KNOWN = %w[title date updated category tags article_type description author cover cover_alt
           related_novels related_articles references seo_title seo_desc layout published permalink
           article_id version keywords series volume chapter_no piece revisions
           series_key volume_no body_sha256 approved_tag].freeze
SEO_TITLE_MAX = 32
SEO_DESC_MAX = 120

errors = []
warns = []
err = ->(f, m) { errors << "ERROR #{f}: #{m}" }
warn = ->(f, m) { warns << "WARN  #{f}: #{m}" }

def load_yaml(path)
  YAML.safe_load(File.read(path), permitted_classes: [Date, Time], aliases: false)
end

cats = (load_yaml(File.join(ROOT, '_data/literature.yml')) || {}).fetch('categories', []).map { |c| c['name'] }
novels = (load_yaml(File.join(ROOT, '_data/novels.yml')) || {}).keys
today = (Time.now.utc + 8 * 3600).to_date # Asia/Taipei

def to_date(v)
  case v
  when Date then v.is_a?(DateTime) ? v.to_date : v
  when Time then (v.getutc + 8 * 3600).to_date
  when String then Date.parse(v)
  end
rescue ArgumentError
  nil
end

def blank?(v)
  v.nil? || (v.is_a?(String) && v.strip.empty?)
end

files = Dir.exist?(DIR) ? Dir.glob(File.join(DIR, '**', '*')).select { |f| File.file?(f) }.sort : []
docs = {}
rel_list = []

files.each do |path|
  rel = path.sub("#{ROOT}/", '')
  ext = File.extname(path)
  unless %w[.md .markdown .html].include?(ext)
    err.(rel, "不是文章檔（只接受 .md／.markdown／.html），請移出 _literature/")
    next
  end
  raw = File.read(path, encoding: 'utf-8')
  m = raw.match(/\A---\s*\n(.*?)\n---\s*(\n|\z)/m)
  unless m
    err.(rel, 'Front Matter 格式錯誤：檔案開頭必須是 --- 包起來的區塊')
    next
  end
  begin
    fm = YAML.safe_load(m[1], permitted_classes: [Date, Time], aliases: false) || {}
  rescue Psych::Exception => e
    err.(rel, "Front Matter YAML 語法錯誤：#{e.message.lines.first.strip}")
    next
  end
  unless fm.is_a?(Hash)
    err.(rel, 'Front Matter 必須是「欄位: 值」的格式')
    next
  end
  name = File.basename(path, ext)
  if File.dirname(path) != DIR
    err.(rel, '文章請直接放在 _literature/ 底下，不要放子資料夾')
  end
  err.(rel, "檔名（網址 /literature/#{name}/）只能用小寫英文、數字和連字號") unless name.match?(/\A[a-z0-9]+(-[a-z0-9]+)*\z/)
  err.(rel, '檔名不能是 index') if name == 'index'
  err.(rel, '不要自訂 permalink，網址一律用檔名') if fm.key?('permalink')
  err.(rel, '未核准的文章不可以放進 repo（不要用 published: false 存草稿）') if fm.key?('published')
  (fm.keys - KNOWN).each { |k| warn.(rel, "不認得的欄位「#{k}」，頁面不會用到") }

  # 標題、摘要、作者
  err.(rel, 'title 必填') if blank?(fm['title'])
  err.(rel, 'title 必須是文字') if fm['title'] && !fm['title'].is_a?(String)
  err.(rel, 'description（公開摘要）必填') if blank?(fm['description'])
  err.(rel, 'description 必須是文字') if fm['description'] && !fm['description'].is_a?(String)
  err.(rel, "author 只能是「#{AUTHOR}」（可以不寫，預設就是）") if fm.key?('author') && fm['author'] != AUTHOR

  # 分類、文章性質
  if blank?(fm['category']) then err.(rel, 'category 必填')
  elsif !cats.include?(fm['category']) then err.(rel, "category「#{fm['category']}」不是六大研究專區（#{cats.join('、')}）")
  end
  if blank?(fm['article_type']) then err.(rel, 'article_type 必填（knowledge 或 opinion）')
  elsif !TYPES.include?(fm['article_type']) then err.(rel, "article_type 只能是 knowledge 或 opinion，現在是「#{fm['article_type']}」")
  end

  # 標籤
  if fm.key?('tags')
    t = fm['tags']
    if !t.is_a?(Array) then err.(rel, 'tags 必須是清單，例如 [依附理論, 親密關係]')
    else
      t.each do |x|
        if !x.is_a?(String) || x.strip.empty? then err.(rel, "tags 裡有空白或不是文字的項目：#{x.inspect}")
        elsif x.start_with?('#') then err.(rel, "標籤不要加 #：「#{x}」")
        elsif x.include?('|') || x.include?(',') then err.(rel, "標籤不能有 | 或逗號：「#{x}」")
        elsif x.length > 20 then warn.(rel, "標籤有點長（#{x.length} 字）：「#{x}」")
        end
      end
      err.(rel, "tags 有重複：#{t.group_by(&:itself).select { |_, v| v.size > 1 }.keys.join('、')}") if t.uniq.size != t.size
    end
  end

  # 日期
  pub = nil
  if fm['date'].nil? then err.(rel, 'date（首次發布日期）必填')
  else
    pub = to_date(fm['date'])
    if pub.nil? then err.(rel, "date 不是正確日期：#{fm['date'].inspect}")
    elsif pub > today then err.(rel, "date #{pub} 在未來，不接受排程文章")
    end
  end
  if fm.key?('updated')
    up = to_date(fm['updated'])
    if up.nil? then err.(rel, "updated 不是正確日期：#{fm['updated'].inspect}")
    else
      err.(rel, "updated #{up} 在未來") if up > today
      err.(rel, "updated #{up} 早於發布日期 #{pub}") if pub && up < pub
    end
  end

  # 相關小說、相關文章
  if fm.key?('related_novels')
    r = fm['related_novels']
    if !r.is_a?(Array) then err.(rel, 'related_novels 必須是清單，例如 [chaojian, yincang]')
    else
      r.each { |id| err.(rel, "related_novels 裡的「#{id}」不是現有的小說 ID") unless novels.include?(id) }
      err.(rel, 'related_novels 有重複') if r.uniq.size != r.size
    end
  end
  if fm.key?('related_articles') && !fm['related_articles'].is_a?(Array)
    err.(rel, 'related_articles 必須是清單（寫文章檔名）')
  end

  # 封面
  if fm.key?('cover')
    c = fm['cover']
    if blank?(c) then err.(rel, 'cover 有寫就不能空白；沒有封面請整行拿掉')
    elsif c.match?(%r{\Ahttps?://}) then err.(rel, '封面請放在網站裡（例如 /assets/img/lit-xxx.webp），不要用外部網址')
    else
      f = File.join(ROOT, c.sub(%r{\A/}, ''))
      err.(rel, "封面檔案不存在：#{c}") unless File.file?(f)
      err.(rel, "封面圖片格式請用 webp／jpg／png：#{c}") unless c.match?(/\.(webp|jpe?g|png)\z/i)
    end
    err.(rel, '有封面就要寫 cover_alt（替代文字）') if blank?(fm['cover_alt'])
  end

  # 參考資料
  refs = fm['references']
  if fm.key?('references') && !refs.is_a?(Array)
    err.(rel, 'references 必須是清單')
  elsif refs.is_a?(Array)
    refs.each_with_index do |x, i|
      unless x.is_a?(Hash) && !blank?(x['title'])
        err.(rel, "references 第 #{i + 1} 筆缺少 title")
        next
      end
      err.(rel, "references 第 #{i + 1} 筆的 url 必須是 http(s) 網址") if x['url'] && !x['url'].to_s.match?(%r{\Ahttps?://\S+\z})
    end
  end
  if fm['article_type'] == 'knowledge' && !(refs.is_a?(Array) && !refs.empty?)
    err.(rel, '知識文章（knowledge）一定要有 references 參考資料')
  end
  body = raw[m[0].length..] || ''
  body.scan(/href="#ref-(\d+)"/).flatten.map(&:to_i).uniq.each do |n|
    err.(rel, "正文引用了 [#{n}]，但 references 只有 #{refs.is_a?(Array) ? refs.size : 0} 筆") if n < 1 || !refs.is_a?(Array) || n > refs.size
  end

  # SEO
  %w[seo_title seo_desc].each do |k|
    next unless fm.key?(k)
    v = fm[k]
    next if v.nil?
    unless v.is_a?(String)
      err.(rel, "#{k} 必須是文字")
      next
    end
    err.(rel, "#{k} 不能有換行") if v.include?("\n")
    err.(rel, "#{k} 不能有 HTML 標籤") if v.match?(/<[^>]+>/)
  end
  st = fm['seo_title'].is_a?(String) ? fm['seo_title'].strip : ''
  sd = fm['seo_desc'].is_a?(String) ? fm['seo_desc'].strip : ''
  err.(rel, "seo_title 不要寫「#{SITE_NAME}」，網站名稱會自動加在後面") if st.include?(SITE_NAME)
  t_len = (st.empty? ? fm['title'].to_s : st).length
  d_len = (sd.empty? ? fm['description'].to_s : sd).length
  warn.(rel, "SEO 標題 #{t_len} 字，超過建議的 #{SEO_TITLE_MAX} 字（只提醒）") if t_len > SEO_TITLE_MAX
  warn.(rel, "SEO 描述 #{d_len} 字，超過建議的 #{SEO_DESC_MAX} 字（只提醒）") if d_len > SEO_DESC_MAX

  docs[name.downcase] ||= []
  docs[name.downcase] << rel
  fm['related_articles'].each { |a| rel_list << [rel, name, a] } if fm['related_articles'].is_a?(Array)
end

# 識別碼、網址唯一
docs.each { |n, list| errors << "ERROR 網址 /literature/#{n}/ 重複：#{list.join('、')}" if list.size > 1 }
rel_list.each do |rel, self_name, a|
  if a == self_name then err.(rel, 'related_articles 不能放自己')
  elsif !docs.key?(a.to_s.downcase) then err.(rel, "related_articles 裡的「#{a}」找不到這篇文章")
  end
end

puts "研究所文章驗證：#{files.size} 個檔案"
puts warns unless warns.empty?
if errors.empty?
  puts "OK  研究文章資料驗證通過（錯誤 0、提醒 #{warns.size}）"
  exit 0
else
  puts errors
  puts "FAIL 研究文章資料驗證失敗（錯誤 #{errors.size}、提醒 #{warns.size}）"
  exit 1
end
