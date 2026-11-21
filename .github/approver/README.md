# 核准者公鑰（可信核准基準）

`allowed_signers` 只能放**站長本人的 SSH 公鑰**（私鑰永遠不進 repo）。Claude 與任何自動化都不能代簽。
格式（一行）：`站長的email namespaces="git" ssh-ed25519 AAAA...`

核准一篇文章或一個歷史版本（站長在自己電腦執行）：

```
git tag -s ind/IND-1-01-03/v1.0 -m "article_id: IND-1-01-03
version: v1.0
body_sha256: <驗證腳本印出的指紋>" <要核准的 commit>
git push origin ind/IND-1-01-03/v1.0
```
（git 需先設定 `gpg.format ssh`、`user.signingkey ~/.ssh/<你的金鑰>.pub`）

檢查：`ruby .github/scripts/verify_approvals.rb . --strict`。建議在 GitHub 設定 tag 保護規則（ind/*），避免被刪改。
