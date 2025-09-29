// Functions for debugging the camera's position and reotation to the screen.

export function createCameraDebugDiv() {
    const cameraDebugDiv = document.createElement("div");
    cameraDebugDiv.style = "position: fixed; top: 0px; left: 200px; z-index: 5";
    cameraDebugDiv.style.color = "white";
    cameraDebugDiv.style.width = "330px";
    cameraDebugDiv.style.height = "40px";
    cameraDebugDiv.style.background = "gray";
    document.body.append(cameraDebugDiv);
    return cameraDebugDiv;
};

export function updateCameraDebug(camera, debugDiv) {
    const camX = camera.position.x.toPrecision(5);
    const camY = camera.position.y.toPrecision(5);
    const camZ = camera.position.z.toPrecision(5);
    const rotX = camera.quaternion.x.toPrecision(3);
    const rotY = camera.quaternion.y.toPrecision(3);
    const rotZ = camera.quaternion.z.toPrecision(3);
    const rotW = camera.quaternion.w.toPrecision(3);
    debugDiv.innerText = `POS ~ X:${camX} | Y:${camY} | Z:${camZ}\nROT ~ X:${rotX} | Y:${rotY} | Z:${rotZ} | W:${rotW}`;
};
