// V1.8 T03 safe-rollback dry run. Mock storage and mock Supabase only; no network.
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const TOKEN = 'sb-tqicconarhpddejxdvmf-auth-token';
const values = new Map([
  ['wb:last:yu', JSON.stringify({url:'/t/shutter/',no:'51',t:10})]
]);
const localStorage = {
  get length(){ return values.size; },
  key:i=>[...values.keys()][i],
  getItem:k=>values.has(k)?values.get(k):null,
  setItem:(k,v)=>values.set(k,String(v)),
  removeItem:k=>values.delete(k)
};
const win={addEventListener(){}};
vm.runInNewContext(read('assets/js/reading-store.js'),{window:win,localStorage});
const Store=win.WBReadingStore;
function session(id){
  if(id) values.set(TOKEN,JSON.stringify({user:{id},refresh_token:'dummy'}));
  else values.delete(TOKEN);
  Store.setIdentity(id?'unknown':'guest');
  if(id) assert.ok(Store.setIdentity('member',id));
}
function extract(source,heading){
  const start=source.indexOf(heading);assert.ok(start>=0,heading);
  const open=source.indexOf('{',start);let depth=0;
  for(let i=open;i<source.length;i++){
    if(source[i]==='{') depth++;
    else if(source[i]==='}'&&--depth===0) return source.slice(start,i+1);
  }
  throw Error('unterminated: '+heading);
}
const cloud=read('assets/cloud.js');
assert.ok(cloud.includes('var READING_SYNC_ENABLED = true;'),'expected build-time switch');
const helpers=['function cut(','function localRecords(','function num(','function further(','async function sync(']
  .map(s=>extract(cloud,s)).join('\n');
function version(enabled){
  let stamp=[],reads=[],writes=[];
  const sessionStorage={setItem:(k,v)=>stamp.push([k,v])};
  const browser={};
  const sync=new Function('Store','sessionStorage','KEY_RE','window',
    'var READING_SYNC_ENABLED = '+String(enabled)+';\n'+helpers+';return sync;')(
      Store,sessionStorage,/^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$/,browser);
  const fake={
    from(table){
      assert.equal(table,'reading_progress');
      return {
        select(){
          return {eq:async(column,uid)=>{
            reads.push({column,uid});
            return {data:[]};
          }};
        },
        async upsert(rows){
          writes.push(rows);
          return {error:null};
        }
      };
    }
  };
  return {
    reads,writes,stamp,
    execute:()=>sync({getClient:()=>fake,getVerifiedUser:async()=>({user:{id:Store.identity().uid}})})
  };
}
async function main(){
  let count=0;function pass(ok,message){assert.ok(ok,message);count++;}
  // Exact browser storage snapshot, including legacy records, must survive maintenance.
  session('fakeuser-A');
  Store.write('last','yu',JSON.stringify({url:'/t/a/',no:'7',t:42}));
  Store.write('read','/t/a/','1');
  Store.write('pos','/t/a/','0.65');
  const baseline=new Map(values);
  const paused=version(false);
  const pausedResult=await paused.execute();
  pass(pausedResult.reason==='paused','paused sync returns an explicit non-success status');
  pass(paused.reads.length===0 && paused.writes.length===0,'paused sync sends no cloud requests');
  pass(paused.stamp.length===0,'paused sync cannot write a success timestamp');
  pass(JSON.stringify([...values])===JSON.stringify([...baseline]),
    'pausing does not modify legacy, member, or browser records');
  pass(Store.read('read','/t/a/')==='1' && Store.read('pos','/t/a/')==='0.65',
    'offline local read markers and scroll position remain available');

  // Visiting another member while reading sync is paused must not cross ownership.
  session('fakeuser-B');
  pass(Object.keys(Store.listLast()).length===0 && Store.read('pos','/t/a/')===null,
    'member B cannot see A while sync is paused');
  const pausedB=version(false);
  await pausedB.execute();
  pass(pausedB.writes.length===0 && pausedB.stamp.length===0,'paused member B cannot upload A');
  session(null);
  pass(Store.identity().state==='guest' && !Store.listLast().yu,
    'logout switches to guest without exposing A');
  pass(values.has('wb:last:yu'),'legacy quarantined record remains intact');

  // Simulate deploying an approved repaired build to re-enable sync, not restoring old main.
  session('fakeuser-A');
  const restored=version(true);
  const ok=await restored.execute();
  pass(ok.ok===true && restored.reads.length===1 && restored.writes.length===1,
    'enabled repaired code resumes reading sync for verified A');
  pass(restored.writes[0].every(row=>row.user_id==='fakeuser-A'),
    'all simulated uploads retain owner A');
  pass(restored.stamp.length===1 && restored.stamp[0][0].includes('fakeuser-A'),
    'only successful repaired sync records A-scoped success');
  pass(values.get('wb:last:yu')===baseline.get('wb:last:yu'),
    'legacy key unchanged throughout pause and recovery');
  pass(Store.read('pos','/t/a/')==='0.65' && Store.read('read','/t/a/')==='1',
    'local history remains intact after resuming sync');

  // Unsafe fallback must stay forbidden; source inspection of the exact baseline branch.
  const doc=read('docs/t03-reading-safe-rollback.md');
  pass(doc.includes('不是安全回退') && doc.includes('01f9924'),
    'runbook forbids falling back to historical main');
  console.log('T03 isolated safe rollback dry-run: '+count+'/'+count+' passed (mock-only).');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
