from PIL import Image
import sys
import os

src = os.path.join('frontend','web','public','images','logo.png')
if not os.path.exists(src):
    print(f"Source logo not found: {src}")
    sys.exit(1)

img = Image.open(src).convert('RGBA')
# create sizes
sizes = [(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)]
icons = []
for s in sizes:
    icon = img.copy()
    icon = icon.resize(s, Image.LANCZOS)
    icons.append(icon)

out_path = os.path.join('frontend','web','public','favicon.ico')
# Pillow can save .ico with multiple sizes by passing a list of sizes
# Save the largest as base and include sizes
icons[0].save(out_path, format='ICO', sizes=[s for s in sizes])
print(f"Wrote {out_path}")
