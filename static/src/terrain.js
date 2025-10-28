// Functions for loading terrain data and generating a THREE.js mesh.
import * as THREE from 'three';
import { terrainVertexShader, terrainImageFragShader, terrainColorFragShader } from './shaders/terrain_shader.js';
import { terrainGenParams } from './config.js';

// ---------- PARAMETERS ----------
// TERRAIN

// const terrainGenParams.terrainWidth = 2000;  

// const TERRAIN_VERTEX_DENSITY = 0.5;      

// const TERRAIN_VERTEX_JITTER = 10; 


export async function loadGeoTIFF(file){
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
        console.debug(`Geographic CRS detected: pixelSizeX=${pixelSizeX.toFixed(2)}m, pixelSizeY=${pixelSizeY.toFixed(2)}m at lat=${latitude}`);
    } else {
        // Projected coordinates (assume meters)
        pixelSizeX = Math.abs(resolution[0]);
        pixelSizeY = Math.abs(resolution[1]);
        console.debug(`Projected CRS detected: pixelSizeX=${pixelSizeX.toFixed(2)}m, pixelSizeY=${pixelSizeY.toFixed(2)}m`);
    } 
    // // Override with assumed 10m if projected but resolution tiny
    // if (geoKeys.GTModelTypeGeoKey === 2 && pixelSizeX < 0.001) {
    //     pixelSizeX = 10;  // Assume 1-arc-second (~20m at this latitude)
    //     pixelSizeY = 10;
    //     console.debug(`Overriding tiny resolution with assumed 10m x 10m`);
    // }

    console.debug(`Width: ${width}, Height: ${length}`);
    console.debug(`Pixel Resolution: ${pixelSizeX}m x ${pixelSizeY}m`);
    console.debug(`Origin: ${origin}`);
    console.debug(`GeoKeys:`, geoKeys);
    return { elevationData, width, length, pixelSizeX, pixelSizeY};
}

export async function genTerrainMesh(terrainData, terrainDefaultParams, satelliteTexture, borderDefaultParams) {

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
    console.debug(`Real Extents: ${realWidth}m wide x ${realLength}m long`);
    const aspectRatio = realLength / realWidth;
    console.debug(`Aspect Ratio (L/W): ${aspectRatio}`);

    // Uniform scale factor to fit real extents into world space
    const worldSpaceToRealRatio = terrainGenParams.terrainWidth / realWidth;
    console.debug(`World Space to Real Word Unit ratio: ${worldSpaceToRealRatio}`);

    //create initial flat plane with correct # of vertices
    const widthVertices = Math.max(1, Math.floor(terrainWidth * terrainGenParams.terrainVertexDensity));
    const lengthVertices = Math.max(1, Math.floor(terrainLength * terrainGenParams.terrainVertexDensity));
    console.debug(`Vertex Density: ${terrainGenParams.terrainVertexDensity}, Width Verts: ${widthVertices}, Length Verts: ${lengthVertices}, Total Verts: ${widthVertices * lengthVertices}`);
    
    const terrainGeo = new THREE.PlaneGeometry(
        terrainGenParams.terrainWidth,                // world space width
        terrainGenParams.terrainWidth * aspectRatio,  // world space length
        widthVertices-1,              // width segments
        lengthVertices-1              // length segments
    );
    terrainGeo.rotateX(-Math.PI / 2);
    const terrainVertices = terrainGeo.attributes.position.array;
    
    // Jitter and elevation scaled to horizontal compression
    const jitterAmount = terrainGenParams.terrainVertexJitter * worldSpaceToRealRatio;
    
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
            pointSize: { value: defaultPointSizeRatio * terrainGenParams.terrainWidth * window.devicePixelRatio},
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
    console.debug('Terrain points mesh created.');
    return { terrainMesh, terrainShaderMaterial };
}
