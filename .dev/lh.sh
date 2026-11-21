#!/bin/bash
# Lighthouse 實驗室量測（行動版模擬節流、gzip 本機伺服器）。用法：lh.sh <siteDir> <標籤> [路徑...]
D=$(cd "$(dirname "$0")" && pwd); SITE=$1; TAG=$2; shift 2; PORT=$((8800 + RANDOM % 100))
node "$D/serve.js" "$SITE" $PORT & SP=$!; sleep 1; mkdir -p /tmp/lh
for p in "${@:-/}"; do n=$(echo "$p" | tr '/.' '__')
  CHROME_PATH=/usr/bin/google-chrome npx --yes lighthouse "http://127.0.0.1:$PORT$p" --quiet --chrome-flags="--headless=new --no-sandbox" --only-categories=performance,accessibility --output=json --output-path=/tmp/lh/$TAG$n.json >/dev/null 2>&1
  python3 -c "
import json;d=json.load(open('/tmp/lh/$TAG$n.json'));a=d['audits'];c=d['categories']
print('$TAG','$p','perf',round(c['performance']['score']*100),'a11y',round(c['accessibility']['score']*100),'LCP',a['largest-contentful-paint'].get('displayValue'),'CLS',a['cumulative-layout-shift'].get('displayValue'),'TBT',a['total-blocking-time'].get('displayValue'),'size',a['total-byte-weight'].get('displayValue'))"
done; kill $SP
