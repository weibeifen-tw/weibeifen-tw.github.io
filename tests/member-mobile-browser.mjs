import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const admin = fs.readFileSync("assets/admin.js","utf8");
const css = fs.readFileSync("assets/style.css","utf8") + "\n" + fs.readFileSync("assets/css/admin.css","utf8");
const people = [
 {id:"11111111-1111-4111-8111-111111111111",display_name:"哲",username:"yeeeee",role:"reader",created_at:"2026-11-22T14:54:00Z",comments:1,banned:false,avatar_color:"#debd73"},
 {id:"22222222-2222-4222-8222-222222222222",display_name:"柚",username:null,role:"reader",created_at:"2026-11-20T03:21:00Z",comments:1,banned:false},
 {id:"33333333-3333-4333-8333-333333333333",display_name:"鯉",username:"chou_yu",role:"reader",created_at:"2026-11-20T02:11:00Z",comments:5,banned:true,ban_reason:"測試原因"},
 {id:"44444444-4444-4444-8444-444444444444",display_name:"非常長的中文會員顯示名稱",username:"very_long_name_with_12345678",role:"reader",created_at:"2026-11-19T23:59:00Z",comments:0,banned:false},
 {id:"55555555-5555-4555-8555-555555555555",display_name:"畝 MU",username:"muu",role:"admin",created_at:"2026-11-19T21:55:00Z",comments:0,banned:false}
];
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>
<main class="wrap"><div class="admin-page">
<section class="novel page-box mb-box"><h1>管理後台</h1><p class="ad-status"></p><div class="ad-tabs"><button type="button" data-tab="members">會員</button></div></section>
<section class="novel page-box mb-box ad-panel" data-panel="members" hidden></section></div></main>
<script id="novels" type="application/json">{}</script><script id="posts-map" type="application/json">{}</script>
<script>
window.__calls=[];
window.__members=${JSON.stringify(people)};
window.WBAuth={
 configProblem:()=>null,
 getVerifiedUser:async()=>({user:null,error:"測試登入停用"}),
 isAdmin:async()=>false,
 getClient:()=>({rpc:async(name,args)=>{
   window.__calls.push({name,args});
   if(name==="admin_member_list")return {data:window.__members.map(m=>({...m})),error:null};
   if(name==="admin_ban"||name==="admin_unban"){
     const m=window.__members.find(x=>x.id===args.p_user);
     if(!m||m.role==="admin")return {error:{message:"not_allowed"}};
     m.banned=name==="admin_ban";
     return {error:null};
   }
   return {data:null,error:{message:"other_rpc_disabled"}};
 }})
};
window.WBAvatar={make:(user)=>{const e=document.createElement("span");e.className="cm-av";e.textContent=(user.name||"?").slice(0,1);return e;}};
</script><script src="/assets/admin.js"></script></body></html>`;
const browser = await chromium.launch({headless:true});
try {
  for (const width of [320,375,390,430,768,1024,1440]) {
    const page=await browser.newPage({viewport:{width,height:850}});
    await page.route("**/*",route=>{
      if(route.request().url().endsWith("/assets/admin.js"))return route.fulfill({status:200,contentType:"application/javascript",body:admin});
      if(route.request().url().endsWith("/admin/"))return route.fulfill({status:200,contentType:"text/html",body:html});
      return route.abort();
    });
    await page.goto("https://member-example.test/admin/");
    await page.locator('[data-tab="members"]').click();
    await page.locator(".ad-member-card").first().waitFor({state:"attached"});
    const isMobile=width<=767;
    const cardDisplay=await page.locator(".ad-member-cards").evaluate(e=>getComputedStyle(e).display);
    const tableDisplay=await page.locator(".ad-members-desktop").evaluate(e=>getComputedStyle(e).display);
    assert.equal(cardDisplay==="none",!isMobile,"card visibility at "+width);
    assert.equal(tableDisplay==="none",isMobile,"table visibility at "+width);
    const dimensions=await page.evaluate(()=>({actual:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
    assert.ok(dimensions.actual<=dimensions.viewport+1, "horizontal overflow at "+width+": "+JSON.stringify(dimensions));
    if(isMobile){
      assert.equal(await page.locator(".ad-member-card").count(),5);
      assert.equal(await page.locator(".ad-member-manage").count(),4,"admin has no management button");
      const button=page.locator(".ad-member-manage").first();
      await button.click();
      const dialog=page.locator('[role="dialog"]');
      await dialog.waitFor();
      assert.equal(await dialog.getAttribute("aria-modal"),"true");
      assert.equal(await page.locator(".ad-member-remove-label input").isChecked(),false);
      await page.keyboard.press("Escape");
      assert.equal(await dialog.count(),0,"Escape should close");
      assert.equal(await button.evaluate(e=>document.activeElement===e),true,"focus restored");
      if(width===390){
        page.on("dialog",d=>d.accept());
        await button.click();
        await page.locator(".ad-member-remove-label input").check();
        await page.locator(".ad-member-confirm").click();
        await page.locator(".ad-member-card").first().waitFor();
        const calls=await page.evaluate(()=>window.__calls.filter(c=>c.name==="admin_ban"));
        assert.equal(calls.length,1);
        assert.equal(calls[0].args.p_remove_comments,true,"removal only when checked");
      }
    }
    await page.close();
    console.log("OK responsive",width);
  }
} finally {
  await browser.close();
}
