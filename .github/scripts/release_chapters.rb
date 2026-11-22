# 把站長授權的章節改成公開：拿掉 published: false（與 release_at），加進 .github/release/authorized.txt
# 用法：ruby .github/scripts/release_chapters.rb --now "hongdian11,exam40"   → 立即發布指定章節（站長手動執行）
#       ruby .github/scripts/release_chapters.rb --due                     → 發布 release_at 已到的章節（站長事先指定時間）
# 正文、日期、順序都不改。找不到或不是未發布章節 → 失敗。
Encoding.default_external = Encoding::UTF_8
require 'time'
ROOT = '.'; LEDGER = '.github/release/authorized.txt'
mode = ARGV[0]; want = (ARGV[1] || '').split(/[,\s]+/).reject(&:empty?)
files = Dir.glob('_posts/*').select { |f| File.file?(f) }.to_h { |f| [File.basename(f).sub(/\A\d{4}-\d{2}-\d{2}-/, '').sub(/\.[^.]+\z/, ''), f] }
pick = []
if mode == '--now'
  abort '請輸入要發布的章節代號（例如 hongdian11）' if want.empty?
  want.each do |s|
    f = files[s] or abort "找不到章節 #{s}"
    abort "#{s} 不是未發布章節（沒有 published: false）" unless File.read(f).match?(/\A---\s*\n(?:.*\n)*?published:\s*false\s*\n(?:.*\n)*?---/)
    pick << s
  end
elsif mode == '--due'
  now = Time.now
  files.each do |s, f|
    t = File.read(f); next unless t.match?(/^published:\s*false\s*$/)
    ra = t[/^release_at:\s*["']?([^"'\n]+)/, 1] or next
    pick << s if (Time.parse(ra) rescue nil)&.<=(now)
  end
else abort '用法：--now "代號,代號" 或 --due' end
pick.each do |s|
  f = files[s]; t = File.read(f)
  head, body = t.split(/^---\s*$\n?/, 3)[1], t.split(/^---\s*$\n?/, 3)[2]
  head = head.lines.reject { |l| l.match?(/\A(published|release_at):/) }.join
  File.write(f, "---\n#{head}---\n#{body}")
  File.open(LEDGER, 'a') { |o| o.puts s }
  puts "發布：#{s}"
end
File.write(ENV['GITHUB_OUTPUT'], "released=#{pick.join(',')}\n", mode: 'a') if ENV['GITHUB_OUTPUT']
puts pick.empty? ? '沒有要發布的章節' : "共 #{pick.size} 篇"
