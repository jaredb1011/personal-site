import rasterio 

with rasterio.open('./static/models/st_mary_valley_terrain.tif') as src:
    width = src.width
    height = src.height
    print(f"Width: {width}, Height: {height}")

