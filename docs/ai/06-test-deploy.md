# 06 測試、部署與維護
- 測試尺寸：320、360、390、430、767、768、820、1023、1024、1280、1440、1920。
- 效能目標：LCP ≤2.5 s、INP ≤200 ms、CLS ≤0.1、Lighthouse 90+；改版前後同條件比較，實驗室與真實數據分開記，量不到就寫量不到。
- 部署：`.github/workflows/deploy-pages.yml`（Pages Source＝GitHub Actions）在 main 推送、手動、或「排程發章」完成後執行；研究驗證或簽章不通過就不部署。合併前另有「建置檢查」。
- 其他 workflow：supabase-keepalive（每 3 天）、schedule-chapters（只能手動執行；站長決定何時發章）。Threads 自動發文已退役（workflow 已移除），脆由站長手動發。
- 備份：每週手動匯出（後台「統計」）；每日／每月政策缺口保留待解決。
