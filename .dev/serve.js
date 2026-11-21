// 本機測試伺服器（模擬 GitHub Pages 的 gzip）。用法：node serve.js <siteDir> <port>
const http=require('http'),fs=require('fs'),path=require('path'),zlib=require('zlib');
const [, , SITE, PORT]=process.argv;
const T={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.webmanifest':'application/manifest+json','.xml':'application/xml'};
http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);let f=path.join(SITE,p);if(p.endsWith('/'))f=path.join(f,'index.html');
 if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404,{'content-type':'text/html'});return r.end('404')}
 const ext=path.extname(f),type=T[ext]||'application/octet-stream',buf=fs.readFileSync(f);
 if(/text|javascript|json|svg|xml/.test(type)&&/gzip/.test(q.headers['accept-encoding']||'')){r.writeHead(200,{'content-type':type,'content-encoding':'gzip','cache-control':'max-age=600'});return r.end(zlib.gzipSync(buf))}
 r.writeHead(200,{'content-type':type,'cache-control':'max-age=600'});r.end(buf)}).listen(+PORT);
