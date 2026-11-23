import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const js=fs.readFileSync("assets/admin.js","utf8");
const css=fs.readFileSync("assets/css/admin.css","utf8");
const members=js.slice(js.indexOf("/* ---------- 會員列表"),js.indexOf("/* ---------- 人氣："));
test("desktop table and its original fields survive",()=>{
 assert.match(members,/ad-table ad-members-desktop/);
 for(const field of ["顯示名稱","帳號名稱","角色","加入時間","留言","狀態"]) assert.ok(members.includes(field),field);
});
test("same protected admin RPC endpoints; no direct table writes",()=>{
 for(const endpoint of ["admin_member_list","admin_ban","admin_unban"])assert.ok(members.includes(endpoint),endpoint);
 assert.doesNotMatch(members,/\.from\(['"](?:profiles|user_roles|banned_users|comments)['"]\)/);
});
test("mobile cards exclude admin ban controls",()=>{
 assert.match(members,/if\(r\.role!=='admin'\)/);
 assert.match(members,/ad-member-manage/);
 assert.match(members,/ad-member-sheet-layer/);
});
test("safe member management workflow",()=>{
 for(const name of ["aria-modal","aria-labelledby","keydown","Escape","Tab","window.confirm","p_remove_comments","remove.checked=false","loadMembers();","errMsg(err)"])assert.ok(members.includes(name),name);
 assert.match(members,/result\.error/);
});
test("mobile breakpoint and protected desktop presentation",()=>{
 assert.match(css,/@media\s*\(max-width:767px\)/);
 assert.match(css,/@media\s*\(min-width:768px\)/);
 assert.match(css,/\.ad-members-desktop\{display:none\}/);
 assert.match(css,/\.ad-member-cards\{display:none\}/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/max-height:85dvh/);
});
