// terrain_shader.js

export const terrainVertexShader = /* glsl */`
    uniform float pointSize;
    uniform float time;
    varying vec3 vPosition;

    void main() {
        // Create subtle bobbing motion
        vec3 animatedPosition = position;
        float bobAmount = 3.0;  // adjust this to control bob height
        float bobSpeed = 0.3;    // adjust this to control bob speed
        
        // Use position to create varying phase
        float phase = position.x * 0.02 + position.z * 0.02;
        animatedPosition.y += sin(time * bobSpeed + phase) * bobAmount;

        // world space to clip space
        gl_Position = projectionMatrix * modelViewMatrix * vec4(animatedPosition, 1.0);

        // set the size of the point in pixels
        gl_PointSize = pointSize * (1000.0 / length(modelViewMatrix * vec4(animatedPosition, 1.0))); // scale size with distance

        // Pass position to frag shader
        vPosition = animatedPosition;
    }
`;

export const terrainFragShader = /* glsl */`
    varying vec3 vPosition; // received from vertex shader
    uniform vec3 pointColor;
    uniform float pointBrightness;

    void main() {
        // Calculate point coordinates
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center) * 2.0;

        // Discard pixels outside the circle
        if (dist > 1.0) {
            discard;
        }

        gl_FragColor = vec4(pointColor * pointBrightness, 1.0);
    }
`;