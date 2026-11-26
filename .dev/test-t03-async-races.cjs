// T03 V2.2: execute branch-source async account-switch guards with offline fake identities.
// Does NOT load or call Supabase, SQL, production APIs, or actual member records.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const member=fs.readFileSync(path.join(__dirname,'../assets/member.js'),'utf8');
const cloud=fs.readFileSync(path.join(__dirname,'../assets/cloud.js'),'utf8');
let checked=0;
function check(value,label){assert.ok(value,label);checked++;}
function section(source,open,close){
  const a=source.indexOf(open), b=source.indexOf(close,a+open.length);
  assert.ok(a>=0&&b>a,'Unable to extract live source: '+open);
  return source.slice(a,b);
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
const memberGuard=section(member,'  var memberViewEpoch = 0;','\n  function setNote');
const memberInit=section(member,'  async function init() {','\n  if (A) {');
const memberDelete=section(member,'  async function deleteAccount() {','\n  async function logoutAll() {');
const cloudEvents=section(cloud,'    var generation = 0;','  }).catch(function () { favStatus(\'會員服務載入失敗，請重新整理。\'); });');

function mockOwner(){
  let uid='fakeuser-A',state='unknown',version=0;
  const store={
    identity:()=>({state,uid:state==='member'?uid:null,version}),
    setIdentity:(next,id)=>{
      if(next==='member'&&id!==uid)return false;
      state=next;
      if(next==='member')uid=id;
      version++;
      return true;
    },
    clearMember:id=>id==='fakeuser-A',
    syncKey:()=>state==='member'?'fake-only':null
  };
  return {store,getUid:()=>uid,setUid:v=>{uid=v;state='unknown';version++;},reset:()=>{uid='fakeuser-A';state='unknown';version++;}};
}
async function flush(){await Promise.resolve();await Promise.resolve();await Promise.resolve();}

function makeInitHarness(options={}){
  const owner=mockOwner(),paints=[];
  const verify=options.verify||(()=>Promise.resolve({user:{id:owner.getUid()}}));
  const role=options.role||(()=>Promise.resolve('reader'));
  const profile=options.profile||(()=>Promise.resolve({profile:{id:owner.getUid()}}));
  const A={
    configProblem:()=>null,getVerifiedUser:verify,getRole:role,getMyProfile:profile,
    signOut:async()=>({error:null})
  };
  const localProfile=()=>owner.getUid()?{id:owner.getUid()}:null;
  const renderMember=(p,prof)=>paints.push({id:p.id,verified:!!prof});
  const renderGuest=()=>paints.push({guest:true});
  const setNote=()=>{};
  const factory=new Function('A','localProfile','renderMember','renderGuest','setNote','window',
    memberGuard+'\n'+memberInit+'\nreturn {init};');
  const h=factory(A,localProfile,renderMember,renderGuest,setNote,{WBReadingStore:owner.store,addEventListener:()=>{}});
  return {...h,...owner,paints};
}
async function testMember(){
  const old=deferred();
  const h=makeInitHarness({verify:()=>old.promise});
  const pending=h.init();
  check(h.paints.length===1&&h.paints[0].id==='fakeuser-A','cached initial A render before verification');
  h.setUid('fakeuser-B');
  old.resolve({user:{id:'fakeuser-A'}});
  await pending;
  check(!h.paints.some(p=>p.verified),'old A verification cannot paint when session switched B');

  const roleWait=deferred();
  const r=makeInitHarness({role:()=>roleWait.promise});
  const loading=r.init();
  await flush();
  r.setUid('fakeuser-B');
  roleWait.resolve('admin');
  await loading;
  check(!r.paints.some(p=>p.verified),'old A role after B switch cannot render admin/member');

  const profWait=deferred();
  const p=makeInitHarness({profile:()=>profWait.promise});
  const loadingProfile=p.init();
  await flush();
  p.setUid('fakeuser-B');
  profWait.resolve({profile:{id:'fakeuser-A'}});
  await loadingProfile;
  check(!p.paints.some(x=>x.verified),'old A profile after B switch cannot render');
}

async function testCloud(){
  let callback,requests=[],favorites=[],syncs=[],paints=[];
  const A={onChange:fn=>{callback=fn},getVerifiedUser:()=>{const d=deferred();requests.push(d);return d.promise;},getClient:()=>({rpc:async()=>({data:false,error:null})})};
  const owner=mockOwner(),win={};
  const buttons=[[{disabled:false,setOn:on=>paints.push(on)},{novel:'fake',path:'/fake/'}]];
  const h=new Function('A','Store','guest','favStatus','document','buttons','isFav','favList','myCmList','dmDot','sessionStorage','sec','research','SYNC_EVERY','sync','window',cloudEvents+'\nreturn {getGeneration:()=>generation};')(A,owner.store,()=>owner.store.setIdentity('guest'),()=>{}, {querySelectorAll:()=>[],querySelector:()=>null},buttons,()=>{const d=deferred();favorites.push(d);return d.promise;},null,null,async()=>{}, {getItem:()=>null},true,false,0,()=>{const d=deferred();syncs.push(d);return d.promise;},win);
  const first=requests[0];
  callback('SIGNED_IN');const second=requests[1];
  second.resolve({user:{id:'fakeuser-A'}});
  await flush();
  check(owner.store.identity().state==='member','newer verification can identify valid owner A');
  first.resolve({user:{id:'fakeuser-A'}});
  await flush();
  check(owner.store.identity().state==='member'&&h.getGeneration()===2,'first late verification does not rewind identity');
  owner.setUid('fakeuser-B');
  callback('SIGNED_IN',{id:'fakeuser-B'});const stale=requests[2];
  favorites[0].resolve(true);syncs[0].resolve({ok:true});
  await flush();
  check(paints.length===0,'old A favorite response cannot paint after B switch');
  check(win.WBReadingSyncStatus===undefined,'old A sync completion cannot paint after B switch');
  callback('SIGNED_OUT');
  stale.resolve({user:{id:'fakeuser-B'}});
  await flush();
  check(owner.store.identity().state==='guest','late verification after SIGNED_OUT cannot resurrect a member');
  owner.setUid('fakeuser-B');
  callback('SIGNED_IN',{id:'fakeuser-B'});requests[3].resolve({user:{id:'fakeuser-B'}});
  await flush();
  favorites[1].resolve(true);syncs[1].resolve({ok:true});
  await flush();
  check(owner.store.identity().uid==='fakeuser-B'&&paints.length===1&&paints[0]===true,'current B favorite can render');
  check(win.WBReadingSyncStatus==='ok','current B sync status can render');
}

function makeDeleteHarness(options={}){
  const owner=mockOwner();owner.store.setIdentity('member','fakeuser-A');
  const verify=options.verify||(()=>Promise.resolve({user:{id:'fakeuser-A'}}));
  const rpc=options.rpc||(()=>Promise.resolve({error:null}));
  let rpcCalls=0,signOutCalls=0,guestPaints=0,clears=[];
  const A={
    getVerifiedUser:verify,getClient:()=>({rpc:()=>{rpcCalls++;return rpc();}}),
    signOut:async()=>{signOutCalls++;owner.setUid(null);return {error:null}}
  };
  const localProfile=()=>owner.getUid()?{id:owner.getUid()}:null;
  const storage={removeItem:()=>{}};
  const card={querySelector:()=>({disabled:false})};
  const factory=new Function('A','localProfile','window','card','prompt','setNote','localStorage','ME_KEY','renderGuest',
    'var busy=false;\n'+memberGuard+'\n'+memberDelete+
    '\nreturn {deleteAccount};');
  const notes=[];
  const handler=factory(A,localProfile,{WBReadingStore:owner.store},card,()=> '刪除',(msg)=>notes.push(msg),storage,'wb:me',()=>guestPaints++);
  return {...handler,...owner,getRpcCalls:()=>rpcCalls,getSignOutCalls:()=>signOutCalls,getGuestPaints:()=>guestPaints,notes,clears};
}
async function testDelete(){
  const wait=deferred();
  const a=makeDeleteHarness({verify:()=>wait.promise});
  const t=a.deleteAccount();
  a.setUid('fakeuser-B');
  wait.resolve({user:{id:'fakeuser-A'}});
  await t;
  check(a.getRpcCalls()===0,'owner switch during account verification blocks delete RPC');
  check(a.getSignOutCalls()===0,'stale verification does not sign out new B');

  const waitRpc=deferred();
  const b=makeDeleteHarness({rpc:()=>waitRpc.promise});
  const deleting=b.deleteAccount();
  await flush();
  check(b.getRpcCalls()===1,'verified A can start authorized deletion');
  b.setUid('fakeuser-B');
  waitRpc.resolve({error:null});
  await deleting;
  check(b.getSignOutCalls()===0&&b.getGuestPaints()===0,
    'late deletion response cannot sign out or render over B');
}
async function main(){
  await testMember();
  await testCloud();
  await testDelete();
  console.log('T03 V2.2 actual-source async-race fake tests: '+checked+'/'+checked+' passed (offline).');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
