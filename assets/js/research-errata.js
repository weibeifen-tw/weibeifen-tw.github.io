/* Disabled until staging RLS acceptance and owner-approved release. */
(function(){
'use strict';
var ENABLED=false;
if(!ENABLED)return;
var store=window.WBReadingStore, section=document.querySelector('.research-errata'), admin=document.querySelector('.research-errata-admin');
function node(tag,text){var e=document.createElement(tag);if(text)e.textContent=text;return e;}
function same(owner){var n=store.identity();return n.state==='member'&&n.uid===owner.uid&&n.version===owner.version;}
async function verified(owner){var A=window.WBAuth;if(!A||!same(owner))return null;var v=await A.getVerifiedUser();return same(owner)&&v.user&&v.user.id===owner.uid?A:null;}
if(section&&store){
var form=section.querySelector('form'),ta=form.querySelector('textarea'),button=form.querySelector('button'),msg=form.querySelector('[role=status]');
function reset(){form.hidden=store.identity().state!=='member';ta.value='';msg.textContent='';}
store.onChange(reset);reset();
form.addEventListener('submit',async function(e){e.preventDefault();var owner=store.identity(),body=ta.value.trim();if(!body||body.length>2000)return;button.disabled=true;try{var A=await verified(owner);if(!A)return;var r=await A.getClient().from('research_errata_reports').insert({article_id:section.dataset.article,article_version:section.dataset.version,body:body});if(!same(owner))return;if(r.error)throw Error('submit');ta.value='';msg.textContent='已提交，待人工審核。';}catch(e){if(same(owner))msg.textContent='提交失敗，請稍後再試。';}finally{button.disabled=false;}});
}
if(admin&&store){
var refresh=admin.querySelector('button'),list=admin.querySelector('.errata-admin-list'),generation=0;
store.onChange(function(){generation++;list.textContent='';admin.hidden=true;});
async function load(){var owner=store.identity(),ticket=++generation;list.textContent='';try{var A=await verified(owner);if(!A||!await A.isAdmin()||!same(owner)||ticket!==generation)return;var r=await A.getClient().from('research_errata_reports').select('id,article_id,article_version,body,created_at,status').eq('status','pending').order('created_at').limit(100);if(!same(owner)||ticket!==generation)return;if(r.error)throw Error('read');(r.data||[]).forEach(function(row){var box=node('section');box.appendChild(node('h3',row.article_id+'・'+row.article_version));box.appendChild(node('p',row.body));['confirmed','rejected'].forEach(function(state){var b=node('button',state==='confirmed'?'確認':'駁回');b.type='button';b.onclick=async function(){if(!same(owner)||ticket!==generation)return;b.disabled=true;try{var auth=await verified(owner);if(!auth||!await auth.isAdmin()||!same(owner))return;var result=await auth.getClient().from('research_errata_reports').update({status:state,reviewed_at:new Date().toISOString()}).eq('id',row.id).eq('status','pending').select('id');if(!same(owner))return;if(result.error||!result.data||result.data.length!==1)throw Error('review');load();}catch(e){if(same(owner))list.appendChild(node('p','審核失敗，請重新確認。'));}finally{b.disabled=false;}};box.appendChild(b);});list.appendChild(box);});}catch(e){if(same(owner)&&ticket===generation)list.textContent='暫時無法讀取回報。';}}
refresh.onclick=load;admin.hidden=false;
}
})();
