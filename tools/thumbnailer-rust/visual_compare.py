from PIL import Image
import numpy as np
from skimage.metrics import structural_similarity as ssim
from skimage.metrics import peak_signal_noise_ratio as psnr


def _to_gray(arr):
    if arr.ndim == 3:
        # convert RGB to luminance
        return np.dot(arr[..., :3], [0.2989, 0.5870, 0.1140])
    return arr


def compare_images(ref_path, thumb_path):
    ref = Image.open(ref_path).convert('RGB')
    th = Image.open(thumb_path).convert('RGB')
    ref_a = np.asarray(ref).astype(np.float32)
    th_a = np.asarray(th).astype(np.float32)

    # ensure same shape
    if ref_a.shape != th_a.shape:
        th_a = np.array(Image.fromarray(th_a.astype('uint8')).resize((ref_a.shape[1], ref_a.shape[0]), Image.LANCZOS)).astype(np.float32)

    ref_gray = _to_gray(ref_a)
    th_gray = _to_gray(th_a)

    s = ssim(ref_gray, th_gray, data_range=ref_gray.max() - ref_gray.min())
    p = psnr(ref_gray, th_gray, data_range=ref_gray.max() - ref_gray.min())
    return float(s), float(p)


def make_side_by_side(ref_path, thumb_path, out_path):
    ref = Image.open(ref_path).convert('RGB')
    th = Image.open(thumb_path).convert('RGB')
    # resize thumbnails to match ref height
    if ref.size != th.size:
        th = th.resize(ref.size, Image.LANCZOS)

    # canvas: ref | thumb
    w, h = ref.size
    canvas = Image.new('RGB', (w * 2, h))
    canvas.paste(ref, (0, 0))
    canvas.paste(th, (w, 0))
    canvas.save(out_path)