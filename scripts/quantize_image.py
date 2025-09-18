import numpy as np
from PIL import Image
from scipy.spatial import KDTree

# Step 1: Load the image (replace 'input.jpg' with your file)
filename = '/home/jared/projects/jboggs-personal-site/static/geodata/st_mary_valley_satellite'
fileext = '.png'
img = Image.open(f'{filename}{fileext}').convert('RGB')
pixels = np.array(img)  # Shape: (H, W, 3), values 0-255

# Step 2: Define your palette as a list of (R, G, B) tuples (0-255)
# Example: A simple 8-color palette (you can use any, e.g., from Adobe or custom)
palette_rgb = [
    (88, 99, 56),
    (156, 136, 94),
    (35, 77, 89),
    (203, 187, 163),
    (160, 106, 104),
    (54, 72, 49),
    (143, 130, 113),
    (65, 60, 31),
    (90, 7, 33)
]
palette = np.array(palette_rgb)  # Shape: (n_colors, 3)

# Step 3: Build KDTree for fast nearest-neighbor search
tree = KDTree(palette)

# Flatten image pixels for querying
flat_pixels = pixels.reshape(-1, 3)  # Shape: (H*W, 3)

# Query nearest palette index for each pixel
distances, indices = tree.query(flat_pixels)

# Step 4: Map indices back to palette colors
quantized_pixels = palette[indices].reshape(pixels.shape)

# Step 5: Convert back to image and save
quantized_img = Image.fromarray(quantized_pixels.astype(np.uint8))
out_filename = f'{filename}_quantized.jpg'
quantized_img.save(out_filename)
print(f"Quantized image saved as '{out_filename}'")
