# 原住民族專書：正式上線計畫（2026-11-22）

## 現況
- 部署：GitHub Pages「從 main 分支建置」，main 一有 commit 就上線，沒有任何檢查。main 沒有分支保護。
- 小說排程：`.github/workflows/schedule-chapters.yml` 每天台灣 07:53 用內建權杖把到期章節推上 main，再呼叫舊式 Pages 重建 API。
- 研究驗證：`build-check` 在 main／PR 跑 strict，但只是檢查，擋不住部署。

## 發布關卡設計（不改小說排程）
- 關卡＝部署前驗證：研究文章與歷史版本必須有站長 SSH 簽章的核准 tag（`verify_approvals.rb --strict`），不通過就整次不部署、網站維持舊版。
- 為什麼不用「main 必須走 PR」：排程發章直接推 main，開了會被擋；而且任何分支推上去都已經公開，PR 擋不住曝光，只擋得住部署。
- 為什麼要改用 GitHub Actions 部署：舊式建置不會跑驗證。
- 排程發章的相依：改用 Actions 部署後，它的「重建 API」會失效、內建權杖的推送也不會觸發部署 → `deploy-pages.yml` 以 `workflow_run` 監聽「排程發章」完成後部署。schedule-chapters.yml 一行都不用改。

## 上線步驟
| 順序 | 事項 | 誰 |
|---|---|---|
| 1 | 產生自己的 SSH 簽章金鑰（私鑰留在自己電腦），把**公鑰**那一行給 Claude，或自己寫進 `.github/approver/allowed_signers` | 站長 |
| 2 | 核准合併 `feat/research-ind-dev` → main（此時還沒有研究文章，網站只多出專書首頁「籌備中」） | 站長核准，Claude 執行 |
| 3 | 把 `docs/research/deploy-pages.yml.example` 啟用為 `.github/workflows/deploy-pages.yml` | 站長核准，Claude 執行 |
| 4 | Settings → Pages → Build and deployment → Source 改「GitHub Actions」 | 站長 |
| 5 | Actions 頁手動執行一次「排程發章」與「部署網站」，確認網站正常、章節照常上線 | 站長按，Claude 協助看結果 |
| 6 | Settings → Rules → Rulesets：main「禁止強制推送、禁止刪除」（不擋排程）；tag `ind/*`「只有站長能建立／更新／刪除」 | 站長 |
| 7 | （選）Settings → Environments → github-pages → Required reviewers：每次部署都要按核准。會讓每天的排程章節也要等你按，**不建議** | 站長決定 |
| 8 | 在 `_data/indigenous_book.yml` 填已核准公開的專書介紹與卷名 | 站長提供文字，Claude 寫入 |
| 9 | 第一篇文章：驗收報告 → 站長核准 → 站長簽 tag 並推送 → 合併 → 部署時自動驗簽 | 站長＋Claude |

## 回退（依實際提交與部署方式）
- 研究分支合併是 `--no-ff` 合併 commit：先確認它的第 1 個父節點是合併前的 main，再 `git revert -m 1 <合併 commit>`；之後有其他 commit 改到同檔案就先處理衝突。已在獨立複本實測：revert 後與合併前 main 完全相同。
- 步驟 3、4 的回退：把 Pages Source 改回「Deploy from a branch（main）」並刪掉 deploy-pages.yml，排程發章即恢復原本的重建方式。
- 開發前備份：`backup/pre-research-ind-20261122`（＝bce5093）。
- 回退≠撤回：牽涉敏感內容時改走撤回程序（設計文件第 5 節）。
