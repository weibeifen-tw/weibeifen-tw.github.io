'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync('assets/auth.js','utf8');
let uid='A', calls=[], reply={id:'A',name_changed_at:'fake'}, error=null, swap=false;
const client={auth:{getSession:async()=>({data:{session:uid?{user:{id:uid}}:null}})},
  from(){throw Error('direct profiles access forbidden');},
  async rpc(name,args){calls.push({name,args}); if(swap)uid='B';return {data:reply,error};}};
const ctx={window:{WB_AUTH_CONFIG:{publishableKey:'sb_publishable_fake'},supabase:{createClient:()=>client}},location:{origin:'http://localhost'}};
vm.runInNewContext(source,ctx);
const A=ctx.window.WBAuth;
(async()=>{
  assert.equal((await A.getMyProfile('A')).profile.id,'A');
  assert.equal(calls[0].name,'get_my_profile');
  assert.equal(calls[0].args.p_expected_uid,'A');
  assert.equal((await A.updateMyProfile({display_name:'甲',username:'ABC',bio:'  x  ',avatar_color:'blue',id:'B'},'A')).profile.id,'A');
  assert.equal(calls[1].name,'update_my_profile');
  assert.equal(calls[1].args.p_username,'abc');
  assert.equal(calls[1].args.p_bio,'x');
  assert.deepEqual(Object.keys(calls[1].args).sort(),['p_avatar_color','p_bio','p_display_name','p_expected_uid','p_username']);
  uid='B';let n=calls.length;
  assert.equal((await A.updateMyProfile({},'A')).profile,null);assert.equal(calls.length,n);
  uid='A';reply={id:'B'};assert.equal((await A.getMyProfile('A')).profile,null);
  reply={id:'A'};swap=true;assert.equal((await A.getMyProfile('A')).profile,null);
  swap=false;uid='A';error={code:'42501',message:'denied'};assert.ok((await A.updateMyProfile({},'A')).error);
  uid=null;n=calls.length;assert.equal((await A.getMyProfile('A')).profile,null);assert.equal(calls.length,n);
  console.log('G01 mock client: RPC-only, owner assertion, response mismatch, account switch, error and guest checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
