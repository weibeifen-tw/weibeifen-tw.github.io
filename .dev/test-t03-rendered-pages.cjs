// V2.2 generated-site integration gate, entirely local CI _site; no browsing or database calls.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const site=path.join(__dirname,'../_site');
let passed=0;
function ok(x,msg){assert.ok(x,msg);passed++}
const scripts=['assets/js/reading-store.js','assets/app.js','assets/member.js','assets/cloud.js'];
for(const page of ['index.html','shelf/index.html','member/index.html']){
 const file=path.join(site,page);
 ok(fs.existsSync(file),'Missing generated '+page);
 const html=fs.readFileSync(file,'utf8');
 const offsets=scripts.map(x=>html.indexOf('src="/'+x));
 ok(offsets.every(x=>x>=0),'Missing runtime scripts from '+page);
 ok(offsets.every((x,i)=>i===0||x>offsets[i-1]),'Unsafe script order on '+page);
 ok(!html.includes('fakeuser-A')&&!html.includes('fakeuser-B'),
   'Test-only fake member data must not appear in live output '+page);
}
ok(!fs.existsSync(path.join(site,'.dev')),'Internal .dev test fixtures must not be published');
ok(!fs.existsSync(path.join(site,'supabase')),'Internal SQL must not be published');
ok(fs.existsSync(path.join(site,'assets/js/reading-store.js')),'Scoped store missing from output');
console.log('T03 generated layout and artifact isolation: '+passed+'/'+passed+' passed.');
