// 多尺寸截圖＋水平溢出／主控台錯誤檢查。
// 用法：node shot.js <siteDir> <outDir> <path1,path2,...> [widths]
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const [, , SITE, OUT, PATHS, W] = process.argv;
const widths = (W || '320,390,768,1024,1440').split(',').map(Number);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  let f = path.join(SITE, p); if (p.endsWith('/')) f = path.join(f, 'index.html');
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0, async () => {
  const port = srv.address().port; fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const report = [];
  for (const p of PATHS.split(',')) for (const w of widths) {
    const ctx = await b.newContext({ viewport: { width: w, height: w < 768 ? 800 : 900 }, deviceScaleFactor: 1, hasTouch: w < 1024, isMobile: w < 768 });
    await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, r => r.abort());
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message.slice(0, 120)));
    try {
      await pg.goto(`http://127.0.0.1:${port}${p}`, { waitUntil: 'load', timeout: 20000 }); await pg.waitForTimeout(400);
      const m = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      const name = p.replace(/[\/?=&]+/g, '_').replace(/^_|_$/g, '') || 'home';
      await pg.screenshot({ path: `${OUT}/${name}_${w}.png`, fullPage: false });
      report.push({ p, w, overflow: m.sw > m.cw ? m.sw - m.cw : 0, errs });
    } catch (e) { report.push({ p, w, fail: e.message.slice(0, 100) }); }
    await ctx.close();
  }
  await b.close(); srv.close();
  for (const r of report) console.log(r.p, r.w, r.fail ? 'FAIL ' + r.fail : `overflow=${r.overflow}${r.errs.length ? ' JSERR ' + r.errs.join(' | ') : ''}`);
});
