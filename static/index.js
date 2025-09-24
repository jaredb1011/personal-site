import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
// imported GeoTIFF directly as a script in the HTML
import { loadOBJGeometry } from './utils/LoadOBJGeometry.js';
import { objectPicker } from './utils/objectPicker.js';
import { terrainVertexShader, terrainImageFragShader, terrainColorFragShader } from './shaders/terrain_shader.js';
import { hoverDiskVertexShader, hoverDiskFragShader } from './shaders/hover_disk_shader.js';


// ---------- PARAMETERS ----------
// TERRAIN
const TERRAIN_WIDTH = 2000;              // world space size of terrain mesh
const TERRAIN_VERTEX_DENSITY = 0.3;      // if subsampling (< 1.0) then elevation data must be at least TERRAIN_WIDTH wide
const TERRAIN_VERTEX_JITTER = 10;        // the amount to randomly jitter vertices to reduce moire effect

const terrainDefaultParams = {
    pointSizeRatio: 0.0015,
    heightExaggeration: 1.0,
    pointBobAmplitude: 3.0,
    pointBobSpeed: 0.3,
    useSatelliteImage: true,
    pointColor: 0x52bbcc, // blue
    pointBrightness: 1
};

const borderDefaultParams = {
    borderWidth: 0.02, // percent of the terrain that should be edge border
    borderColor: 0xbefed6 // brownish orange
};

// BLOOM
const bloomDefaultParams = {
    threshold: 0.05,
    strength: 0.35,
    radius: 0.0
};


// MAP CONTROLS
const mapControlDefaultParams = {
    zoomSpeed: 0.8,
    rotateSpeed: 0.5,
    panSpeed: 0.8,
    minDistance: 0.03,
    maxDistance: 2.0,
    maxViewAngle: 2.8,
    minViewAngle: 0.0,
    zoomToCursor: true,
    controlDampingFactor: 0.05
};


// ---------- TERRAIN LOADING ----------  
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

   if (geoKeys.GTModelTypeGeoKey === 2) {
        // Geographic coordinates (degrees): convert to meters
        const latitude = origin[1]; // yOrigin in degrees
        const metersPerDegLat = 111000; // Approx 111km per degree latitude
        const metersPerDegLon = metersPerDegLat * Math.cos(latitude * Math.PI / 180); // Adjust for longitude
        pixelSizeX = Math.abs(resolution[0]) * metersPerDegLon; // Width (lon) in meters
        pixelSizeY = Math.abs(resolution[1]) * metersPerDegLat; // Height (lat) in meters
        console.log(`Geographic CRS detected: pixelSizeX=${pixelSizeX.toFixed(2)}m, pixelSizeY=${pixelSizeY.toFixed(2)}m at lat=${latitude}`);
    } else {
        // Projected coordinates (assume meters)
        pixelSizeX = Math.abs(resolution[0]);
        pixelSizeY = Math.abs(resolution[1]);
        console.log(`Projected CRS detected: pixelSizeX=${pixelSizeX.toFixed(2)}m, pixelSizeY=${pixelSizeY.toFixed(2)}m`);
    } 
    // // Override with assumed 10m if projected but resolution tiny
    // if (geoKeys.GTModelTypeGeoKey === 2 && pixelSizeX < 0.001) {
    //     pixelSizeX = 10;  // Assume 1-arc-second (~20m at this latitude)
    //     pixelSizeY = 10;
    //     console.log(`Overriding tiny resolution with assumed 10m x 10m`);
    // }

    console.log(`Width: ${width}, Height: ${length}`);
    console.log(`Pixel Resolution: ${pixelSizeX}m x ${pixelSizeY}m`);
    console.log(`Origin: ${origin}`);
    console.log(`GeoKeys:`, geoKeys);
    return { elevationData, width, length, pixelSizeX, pixelSizeY};
}

async function genTerrainMesh(terrainData, terrainDefaultParams, satelliteTexture, borderDefaultParams) {

    const { 
        elevationData:terrainElevationData,
        width:terrainWidth,
        length:terrainLength,
        pixelSizeX,
        pixelSizeY
    } = terrainData;
    const {
        pointSizeRatio:defaultPointSizeRatio,
        heightExaggeration:defaultHeightExaggeration,
        pointBobAmplitude:defaultBobAmplitude,
        pointBobSpeed:defaultBobSpeed,
        useSatelliteImage:defaultUseSatelliteTexture,
        pointColor:defaultColor,
        pointBrightness:defaultBrightness,
    } = terrainDefaultParams;
    const {
        borderWidth:defaultBorderWidth,
        borderColor:defaultBorderColor
    } = borderDefaultParams;

    // real world dimensions
    const realWidth = terrainWidth * pixelSizeX;
    const realLength = terrainLength * pixelSizeY;
    console.log(`Real Extents: ${realWidth}m wide x ${realLength}m long`);
    const aspectRatio = realLength / realWidth;
    console.log(`Aspect Ratio (L/W): ${aspectRatio}`);

    // Uniform scale factor to fit real extents into world space
    const worldSpaceToRealRatio = TERRAIN_WIDTH / realWidth;
    console.log(`World Space to Real Word Unit ratio: ${worldSpaceToRealRatio}`);

    //create initial flat plane with correct # of vertices
    const widthVertices = Math.max(1, Math.floor(terrainWidth * TERRAIN_VERTEX_DENSITY));
    const lengthVertices = Math.max(1, Math.floor(terrainLength * TERRAIN_VERTEX_DENSITY));
    console.log(`Vertex Density: ${TERRAIN_VERTEX_DENSITY}, Width Verts: ${widthVertices}, Length Verts: ${lengthVertices}, Total Verts: ${widthVertices * lengthVertices}`);
    
    const terrainGeo = new THREE.PlaneGeometry(
        TERRAIN_WIDTH,                // world space width
        TERRAIN_WIDTH * aspectRatio,  // world space length
        widthVertices-1,              // width segments
        lengthVertices-1              // length segments
    );
    terrainGeo.rotateX(-Math.PI / 2);
    const terrainVertices = terrainGeo.attributes.position.array;
    
    // Jitter and elevation scaled to horizontal compression
    const jitterAmount = TERRAIN_VERTEX_JITTER * worldSpaceToRealRatio;
    
    // offset vertex data by sampling (or sub-sampling) elevation data
    let minY = Infinity, maxY = -Infinity;
    for (let coarseRow = 0; coarseRow < lengthVertices; coarseRow++) {
        for (let coarseCol = 0; coarseCol < widthVertices; coarseCol++) {
            // Compute 1D vertex index (row-major order)
            const vIdx = coarseRow * widthVertices + coarseCol;
            const vertexIndex = vIdx * 3;  

            // Clamp vIdx to avoid out-of-bounds (safety for edge cases)
            if (vIdx >= widthVertices * lengthVertices) break;

            // apply jitter to mitigate moire effect from perfect grid alignment
            terrainVertices[vertexIndex]   += (Math.random() - 0.5) * jitterAmount * 2; // x jitter
            terrainVertices[vertexIndex+2] += (Math.random() - 0.5) * jitterAmount * 2; // z jitter 

            // Compute corresponding fine indices and sample elevation
            const fineCol = Math.min(terrainWidth - 1, Math.floor(coarseCol * terrainWidth / widthVertices));
            const fineRow = Math.min(terrainLength - 1, Math.floor(coarseRow * terrainLength / lengthVertices));
            const elevIdx = fineRow * terrainWidth + fineCol;
            const elevation = terrainElevationData[elevIdx] || 0;
            
            // offset Y value by elevation data, scaled horizontally
            // const yPos = elevation * worldSpaceToRealRatio * TERRAIN_HEIGHT_EXAGGERATION;
            const yPos = elevation * worldSpaceToRealRatio;
            terrainVertices[vertexIndex+1] = yPos;
            
            // Track min/max Y
            if (yPos < minY) minY = yPos;
            if (yPos > maxY) maxY = yPos;
        }
    }

    // shift points down so minY = 0
    for (let j=0; j<terrainVertices.length; j+=3) {
        terrainVertices[j+1] -= minY;
    }

    terrainGeo.attributes.position.needsUpdate = true;


    // terrain point shader
    const terrainFragShader = terrainImageFragShader;
    if (!defaultUseSatelliteTexture){
        terrainFragShader = terrainColorFragShader;
    }

    const terrainShaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0.0 },  // time uniform for animation, needs to be updated in main loop
            pointSize: { value: defaultPointSizeRatio * TERRAIN_WIDTH},
            heightExaggeration: { value: defaultHeightExaggeration },
            pointBobAmplitude: { value: defaultBobAmplitude},
            pointBobSpeed: { value: defaultBobSpeed },
            pointColor: { value: new THREE.Color(defaultColor) },
            pointBrightness: { value: defaultBrightness },
            borderThreshold: { value: (1-defaultBorderWidth)*0.5 },
            borderColor: { value: new THREE.Color(defaultBorderColor) },
            uvTexture: { value: satelliteTexture }
        },
        vertexShader: terrainVertexShader,
        fragmentShader: terrainFragShader, 
        depthTest: true,
        depthWrite: true,
        blending: THREE.NormalBlending
    });

    // create points instead of mesh
    const terrainMesh = new THREE.Points(terrainGeo, terrainShaderMaterial);
    console.log('Terrain points mesh created.');
    return { terrainMesh, terrainShaderMaterial };
}


// ---------- 3D MODELS / MESHES ----------
async function createRadarMesh() {
    const radarGeom = await loadOBJGeometry('static/models/mobile_radar/16012_Mobile_Radar_System_v1.obj');
    const radarWireframeGeom = new THREE.WireframeGeometry( radarGeom );
    const radarMaterial = new THREE.LineBasicMaterial({
        color: new THREE.Color(0x0f1773)
    }); // temp for debug
    const radarMesh = new THREE.LineSegments(radarWireframeGeom, radarMaterial);
    radarMesh.rotateX(-Math.PI/2);
    radarMesh.position.set(0, 0, 0);
    radarMesh.scale.set(1.5, 1.5, 1.5);
    return radarMesh;
}

async function createHoverDisk() {
    const circleGeom = new THREE.CircleGeometry(
        TERRAIN_WIDTH * 0.04, // radius
        25, // segments
        0.0, // thetaStart
        2.00 * Math.PI // thetaLength
    );
    const circleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(0xffffff) },
            uFadePercent: { value: 0.0 }
        },
        vertexShader: hoverDiskVertexShader,
        fragmentShader: hoverDiskFragShader,
        depthTest: true,
        depthWrite: true,
        blending: THREE.AdditiveBlending
        // blending: THREE.NormalBlending
    });
    const diskMesh = new THREE.Mesh( circleGeom, circleMaterial );
    diskMesh.position.set(0, 0, 0);
    diskMesh.rotateX(-Math.PI/2);
    return diskMesh;
}

// ---------- RENDER/CAMERA SETUP ----------

// Create a scene and camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    75,    // FOV
    window.innerWidth / window.innerHeight,
    1,     // near plane
    15000  // far plane
);

// Create a renderer
const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ 
    canvas,
    powerPreference: "high-performance"
});
renderer.setPixelRatio(window.devicePixelRatio);  // important for point rendering
renderer.setSize(window.innerWidth, window.innerHeight);

// render target for antialiasing
const renderTarget = new THREE.WebGLRenderTarget(
    window.innerWidth,
    window.innerHeight,
    { type: THREE.HalfFloatType }, // need this for better bloom/lighting because defaults to integer
    {samples: 16} // 4x,8x,16x,etc MSAA
);

// Map Control
const controls = new MapControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = mapControlDefaultParams.controlDampingFactor;
controls.screenSpacePanning = false;
controls.zoomSpeed = mapControlDefaultParams.zoomSpeed;
controls.rotateSpeed = mapControlDefaultParams.rotateSpeed; 
controls.panSpeed = mapControlDefaultParams.panSpeed;
controls.zoomToCursor = mapControlDefaultParams.zoomToCursor;

// Configure controls for bird's eye view
controls.target.set(0, 0, 0);                                                // look at center of terrain
controls.minDistance = TERRAIN_WIDTH * mapControlDefaultParams.minDistance;    // allow closer zoom
controls.maxDistance = TERRAIN_WIDTH * mapControlDefaultParams.maxDistance;  // allow further zoom out
controls.maxPolarAngle = Math.PI / mapControlDefaultParams.maxViewAngle;     // Limit how low you can orbit (prevent seeing under terrain)
controls.minPolarAngle = mapControlDefaultParams.minViewAngle;              // Allow complete top-down view
controls.update();

// Position camera above terrain for initial bird's eye view
camera.position.set(
    TERRAIN_WIDTH/3,
    TERRAIN_WIDTH/3,
    TERRAIN_WIDTH/3
);

// Fog [WIP]
// scene.fog = new THREE.Fog( 0xcccccc, 10, 15);

// ---------- BUILD SCENE ----------

const locationInfo = {
    locationName: 'St. Mary Valley // Glacier National Park // Montana, U.S.A',
    terrainPath: 'static/geodata/st_mary_valley_10m.tif',
    satelliteImagePath: 'static/geodata/st_mary_valley_satellite.png'
    // satelliteImagePath: 'static/geodata/st_mary_valley_satellite_quantized.jpg'
};

// const locationInfo = {
//     locationName: 'St. Mary Valley // Glacier National Park // Montana, U.S.A',
//     terrainPath: 'static/geodata/st_mary_valley_terrain.tif'
// }

// const locationInfo = {
//     locationName: 'Huntsville // Alabama, U.S.A // Rocket City',
//     terrainPath: 'static/geodata/huntsville_al.tif'
// }

// load map data
const terrainTiffData = loadGeoTIFF(locationInfo.terrainPath);
const satelliteImageTexture = new THREE.TextureLoader().load(locationInfo.satelliteImagePath, (texture) => {
    console.log('Texture loaded successfully:', texture.image);
});
const { terrainMesh, terrainShaderMaterial } = await genTerrainMesh(
    await terrainTiffData,
    terrainDefaultParams,
    satelliteImageTexture,
    borderDefaultParams
);

// Add terrain mesh
scene.add(terrainMesh);
terrainMesh.pickable = false;

// Load interactive objects
const interactiveContactInfo = new THREE.Object3D();
interactiveContactInfo.position.set(
    TERRAIN_WIDTH/3.3,
    TERRAIN_WIDTH/45,
    TERRAIN_WIDTH/3.3,
);
interactiveContactInfo.pickable = false;
terrainMesh.add(interactiveContactInfo);

const hoverDiskMesh = await createHoverDisk();
hoverDiskMesh.pickable = true;
interactiveContactInfo.add(hoverDiskMesh);

const radarMesh = await createRadarMesh();
radarMesh.pickable = false;
radarMesh.rotateZ(Math.PI/4)
interactiveContactInfo.add(radarMesh);



// ---------- RENDER PIPELINE ----------

// render
const renderScenePass = new RenderPass( scene, camera );

// bloom

const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85);
bloomPass.threshold = bloomDefaultParams.threshold;
bloomPass.strength = bloomDefaultParams.strength;
bloomPass.radius = bloomDefaultParams.radius;

// output
const outputPass = new OutputPass();


// Render / Postprocessing pipeline
const composer = new EffectComposer( renderer, renderTarget );
composer.addPass( renderScenePass );
composer.addPass( bloomPass );
composer.addPass( outputPass );



// ---------- SETTINGS / STATS Panels ----------
const gui = new GUI();
gui.title('Rendering Settings');

// terrain
const terrainFolder = gui.addFolder( 'terrain' );
terrainFolder.add( terrainDefaultParams, 'pointSizeRatio', 0.0001, 0.0025 ).onChange( function ( value ) {
    terrainShaderMaterial.uniforms.pointSize.value = Number( value ) * TERRAIN_WIDTH;
});
terrainFolder.add( terrainDefaultParams, 'heightExaggeration', 0.5, 5.0 ).onChange( function ( value ) {
    terrainShaderMaterial.uniforms.heightExaggeration.value = Number( value );
});
terrainFolder.add( terrainDefaultParams, 'pointBobAmplitude', 0.0, 10.0 ).step( 0.5 ).onChange( function ( value ) {
    terrainShaderMaterial.uniforms.pointBobAmplitude.value = Number( value );
});
terrainFolder.add( terrainDefaultParams, 'pointBobSpeed', 0.0, 5.0 ).step( 0.2 ).onChange( function ( value ) {
    terrainShaderMaterial.uniforms.pointBobSpeed.value = Number( value );
});
const satImgCtrl = terrainFolder.add( terrainDefaultParams, 'useSatelliteImage' )

const colorCtrl = terrainFolder.addColor( terrainDefaultParams, 'pointColor' ).onChange( function (value ) {
    terrainShaderMaterial.uniforms.pointColor.value = new THREE.Color( value );
});
const brightnessCtrl = terrainFolder.add( terrainDefaultParams, 'pointBrightness', 0.0, 2.0 ).step( 0.2 ).onChange( function ( value ) {
    terrainShaderMaterial.uniforms.pointBrightness.value = Number( value );
});
// hide color/brightness when using satellite image
satImgCtrl.onChange( function ( value ) {
    const useSatBool = Boolean( value );
    if (useSatBool) {
        terrainShaderMaterial.fragmentShader = terrainImageFragShader;
        terrainShaderMaterial.needsUpdate = true;
        colorCtrl.disable();
        brightnessCtrl.disable();
    }
    else {
        terrainShaderMaterial.fragmentShader = terrainColorFragShader;
        terrainShaderMaterial.needsUpdate = true;
        colorCtrl.enable();
        brightnessCtrl.enable();
    }
});
// border
const borderFolder = gui.addFolder( 'border' );
borderFolder.add( borderDefaultParams, 'borderWidth', 0.002, 0.1 ).onChange( function ( value ) {
    terrainShaderMaterial.uniforms.borderThreshold.value = (1.0 - value)*0.5;
});
borderFolder.addColor( borderDefaultParams, 'borderColor').onChange( function ( value ) {
    terrainShaderMaterial.uniforms.borderColor.value = new THREE.Color( value );
});
// bloom
const bloomFolder = gui.addFolder( 'bloom' );
bloomFolder.add( bloomDefaultParams, 'threshold', 0.0, 1.0 ).onChange( function ( value ) {
    bloomPass.threshold = Number( value );
});
bloomFolder.add( bloomDefaultParams, 'strength', 0.0, 3.0 ).onChange( function ( value ) {
    bloomPass.strength = Number( value );
});
bloomFolder.add( bloomDefaultParams, 'radius', 0.0, 1.0 ).step( 0.01 ).onChange( function ( value ) {
    bloomPass.radius = Number( value );
});
gui.close();

// stats
const stats = new Stats();
document.body.appendChild(stats.dom);



// ---------- Object Picking ----------
const objPick = new objectPicker();
objPick.setPickableObjects([interactiveContactInfo]);
let intersectedObj = null;
let pickedObj = null;
let pickPos = new THREE.Vector2(0.0, 0.0);
clearPickPosition();

function getCanvasRelativePosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * canvas.width/rect.width,
        y: (event.clientY - rect.top) * canvas.height/rect.height,
    }
}
function setPickPosition(event) {
    const pos = getCanvasRelativePosition(event);
    pickPos.x = (pos.x / canvas.width) * 2 - 1;
    pickPos.y = (pos.y / canvas.height) * -2 + 1; // flipped Y
    // perform raycast to get hovered object
    intersectedObj = objPick.pick(pickPos, camera);
}
function clearPickPosition() {
    pickPos.x = -100000;
    pickPos.y = -100000;
}
window.addEventListener('mousemove', setPickPosition);
window.addEventListener('mouseout', clearPickPosition);
window.addEventListener('mouseleave', clearPickPosition);

// ---------- LOOP ----------
// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update time uniform for terrain bobbing animation
    terrainShaderMaterial.uniforms.time.value = performance.now() / 1000;  // Convert to seconds

    // Check for picked objects / hover
    if (intersectedObj !== pickedObj) {
        // Reset previous if it exists
        if (pickedObj !== null) {
            pickedObj.material.uniforms.uFadePercent.value = 0.0;
        }
        // Set new if hovering something
        if (intersectedObj !== null) {
            intersectedObj.material.uniforms.uFadePercent.value = 1.0;
        }
        pickedObj = intersectedObj;
    }

    controls.update(); // required for controls.enableDamping = true
    composer.render();

    stats.update();
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderTarget.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth, window.innerHeight);
});

// Start the animation loop
animate();
