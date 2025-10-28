// configurable settings used throughout the project

export const terrainGenParams = {
    // World space size of terrain mesh in three.js units.
    // This is somewhat arbitrary and changing it would cause problems
    // because some objects take this into account and some are sadly still
    // hardcoded. I should fix that.
    terrainWidth: 2000,
    // The percentage of of the original terrain data points to use as 
    // vertices for the mesh. If subsampling (this value < 1.0) then the
    // terrain elevation data must be at least terrainWidth wide.
    terrainVertexDensity: 0.5,
    // A bunch of points in a straight line grid is subject to an ugly
    // moire effect when zoomed out. Applying a jitter to the x/y position
    // breaks up the grid and reduces the effect.
    terrainVertexJitter: 10,
}

export const terrainShaderDefaultParams = {
    pointSizeRatio: 0.0007,
    heightExaggeration: 1.0,
    pointBobAmplitude: 3.0,
    pointBobSpeed: 0.3,
    useSatelliteImage: true,
    pointColor: 0x52bbcc, // blue
    pointBrightness: 1
};

export const borderDefaultParams = {
    borderWidth: 0.02, // percent of the terrain that should be edge border
    borderColor: 0xbefed6 // brownish orange
};

export const bloomDefaultParams = {
    threshold: 0.05,
    strength: 0.35,
    radius: 0.0
};

export const mapControlDefaultParams = {
    zoomSpeed: 0.8,
    rotateSpeed: 0.5,
    panSpeed: 0.8,
    minDistance: 0.03,
    maxDistance: 2.0,
    maxViewAngle: 2.4,
    minViewAngle: 0.0,
    zoomToCursor: false,
    controlDampingFactor: 0.05
};
