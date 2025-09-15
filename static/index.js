import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { terrainVertexShader, terrainFragShader } from './shaders/terrain_shader.js';

// loaded GeoTIFF directly as a script in the HTML


// VISUAL PARAMETERS
const TERRAIN_WIDTH = 2000;
const TERRAIN_POINT_SIZE_RATIO = 1/2000;
const TERRAIN_POINT_COLOR = 0x52bbcc;

// Geo data functions ---------
async function loadGeoTIFF(file){
    // conv raw filedata into tiff format
    const response = await fetch(file);
    const arrayBuffer = await response.arrayBuffer();
    const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
    // read rasters from data
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    const elevationData = rasters[0]; 
    const width = image.getWidth();
    const length = image.getHeight();
    // extract resolution (pixel size in real-world units)
    const resolution = await image.getResolution();
    const origin = await image.getOrigin(); // [xOrigin, yOrigin]
    const geoKeys = await image.getGeoKeys(); // Projection info

    let pixelSizeX = Math.abs(resolution[0]);
    let pixelSizeY = Math.abs(resolution[1]);

    // Override with assumed 20m if projected but resolution tiny
    if (geoKeys.GTModelTypeGeoKey === 2 && pixelSizeX < 0.001) {
        pixelSizeX = 20;  // Assume 1-arc-second (~20m at this latitude)
        pixelSizeY = 20;
        console.log(`Overriding tiny resolution with assumed 20m x 20m`);
    }

    console.log(`Width: ${width}, Height: ${length}`);
    console.log(`Pixel Resolution: ${pixelSizeX}m x ${pixelSizeY}m`);
    console.log(`Origin: ${origin}`);
    console.log(`GeoKeys:`, geoKeys);
    return { elevationData, width, length, pixelSizeX, pixelSizeY, origin, geoKeys };
}

async function genTerrainMesh(terrainData) {

    const { elevationData:terrainElevationData, width:terrainWidth, length:terrainLength, pixelSizeX, pixelSizeY, origin, geoKeys } = terrainData;

    // real world dimensions
    const realWidth = terrainWidth * pixelSizeX;
    const realLength = terrainLength * pixelSizeY;
    console.log(`Real Extents: ${realWidth}m wide x ${realLength}m long`);
    const aspectRatio = realLength / realWidth;

    // create initial flat plane with correct # of vertices
    const terrainGeo = new THREE.PlaneGeometry(
        TERRAIN_WIDTH,  // scaled width
        TERRAIN_WIDTH * aspectRatio,  // scaled length 
        terrainWidth-1, // width segments
        terrainLength-1 // length segments
    );
    terrainGeo.rotateX(-Math.PI / 2);

    // uniform scale factor
    const horizontalScale = TERRAIN_WIDTH / realWidth;
    const verticalExaggeration = 1.0; // adjust this for dramatic elevation 
    
    // offset vertex data by elevation
    const terrainVertices = terrainGeo.attributes.position.array;
    const jitterAmount = 7 * horizontalScale;
    for (let i = 0; i < terrainElevationData.length; i++) {
        // geometry vertex data has x,y,z components so need to skip 3
        // elements to get to the next vertex (i*3)
        const vertexIndex = i*3;  

        // apply jitter to mitigate moire effect from perfect grid alignment
        terrainVertices[vertexIndex]   += (Math.random() - 0.5) * jitterAmount*2; // x jitter
        terrainVertices[vertexIndex+2] += (Math.random() - 0.5) * jitterAmount*2; // z jitter 

        // offset Y value by elevation data
        terrainVertices[vertexIndex+1] = (terrainElevationData[i] || 0) * horizontalScale * verticalExaggeration;
    }
    terrainGeo.attributes.position.needsUpdate = true;
   
    // compute normals 
    // this will only be needed if using lighting/advanced texture later
    //terrainGeo.computeVertexNormals();

    // terrain point shader
    const shaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
            pointSize: { value: TERRAIN_POINT_SIZE_RATIO * TERRAIN_WIDTH},
            pointColor: { value: new THREE.Color(TERRAIN_POINT_COLOR) },
            pointBrightness: { value: 0.9 },
            time: { value: 0.0 }  // time uniform for animation
        },
        vertexShader: terrainVertexShader,
        fragmentShader: terrainFragShader,
        depthTest: true,
        depthWrite: true,
        blending: THREE.NormalBlending
    });

    // create points instead of mesh
    const points = new THREE.Points(terrainGeo, shaderMaterial);
    return points;
}

// START ----------

// load map data
const terrainTiffData = await loadGeoTIFF('static/models/st_mary_valley_terrain.tif');
const terrainMesh = await genTerrainMesh(terrainTiffData);

// Create a scene and camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    1,  // closer near plane
    15000  // slightly further far plane
);

// Create a renderer
const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ 
    canvas,
    antialias: true,
    logarithmicDepthBuffer: true,  // helps with depth precision
    powerPreference: "high-performance"
});
renderer.setPixelRatio(window.devicePixelRatio);  // important for point rendering
renderer.setSize(window.innerWidth, window.innerHeight);

// Map Control
const controls = new MapControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.zoomSpeed = 0.5
controls.rotateSpeed = 0.5
controls.panSpeed = 0.8;
controls.zoomToCursor = true;

// Configure controls for bird's eye view
controls.target.set(0, 0, 0);               // look at center of terrain
controls.minDistance = TERRAIN_WIDTH*0.05;  // allow closer zoom
controls.maxDistance = TERRAIN_WIDTH * 2;   // allow further zoom out
controls.maxPolarAngle = Math.PI / 2.8;     // Limit how low you can orbit (prevent seeing under terrain)
controls.minPolarAngle = 0;                 // Allow complete top-down view
controls.update();

// Position camera above terrain for initial bird's eye view
camera.position.set(
    TERRAIN_WIDTH/3,
    TERRAIN_WIDTH/3,
    TERRAIN_WIDTH/3
);

// Add terrain mesh
scene.add(terrainMesh);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update time uniform for shader animation
    terrainMesh.material.uniforms.time.value = performance.now() / 1000;  // Convert to seconds

    controls.update(); // required for controls.enableDamping = true
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the animation loop
animate();
