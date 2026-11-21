# 未備份研究所｜可信核准基準檢查（DEV-03）
# 每篇專書文章、每個歷史版本都必須有站長以自己 SSH 金鑰簽章的 git tag：
#   tag 名稱＝front matter 的 approved_tag；tag 訊息要有三行：
#     article_id: IND-1-01-03
#     version: v1.0
#     body_sha256: <正文去空白後的 SHA-256>
#   tag 指向的 commit 裡，該檔案的正文指紋也必須相同。
# 驗簽用 .github/approver/allowed_signers（只放站長的「公鑰」）。repo 內重算的雜湊不算基準，簽章才算。
# 用法：ruby .github/scripts/verify_approvals.rb [根目錄] [--strict]
#   --strict（main／發布用）：缺公鑰、缺 tag、驗簽失敗一律失敗
#   非 strict（開發分支）：列為提醒
Encoding.default_external = Encoding::UTF_8
Encoding.default_internal = Encoding::UTF_8
require 'yaml'
require 'date'
require 'digest'
require 'open3'

ROOT = File.expand_path(ARGV.find { |a| !a.start_with?('--') } || '.')
STRICT = ARGV.include?('--strict') || ENV['APPROVAL_STRICT'] == '1'
SIGNERS = File.join(ROOT, '.github/approver/allowed_signers')
SERIES = 'indigenous-history'
problems = []; ok = 0

def load_doc(path)
  raw = File.read(path, encoding: 'UTF-8')
  m = raw.match(/\A---\s*\n(.*?)\n---\s*\n?(.*)\z/m) or return [nil, raw]
  [YAML.safe_load(m[1], permitted_classes: [Date, Time], aliases: false) || {}, m[2]]
end
def body_sha(body) = Digest::SHA256.hexdigest(body.gsub(/\s+/, ''))
def git(*a) = Open3.capture3('git', '-C', ROOT, *a)

items = []
Dir.glob(File.join(ROOT, '_literature/*.{md,markdown,html}')).sort.each do |f|
  fm, body = load_doc(f); next unless fm.is_a?(Hash) && fm['series_key'] == SERIES
  items << [f.sub(ROOT + '/', ''), fm, body]
end
Dir.glob(File.join(ROOT, '_lit_versions/*/*.{md,markdown}')).sort.each do |f|
  fm, body = load_doc(f); next unless fm.is_a?(Hash)
  items << [f.sub(ROOT + '/', ''), fm, body]
end

have_key = File.file?(SIGNERS) && File.read(SIGNERS).lines.any? { |l| l.strip != '' && !l.start_with?('#') }
problems << ['.github/approver/allowed_signers', '還沒有站長公鑰，無法驗證任何核准'] if !have_key && items.any?

items.each do |rel, fm, body|
  tag = fm['approved_tag'].to_s
  if tag.empty? then problems << [rel, '沒有 approved_tag']; next; end
  _o, _e, st = git('rev-parse', '-q', '--verify', "refs/tags/#{tag}")
  unless st.success? then problems << [rel, "找不到核准 tag #{tag}（請確認已 push tags）"]; next; end
  type, = git('cat-file', '-t', tag)
  unless type.strip == 'tag' then problems << [rel, "#{tag} 不是附註 tag（必須是簽章 tag）"]; next; end
  if have_key
    _o, e, st = git('-c', 'gpg.format=ssh', '-c', 'gpg.ssh.program=ssh-keygen', '-c', "gpg.ssh.allowedSignersFile=#{SIGNERS}", 'verify-tag', tag)
    unless st.success? then problems << [rel, "#{tag} 不是站長公鑰簽的（或沒有簽章）：#{e.lines.last.to_s.strip}"]; next; end
  end
  msg, = git('tag', '-l', '--format=%(contents)', tag)
  kv = msg.lines.map { |l| l.strip.split(/:\s*/, 2) }.select { |a| a.size == 2 }.to_h
  cur = body_sha(body)
  problems << [rel, "tag 的 article_id（#{kv['article_id']}）與檔案不符"] if kv['article_id'] != fm['article_id'].to_s
  problems << [rel, "tag 的 version（#{kv['version']}）與檔案不符"] if kv['version'] != fm['version'].to_s
  problems << [rel, '正文指紋與核准時不同：正文在核准後被改過'] if kv['body_sha256'] != cur
  at, _e, st = git('show', "#{tag}^{commit}:#{rel}")
  if !st.success? then problems << [rel, "核准 tag 指向的 commit 裡沒有這個檔案"]
  else
    _f, b0 = (m = at.match(/\A---\s*\n(.*?)\n---\s*\n?(.*)\z/m)) ? [nil, m[2]] : [nil, at]
    problems << [rel, '核准當時的正文與現在不同'] if body_sha(b0) != cur
  end
  ok += 1 if problems.none? { |p| p[0] == rel }
end

puts "核准基準檢查（#{STRICT ? 'strict' : '開發模式'}）：項目 #{items.size}、通過 #{ok}"
problems.each { |f, m| puts "#{STRICT ? '錯誤' : '提醒'} #{f}: #{m}" }
if problems.any? && STRICT then puts 'FAIL 核准基準檢查失敗'; exit 1 end
puts problems.empty? ? 'OK  核准基準檢查通過' : 'WARN 開發模式：有未核准項目，不得合併到 main'
