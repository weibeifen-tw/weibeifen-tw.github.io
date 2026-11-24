/* T03 isolated preview: static local-only fake users. No API, fetch, or real authentication. */
(function(){
'use strict';
const store=window.WBReadingStore;
const SESSION='sb-tqicconarhpddejxdvmf-auth-token';
const prefix='wb:v2:';
const novel='preview-demo';
const page='/preview/sample/';
const $=id=>document.getElementById(id);
const names={guest:'訪客',member:'假會員',unknown:'身分未驗證'};
function changeIdentity(mode){
  if(mode==='guest'){
    localStorage.removeItem(SESSION);
    store.setIdentity('guest');
  }else if(mode==='unknown'){
    localStorage.setItem(SESSION,JSON.stringify({user:{id:'fakeuser-A'},refresh_token:'mock-only'}));
    store.setIdentity('unknown');
  }else{
    const uid=mode==='a'?'fakeuser-A':'fakeuser-B';
    localStorage.setItem(SESSION,JSON.stringify({user:{id:uid},refresh_token:'mock-only'}));
    store.setIdentity('unknown');
    // Local synthetic verification only: NEVER contact an identity provider.
    store.setIdentity('member',uid);
  }
  render();
}
function render(){
  const i=store.identity();
  $('identity').textContent=i.state==='member'?names.member+' '+(i.uid==='fakeuser-A'?'A':'B'):names[i.state];
  const r=store.listLast()[novel];
  $('progress').textContent=r?'最後閱讀：'+r.title+'（'+r.no+'）':'尚無閱讀紀錄';
  $('mark').textContent=store.read('read',page)==='1'?'已讀':'未讀';
  $('pos').textContent='位置：'+(store.read('pos',page)||'無');
}
function clearCurrent(){
  const i=store.identity();
  if(i.state==='unknown')return;
  const namespace=i.state==='member'?'member:'+i.uid+':':'guest:';
  for(const k of [prefix+namespace+'last:'+novel,prefix+namespace+'pos:'+page,prefix+namespace+'read:'+page])localStorage.removeItem(k);
  render();
}
function verifyIsolation(){
  const result=[];
  const previous=localStorage.getItem(SESSION);
  const previousIdentity=store.identity();
  function test(ok,msg){result.push((ok?'通過':'失敗')+' · '+msg)}
  const keys=[];
  try{
    for(const [who,uid] of [['a','fakeuser-A'],['b','fakeuser-B']]){
      changeIdentity(who);
      const sentinel='隔離測試-'+who;
      const k=prefix+'member:'+uid+':last:preview-test';
      keys.push(k);
      localStorage.setItem(k,sentinel);
    }
    changeIdentity('a');
    test(store.read('last','preview-test')==='隔離測試-a','A 只能讀取 A 的測試記錄');
    changeIdentity('b');
    test(store.read('last','preview-test')==='隔離測試-b','B 只能讀取 B 的測試記錄');
    changeIdentity('guest');
    test(store.read('last','preview-test')===null,'訪客不能讀取會員記錄');
    changeIdentity('unknown');
    test(store.read('last','preview-test')===null && !store.syncKey(),'身分未驗證時無會員進度和同步鍵');
    const scripts=Array.from(document.querySelectorAll('script[src]'),s=>s.getAttribute('src')||'');
    test(scripts.some(src=>/^(?:\.\/|\/)reading-store\.js$/.test(src)) &&
      scripts.some(src=>/^(?:\.\/|\/)preview\.js$/.test(src)),
      '預覽所需的兩個本地 JS 均已載入（不計瀏覽器或託管服務額外程式）');
  }finally{
    for(const k of keys)localStorage.removeItem(k);
    if(previous===null){localStorage.removeItem(SESSION);store.setIdentity('guest')}
    else{
      localStorage.setItem(SESSION,previous);
      if(previousIdentity.state==='member'){store.setIdentity('unknown');store.setIdentity('member',previousIdentity.uid)}
      else store.setIdentity(previousIdentity.state);
    }
    render();
  }
  $('report').textContent=result.join('\n')+'\n'+result.filter(x=>x.startsWith('通過')).length+'/'+result.length+' 通過';
}
document.addEventListener('click',function(e){
  const button=e.target.closest('button[data-action]');
  if(!button)return;
  const action=button.dataset.action;
  if(['guest','unknown','a','b'].includes(action))changeIdentity(action);
  else if(action==='read'){
    store.write('last',novel,JSON.stringify({url:page,no:'測試第 1 章',title:'示範章節',t:Date.now()}));
    store.write('pos',page,'0.65');render();
  }else if(action==='mark'){store.write('read',page,'1');render()}
  else if(action==='reset')clearCurrent();
  else if(action==='run-checks')verifyIsolation();
  else if(action==='clear-demo'){
    // Clear only keys belonging to this preview demo, never arbitrary localStorage keys.
    const toDelete=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith(prefix)&&((k.includes('preview-demo'))||(k.includes('/preview/sample/'))||(k.includes(':preview-test'))))toDelete.push(k);
    }
    toDelete.forEach(k=>localStorage.removeItem(k));
    localStorage.removeItem(SESSION);store.setIdentity('guest');render();$('report').textContent='已清除預覽假資料';
  }
});
store.onChange(render);
render();
})();