from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import textwrap
import os

md_path = os.path.join('docs','DEPLOYMENT_APPENDIX.md')
if not os.path.exists(md_path):
    print(f"Source markdown not found: {md_path}")
    exit(1)

with open(md_path, 'r', encoding='utf-8') as f:
    text = f.read()

lines = text.splitlines()

out_pdf = os.path.join('docs','DEPLOYMENT_APPENDIX.pdf')
c = canvas.Canvas(out_pdf, pagesize=letter)
width, height = letter
margin = 50
y = height - margin
max_width = width - margin*2

c.setFont('Helvetica-Bold', 14)
if lines:
    c.drawString(margin, y, lines[0][:80])
    y -= 24
c.setFont('Helvetica', 10)

wrapper = textwrap.TextWrapper(width=100)
for line in lines[1:]:
    if y < margin + 40:
        c.showPage()
        c.setFont('Helvetica', 10)
        y = height - margin
    wrapped = wrapper.wrap(line)
    for wline in wrapped:
        c.drawString(margin, y, wline)
        y -= 12

c.save()
print(f"Wrote {out_pdf}")
