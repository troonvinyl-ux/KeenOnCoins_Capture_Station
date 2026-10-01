# KeenOnCoins Capture Station

A simple static, camera-first silver coin capture app.

## Upload to GitHub
Put `index.html`, `styles.css`, and `app.js` in the repository root.

For GitHub Pages:
Settings → Pages → Deploy from branch → `main` → `/ (root)`.

## Camera
Camera access normally requires HTTPS. GitHub Pages provides HTTPS.

## SWISH connection
The app is deliberately local-first. API URLs are isolated at the top of `app.js`:

- `SWISH_IDENTIFY_URL`
- `SWISH_VALUE_URL`
- `SWISH_SAVE_URL`

Populate those with the existing SWISH endpoints rather than creating a second database or authentication system.

The app never invents an identification or valuation when an endpoint is unavailable.
