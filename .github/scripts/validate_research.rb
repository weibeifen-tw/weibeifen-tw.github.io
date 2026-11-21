# 未備份研究所｜原住民族專書：研究資料驗證（DEV-03）
# 用法：ruby .github/scripts/validate_research.rb [網站根目錄，預設 .]
# 只讀檔案，不需要套件。檢查：
#   - 專書文章欄位（article_id、卷章篇、版本、正文指紋、核准 tag 名稱）
#   - 證據卡（核讀狀態、授權、摘錄、claim_hash、撤回分級）
#   - 正文／歷史版本裡的證據引用（L3 撤回仍被引用 → 失敗）
#   - 歷史版本（指紋、ev_map、對應的現行文章）
#   - 撤回清單（網址必須已經不存在）
# 簽章（可信核准基準）另由 verify_approvals.rb 檢查。
require 'yaml'
require 'date'
require 'digest'

ROOT = File.expand_path(ARGV[0] || '.')
SERIES = 'indigenous-history'
RESERVED = %w[indigenous].freeze
READ = %w[direct indirect unverified].freeze
LIC = %w[allowed restricted unknown].freeze
LEVELS = %w[L1 L2 L3].freeze
errors = []; warns = []
err = ->(f, m) { errors << "#{f}: #{m}" }
warn = ->(f, m) { warns << "#{f}: #{m}" }

def load_doc(path)
  raw = File.read(path, encoding: 'UTF-8')
  m = raw.match(/\A---\s*\n(.*?)\n---\s*\n?(.*)\z/m) or return [nil, raw]
  [YAML.safe_load(m[1], permitted_classes: [Date, Time], aliases: false) || {}, m[2]]
end
def body_sha(body) = Digest::SHA256.hexdigest(body.gsub(/\s+/, ''))
def cites(body) = body.scan(/\{%-?\s*include\s+ev\.html\s+id=["']([^"']+)["']\s*-?%\}/).flatten

lit_dir = File.join(ROOT, '_literature')
arts = {} # slug => [fm, body, rel]
Dir.glob(File.join(lit_dir, '*.{md,markdown,html}')).sort.each do |f|
  slug = File.basename(f).sub(/\.[^.]+\z/, ''); rel = f.sub(ROOT + '/', '')
  err.(rel, "檔名「#{slug}」是保留字（專書首頁網址），請改名") if RESERVED.include?(slug)
  fm, body = load_doc(f); next unless fm.is_a?(Hash)
  arts[slug] = [fm, body, rel]
end

# 證據卡
ev = {} # article_id => {id => card}
Dir.glob(File.join(ROOT, '_data/evidence/*.{yml,yaml}')).sort.each do |f|
  rel = f.sub(ROOT + '/', ''); aid = File.basename(f).sub(/\.ya?ml\z/, '')
  cards = YAML.safe_load(File.read(f, encoding: 'UTF-8'), permitted_classes: [Date], aliases: false)
  unless cards.is_a?(Array) then err.(rel, '證據卡檔案必須是清單（每張卡一項）'); next; end
  ev[aid] = {}
  cards.each_with_index do |c, i|
    w = "#{rel} 第 #{i + 1} 張"
    unless c.is_a?(Hash) then err.(w, '格式錯誤'); next; end
    id = c['id'].to_s
    err.(w, 'id 必填，格式 EV-數字（例如 EV-001）') unless id.match?(/\AEV-\d{3,}\z/)
    err.(w, "id #{id} 重複") if ev[aid].key?(id)
    ev[aid][id] = c
    s = c['source']
    if !s.is_a?(Hash) || s['title'].to_s.strip.empty? then err.(w, 'source.title（來源名稱）必填') end
    if s.is_a?(Hash) && s['url'] && !s['url'].to_s.match?(%r{\Ahttps?://}) then err.(w, 'source.url 必須是 http(s) 公開連結') end
    rs = c['read_status'].to_s
    err.(w, "read_status 只能是 #{READ.join('／')}") unless READ.include?(rs)
    err.(w, 'read_status: direct（直接核讀）必須有 read_date') if rs == 'direct' && c['read_date'].nil?
    err.(w, 'read_status 不是 direct 卻填了 read_date（不得把未核讀標成已核讀）') if rs != 'direct' && !c['read_date'].nil?
    claim = c['claim'].to_s
    if claim.strip.empty? then err.(w, 'claim（支持的主張）必填')
    elsif c['claim_hash'] != Digest::SHA256.hexdigest(claim) then err.(w, 'claim_hash 與 claim 不符（改了主張就要重算；舊版引用會因此顯示「無法確認」）') end
    l = c['license']
    if !l.is_a?(Hash) then err.(w, 'license 必填（cite／display／reproduce）')
    else %w[cite display reproduce].each { |k| err.(w, "license.#{k} 只能是 #{LIC.join('／')}") unless LIC.include?(l[k].to_s) } end
    if c['excerpt'] && !(l.is_a?(Hash) && l['reproduce'] == 'allowed') then err.(w, '有 excerpt（摘錄）必須 license.reproduce: allowed') end
    wd = c['withdrawal']
    if wd
      if !wd.is_a?(Hash) || !LEVELS.include?(wd['level'].to_s) then err.(w, "withdrawal.level 只能是 #{LEVELS.join('／')}")
      else
        err.(w, 'withdrawal.date 必填') if wd['date'].nil?
        err.(w, 'L2 授權撤回：必須拿掉 excerpt') if wd['level'] == 'L2' && c['excerpt']
      end
    end
  end
end

# 專書文章
ids = {}
arts.each do |slug, (fm, body, rel)|
  next unless fm['series_key'] == SERIES
  aid = fm['article_id'].to_s
  m = aid.match(/\AIND-([1-7])-(\d{2})-(\d{2})\z/)
  unless m then err.(rel, 'article_id 格式：IND-卷-章兩位數-篇兩位數（例如 IND-1-01-03）'); next; end
  err.(rel, "article_id #{aid} 重複（#{ids[aid]}）") if ids[aid]; ids[aid] = rel
  err.(rel, 'category 必須是「原住民族」') unless fm['category'] == '原住民族'
  err.(rel, 'volume_no 必須等於 article_id 的卷') unless fm['volume_no'] == m[1].to_i
  err.(rel, 'chapter_no 必須等於 article_id 的章') unless fm['chapter_no'] == m[2].to_i
  err.(rel, 'piece 必須等於 article_id 的篇') unless fm['piece'] == m[3].to_i
  err.(rel, 'version 必填（例如 v1.0）') if fm['version'].to_s.strip.empty?
  err.(rel, 'approved_tag 必填（站長簽章的核准 tag 名稱）') if fm['approved_tag'].to_s.strip.empty?
  err.(rel, 'body_sha256 與正文不符（正文改了就是新版本，需要重新核准）') unless fm['body_sha256'] == body_sha(body)
  cards = ev[aid] || {}
  cites(body).uniq.each do |id|
    c = cards[id]
    if c.nil? then err.(rel, "引用的證據 #{id} 不在 _data/evidence/#{aid}.yml")
    elsif c.dig('withdrawal', 'level') == 'L3' then err.(rel, "證據 #{id} 已 L3 撤回，正文仍在引用：需要人工修訂後重新核准") end
  end
end
ev.each_key { |aid| err.("_data/evidence/#{aid}.yml", "沒有對應的已發布文章（article_id #{aid}）；證據卡會公開，未發布文章的證據不得放進 repo") unless ids[aid] }

# 歷史版本
vdir = File.join(ROOT, '_lit_versions')
Dir.glob(File.join(vdir, '**', '*')).select { |f| File.file?(f) }.sort.each do |f|
  rel = f.sub(ROOT + '/', '')
  parts = f.sub(vdir + '/', '').split('/')
  unless parts.size == 2 && f.match?(/\.(md|markdown)\z/) then err.(rel, '版本檔放在 _lit_versions/<文章檔名>/<版本>.md'); next; end
  fm, body = load_doc(f); unless fm.is_a?(Hash) then err.(rel, 'Front Matter 格式錯誤'); next; end
  slug = parts[0]
  err.(rel, "article 必須等於資料夾名「#{slug}」") unless fm['article'] == slug
  cur = arts[slug]
  err.(rel, "現行文章 #{slug} 不存在：整篇撤回時歷史版本也要一起撤回（並加入 _data/withdrawn.yml）") unless cur
  err.(rel, 'article_id 必須跟現行文章相同') if cur && fm['article_id'] != cur[0]['article_id']
  %w[version date title approved_tag].each { |k| err.(rel, "#{k} 必填") if fm[k].to_s.strip.empty? }
  err.(rel, '版本檔名必須等於 version') if fm['version'] && File.basename(f).sub(/\.[^.]+\z/, '') != fm['version'].to_s
  err.(rel, 'body_sha256 與正文不符：舊版正文不得改寫（Q12）') unless fm['body_sha256'] == body_sha(body)
  map = fm['ev_map'] || {}
  cards = ev[fm['article_id'].to_s] || {}
  cites(body).uniq.each do |id|
    err.(rel, "引用 #{id} 但 ev_map 沒有記錄當時的 claim_hash") unless map.key?(id)
    err.(rel, "證據 #{id} 已 L3 撤回，歷史版本仍在引用：需要人工決定撤回這一版") if cards.dig(id, 'withdrawal', 'level') == 'L3'
  end
end

# 撤回清單
wd = (YAML.safe_load(File.read(File.join(ROOT, '_data/withdrawn.yml'), encoding: 'UTF-8'), permitted_classes: [Date]) || {})['urls'] || [] rescue []
wd.each do |w|
  u = w.is_a?(Hash) ? w['url'].to_s : ''
  if !u.start_with?('/') then err.('_data/withdrawn.yml', "網址要以 / 開頭：#{u.inspect}"); next; end
  segs = u.split('/').reject(&:empty?)
  if segs[0] == 'literature' && segs.size == 2 && arts[segs[1]] then err.('_data/withdrawn.yml', "#{u} 已列為撤回，但文章檔還在") end
  if segs[0] == 'literature' && segs.size == 3 && Dir.glob(File.join(vdir, segs[1], segs[2] + '.*')).any? then err.('_data/withdrawn.yml', "#{u} 已列為撤回，但版本檔還在") end
end

puts "研究資料驗證：專書文章 #{ids.size}、證據卡檔 #{ev.size}、歷史版本 #{Dir.glob(File.join(vdir, '**', '*.md')).size}、撤回網址 #{wd.size}"
warns.each { |w| puts "提醒 #{w}" }
if errors.empty? then puts "OK  研究資料驗證通過（錯誤 0、提醒 #{warns.size}）"
else errors.each { |e| puts "錯誤 #{e}" }; puts "FAIL 研究資料驗證失敗（錯誤 #{errors.size}）"; exit 1 end
