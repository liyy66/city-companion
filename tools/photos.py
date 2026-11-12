import base64, io, json, os, sys
from PIL import Image

src = json.load(open('data/_photos.json', encoding='utf-8'))
os.makedirs('data/photos', exist_ok=True)
total_in = total_out = 0
for item in src:
    b64 = item['b64']
    if b64.startswith('data:'):
        b64 = b64.split(',', 1)[1]
    raw = base64.b64decode(b64)
    total_in += len(raw)
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    w, h = im.size
    if w > 760:
        im = im.resize((760, max(1, round(h * 760 / w))), Image.LANCZOS)
    out = os.path.join('data', item['file'])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out, 'WEBP', quality=62, method=6)
    total_out += os.path.getsize(out)
print(f'photos {len(src)}  in {total_in/1e6:.1f}MB -> out {total_out/1e6:.2f}MB')
