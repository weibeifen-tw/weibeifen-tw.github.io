// G03: produce emergency source in memory, never modify deployed code or old main.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.argv[2]||'assets/cloud.js','utf8');
const needle='var READING_SYNC_ENABLED = true;';
assert.equal(source.split(needle).length,2);
const paused=source.replace(needle,'var READING_SYNC_ENABLED = false;');
new vm.Script(source);new vm.Script(paused);
assert.equal(paused.replace('var READING_SYNC_ENABLED = false;',needle),source);
assert.ok(paused.includes("if (!READING_SYNC_ENABLED) return { ok: false, reason: 'paused' };"));
console.log('G03 emergency variant syntax and exact one-line difference verified; no deployment');
