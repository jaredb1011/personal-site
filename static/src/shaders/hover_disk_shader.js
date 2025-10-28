// hover_disk_shader.js

export const hoverDiskVertexShader = /* glsl */`
    varying vec2 vUv;

    void main() {
        // world space to clip space (is there a way to have this offset by the terrain?)
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

        // uv needed in frag shader for fade
        vUv = uv;
    }
`;

export const hoverDiskFragShader = /* glsl */`
    uniform vec3 uColor;
    uniform float uFadePercent;
    varying vec2 vUv;

    void main() {
        // Calculate distance from the center of the disk
        vec2 center = vec2(0.5); // center of the UV map
        float dist = length(vUv - center); // radial distance (0 to ~0.707)

        // fade color based on distance to center
        float fade = 1.0 - smoothstep(0.0, 0.6, dist);

        // modify alpha strength by fadePercent
        gl_FragColor = vec4(uColor * fade, uFadePercent);
    }
`;