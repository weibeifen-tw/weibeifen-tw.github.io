'use strict';
// V2.3 release guard: repository-only static checks + existing mock rollback.
// It intentionally does not open a DB connection or access real member rows.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
let checks = 0;
const ok = (condition, message) => { assert.ok(condition,message); checks++; };
const schema = read('supabase/003_batch2.sql');
const cloud = read('assets/cloud.js');
const store = read('assets/js/reading-store.js');
const runbook = read('docs/t03-reading-safe-rollback.md');
ok(/ALTER TABLE public\.reading_progress ENABLE ROW LEVEL SECURITY;/.test(schema),'source migration enables reading_progress RLS');
ok(/CREATE POLICY "own progress select"[\s\S]*?USING \(\(SELECT auth\.uid\(\)\) = user_id\)/.test(schema),'source migration scopes SELECT to owner');
ok(/CREATE POLICY "own progress insert"[\s\S]*?WITH CHECK \(\(SELECT auth\.uid\(\)\) = user_id\)/.test(schema),'source migration scopes INSERT to owner');
ok(/CREATE POLICY "own progress update"[\s\S]*?USING \(\(SELECT auth\.uid\(\)\) = user_id\) WITH CHECK \(\(SELECT auth\.uid\(\)\) = user_id\)/.test(schema),'source migration scopes UPDATE before and after');
ok(/REVOKE ALL ON public\.favorites, public\.reading_progress FROM anon, authenticated;/.test(schema),'source migration revokes guest table access');
ok(/var READING_SYNC_ENABLED = true;/.test(cloud),'current branch leaves reading sync unchanged');
ok(/if \(!READING_SYNC_ENABLED\) return \{ ok: false, reason: 'paused' \};/.test(cloud),'pause is explicit non-success');
ok(/identity\.state !== 'member' \|\| !identity\.uid/.test(cloud),'sync rejects unverified identity');
ok(/verified\.user\.id !== uid/.test(cloud),'sync checks verified owner before upsert');
ok(/Store\.listLast\(\)/.test(cloud),'sync uses scoped reading records');
ok(/不是安全回退/.test(runbook),'runbook forbids unsafe old-main rollback');
ok(/var PREFIX = 'wb:v2:';/.test(store) && /'member:' \+ uid \+ ':'/.test(store),'reading store retains member-scoped namespace');
const result=cp.spawnSync(process.execPath,[path.join(root,'.dev/test-t03-rollback.cjs')],{
 cwd:root,encoding:'utf8',timeout:25000,env:{...process.env}
});
if(result.error) throw result.error;
assert.equal(result.status,0,'mock rollback script must succeed: '+(result.stderr||''));
ok(/15\/15 passed/.test(result.stdout),'existing isolated 15-case rollback remains green');
console.log('T03 V2.3 release guard: '+checks+'/'+checks+' passed (source/static + mock only).');
