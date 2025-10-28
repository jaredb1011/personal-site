// most of this taken from three.js docs
import * as THREE from 'three';

export class objectPicker {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.pickableObjects = null; 
    this.pickPos = new THREE.Vector2(); // expect this to be normalized by size of canvas
  }
  setPickableObjects(objects) {
    this.pickableObjects = objects;
  }
  clearPickPosition() {
    this.pickPos.x = -100000;
    this.pickPos.y = -100000;
  }
  pick(camera) {
    // cast a ray through the frustum
    this.raycaster.setFromCamera(this.pickPos, camera);

    // get the list of objects the ray intersected
    const intersectedObjects = this.raycaster.intersectObjects(this.pickableObjects, true);
    let pickedObj = null;
    for (let i=0; i<intersectedObjects.length; i++) {
        // find the first pickable object
        if (intersectedObjects[i].object.pickable === true){
            pickedObj = intersectedObjects[i].object;
            break;
        }
    }
    return pickedObj;
  }
}