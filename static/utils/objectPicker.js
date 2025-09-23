// most of this taken from three.js docs
import * as THREE from 'three';

export class objectPicker {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.pickableObjects = null; 
  }
  setPickableObjects(objects) {
    this.pickableObjects = objects;
  }
  pick(normalizedPosition, camera) {
    // cast a ray through the frustum
    this.raycaster.setFromCamera(normalizedPosition, camera);

    // get the list of objects the ray intersected
    const intersectedObjects = this.raycaster.intersectObjects(this.pickableObjects, true);
    // const intersectedObjects = this.raycaster.intersectObjects(scene.children);
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