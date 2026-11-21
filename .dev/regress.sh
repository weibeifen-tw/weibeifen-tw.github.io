#!/bin/bash
# 回歸比對：忽略 ?v=時間戳與 window.VER，列出內容真的有變的檔案。用法：regress.sh <基準輸出> <新輸出>
A=$1; B=$2
diff -rq "$A" "$B" 2>/dev/null | while read -r l; do
  if [[ $l == Files* ]]; then f1=$(echo "$l"|awk '{print $2}'); f2=$(echo "$l"|awk '{print $4}')
    if ! diff -q <(sed -E 's/(v=|VER = ")[0-9]{9,}/\1X/g' "$f1") <(sed -E 's/(v=|VER = ")[0-9]{9,}/\1X/g' "$f2") >/dev/null; then echo "CHANGED ${f1#$A}"; fi
  else echo "$l"; fi
done
