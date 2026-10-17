# KeenOnCoins Capture Station — GitHub Pages build

This is a standalone, upload-ready specialist coin capture tool. It connects to the existing SWISH / OnSpace Supabase-compatible backend.

## Upload these three files

Put these files directly in the **root** of `troonvinyl-ux/KeenOnCoins_Capture_Station`:

- `index.html`
- `swish.css`
- `swish.js`

Replace the existing files with the same names. Do not put them in a subfolder. GitHub Pages serves `index.html` from the repository root.

## What this version does

- Signs in through the existing SWISH account and loads the existing tenant.
- Captures obverse and reverse with the device camera or uploads existing photos.
- Records weight, diameter, thickness, observed metal and notes.
- Calls the existing `swish-identify` and `swish-islamic-identify` Edge Functions.
- Calls the existing `swish-market-value` Edge Function for a valuation request.
- Lets you review the returned identification and evidence before saving.
- Saves the reviewed coin to the existing `items` table and uploads photos to the existing `item-images` storage bucket.
- Uses the existing backend only: no new database, auth system, Edge Functions or AI provider credentials.

## Important notes

- The public anon key in `swish.js` is the existing public client key from the SWISH web project. It is not a service-role key or an eBay/Gemini/Numista secret.
- All private marketplace and AI credentials must remain server-side in the existing backend.
- Camera access requires HTTPS (GitHub Pages is HTTPS) and browser permission.
- If image upload reports a storage-bucket/policy error, the coin record may still have been saved. Check the existing backend's bucket and policies rather than creating a new bucket automatically.
- The frontend calls existing Edge Functions; their successful operation depends on the functions deployed in your current SWISH backend.
- This is a specialist capture station, not a replacement for the full SWISH application.
