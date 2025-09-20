// terrain_shader.js

export const terrainVertexShader = /* glsl */`
    uniform float pointSize;
    uniform float time;
    uniform float pointBobAmplitude;
    uniform float pointBobSpeed;
    uniform float heightExaggeration;
    varying vec3 vPosition;
    varying vec2 vUv;

    void main() {
        // Create subtle bobbing motion
        vec3 animatedPosition = position;
        
        // apply height exaggeration
        animatedPosition.y *= heightExaggeration;

        // Use position to create varying phase
        float phase = position.x * 0.02 + position.z * 0.02;
        animatedPosition.y += sin(time * pointBobSpeed + phase) * pointBobAmplitude;

        // world space to clip space
        gl_Position = projectionMatrix * modelViewMatrix * vec4(animatedPosition, 1.0);

        // set the size of the point in pixels
        gl_PointSize = pointSize * (1000.0 / length(modelViewMatrix * vec4(animatedPosition, 1.0))); // scale size with distance

        // Pass position to frag shader
        vPosition = animatedPosition;
        vUv = uv;
    }
`;

export const terrainImageFragShader = /* glsl */`
    // varyings are received from vertex shader
    varying vec3 vPosition;
    varying vec2 vUv;
    uniform sampler2D uvTexture;

    void main() {
        // Calculate point coordinates
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center) * 2.0;

        // Discard pixels outside the circle
        if (dist > 1.0) {
            discard;
        }

        gl_FragColor = texture2D(uvTexture, vUv);
    }
`;

export const terrainColorFragShader = /* glsl */`
    // varyings are received from vertex shader
    varying vec3 vPosition;
    varying vec2 vUv;
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