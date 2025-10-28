# Jared Boggs Personal Site

## Run Instructions

Launch the fastapi server with ```uv run fastapi dev main.py```

View at ```localhost:8000```

## To-Do

1. Terrain
   - tweak brightness in satellite image mode
   - better border effects
   - experiment with different looks in terrain frag shader
2. Rendering
   - Postprocessing
     - depth of field
     - elevation-based fog
   - fix wacky antialiasing
3. Points of Interest
   - better outline effect for 3D models
   - Add all POI content
     - City/Building - Education
     - Satellite Station - Contact Info
     - Defensive Station - Skills & Certs
     - Air Targets - Job Experience
4. Interactivity
   - hyperlinks to content
   - download resume document
5. Sound Design
   - Ambient sound
   - Camera move sound
   - Hologram ambience
6. UI
   - Menu option in addition to clicking on map to select objects
   - About page
7. Visual Polish
   - animations for 3D models
   - background skybox / environment
   - text plane effects
   - intro loading / init page & animation
   - (SUPER AMBITIOUS) use camera head tracking for subtle shift
8. Bugs
   - Clicking while text fade in is occurring causes text not to fade away later

## References & Thanks

- ThreeJS community forums and contributors
- This helpful article about visualizing terrain - <https://spatial-dev.guru/2024/11/30/creating-3d-terrain-maps-from-geotiff-files-with-three-js/>
- Facetype.js for font conversion

## License

- Fonts are sourced from Google Fonts and licensed under the Open Font License: <https://openfontlicense.org/>
- Terrain data provided by OpenTopography - NASA SRTM(2013) dataset.

> blockquote example provided here

`codeblock goes here`
