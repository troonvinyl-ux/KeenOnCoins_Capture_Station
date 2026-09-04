# KeenOnCoins Capture & Clean Prototype

A zero-backend browser prototype for testing the coin image pipeline.

## What works
- Upload a coin photograph.
- Connect to a USB digital microscope/webcam through the browser camera API.
- Capture a frame.
- Run a pixel-preserving coin extraction/rebuild.
- Estimate the coin boundary and ellipse geometry.
- Warp the detected ellipse toward a circular presentation.
- Remove the detected background using true alpha transparency.
- Compare original vs cleaned image.
- Download a transparent PNG.
- Includes synthetic sample images for quick testing.

## Important
The current prototype deliberately does **not** use a generative AI model to redraw the coin. It uses browser-side computer vision and source-pixel warping so that lettering, dates, portraits, scratches and wear are not invented. This is the safe foundation for a later AI-assisted enhancement stage.

## Run
This is a static site. You can open `index.html` directly for image upload/testing. Camera access normally requires a secure context (HTTPS) or localhost, so for the microscope use a local/static web server or GitHub Pages.

### GitHub Pages
1. Create a repository, e.g. `keenoncoins-capture`.
2. Upload `index.html`, `styles.css`, `app.js`, and `README.md`.
3. Enable GitHub Pages from the repository's Pages settings, using the main branch and root folder.
4. Open the generated HTTPS page and allow camera access.

## Next engineering step
Replace/augment `rebuildCoin()` with a server-side or browser AI/CV model only where it improves segmentation or genuine source-pixel restoration. Keep the original capture and cleaned result side-by-side and never silently hallucinate numismatic detail.
