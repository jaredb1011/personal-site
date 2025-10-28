// library imports
import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
// imported GeoTIFF directly as a script in the HTML

// source code imports
import {
    terrainGenParams,
    terrainShaderDefaultParams,
    borderDefaultParams,
    bloomDefaultParams,
    mapControlDefaultParams
} from './config.js';
import { textContent }  from './textContent.js';
import { createTextGeometry, createTextMaterials } from './utils/textUtils.js';
import { loadOBJ, applyMaterialToObjMesh } from './objLoading.js';
import { objectPicker } from './objectPicker.js';
import { loadGeoTIFF, genTerrainMesh } from './terrain.js';
import { terrainImageFragShader, terrainColorFragShader } from './shaders/terrain_shader.js';
import { hoverDiskVertexShader, hoverDiskFragShader } from './shaders/hover_disk_shader.js';
import { createCameraDebugDiv, updateCameraDebug, subtleMousePerspectiveShift } from './utils/cameraUtils.js';
import { camSmoothMoveCurve, textFadeCurve } from './utils/bezierCurves.js';


// welcome message
console.log(textContent.consoleHello);


// ---------- 3D MODELS / MESHES ----------
const radarModelData = {
    path: 'static/models/radar_tower/Radar_Tower.obj',
    meshColor: 0x000000,
    edgeColor: 0xffffff,
    edgeAngle: 5,
    scale: 20
};

async function createOutlinedObjMesh(objData) {
    // expects object with the following members:
    // path: path to .obj file
    // meshColor: mesh hex color
    // edgeColor: edge hex color
    // edgeAngle: angle at which edges are detected
    // scale: scale relative to original .obj data

    const objMesh = await loadOBJ(objData.path);

    const objMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(objData.meshColor)
    });

    applyMaterialToObjMesh(objMesh, objMaterial);

    const edgeMaterial = new THREE.LineBasicMaterial({
        color: objData.edgeColor,
        linewidth: 1
    });

    // add each submesh's line segments to the main mesh
    objMesh.children.forEach(element => {
        objMesh.add(new THREE.LineSegments(
            new THREE.EdgesGeometry(element.geometry, objData.edgeAngle),
            edgeMaterial
        ));
    });

    objMesh.position.set(0, 0, 0);
    objMesh.scale.set(objData.scale, objData.scale, objData.scale);

    return objMesh;
}

async function createHoverDisk() {
    // what I really want here is a vertical disk billboard
    // that provides a backdrop behind the interactable.
    // it should render in front of terrain but behind the object.
    const circleGeom = new THREE.CircleGeometry(
        terrainGenParams.terrainWidth * 0.05, // radius
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

// WebGL Renderer
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
    { samples: 16 } // 4x,8x,16x,etc MSAA
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
controls.minDistance = terrainGenParams.terrainWidth * mapControlDefaultParams.minDistance;    // allow closer zoom
controls.maxDistance = terrainGenParams.terrainWidth * mapControlDefaultParams.maxDistance;  // allow further zoom out
controls.maxPolarAngle = Math.PI / mapControlDefaultParams.maxViewAngle;     // Limit how low you can orbit (prevent seeing under terrain)
controls.minPolarAngle = mapControlDefaultParams.minViewAngle;              // Allow complete top-down view
controls.update();

// Position camera above terrain for initial bird's eye view
camera.position.set(
    0,
    terrainGenParams.terrainWidth/2.5,
    -terrainGenParams.terrainWidth/1.5
);



// ---------- BUILD SCENE ----------

const locationInfo = {
    locationName: 'St. Mary Valley // Glacier National Park // Montana, U.S.A',
    terrainPath: 'static/geodata/st_mary_valley_10m.tif',
    satelliteImagePath: 'static/geodata/st_mary_valley_satellite.png'
    // satelliteImagePath: 'static/geodata/st_mary_valley_satellite_quantized.jpg'
};

// load map data
const terrainTiffData = loadGeoTIFF(locationInfo.terrainPath);
const satelliteImageTexture = new THREE.TextureLoader().load(locationInfo.satelliteImagePath, (texture) => {
    console.debug('Texture loaded successfully:', texture.image);
});
const { terrainMesh, terrainShaderMaterial } = await genTerrainMesh(
    await terrainTiffData,
    terrainShaderDefaultParams,
    satelliteImageTexture,
    borderDefaultParams
);

// Add terrain mesh
scene.add(terrainMesh);
terrainMesh.pickable = false;


// Load interactive objects

// construct the main mesh object for an interactable
// this object must implement the following:
// attributes: name (str), pickable (bool), cameraLockPos (Vector3 - world space), cameraLockQuat (Quaternion)
// hover mesh: a mesh that will have its material shader updated, added as a child and also to .hover attribute - THIS SHOULD CHANGE
// methods: onSelected, onDeselected - these need to exist but don't need to do anything

// the sphere is used for click interactions, not actually visible
// TODO: replace this with a cylinder so it doesn't extend below the map
const interactiveContactInfoGeom = new THREE.SphereGeometry(
    terrainGenParams.terrainWidth/20, // radius
    15, 15            // width and height segments
);

const interactiveContactInfoMat = new THREE.MeshBasicMaterial({
    wireframe: true,
    transparent: true,
    opacity: 0.0
});
const interactiveContactInfo = new THREE.Mesh(interactiveContactInfoGeom, interactiveContactInfoMat);
interactiveContactInfo.name = "Contact Info Interactable";
interactiveContactInfo.pickable = true;

// set the world position of the mesh
interactiveContactInfo.position.set(
    terrainGenParams.terrainWidth/2.8,
    terrainGenParams.terrainWidth/45,
    terrainGenParams.terrainWidth/3.7,
);
interactiveContactInfo.rotateY(Math.PI/4);

// set the position & rotation for the locked off camera shot
// when this interactable item is selected
interactiveContactInfo.cameraLockPos = new THREE.Vector3(
    680,
    140,
    440,
);
interactiveContactInfo.cameraLockQuat = new THREE.Quaternion(
    -0.0212,
    0.971,
    0.222,
    0.0928
);

// add glowing disk effect when hovered
// TODO: make the glow better / animated
const hoverDiskMesh = await createHoverDisk();
hoverDiskMesh.pickable = false;
interactiveContactInfo.add(hoverDiskMesh);
interactiveContactInfo.hover = hoverDiskMesh;

// create the outline mesh that overlays the original mesh
const radarMesh = await createOutlinedObjMesh(radarModelData);
radarMesh.pickable = false;
interactiveContactInfo.add(radarMesh);

// callback for when this item is selected and the
// camera has finished moving
interactiveContactInfo.onSelected = function () {
    console.debug(`showing ${interactiveContactInfo.name}'s text window`);
    // get camera direction vector in world space
    let camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    console.debug('camera direction', camDir);

    // move text mesh to camera + offset
    const offsetCamPos = camera.localToWorld(new THREE.Vector3(7.5, 0, -15));
    textMesh.position.set(...offsetCamPos);
    console.debug('textMesh position:', textMesh.position);

    // set text mesh rotation based on camera
    let camQuat = new THREE.Quaternion();
    camera.getWorldQuaternion(camQuat);
    console.debug('camera quaternion', camQuat);
    textMesh.quaternion.set(...camQuat);
    console.debug('textMesh quat:', textMesh.quaternion);

    // start opacity transition
    isTextFadeIn = true;
    textFadeStartTime = performance.now() / 1000;
}

// callback for when this item is deselected before the
// camera start moving
interactiveContactInfo.onDeselected = function () {
    console.debug(`hiding ${interactiveContactInfo.name}'s text window`);

    // start opacity transition
    isTextFadeOut = true;
    textFadeStartTime = performance.now() / 1000;
}

// add to the main terrain object
terrainMesh.add(interactiveContactInfo);



// ---------- TEXT WINDOWS ----------
const textFadeInDuration = 0.7;
const textFadeOutDuration = 0.4;
const textMaxOpacity = 0.90;
const textPlaneWidth = 15;
const textPlaneHeight = 20;
const textContentMarginX = 0.5;
const textContentMarginY = 1.5;
const textTitleBodySpacing = 3.0;

let textFadeStartTime = null;
let textFadeProgress = 0.0;
let isTextFadeIn = false;
let isTextFadeOut = false;

const textPlane = new THREE.PlaneGeometry(
    textPlaneWidth,
    textPlaneHeight,
    4,  // width segments
    4   // height segments
);
const textPlaneMaterial = new THREE.MeshBasicMaterial({
    color: 0x1b3614,
    transparent: true,
    opacity: 0.0,
    side: THREE.FrontSide
});
const textMesh = new THREE.Mesh(textPlane, textPlaneMaterial);
textMesh.currentContentMeshes = [];
textMesh.position.set(0, 100, 0);
scene.add(textMesh);

textMesh.setOpacity = (newOpacity) => {
    textMesh.material.opacity = newOpacity*textMaxOpacity;
    textMesh.currentContentMeshes.forEach((contentMesh) => {
        contentMesh.material.forEach((mat) => {
            mat.opacity = textMesh.material.opacity;
        });
    });
};

function interpTextFadeProgress(fadeProgress) {
    const interpPos = textFadeCurve.getPoint(fadeProgress).y;
    return interpPos;
};


// text content
// fontPath: "static/fonts/Iceberg_Regular.json",
// fontPath: "static/fonts/Jockey_One_Regular.json",
// fontPath: "static/fonts/Share_Tech_Mono_Regular.json",

// make title mesh
const contactTitleTextParams = {
    fontPath: "static/fonts/Iceberg_Regular.json",
    textColor: 0xffffff,
    size: 0.9,
    depth: 0.05,
    curveSegments: 10
};
const contactTitleTextMaterials = createTextMaterials(contactTitleTextParams.textColor);
const contactTextTitleGeom = await createTextGeometry(
    textContent.contactWindow.title,
    contactTitleTextParams
);
const contactTextTitleMesh = new THREE.Mesh(contactTextTitleGeom, contactTitleTextMaterials);
contactTextTitleMesh.position.set(
    -textPlaneWidth/2 + textContentMarginX,
    textPlaneHeight/2 - textContentMarginY,
    0
);
textMesh.add(contactTextTitleMesh);
textMesh.currentContentMeshes.push(contactTextTitleMesh);

// make body mesh
const contactBodyTextParams = {
    fontPath: "static/fonts/Jockey_One_Regular.json",
    textColor: 0xffffff,
    size: 0.7,
    depth: 0.05,
    curveSegments: 10
};
const contactBodyTextMaterials = createTextMaterials(contactBodyTextParams.textColor);
const contactTextBodyGeom = await createTextGeometry(
    textContent.contactWindow.body,
    contactBodyTextParams
);
const contactTextBodyMesh = new THREE.Mesh(contactTextBodyGeom, contactBodyTextMaterials);
contactTextBodyMesh.position.set(
    contactTextTitleMesh.position.x,
    contactTextTitleMesh.position.y - textTitleBodySpacing,
    0
);

textMesh.add(contactTextBodyMesh);
textMesh.currentContentMeshes.push(contactTextBodyMesh);



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

function resizeRenderPipeline() {
    // calculate new dimensions
    const pixelRatio = Math.min(window.devicePixelRatio, 2); // cap
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;

    // Camera -----
    camera.aspect = aspect; 
    camera.updateProjectionMatrix();

    // Effect Composer -----
    // EffectComposer.setSize() automatically will set the size/pixel ratio
    // for its render target and any passes that have been added to it.
    // It doesn't seem to update the actual renderer, so we still
    // set that one manually above.
    // EffectComposer.setPixelRatio() calls setSize() so instead of calling
    // setSize ourself, just set the width and height directly
    // then let setPixelRatio call setSize() to avoid a double setSize call.
    composer._width = width;
    composer._height = height;
    composer.setPixelRatio(pixelRatio);

    // webgl renderer & target -----
    // For some reason, the setPixelRatio() trick doesn't work on the
    // WebGLRenderer class so we have to eat the extra setSize call.
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);

    // do an extra render since things changed.
    composer.render();
};



// ---------- PANEL OVERLAYS ----------
function setupGui(){
    const gui = new GUI();
    gui.title('Visual Settings');

    // terrain
    const terrainFolder = gui.addFolder( 'Terrain' );
    terrainFolder.add( terrainShaderDefaultParams, 'pointSizeRatio', 0.0001, 0.0025 ).onChange( function ( value ) {
        terrainShaderMaterial.uniforms.pointSize.value = Number( value ) * terrainGenParams.terrainWidth * window.devicePixelRatio;
    }).name("Point Size");
    terrainFolder.add( terrainShaderDefaultParams, 'heightExaggeration', 0.0, 5.0 ).onChange( function ( value ) {
        terrainShaderMaterial.uniforms.heightExaggeration.value = Number( value );
    }).name("Height Exaggeration");
    terrainFolder.add( terrainShaderDefaultParams, 'pointBobAmplitude', 0.0, 10.0 ).step( 0.5 ).onChange( function ( value ) {
        terrainShaderMaterial.uniforms.pointBobAmplitude.value = Number( value );
    }).name("Bobbing Motion - Height");
    terrainFolder.add( terrainShaderDefaultParams, 'pointBobSpeed', 0.0, 5.0 ).step( 0.2 ).onChange( function ( value ) {
        terrainShaderMaterial.uniforms.pointBobSpeed.value = Number( value );
    }).name("Bobbing Motion - Speed");
    const satImgCtrl = terrainFolder.add( terrainShaderDefaultParams, 'useSatelliteImage' ).name("Use Satellite Imagery");

    const colorCtrl = terrainFolder.addColor( terrainShaderDefaultParams, 'pointColor' ).onChange( function (value ) {
        terrainShaderMaterial.uniforms.pointColor.value = new THREE.Color( value );
    }).name("Color");
    const brightnessCtrl = terrainFolder.add( terrainShaderDefaultParams, 'pointBrightness', 0.0, 2.0 ).step( 0.2 ).onChange( function ( value ) {
        terrainShaderMaterial.uniforms.pointBrightness.value = Number( value );
    }).name("Brightness");
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
    const borderFolder = gui.addFolder( 'Map Border' );
    borderFolder.add( borderDefaultParams, 'borderWidth', 0.002, 0.1 ).onChange( function ( value ) {
        terrainShaderMaterial.uniforms.borderThreshold.value = (1.0 - value)*0.5;
    }).name("Width");
    borderFolder.addColor( borderDefaultParams, 'borderColor').onChange( function ( value ) {
        terrainShaderMaterial.uniforms.borderColor.value = new THREE.Color( value );
    }).name("Color");
    // bloom
    const bloomFolder = gui.addFolder( 'Bloom' );
    bloomFolder.add( bloomDefaultParams, 'threshold', 0.0, 1.0 ).onChange( function ( value ) {
        bloomPass.threshold = Number( value );
    }).name("Threshold");
    bloomFolder.add( bloomDefaultParams, 'strength', 0.0, 3.0 ).onChange( function ( value ) {
        bloomPass.strength = Number( value );
    }).name("Strength");
    bloomFolder.add( bloomDefaultParams, 'radius', 0.0, 1.0 ).step( 0.01 ).onChange( function ( value ) {
        bloomPass.radius = Number( value );
    }).name("Radius");
    gui.close();
    return gui;
}

// settings gui
setupGui();

// performance stats
const stats = new Stats();
document.body.appendChild(stats.dom);

// camera debug
const cameraDebugDiv = createCameraDebugDiv();



// ---------- OBJECT INTERACTION ----------
// globals
let targetInteractable = null;
let intersectedObj = null;
let hoveredObj = null;

const objPick = new objectPicker();
// only the following items can be raycast against
objPick.setPickableObjects([
    interactiveContactInfo
]);

function getCanvasRelativePosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * canvas.width/rect.width,
        y: (event.clientY - rect.top) * canvas.height/rect.height,
    }
}

function setPickPosition(pos) {
    // const pos = getCanvasRelativePosition(event);
    objPick.pickPos.x = (pos.x / canvas.width) * 2 - 1;
    objPick.pickPos.y = (pos.y / canvas.height) * -2 + 1; // flipped Y
    
    // perform raycast to get hovered object
    intersectedObj = objPick.pick(camera);
}

function handleClicks(event) {
    console.debug(`Click Event Target: ${event.target.id}`);
    if (event.target.id == 'three-canvas' && hoveredObj !== null && targetInteractable === null){
        // Start a camera move for an interactable object
        console.log(`Selected: ${hoveredObj.name}`);
        targetInteractable = hoveredObj;
        goToInteractable();
    }
}

function handleKeyPress(event) {
    const keyName = event.key;
    console.debug(`${keyName} pressed.`)
    if (keyName === "Escape" && targetInteractable !== null) {
        leaveInteractable();
    }
    else {
        console.debug("key not handled");
    }
}

function goToInteractable(){
    if (targetInteractable === null) {
        console.error(`targetInteractable is null! Can't go to it.`);
        return;
    }
    console.debug(`Snapping to position:`, targetInteractable.cameraLockPos, `quaternion:`, targetInteractable.cameraLockQuat);
    controls.enabled = false;
    targetInteractable.hover.material.uniforms.uFadePercent.value = 0.0;
    startCamMove(
        camera.position,                  // start pos
        camera.quaternion,                // start rotation
        targetInteractable.cameraLockPos, // end pos
        targetInteractable.cameraLockQuat // end rotation
    );
}

function leaveInteractable(){
    if (targetInteractable === null) {
        console.error(`targetInteractable is null! Can't leave it.`);
        return;
    }
    targetInteractable.onDeselected();
    
    returnToFreeCam();
}

// event listeners & handlers
function mouseMoveHandler(event) {
    const pos = getCanvasRelativePosition(event);
    // within an interactable locked camera shot
    if (targetInteractable !== null && !controls.enabled) {
        const newQuat = subtleMousePerspectiveShift(canvas, pos, camera.setpoint.quat);
        camera.setRotationFromQuaternion(newQuat);
    }
    // free cam
    else if (targetInteractable === null && controls.enabled) {
        setPickPosition(pos);
    }
}

window.addEventListener('click', handleClicks);
window.addEventListener('mousemove', mouseMoveHandler);
window.addEventListener('mouseout', () => objPick.clearPickPosition); // use arrow function so "this" doesn't get overridden inside the class.
window.addEventListener('mouseleave', () => objPick.clearPickPosition);
window.addEventListener('resize', resizeRenderPipeline);
window.addEventListener('keydown', handleKeyPress);



// ---------- CAMERA MOVEMENT ----------
const camSmoothMoveDuration = 1.0;
let isCameraSmoothMove = false;
let camSmoothMoveStartTime = null;
let camSmoothMoveProgress = 0.0;
let camStartPos = null;
let camStartQuat = null;
let camEndPos = null;
let camEndQuat = null;
let shouldReenableControls = false;
camera.setpoint = {
    pos: null,
    quat: null
}; // used for subtle offset effect


function startCamMove(startPos, startQuat, endPos, endQuat) {
    isCameraSmoothMove = true;
    camStartPos = startPos.clone();
    camStartQuat = startQuat.clone();
    camEndPos = endPos.clone();
    camEndQuat = endQuat.clone();
    camera.setpoint.pos = camEndPos;
    camera.setpoint.quat = camEndQuat;
    camSmoothMoveStartTime = performance.now() / 1000;
    camSmoothMoveProgress = 0.0;
}

function endCamMove() {
    // final camera state
    camera.position.copy(camEndPos);
    camera.quaternion.copy(camEndQuat);
    // reset cam params
    isCameraSmoothMove = false;
    camSmoothMoveStartTime = null;
    camSmoothMoveProgress = 0.0;
    // leave camStartPos populated so we can return there later after locked-off shot
    camEndPos = null;
    camEndQuat = null;
    // re-enable controls (optional)
    if (shouldReenableControls){
        controls.enabled = true;
        shouldReenableControls = false;
    }
    // call interactable's arrival handler if applicable 
    if (targetInteractable !== null){
        targetInteractable.onSelected();
    }
}

function updateCameraSmoothMove() {
    const interpPos = camSmoothMoveCurve.getPoint(camSmoothMoveProgress).y;
    camera.position.lerpVectors(camStartPos, camEndPos, interpPos);
    camera.quaternion.slerpQuaternions(camStartQuat, camEndQuat, interpPos);
}

function returnToFreeCam() {
    if (camStartPos === null || camStartQuat === null){
        console.error('Cannot return to free cam, starting pos or quaternion was empty!', camStartPos, camStartQuat);
        return;
    }
    console.debug("returning to free cam");
    // use previous start position as next end position.
    const endPos = camStartPos;
    const endQuat = camStartQuat;

    // reenable controls and raycasting after returning to free cam
    shouldReenableControls = true;
    targetInteractable = null;
    startCamMove(
        camera.position,
        camera.quaternion,
        endPos,
        endQuat
    );
}



// ---------- ANIMATION LOOP ----------
// Main animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // get current time for use in animations
    let curTime = performance.now() / 1000; // conv to seconds

    // Update time uniform for terrain bobbing animation
    terrainShaderMaterial.uniforms.time.value = curTime;

    // Check for picked objects / hover
    if ((targetInteractable === null) && (intersectedObj !== hoveredObj)) {
        // Reset previous if it exists
        if (hoveredObj !== null) {
            hoveredObj.hover.material.uniforms.uFadePercent.value = 0.0;
        }
        // Set new if hovering something
        if (intersectedObj !== null) {
            intersectedObj.hover.material.uniforms.uFadePercent.value = 1.0;
        }
        hoveredObj = intersectedObj;
    }

    // camera move
    if (isCameraSmoothMove) {
        camSmoothMoveProgress = (curTime - camSmoothMoveStartTime) / camSmoothMoveDuration;
        if (camSmoothMoveProgress > 1.0){
            endCamMove();
        }
        else {
            updateCameraSmoothMove();
        }
    }

    // text panel fade
    if (isTextFadeIn && textFadeStartTime !== null) {
        textFadeProgress = (curTime - textFadeStartTime) / textFadeInDuration;   
        if (textFadeProgress > 1.0){
            // end fade in
            isTextFadeIn = false;
            textFadeStartTime = null;
            console.debug()
        }
        // fade in
        textMesh.setOpacity(interpTextFadeProgress(textFadeProgress));
    }
    else if (isTextFadeOut && textFadeStartTime !== null) {
        textFadeProgress = (curTime - textFadeStartTime) / textFadeOutDuration;   
        if (textFadeProgress > 1.0){
            // end fade out
            isTextFadeOut = false;
            textFadeStartTime = null;
        }
        // fade out
        textMesh.setOpacity(1.0 - interpTextFadeProgress(textFadeProgress));
    }

    // controls
    if (controls.enabled && targetInteractable === null) {
        controls.update(); // required for controls.enableDamping = true
    }

    // render
    composer.render();

    // Update HTML elements
    stats.update();
    updateCameraDebug(camera, cameraDebugDiv);
}



// ---------- MAIN ----------
// Make sure nothing is selected
// Then start the main loop
objPick.clearPickPosition();
animate();
