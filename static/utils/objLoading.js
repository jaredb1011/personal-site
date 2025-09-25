import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
// import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// export async function loadOBJGeometry(url) {
//   const loader = new OBJLoader();
//   return new Promise((resolve, reject) => {
//     loader.load(
//       url,
//       (obj) => {
//         // OBJLoader returns a Group; we need to extract the geometry
//         const geometry = [];
//         // let geometry = null;
//         obj.traverse((child) => {
//           if (child.isMesh && child.geometry) {
//             geometry.push(child.geometry);
//             console.log('added geometry')
//             // geometry = child.geometry;
//           }
//         });
//         if (geometry) {
//           resolve(mergeGeometries(geometry));
//         } else {
//           reject(new Error('No geometry found in OBJ file'));
//         }
//       },
//       undefined, // onProgress (optional)
//       (error) => reject(error)
//     );
//   });
// }

export async function loadOBJ(url) {
  const loader = new OBJLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (obj) => {
        // Optionally traverse to perform any adjustments, like scaling or positioning
        // obj.traverse((child) => { ... });
        if (obj.children.length > 0) {
          resolve(obj);  // Return the Group as-is
        } else {
          reject(new Error('No content found in OBJ file'));
        }
      },
      undefined,  // onProgress (optional)
      (error) => reject(error)
    );
  });
}

export async function applyMaterialToObjMesh(objMesh, customMaterial) {
  objMesh.traverse((child) => {
    if (child.isMesh) {
      child.material = customMaterial;
      child.material.needsUpdate = true;
    }
  });
};