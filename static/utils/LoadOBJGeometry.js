import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'

export async function loadOBJGeometry(url) {
  const loader = new OBJLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (obj) => {
        // OBJLoader returns a Group; we need to extract the geometry
        let geometry = null;
        obj.traverse((child) => {
          if (child.isMesh && child.geometry) {
            geometry = child.geometry;
          }
        });
        if (geometry) {
          resolve(geometry);
        } else {
          reject(new Error('No geometry found in OBJ file'));
        }
      },
      undefined, // onProgress (optional)
      (error) => reject(error)
    );
  });
}
