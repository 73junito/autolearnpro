from PIL import Image
import os
os.makedirs('sample_images', exist_ok=True)
for i in range(20):
    img = Image.new('RGB',(1920,1080),(i*10%256,i*5%256,i*3%256))
    img.save(f'sample_images/img_{i:03}.png')
print('generated sample_images')
