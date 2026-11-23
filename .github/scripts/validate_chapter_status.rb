#!/usr/bin/env ruby
# P3-01-A: validate the public chapter-status index produced by Jekyll.
# Run only after building: ruby .github/scripts/validate_chapter_status.rb . --site _site
# Read-only: never modifies the repository, generated site or Supabase.
Encoding.default_external = Encoding::UTF_8
require 'json'
require 'yaml'
require 'date'
require 'set'
require 'time'

class UniqueKeys < Hash
  def []=(key, value)
    raise ArgumentError, "duplicate JSON key: #{key}" if key?(key)
    super
  end
end

def parse_json(path)
  JSON.parse(File.read(path), object_class: UniqueKeys)
end

def fail_if(condition, description, errors)
  errors << description if condition
end

def valid_url?(url)
  url.is_a?(String) && url.match?(%r{\A/t/[a-zA-Z0-9_-]+/\z})
end

args = ARGV.dup
idx = args.index('--site')
abort 'Usage: ruby validate_chapter_status.rb ROOT --site BUILD_DIR' unless idx && args[idx + 1]
site = File.expand_path(args[idx + 1])
root = File.expand_path(args[0] || '.')
errors = []

begin
  index = parse_json(File.join(site, 'assets/chapter-status.json'))
  posts = parse_json(File.join(site, 'assets/posts.json'))
  novels = YAML.safe_load(File.read(File.join(root, '_data/novels.yml')), permitted_classes: [Date, Time], aliases: false) || {}
  characters = YAML.safe_load(File.read(File.join(root, '_data/characters.yml')), permitted_classes: [Date, Time], aliases: false) || {}
  withdrawn_source = YAML.safe_load(File.read(File.join(root, '_data/withdrawn.yml')), permitted_classes: [Date, Time], aliases: false) || {}
  ledger_path = File.join(root, '.github/release/authorized.txt')
  ledger = File.readlines(ledger_path, chomp: true).map(&:strip).reject { |s| s.empty? || s.start_with?('#') }.to_set
  raise 'chapter-status root must be an object' unless index.is_a?(Hash)
  raise 'posts index must be an object' unless posts.is_a?(Hash)
  raise 'chapter-status version must be 1' unless index['version'] == 1
  Time.iso8601(index.fetch('generated_at'))
  chapters = index.fetch('chapters')
  withdrawn = index.fetch('withdrawn')
  remaps = index.fetch('remaps')
  raise 'chapters, withdrawn and remaps must be objects' unless [chapters, withdrawn, remaps].all? { |v| v.is_a?(Hash) }
  fail_if(!remaps.empty?, 'P3-01-A does not authorize new redirects', errors)

  by_url = {}
  posts.each do |slug, post|
    unless post.is_a?(Hash)
      errors << "posts.json entry invalid: #{slug}"
      next
    end
    url = post['u']
    fail_if(!valid_url?(url), "posts.json invalid chapter URL: #{url}", errors)
    fail_if(!ledger.include?(slug), "unapproved chapter in posts.json: #{slug}", errors)
    fail_if(by_url.key?(url), "duplicate chapter URL: #{url}", errors)
    by_url[url] = post
    fail_if(!File.file?(File.join(site, 't', slug, 'index.html')), "missing published page: #{slug}", errors)
  end

  fail_if(chapters.keys.to_set != by_url.keys.to_set, 'chapter-status URLs do not match published posts.json', errors)
  chapters.each do |url, row|
    unless row.is_a?(Hash)
      errors << "chapter entry invalid: #{url}"
      next
    end
    fail_if(!valid_url?(url), "invalid chapter URL: #{url}", errors)
    fail_if(row['url'] != url || row['status'] != 'published', "invalid status/URL: #{url}", errors)
    novel_id = row['novel']
    character_id = row['character']
    fail_if(!novels.key?(novel_id), "unknown novel: #{url}", errors)
    if !character_id.nil?
      character = characters[character_id]
      fail_if(!character.is_a?(Hash), "unknown character: #{url}", errors)
      if character.is_a?(Hash)
        allowed_novels = [character['novel'], *Array(character['also'])]
        fail_if(!allowed_novels.include?(novel_id), "character belongs to a different novel: #{url}", errors)
      end
    end
    fail_if(!row['chapter'].is_a?(Integer) || row['chapter'] < 1, "invalid chapter number: #{url}", errors)
    fail_if(!row['title'].is_a?(String) || row['title'].strip.empty?, "missing chapter title: #{url}", errors)
    post = by_url[url]
    if post
      fail_if([row['novel'], row['chapter'], row['character'], row['title']] != [post['n'], post['ch'], post['c'], post['t']], "index does not match posts.json: #{url}", errors)
    end
  end

  source_rows = withdrawn_source.fetch('urls', [])
  raise 'withdrawn.yml urls must be an array' unless source_rows.is_a?(Array)
  source_urls = source_rows.map { |w| w['url'] }
  fail_if(source_urls.uniq.length != source_urls.length, 'duplicate withdrawn URL in source', errors)
  fail_if(withdrawn.keys.to_set != source_urls.to_set, 'withdrawn index does not match withdrawn.yml', errors)
  source_rows.each do |row|
    url = row['url']
    fail_if(!valid_url?(url), "invalid withdrawn URL: #{url}", errors)
    fail_if(chapters.key?(url), "WITHDRAWN chapter is also public: #{url}", errors)
    fail_if(File.exist?(File.join(site, url.to_s.sub(%r{\A/}, ''), 'index.html')), "withdrawn chapter still built: #{url}", errors)
    actual = withdrawn[url]
    unless actual.is_a?(Hash)
      errors << "missing withdrawn metadata: #{url}"
      next
    end
    date = row['date'].respond_to?(:strftime) ? row['date'].strftime('%Y-%m-%d') : row['date'].to_s
    fail_if(actual != {'status' => 'withdrawn', 'level' => row['level'], 'date' => date}, "withdrawn metadata mismatch: #{url}", errors)
  end

  # Check that the index is no wider than its declared public schema.
  fail_if(index.keys.to_set != %w[version generated_at chapters withdrawn remaps].to_set, 'unexpected top-level fields', errors)
  chapters.each do |url, row|
    next unless row.is_a?(Hash)
    fail_if(row.keys.to_set != %w[url novel chapter character title status].to_set, "unexpected chapter fields: #{url}", errors)
  end
  withdrawn.each do |url, row|
    next unless row.is_a?(Hash)
    fail_if(row.keys.to_set != %w[status level date].to_set, "unexpected withdrawn fields: #{url}", errors)
  end
  puts "P3-01-A 章節狀態索引：公開 #{chapters.size} 篇、撤回 #{withdrawn.size} 筆"
rescue StandardError => e
  errors << "#{e.class}: #{e.message}"
end

if errors.empty?
  puts 'OK  P3-01-A 章節與撤回索引驗證通過'
else
  errors.each { |message| warn "錯誤 #{message}" }
  warn "FAIL P3-01-A：#{errors.length} 項"
  exit 1
end
