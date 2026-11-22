# 小說章節發布驗證（2026-11-22 起）：只有站長授權的章節可以公開
# 用法：ruby .github/scripts/validate_release.rb [根目錄]            → 檢查 repo（部署前、建置檢查都會跑）
#       ruby .github/scripts/validate_release.rb [根目錄] --site _site → 再檢查正式建置輸出
# 規則：
#   - _posts 裡每一篇：published: false（未授權，不建置）或 列在 .github/release/authorized.txt（已授權）
#   - 兩者都不是 → 失敗（不得因日期到了或其他部署而順便公開）
#   - release_at（站長指定的發布時間）只能寫在 published: false 的章節，格式要有時區
#   - --site：已授權章節都要有頁面；未授權章節不得出現在頁面、posts.json、search.json、sitemap.xml
Encoding.default_external = Encoding::UTF_8
Encoding.default_internal = Encoding::UTF_8
require 'yaml'
require 'date'
require 'json'
require 'time'

args = ARGV.dup
SITE = (i = args.index('--site')) ? File.expand_path(args.slice!(i, 2)[1].to_s) : nil
ROOT = File.expand_path(args.first || '.')
LEDGER = File.join(ROOT, '.github/release/authorized.txt')
errors = []
err = ->(f, m) { errors << "#{f}: #{m}" }

ok = File.file?(LEDGER) ? File.readlines(LEDGER, chomp: true).map(&:strip).reject { |l| l.empty? || l.start_with?('#') } : []
err.('.github/release/authorized.txt', '找不到授權清單') unless File.file?(LEDGER)
dups = ok.group_by(&:itself).select { |_, v| v.size > 1 }.keys
err.('.github/release/authorized.txt', "重複：#{dups.join('、')}") if dups.any?
okset = ok.to_h { |s| [s, true] }

released = []; held = []
Dir.glob(File.join(ROOT, '_posts', '*')).select { |f| File.file?(f) }.sort.each do |f|
  rel = f.sub(ROOT + '/', '')
  slug = File.basename(f).sub(/\A\d{4}-\d{2}-\d{2}-/, '').sub(/\.[^.]+\z/, '')
  raw = File.read(f)
  m = raw.match(/\A---\s*\n(.*?)\n---/m)
  fm = m ? (YAML.safe_load(m[1], permitted_classes: [Date, Time], aliases: false) || {}) : {}
  if fm['published'] == false
    held << slug
    err.(rel, '未授權章節同時列在授權清單：請擇一（要發布就拿掉 published: false）') if okset[slug]
    if fm.key?('release_at')
      t = (Time.parse(fm['release_at'].to_s) rescue nil)
      err.(rel, 'release_at 格式錯誤，例如 2026-12-01T20:00:00+08:00') if t.nil? || fm['release_at'].to_s !~ /[+-]\d{2}:?\d{2}\z|Z\z/
    end
  else
    err.(rel, "未授權公開：沒有列在 .github/release/authorized.txt，也沒有 published: false（不得因日期到達或其他部署而公開）") unless okset[slug]
    err.(rel, 'release_at 只能用在 published: false 的未發布章節') if fm.key?('release_at')
    released << slug
  end
end

if SITE
  posts = (JSON.parse(File.read(File.join(SITE, 'assets/posts.json'))) rescue {})
  search = File.read(File.join(SITE, 'assets/search.json')) rescue ''
  sitemap = File.read(File.join(SITE, 'sitemap.xml')) rescue ''
  released.each { |s| err.("_site/t/#{s}/", '已授權章節沒有產生頁面') unless File.file?(File.join(SITE, 't', s, 'index.html')) }
  held.each do |s|
    err.("_site/t/#{s}/", '未授權章節出現在網站') if File.exist?(File.join(SITE, 't', s))
    err.('assets/posts.json', "未授權章節 #{s} 出現在索引") if posts.key?(s)
    err.('assets/search.json', "未授權章節 #{s} 出現在搜尋") if search.include?("/t/#{s}/")
    err.('sitemap.xml', "未授權章節 #{s} 出現在網站地圖") if sitemap.include?("/t/#{s}/")
  end
end

puts "章節發布驗證：已授權公開 #{released.size}、未授權保留 #{held.size}#{SITE ? '（含建置輸出檢查）' : ''}"
if errors.empty? then puts 'OK  章節發布驗證通過'
else errors.each { |e| puts "錯誤 #{e}" }; puts "FAIL 章節發布驗證失敗（#{errors.size}）"; exit 1 end
