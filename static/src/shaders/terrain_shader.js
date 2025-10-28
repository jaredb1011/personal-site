// terrain_shader.js

export const terrainVertexShader = /* glsl */`
    uniform float pointSize;
    uniform float time;
    uniform float pointBobAmplitude;
    uniform float pointBobSpeed;
    uniform float heightExaggeration;
    uniform float borderThreshold; // between [0, 0.5]
    varying vec3 vPosition;
    varying vec2 vUv;
    varying float vInBorder;

    void main() {
        // Create subtle bobbing motion
        vec3 animatedPosition = position;
        
        // apply height exaggeration
        animatedPosition.y *= heightExaggeration;

        // Use position to create varying phase
        float phase = position.x * 0.02 + position.z * 0.02;
        animatedPosition.y += sin(time * pointBobSpeed + phase) * pointBobAmplitude;

        // check if point is on the border for frag shader
        float dist_x = abs(uv.x - 0.5); // distance away from center between (0, 0.5)
        float dist_y = abs(uv.y - 0.5);
        float thresh_x = step(borderThreshold, dist_x); // step -> 0 if < 0.45, 1 if > 0.45
        float thresh_y = step(borderThreshold, dist_y); // so thresh is 1 if in border, 0 if not
        vInBorder = min(thresh_x + thresh_y, 1.0); // 1 if in one of the borders, 0 if not

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
    varying float vInBorder;
    uniform sampler2D uvTexture;
    uniform vec3 borderColor;

    void main() {
        // Calculate point coordinates
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center) * 2.0;

        // Discard pixels outside the circle
        if (dist > 1.0) {
            discard;
        }

        // sample texture
        vec4 texColor = texture2D(uvTexture, vUv); // sample texture
        // get border color if applicable
        vec3 finalColor = (texColor.xyz * (1.0 - vInBorder)) + (borderColor * vInBorder);
        // final color
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

export const terrainColorFragShader = /* glsl */`
    // varyings are received from vertex shader
    varying vec3 vPosition;
    varying vec2 vUv;
    varying float vInBorder;
    uniform vec3 pointColor;
    uniform float pointBrightness;
    uniform vec3 borderColor;

    void main() {
        // Calculate point coordinates
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center) * 2.0;

        // Discard pixels outside the circle
        if (dist > 1.0) {
            discard;
        }

        // get border color if applicable
        vec3 finalColor = (pointColor * (1.0 - vInBorder)) + (borderColor * vInBorder);
        // final color
        gl_FragColor = vec4(finalColor * pointBrightness, 1.0);
    }
`;