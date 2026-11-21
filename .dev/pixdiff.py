# 像素回歸：比對兩個截圖資料夾，列出不同的檔案與差異像素比例。用法：python3 pixdiff.py <舊> <新>
import sys,os
from PIL import Image,ImageChops
a,b=sys.argv[1:3];bad=0
for f in sorted(os.listdir(a)):
  if not f.endswith('.png') or not os.path.exists(os.path.join(b,f)): continue
  x=Image.open(os.path.join(a,f)).convert('RGB');y=Image.open(os.path.join(b,f)).convert('RGB')
  if x.size!=y.size: print('SIZE',f,x.size,y.size);bad+=1;continue
  d=ImageChops.difference(x,y).getbbox()
  if d:
    px=sum(1 for p in ImageChops.difference(x,y).convert('L').getdata() if p>16)
    print('DIFF',f,d,f'{px/(x.size[0]*x.size[1])*100:.2f}%');bad+=1
print('total diffs',bad)
