// Functions for debugging the camera's position and reotation to the screen.

import * as THREE from 'three';

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

export function subtleMousePerspectiveShift(canvas, mousePos, origQuat) {
    const maxShiftHorizontalDeg = 1.0;
    const maxShiftVerticalDeg = 0.5;
    // get shifted x quaternion
    const xPerc = ((mousePos.x / canvas.width) - 0.5) * 2;
    const xOffsetRad = -1 * xPerc * maxShiftHorizontalDeg * (Math.PI/180);
    const xQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), // rotate around Y axis to offset horizontally
        xOffsetRad
    );
    // get shifted y quaternion
    const yPerc = ((mousePos.y / canvas.height) - 0.5) * 2;
    const yOffsetRad = -1 * yPerc * maxShiftVerticalDeg * (Math.PI/180);
    const yQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), // rotate around X axis to offset vertically
        yOffsetRad
    );
    // multiplying quaternions applies their rotations in order
    // so this starts from existing quaternion, then rotates by xQuat, then by yQuat
    return origQuat.clone().multiply(xQuat).multiply(yQuat);
};