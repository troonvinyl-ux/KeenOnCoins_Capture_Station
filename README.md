# SWISH Web

Standalone GitHub Pages version of the uploaded SWISH app.

## Upload
Upload `index.html` to the GitHub repository root. If GitHub Pages is enabled for the repository, it can be served directly without npm, Expo, Node or an OnSpace build.

## Backend
This web copy points at the existing SWISH/OnSpace Supabase-compatible backend using the public anonymous key from the source project. No new database is created.

## Important
The browser copy deliberately does not contain eBay client secrets, access tokens, refresh tokens, or other server credentials. Existing eBay OAuth/token-refresh and other privileged operations should continue through the project's existing server/Edge Functions rather than being moved into browser code.
