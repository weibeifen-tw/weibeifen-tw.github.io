# frozen_string_literal: true
# Check the rendered site, not only Jekyll input.
require 'pathname'
require 'date'

root = File.expand_path(ARGV[0] || '.')
i = ARGV.index('--site')
abort 'Usage: validate_novel_seo.rb . --site _site' unless i && ARGV[i + 1]
site = File.expand_path(ARGV[i + 1])
errors = []
check = ->(condition, message) { errors << message unless condition }

pages = Dir.glob(File.join(root, 'novel', '*.html')).sort
check.call(!pages.empty?, 'No novel landing pages found')
require 'yaml'
all_ids = pages.map { |f| File.basename(f, '.html') }
withdrawn = YAML.safe_load(File.read(File.join(root, '_data', 'withdrawn.yml')), permitted_classes: [Date])['urls'] || []
withdrawn_ids = withdrawn.filter_map { |entry| entry['url'][%r{\A/novel/([^/]+)/\z}, 1] }
withdrawn_ids.each do |id|
  check.call(!File.exist?(File.join(site, 'novel', id, 'index.html')), "#{id}: withdrawn novel page is still public")
end
ids = all_ids - withdrawn_ids
check.call(!ids.empty?, 'No public novel landing pages found')

ids.each do |id|
  jpg = File.join(site, 'assets', 'og', "#{id}.jpg")
  check.call(File.file?(jpg), "#{id}: share JPG is missing")
  if File.file?(jpg)
    check.call(File.binread(jpg, 3).bytes == [0xFF, 0xD8, 0xFF], "#{id}: invalid JPEG")
  end
  path = File.join(site, 'novel', id, 'index.html')
  check.call(File.file?(path), "#{id}: novel page is missing")
  next unless File.file?(path)
  html = File.read(path)
  check.call(html.scan(/<meta name="description"/).size == 1, "#{id}: wrong meta description count")
  check.call(html.scan(/<link rel="canonical"/).size == 1, "#{id}: wrong canonical count")
  check.call(html.scan(/<meta property="og:image"/).size == 1, "#{id}: wrong og:image count")
  check.call(html.include?('property="og:image:type" content="image/jpeg"'), "#{id}: OG image type must be JPEG")
  check.call(html.include?('"@type": "Book"'), "#{id}: missing Book JSON-LD")
  check.call(html.scan(/"@type": "Book"/).size == 1, "#{id}: duplicate Book JSON-LD")
end

chapters = 0
Dir.glob(File.join(site, 't', '*', 'index.html')).sort.each do |path|
  html = File.read(path)
  next unless html.include?('class="chapter read"')
  chapters += 1
  slug = File.basename(File.dirname(path))
  novel_id = html[/<article[^>]+data-novel="([^"]+)"/, 1]
  check.call(ids.include?(novel_id), "#{slug}: unknown novel #{novel_id}") unless ids.include?(novel_id)
  check.call(html.scan(/<meta name="description"/).size == 1, "#{slug}: wrong meta description count")
  check.call(html.scan(/<link rel="canonical"/).size == 1, "#{slug}: wrong canonical count")
  check.call(html.scan(/<meta property="og:image"/).size == 1, "#{slug}: wrong og:image count")
  check.call(html.include?('property="og:image:type" content="image/jpeg"'), "#{slug}: OG image must be JPEG")
  check.call(html.include?('"@type": "Chapter"'), "#{slug}: missing Chapter JSON-LD")
  check.call(html.include?('"@type": "Book"'), "#{slug}: chapter is missing parent Book")
end

check.call(chapters > 0, 'No rendered chapters were found')
puts "SEO validation: #{ids.size} books, #{chapters} chapters, #{errors.size} errors"
if errors.any?
  errors.each { |e| warn "FAIL #{e}" }
  exit 1
end
puts 'OK books and chapters have unique SEO metadata and JPEG sharing image'
