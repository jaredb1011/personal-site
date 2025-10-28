// Bezier curves for smooth animations
import * as THREE from 'three';

export const camSmoothMoveCurve = new THREE.CubicBezierCurve(
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.9, 0),
    new THREE.Vector2(0.1, 1),
    new THREE.Vector2(1, 1),
);

export const textFadeCurve = new THREE.CubicBezierCurve(
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0, 1),
    new THREE.Vector2(0.2, 1),
    new THREE.Vector2(1, 1),
);
