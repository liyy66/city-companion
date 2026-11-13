from pypdf import PdfReader
import sys

path = r'D:\Downloads\第二届全国人工智能应用创新大赛作品提交说明 .pdf'
reader = PdfReader(path)
out = []
for i, page in enumerate(reader.pages):
    out.append('--- p%d ---' % (i + 1))
    out.append(page.extract_text() or '')
text = '\n'.join(out)
sys.stdout.write(text)
open(r'C:\Users\td\Desktop\anxin-trip\data\_submission_rules.txt', 'w', encoding='utf-8').write(text)
