// Utilities for loading fonts and generation 3D Text objects.
// Derived from three.js examples.
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';


// example parameters
// textParams = {
//     fontPath: /path/to/font,
//     size: 10,
//     depth: 5,
//     curveSegments: 15,
//     bevelThickness: 4,
//     bevelSize: 5,
//     bevelEnabled: true
// };

const loader = new FontLoader();

function __loadFontAsync(fontPath) {
    return new Promise((resolve, reject) => {
        loader.load(fontPath,
            ( font ) => {resolve( font );},
            ( prog ) => {console.debug( 'font' + (prog.loaded / prog.total * 100) + '% loaded' );},
            ( err )  => {reject( err );}
        );
    });
};

export async function createTextGeometry(textToWrite, textParams) {
    const loadedFont = await __loadFontAsync(textParams.fontPath); 
    
    console.debug(loadedFont);
    const textGeom = new TextGeometry( textToWrite, {
        font: loadedFont,
        size: textParams.size,
        depth: textParams.depth,
        curveSegments: textParams.curveSegments,
        bevelEnabled: false
    });
    textGeom.computeBoundingBox();
    return textGeom;
};

export function createTextMaterials(textColor) {
    const mainMaterial = new THREE.MeshBasicMaterial({
        color: textColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0
    });
    const sideMaterial = new THREE.MeshBasicMaterial({
        color: textColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0
    });
    return [mainMaterial, sideMaterial];
};
