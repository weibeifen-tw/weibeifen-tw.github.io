// 本機模擬 Jekyll（liquidjs）：只為了截圖與回歸比對，正式建置仍以 GitHub build-check 為準。
// 用法：node render.js <repo> <out>
const fs = require('fs'), path = require('path');
const yaml = require('js-yaml'), matter = require('gray-matter');
const { Liquid } = require('liquidjs');
const { marked } = require('marked');

const SRC = path.resolve(process.argv[2] || '.'), OUT = path.resolve(process.argv[3] || '/tmp/site');
const cfg = yaml.load(fs.readFileSync(path.join(SRC, '_config.yml'), 'utf8')) || {};
const exclude = new Set(['node_modules', 'vendor', 'Gemfile', 'Gemfile.lock', 'README.md', 'supabase', ...(cfg.exclude || [])]);

function readData(dir) {
  const o = {};
  if (!fs.existsSync(dir)) return o;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f), k = f.replace(/\.(ya?ml|json)$/, '');
    if (fs.statSync(p).isDirectory()) o[f] = readData(p);
    else if (/\.ya?ml$/.test(f)) o[k] = yaml.load(fs.readFileSync(p, 'utf8'));
    else if (/\.json$/.test(f)) o[k] = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return o;
}

const liquid = new Liquid({
  root: [path.join(SRC, '_includes')], partials: path.join(SRC, '_includes'), extname: '',
  jekyllInclude: true, dynamicPartials: false, strictFilters: false, strictVariables: false,
  relativeReference: false, greedy: false, timezoneOffset: -480,
});
liquid.registerTag('seo', { parse() {}, render() { return ''; } });
liquid.registerFilter('relative_url', v => (cfg.baseurl || '') + (v || ''));
liquid.registerFilter('absolute_url', v => (cfg.url || 'https://weibeifen.com') + (cfg.baseurl || '') + (v || ''));
liquid.registerFilter('markdownify', v => marked.parse(String(v || '')));

const slugOf = f => path.basename(f).replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.(md|markdown|html)$/, '');
const isMd = f => /\.(md|markdown)$/.test(f);

function permalinkFor(rel, fm, tpl, extra = {}) {
  if (fm.permalink) return fm.permalink;
  if (tpl) {
    let u = tpl;
    for (const [k, v] of Object.entries(extra)) u = u.replace(':' + k, v);
    return u;
  }
  const r = '/' + rel.replace(/\\/g, '/');
  if (/index\.(html|md)$/.test(r)) return r.replace(/index\.(html|md)$/, '');
  return r.replace(/\.(md|markdown)$/, '.html');
}

const site = { ...cfg, data: readData(path.join(SRC, '_data')), posts: [], pages: [], static_files: [], time: new Date(), collections: [] };
const docs = []; // {rel, fm, body, url, kind}

// posts
const pdir = path.join(SRC, '_posts');
for (const f of fs.readdirSync(pdir).filter(f => /\.(md|html)$/.test(f))) {
  const raw = matter(fs.readFileSync(path.join(pdir, f), 'utf8'));
  const m = f.match(/^(\d{4})-(\d{2})-(\d{2})-/);
  const date = raw.data.date ? new Date(raw.data.date) : new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`);
  const slug = slugOf(f);
  const url = permalinkFor('', raw.data, cfg.permalink, { title: slug, year: m[1], month: m[2], day: m[3] });
  const d = { ...raw.data, date, slug, url, id: '/' + slug, path: '_posts/' + f, collection: 'posts', _body: raw.content, _md: isMd(f) };
  site.posts.push(d); docs.push(d);
}
site.posts.sort((a, b) => b.date - a.date);
site.posts.forEach((p, i) => { p.previous = site.posts[i + 1] || null; p.next = site.posts[i - 1] || null; });

// collections
for (const [name, c] of Object.entries(cfg.collections || {})) {
  const dir = path.join(SRC, '_' + name), arr = [];
  const listDocs = (d, pre = '') => fs.existsSync(d) ? fs.readdirSync(d).flatMap(f => fs.statSync(path.join(d, f)).isDirectory() ? listDocs(path.join(d, f), pre + f + '/') : (/\.(md|html)$/.test(f) ? [pre + f] : [])) : [];
  for (const f of listDocs(dir)) {
    const raw = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
    let fm = { ...raw.data };
    for (const d of cfg.defaults || []) if (d.scope && d.scope.type === name) fm = { ...d.values, ...fm };
    const relp = f.replace(/\.(md|html)$/, ''), nm = path.basename(relp);
    const url = permalinkFor('', fm, c.permalink, { name: nm, title: nm, path: relp });
    const d = { ...fm, slug: nm, url, collection: name, path: `_${name}/${f}`, _body: raw.content, _md: isMd(f), _out: c.output };
    arr.push(d); if (c.output) docs.push(d);
  }
  site[name] = arr; site.collections.push({ label: name, docs: arr });
}

// pages
function walk(dir, rel = '') {
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('_') || f.startsWith('.') || exclude.has(f) || exclude.has(rel + f)) continue;
    const p = path.join(dir, f), r = rel + f;
    if (fs.statSync(p).isDirectory()) { walk(p, r + '/'); continue; }
    const txt = fs.readFileSync(p);
    if (txt.slice(0, 3).toString() === '---') {
      const raw = matter(txt.toString());
      const d = { ...raw.data, url: permalinkFor(r, raw.data), path: r, name: f, _body: raw.content, _md: isMd(f), _page: true };
      site.pages.push(d); docs.push(d);
    } else {
      const o = path.join(OUT, r); fs.mkdirSync(path.dirname(o), { recursive: true }); fs.copyFileSync(p, o);
      site.static_files.push({ path: '/' + r, name: f, basename: f.replace(/\.[^.]+$/, ''), extname: path.extname(f) });
    }
  }
}
walk(SRC);

const layouts = {};
for (const f of fs.readdirSync(path.join(SRC, '_layouts'))) {
  const raw = matter(fs.readFileSync(path.join(SRC, '_layouts', f), 'utf8'));
  layouts[f.replace(/\.html$/, '')] = raw;
}

(async () => {
  let n = 0, errs = 0;
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  for (const d of docs) {
    if (only && !only.test(d.url)) continue;
    const page = { ...d }; delete page._body;
    try {
      let content = await liquid.parseAndRender(d._body, { site, page, paginator: null });
      if (d._md) content = marked.parse(content);
      page.content = content;
      let lay = d.layout === undefined ? (d.collection === 'posts' ? null : null) : d.layout;
      let guard = 0, layoutVars = {};
      while (lay && layouts[lay] && guard++ < 5) {
        const L = layouts[lay];
        layoutVars = { ...L.data, ...layoutVars };
        content = await liquid.parseAndRender(L.content, { site, page, content, layout: layoutVars });
        lay = L.data.layout;
      }
      let out = d.url.endsWith('/') ? d.url + 'index.html' : d.url;
      if (!/\.[a-z0-9]+$/i.test(out)) out += '.html';
      const o = path.join(OUT, out); fs.mkdirSync(path.dirname(o), { recursive: true }); fs.writeFileSync(o, content); n++;
    } catch (e) { errs++; console.error('ERR', d.path, e.message.slice(0, 200)); }
  }
  console.log(`rendered ${n}, errors ${errs} -> ${OUT}`);
  process.exit(errs ? 1 : 0);
})();
